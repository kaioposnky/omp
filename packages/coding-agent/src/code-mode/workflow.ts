/**
 * Per-model-family Code Mode guidance, measured in
 * docs/code-mode/micro/token-economy-model-behaviors.md.
 *
 * - `cells`: spell out the few-cells workflow and inline `todo`; each extra cell resends the whole
 *   conversation. Anthropic models already work that way.
 * - `scope`: edit only what the task asks for. Code Mode cells tend to rewrite whole files; the rule
 *   fixed that for Anthropic and OpenAI at no token cost.
 *
 * Every other model (open-weights, unclassified, or unknown) gets the default: token reduction only.
 * The scope rule added ~58% tokens on deepseek without a quality gain, so it is not part of it.
 */
import { classifyModel } from "@oh-my-pi/pi-catalog/identity";

export interface CodeModeGuidance {
	/** Spell out the few-cells workflow and inline `todo`. */
	cells: boolean;
	/** Edit only what the task asks for; keep unrelated behavior. */
	scope: boolean;
}

const FAMILY_GUIDANCE: Readonly<Record<string, CodeModeGuidance>> = {
	anthropic: { cells: false, scope: true },
	openai: { cells: true, scope: true },
};

/** Token-reduction-only guidance for any family without its own rules. */
const DEFAULT_GUIDANCE: CodeModeGuidance = { cells: true, scope: false };

/** Code Mode eval-prompt guidance for `model` (`provider/id`). */
export function codeModeGuidance(model: string | undefined): CodeModeGuidance {
	if (!model) return DEFAULT_GUIDANCE;
	const family = classifyModel("", model, { lenient: true }).class;
	return Object.hasOwn(FAMILY_GUIDANCE, family) ? FAMILY_GUIDANCE[family]! : DEFAULT_GUIDANCE;
}
