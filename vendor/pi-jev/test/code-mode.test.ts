import test from "node:test";
import assert from "node:assert/strict";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { McpGate } from "../src/mcp-gate.js";
import { ToolRouter } from "../src/router.js";
import { ToolGuard } from "../src/tool-guard.js";
import { AutoJev } from "../src/auto.js";
import { registerJevTools } from "../src/tools.js";
import type { JevClient } from "../src/jev.js";
import type { SkillRouter } from "../src/skills.js";

/**
 * RF6.5 (code-mode plan): pi-jev adjusts to Code Mode.
 * Planned ExtensionAPI surface (packages/coding-agent...#ExtensionAPI [planned]):
 *   pi.isCodeModeActive(): boolean
 * This file fixes the planned pi-jev contract the implementation must satisfy:
 *   - RouterResult.hintedTools?: string[]     [planned] names selected but not activated
 *   - AutoRouteResult.hintedTools?: string[]  [planned] same, for automatic routing
 *   - skillHintMessage(skills): string        [planned] src/auto.ts export used by the jev-auto hint
 */

type ClientCtor = Pick<JevClient, "isConfigured" | "evaluate">;
type SkillRouterCtor = Pick<SkillRouter, "getAvailableSkills" | "shortlist">;

interface RegisteredTool {
  name: string;
  execute: (
    toolCallId: string,
    params: Record<string, unknown>,
    signal?: AbortSignal,
    onUpdate?: (update: unknown) => void,
  ) => Promise<{ content?: Array<{ text?: string }> }>;
}

interface PiHarness {
  pi: ExtensionAPI;
  setActiveCalls: string[][];
  registered: Map<string, RegisteredTool>;
}

function asRegisteredTool(tool: unknown): RegisteredTool | undefined {
  if (!tool || typeof tool !== "object") return undefined;
  if (!("name" in tool) || typeof tool.name !== "string") return undefined;
  if (!("execute" in tool) || typeof tool.execute !== "function") return undefined;
  // Shape was checked above; the cast only restores the function type lost by `unknown`.
  return tool as RegisteredTool;
}

/**
 * Fake ExtensionAPI with the subset used by pi-jev. `codeMode: "active"`
 * installs the planned `isCodeModeActive()` method; `codeMode: "legacy"`
 * omits it to emulate an omp fork without RF6.4.
 */
function mockPi(opts: {
  tools: Array<{ name: string; description?: string }>;
  active: string[];
  codeMode?: "active" | "legacy";
}): PiHarness {
  const setActiveCalls: string[][] = [];
  const registered = new Map<string, RegisteredTool>();
  let active = [...opts.active];
  const fake = {
    getAllTools: () => opts.tools,
    getActiveTools: () => [...active],
    setActiveTools: async (names: string[]) => {
      active = [...names];
      setActiveCalls.push([...names]);
    },
    registerTool: (tool: unknown) => {
      const known = asRegisteredTool(tool);
      if (known) registered.set(known.name, known);
    },
    ...(opts.codeMode === "active" ? { isCodeModeActive: () => true } : {}),
  };
  // Partial test double: only the ExtensionAPI members pi-jev actually calls.
  return { pi: fake as unknown as ExtensionAPI, setActiveCalls, registered };
}

function mockClient(
  answers: Record<string, { value: number }> = {},
  opts: { throw?: boolean } = {},
) {
  const seen: unknown[] = [];
  const client = {
    isConfigured: () => true,
    evaluate: async (req: unknown) => {
      seen.push(req);
      if (opts.throw) throw new Error("jev down");
      return { answers, model: "jev-latest", elapsedMs: 5 };
    },
  };
  return { client: client as unknown as ClientCtor, seen };
}

function emptySkillRouter(): SkillRouterCtor {
  // Auto routing only reads skills here; the test exercises tool selection.
  return { getAvailableSkills: () => [], shortlist: () => [] } as unknown as SkillRouterCtor;
}

const GITHUB = [
  { name: "mcp__github_pr", description: "Create pull requests" },
  { name: "mcp__github_issue" },
];

const PG = [{ name: "postgres_query", description: "Query a postgres database" }];

/** [planned] field on AutoRouteResult, absent from today's source. */
interface PlannedAutoRouteResult {
  hintedTools?: string[];
}

