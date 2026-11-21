import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { JevClient } from "./jev.js";
import type { ToolRouter } from "./router.js";
import type { SkillRouter } from "./skills.js";
import { JEV_THRESHOLD, skillApplicabilityQuestion } from "./skills.js";
import type { QuestionConfig } from "./types.js";

export type AutoSkipReason =
  | "disabled"
  | "unconfigured"
  | "busy"
  | "empty-prompt"
  | "error";

export interface AutoRouteResult {
  ran: boolean;
  reason?: AutoSkipReason;
  activated: string[];
  /** Code Mode: matched tool names to hint; nothing was activated. */
  hintedTools?: string[];
  skills: Array<{ name: string; probability: number }>;
  elapsedMs: number;
  /** Set when a model switch was decided as part of this batched request. */
  modelConfidence?: number;
}

/** Router surface AutoJev needs; `isCodeModeActive` is optional for legacy host doubles. */
type AutoToolRouter = Pick<ToolRouter, "shortlist" | "activateTools"> &
  Partial<Pick<ToolRouter, "isCodeModeActive">>;

/** A pending model-switch judgment, contributed by the model router. */
export interface ModelJudgmentContribution {
  key: "model:switch";
  instructions: string;
}

export { JEV_THRESHOLD };

/**
 * The jev-auto hint attached after a user prompt. Skills use the `skill://<name>`
 * resource form so Code Mode (and normal mode) can load them without a slash command.
 */
export function skillHintMessage(
  skills: Array<{ name: string; probability: number }>
): string {
  return (
    "Jev auto-matched skill(s) for this task. Load the matching SKILL.md before proceeding:\n" +
    skills.map((s) => `• skill://${s.name} (P=${s.probability.toFixed(2)})`).join("\n")
  );
}

/**
 * Automatic Jev usage: runs one routing pass per user prompt before the agent starts.
 * Only active when explicitly enabled, and only when Jev is configured.
 */
export class AutoJev {
  public enabled: boolean;
  private running = false;

  constructor(
    private jevClient: Pick<JevClient, "isConfigured" | "evaluate">,
    private router: AutoToolRouter,
    private skillRouter: Pick<SkillRouter, "getAvailableSkills" | "shortlist">,
    enabled = false
  ) {
    this.enabled = enabled;
  }

  /** Extra Noul questions folded into the next batched request. */
  public pendingQuestions: ModelJudgmentContribution[] = [];

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /** Never throws: automatic routing must not break the agent turn. */
  public async route(
    prompt: string,
    ctx?: ExtensionContext,
    signal?: AbortSignal,
    /** Route this prompt even when auto mode is off (web tasks). */
    force = false
  ): Promise<AutoRouteResult> {
    const startTime = Date.now();
    const skip = (reason: AutoSkipReason): AutoRouteResult => ({
      ran: false,
      reason,
      activated: [],
      skills: [],
      elapsedMs: Date.now() - startTime,
    });

    if (!this.enabled && !force) return skip("disabled");
    if (this.running) return skip("busy");
    if (!prompt || !prompt.trim() || prompt.trim().startsWith("/")) {
      return skip("empty-prompt");
    }
    if (!this.jevClient.isConfigured()) return skip("unconfigured");

    this.running = true;
    try {
      const toolCandidates = this.router.shortlist(prompt, 10);
      const skillCandidates = this.skillRouter.shortlist(
        this.skillRouter.getAvailableSkills(ctx),
        prompt,
        12
      );
      const questions: Record<string, QuestionConfig> = {};

      for (const c of toolCandidates) {
        questions[`tool:${c.name}`] = {
          type: "noul",
          instructions: `Does the tool '${c.name}' (${c.description || "no description"}) directly help accomplish this task: "${prompt}"?`,
        };
      }
      for (const [index, s] of skillCandidates.entries()) {
        questions[`skill:${s.name}`] = skillApplicabilityQuestion(index);
      }
      for (const q of this.pendingQuestions) {
        questions[q.key] = { type: "noul", instructions: q.instructions };
      }
      this.pendingQuestions = [];

      const answers = Object.keys(questions).length === 0
        ? {}
        : (await this.jevClient.evaluate(
            {
              state: { task: prompt, tools: toolCandidates, available_skills: skillCandidates },
              questions,
            },
            signal
          )).answers;

      const modelValue = answers["model:switch"]?.value;
      const modelConfidence = typeof modelValue === "number" ? modelValue : undefined;

      const matched = toolCandidates
        .filter((c) => {
          const value = answers[`tool:${c.name}`]?.value;
          return typeof value === "number" && value >= JEV_THRESHOLD;
        })
        .map((c) => c.name);
      const codeMode = this.router.isCodeModeActive?.() === true;
      if (!codeMode) this.router.activateTools(matched);

      const skills = skillCandidates
        .map((s) => ({
          name: s.name,
          probability: answers[`skill:${s.name}`]?.value,
        }))
        .filter((s): s is { name: string; probability: number } =>
          typeof s.probability === "number" && s.probability >= JEV_THRESHOLD
        )
        .sort((a, b) => b.probability - a.probability);

      const result: AutoRouteResult = {
        ran: true,
        activated: codeMode ? [] : matched,
        skills,
        modelConfidence,
        elapsedMs: Date.now() - startTime,
      };
      if (codeMode) result.hintedTools = [...matched];
      return result;
    } catch {
      return skip("error");
    } finally {
      this.running = false;
    }
  }
}
