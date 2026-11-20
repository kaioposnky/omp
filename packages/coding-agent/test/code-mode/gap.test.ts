/**
 * Code Mode coverage gaps: the eval-prelude tool discovery surface, plan-mode
 * bridge narrowing, the `tool_call` hook identity for bridged calls, and the
 * `codeMode.scope` settings round-trip.
 *
 * Code Mode is `[planned]` (`src/code-mode/`, `createAgentSession({ codeMode })`).
 * Every case is an `it.todo` with a real body so `bun test --todo` turns the
 * suite into the implementation checklist.
 */
import { describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import type { ExtensionFactory } from "@oh-my-pi/pi-coding-agent/extensibility/extensions/types";
import { AgentStorage } from "@oh-my-pi/pi-coding-agent/session/agent-storage";
import { $which, TempDir } from "@oh-my-pi/pi-utils";
import {
	type CodeModeDecision,
	type CodeModeSession,
	MCP_FIXTURE_TOOL_NAME,
	loadPlanned,
	makeCodeModeSession,
	mcpTool,
	wireToolNames,
} from "./helpers";

const BASE_SETTINGS = {
	"marketplace.autoUpdate": "off",
	"compaction.enabled": false,
	"retry.enabled": false,
	"todo.enabled": false,
} as const;

/** Python eval kernels are opt-in, like the other real-kernel suites (`test/eval/session-tool-timeout.test.ts`). */
const PYTHON_INTERPRETER = Bun.env.PYTHON ?? $which("python3") ?? $which("python") ?? "";
const HAS_PYTHON_EVAL = PYTHON_INTERPRETER !== "" && Bun.env.PI_PYTHON_INTEGRATION === "1";

/** `[planned]` records written by `src/code-mode/settings.ts`. */
interface CodeModeScope {
	main?: boolean;
	agents?: Record<string, boolean>;
	roles?: Record<string, boolean>;
	models?: Array<{ match: string; enabled: boolean }>;
}

/** `[planned]` input accepted by `src/code-mode/scope.ts` `resolveCodeMode`. */
interface CodeModeResolveInput {
	isMain: boolean;
	sessionOverride?: boolean;
	spawnOverride?: boolean;
	agent?: { name: string; codeMode?: boolean; tools?: string[] };
	role?: string;
	modelId?: string;
	settings: { default: boolean; scope: CodeModeScope };
	evalAvailable: boolean;
	planMode?: boolean;
	restrictedToolNames?: string[];
}

interface PlannedSetting<T> {
	get(settings: Settings): T;
	set(settings: Settings, value: T): void;
}

interface PlannedSettingsModule {
	cfgCodeModeScope: PlannedSetting<CodeModeScope>;
}

interface PlannedScopeModule {
	resolveCodeMode(input: CodeModeResolveInput): CodeModeDecision;
}

interface ToolSearchEntry {
	name: string;
	summary: string;
	signature: string;
}

/** The slice of `AgentToolResult` the eval cells and bridged tools return. */
interface TextResultLike {
	content: Array<{ type: string; text?: string }>;
	details?: { cells?: Array<{ output?: string; status?: string }> };
}

function resultText(result: TextResultLike): string {
	return result.content
		.filter(block => block.type === "text")
		.map(block => block.text ?? "")
		.join("\n");
}

/** Cell body as printed, preferring the cell output the transcript renderer shows. */
function cellOutput(result: TextResultLike): string {
	return result.details?.cells?.[0]?.output ?? resultText(result);
}

/** Last standalone JSON object the cell printed, so a successful run is asserted on values, not prose. */
function lastJsonLine(output: string): Record<string, unknown> {
	const line = output
		.split(/\r?\n/)
		.map(candidate => candidate.trim())
		.filter(candidate => candidate.startsWith("{") && candidate.endsWith("}"))
		.at(-1);
	if (!line) throw new Error(`eval cell printed no JSON object:\n${output}`);
	return JSON.parse(line) as Record<string, unknown>;
}

function evalTool(session: CodeModeSession) {
	const tool = session.agent.state.tools.find(candidate => candidate.name === "eval");
	if (!tool) throw new Error("eval tool missing from the session wire");
	return tool;
}

function assertSearchEntries(value: unknown): ToolSearchEntry[] {
	expect(Array.isArray(value)).toBe(true);
	const entries = value as ToolSearchEntry[];
	expect(entries.length).toBeGreaterThan(0);
	expect(entries.length).toBeLessThanOrEqual(5);
	for (const entry of entries) {
		expect(typeof entry.name).toBe("string");
		expect(typeof entry.summary).toBe("string");
		expect(typeof entry.signature).toBe("string");
	}
	return entries;
}

describe("Code Mode coverage gaps", () => {
	it.todo("CM-G1 tool.describe returns the read signature and throws on an unknown name", async () => {
		using dir = TempDir.createSync("@omp-cm-g1-");
		const { session } = await makeCodeModeSession({
			cwd: dir.path(),
			codeMode: true,
			settings: Settings.isolated(BASE_SETTINGS),
		});
		try {
			expect(session.isCodeModeActive()).toBe(true);
			const cell = `
const signature = await tool.describe("read");
let unknown = { threw: false, message: "" };
try {
	await tool.describe("gap_missing_tool");
} catch (error) {
	unknown = { threw: true, message: String(error && error.message ? error.message : error) };
}
console.log(JSON.stringify({ signature, unknown }));
`;
			const output = cellOutput(await evalTool(session).execute("gap-g1", { language: "js", code: cell }));
			const payload = lastJsonLine(output);

			expect(payload.signature).toEqual(expect.any(String));
			const signature = String(payload.signature);
			expect(signature).toContain("path");
			expect(signature.toLowerCase()).toContain("read");

			const unknown = payload.unknown as { threw?: unknown; message?: unknown };
			expect(unknown.threw).toBe(true);
			expect(typeof unknown.message).toBe("string");
			expect(String(unknown.message).length).toBeGreaterThan(0);
		} finally {
			await session.dispose();
		}
	});

	it.todo("CM-G2 tool.search ranks read for file contents and finds bridge-only MCP tools", async () => {
		using dir = TempDir.createSync("@omp-cm-g2-");
		const { session } = await makeCodeModeSession({
			cwd: dir.path(),
			codeMode: true,
			mcpTools: [mcpTool],
			settings: Settings.isolated(BASE_SETTINGS),
		});
		try {
			expect(session.isCodeModeActive()).toBe(true);
			// The MCP fixture must be searchable while absent from the wire schema.
			expect(wireToolNames(session)).not.toContain(MCP_FIXTURE_TOOL_NAME);
			const cell = `
const entries = await tool.search("file contents", 5);
const bridge = await tool.search("fixture probe", 5);
console.log(JSON.stringify({ entries, bridge }));
`;
			const output = cellOutput(await evalTool(session).execute("gap-g2", { language: "js", code: cell }));
			const payload = lastJsonLine(output);

			const entries = assertSearchEntries(payload.entries);
			expect(entries.map(entry => entry.name)).toContain("read");

			const bridgeEntries = assertSearchEntries(payload.bridge);
			expect(bridgeEntries.map(entry => entry.name)).toContain(MCP_FIXTURE_TOOL_NAME);
		} finally {
			await session.dispose();
		}
	});
});

describe.skipIf(!HAS_PYTHON_EVAL)("Code Mode coverage gaps (real Python kernel)", () => {
	it.todo("CM-G3 the Python prelude exposes the same tool discovery surface", async () => {
		using dir = TempDir.createSync("@omp-cm-g3-");
		const { session } = await makeCodeModeSession({
			cwd: dir.path(),
			codeMode: true,
			mcpTools: [mcpTool],
			settings: Settings.isolated({
				...BASE_SETTINGS,
				"eval.autoProvision": false,
				"python.interpreter": PYTHON_INTERPRETER,
			}),
		});
		try {
			expect(session.isCodeModeActive()).toBe(true);
			expect(wireToolNames(session)).not.toContain(MCP_FIXTURE_TOOL_NAME);
			const cell = `
import json

signature = await tool.describe("read")
entries = await tool.search("file contents", 5)
bridge = await tool.search("fixture probe", 5)
print(json.dumps({"signature": signature, "entries": entries, "bridge": bridge}))
`;
			const output = cellOutput(await evalTool(session).execute("gap-g3", { language: "py", code: cell }));
			const payload = lastJsonLine(output);

			expect(payload.signature).toEqual(expect.any(String));
			const signature = String(payload.signature);
			expect(signature).toContain("path");
			expect(signature.toLowerCase()).toContain("read");

			const entries = assertSearchEntries(payload.entries);
			expect(entries.map(entry => entry.name)).toContain("read");

			const bridgeEntries = assertSearchEntries(payload.bridge);
			expect(bridgeEntries.map(entry => entry.name)).toContain(MCP_FIXTURE_TOOL_NAME);
		} finally {
			await session.dispose();
		}
	});
});

describe("Code Mode coverage gaps (hooks and settings)", () => {
	it.todo("CM-G4 plan mode narrows the eval bridge to the tools plan mode allows", async () => {
		using dir = TempDir.createSync("@omp-cm-g4-");
		const target = path.join(dir.path(), "gap-plan-read.txt");
		fs.writeFileSync(target, "GAP_PLAN_READ\n");
		const { session } = await makeCodeModeSession({
			cwd: dir.path(),
			codeMode: true,
			settings: Settings.isolated(BASE_SETTINGS),
		});
		try {
			expect(session.isCodeModeActive()).toBe(true);
			session.setPlanModeState({ enabled: true, planFilePath: "local://gap-plan.md" });
			expect(session.getPlanModeState()?.enabled).toBe(true);

			// A read tool stays reachable through the bridge.
			const readTool = session.getToolForEvalBridge("read");
			expect(readTool).toBeDefined();
			const result = await readTool!.execute("gap-plan-read", { path: target });
			expect(resultText(result as TextResultLike)).toContain("GAP_PLAN_READ");

			// Write-capable tools leave the bridge while plan mode is active.
			expect(session.getToolForEvalBridge("edit")).toBeUndefined();
			expect(session.getToolForEvalBridge("write")).toBeUndefined();
		} finally {
			await session.dispose();
		}
	});

	it.todo("CM-G5 a bridged tool.read fires tool_call once with the inner tool name", async () => {
		using dir = TempDir.createSync("@omp-cm-g5-");
		const target = path.join(dir.path(), "gap-hook.txt");
		fs.writeFileSync(target, "GAP_HOOK_BODY\n");
		const calls: Array<{ toolName: string; path: unknown }> = [];
		const factory: ExtensionFactory = pi => {
			pi.on("tool_call", async event => {
				calls.push({
					toolName: event.toolName,
					path: "path" in event.input ? event.input.path : undefined,
				});
			});
		};
		const { session } = await makeCodeModeSession({
			cwd: dir.path(),
			codeMode: true,
			extensions: [factory],
			settings: Settings.isolated(BASE_SETTINGS),
		});
		try {
			expect(session.isCodeModeActive()).toBe(true);
			const cell = `
const read = await tool.read({ path: ${JSON.stringify(target)} });
console.log(JSON.stringify({ ok: true, length: String(read).length }));
`;
			const output = cellOutput(await evalTool(session).execute("gap-g5", { language: "js", code: cell }));
			expect(lastJsonLine(output).ok).toBe(true);

			const readCalls = calls.filter(call => call.toolName === "read");
			expect(readCalls).toHaveLength(1);
			expect(readCalls[0]?.path).toBe(target);

			// The inner call must never be attributed to the outer eval dispatch.
			expect(calls.filter(call => call.toolName === "eval" && call.path !== undefined)).toHaveLength(0);
		} finally {
			await session.dispose();
		}
	});

	it.todo("CM-G6 codeMode.scope round-trips through Settings and drives resolveCodeMode", async () => {
		using dir = TempDir.createSync("@omp-cm-g6-");
		const agentDir = path.join(dir.path(), "agent");
		fs.mkdirSync(agentDir, { recursive: true });
		try {
			const { cfgCodeModeScope } = await loadPlanned<PlannedSettingsModule>("code-mode/settings");
			const scope: CodeModeScope = {
				main: true,
				agents: { scout: false },
				roles: { plan: false },
				models: [
					{ match: "*gpt-4o*", enabled: false },
					{ match: "openai/*", enabled: true },
				],
			};

			const settings = await Settings.loadIsolated({ cwd: dir.path(), agentDir });
			cfgCodeModeScope.set(settings, scope);
			expect(cfgCodeModeScope.get(settings)).toEqual(scope);
			await settings.flush();

			// The same persist path /settings uses: config.yml reloads the written record.
			const reloaded = await Settings.loadIsolated({ cwd: dir.path(), agentDir });
			const readBack = cfgCodeModeScope.get(reloaded);
			expect(readBack).toEqual(scope);
			expect(readBack.models?.map(rule => rule.match)).toEqual(["*gpt-4o*", "openai/*"]);

			const { resolveCodeMode } = await loadPlanned<PlannedScopeModule>("code-mode/scope");
			const base = { default: false, scope: readBack };
			expect(
				resolveCodeMode({
					isMain: false,
					agent: { name: "scout" },
					settings: base,
					evalAvailable: true,
				}),
			).toMatchObject({ enabled: false, source: "scope.agents" });
			// First matching model rule wins over the later, permissive rule.
			expect(
				resolveCodeMode({
					isMain: false,
					role: "default",
					modelId: "openai/gpt-4o-mini",
					settings: base,
					evalAvailable: true,
				}),
			).toMatchObject({ enabled: false, source: "scope.models" });
			expect(
				resolveCodeMode({
					isMain: false,
					role: "default",
					modelId: "openai/other-model",
					settings: base,
					evalAvailable: true,
				}),
			).toMatchObject({ enabled: true, source: "scope.models" });
			expect(
				resolveCodeMode({
					isMain: false,
					role: "plan",
					modelId: "anthropic/claude-3",
					settings: base,
					evalAvailable: true,
				}),
			).toMatchObject({ enabled: false, source: "scope.roles" });
			expect(
				resolveCodeMode({
					isMain: true,
					role: "default",
					modelId: "anthropic/claude-3",
					settings: base,
					evalAvailable: true,
				}),
			).toMatchObject({ enabled: true, source: "scope.main" });
		} finally {
			AgentStorage.close();
		}
	});
});