test("JEV-CM1 McpGate makes no setActiveTools call when isCodeModeActive()", { todo: "code-mode" }, async () => {
  const { client } = mockClient({ "mcp:github": { value: 0.9 } });
  const { pi, setActiveCalls } = mockPi({ tools: [...GITHUB], active: ["read"], codeMode: "active" });

  await new McpGate(client).route("open a PR", pi);

  // Code Mode owns tool selection: the gate must not rewrite the active set.
  assert.deepEqual(setActiveCalls, []);
});

test("JEV-CM2 auto routing skips activation in code mode and returns hint names", { todo: "code-mode" }, async () => {
  const { client } = mockClient({ "tool:postgres_query": { value: 0.9 } });
  const { pi, setActiveCalls } = mockPi({ tools: [...PG], active: ["read"], codeMode: "active" });
  const router = new ToolRouter(pi, client as unknown as JevClient);
  const auto = new AutoJev(client, router, emptySkillRouter(), true);

  const result = await auto.route("query the postgres database");

  assert.deepEqual(setActiveCalls, []);
  assert.deepEqual(result.activated, []);
  const planned = result as unknown as PlannedAutoRouteResult; // [planned] hintedTools not in source yet
  assert.ok(
    (planned.hintedTools ?? []).includes("postgres_query"),
    `[planned] AutoRouteResult.hintedTools must list names selected in code mode; got ${JSON.stringify(result)}`,
  );
});

test("JEV-CM3 jev_find_tools suggests tool.<name> in code mode without activating", { todo: "code-mode" }, async () => {
  const { client } = mockClient({ postgres_query: { value: 0.9 } });
  const { pi, setActiveCalls, registered } = mockPi({
    tools: [...PG],
    active: ["read"],
    codeMode: "active",
  });
  const router = new ToolRouter(pi, client as unknown as JevClient);
  registerJevTools(pi, client as unknown as JevClient, router, emptySkillRouter() as unknown as SkillRouter);

  const finder = registered.get("jev_find_tools");
  assert.ok(finder, "jev_find_tools must be registered");
  const output = await finder.execute("call-1", { query: "query the postgres database" }, undefined, undefined);
  const text = (output.content ?? []).map((c) => c.text ?? "").join("\n");

  assert.match(text, /tool\.postgres_query/);
  assert.deepEqual(setActiveCalls, []);
});

test("JEV-CM4 ToolGuard ignores the eval tool name", { todo: "code-mode" }, async () => {
  const { client, seen } = mockClient({ is_hallucinated: { value: 0.99 } });
  const guard = new ToolGuard({} as unknown as ExtensionAPI, client as unknown as JevClient, true);

  const result = await guard.checkToolCall("eval", { code: "await tool.read('a.txt')" });

  // Judging the typed program itself would block valid code; nested tool.*
  // calls are judged on their own tool_call events (RF6.6).
  assert.equal(seen.length, 0);
  assert.equal(result.valid, true);
  assert.ok(!result.blocked);
});

test("JEV-CM5 skill hint uses the skill:// form", { todo: "code-mode" }, async () => {
  // Dynamic import because skillHintMessage does not exist yet and the file must
  // typecheck today; static import cannot reference a planned export.
  const autoModule = (await import("../src/auto.js")) as unknown as {
    skillHintMessage?: (skills: Array<{ name: string; probability: number }>) => string;
  };
  assert.equal(
    typeof autoModule.skillHintMessage,
    "function",
    "[planned] src/auto.ts must export skillHintMessage(skills) used by the jev-auto hint",
  );

  const text = autoModule.skillHintMessage!([{ name: "web-ui-ai-notes", probability: 0.91 }]);
  assert.match(text, /skill:\/\/web-ui-ai-notes/);
  assert.doesNotMatch(text, /\/skill:/);
});

// Current behavior for forks without RF6.4 (no pi.isCodeModeActive): regression,
// not todo — it must keep passing while the code-mode branches land.
test("JEV-CM6 pi without isCodeModeActive keeps the current activation behavior", async () => {
  const { client } = mockClient({ "mcp:github": { value: 0.9 } });
  const { pi, setActiveCalls } = mockPi({ tools: [...GITHUB], active: ["read"], codeMode: "legacy" });
  assert.ok(!("isCodeModeActive" in pi), "legacy fork must not expose isCodeModeActive");

  await new McpGate(client).route("open a PR", pi);

  assert.deepEqual(setActiveCalls, [["read", "mcp__github_pr", "mcp__github_issue"]]);
});
