/**
 * Shared fixtures for the Code Mode test suite (`test/code-mode/*.test.ts`).
 *
 * Code Mode is not implemented yet: the modules under `src/code-mode/` and the
 * session methods named by {@link CodeModeSession} are `[planned]`. Tests load
 * those modules through {@link loadPlanned} so this file keeps typechecking
 * against today's tree, and cast the session to {@link CodeModeSession} to reach
 * the planned surface.
 */
import { type } from "@oh-my-pi/omptype";
import { getBundledModel } from "@oh-my-pi/pi-catalog/models";
import { Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import {
	type CreateAgentSessionOptions,
	type CreateAgentSessionResult,
	type CustomTool,
	createAgentSession,
} from "@oh-my-pi/pi-coding-agent/sdk";
import type { AgentSession } from "@oh-my-pi/pi-coding-agent/session/agent-session";
import { SessionManager } from "@oh-my-pi/pi-coding-agent/session/session-manager";

/** Wire name of the MCP fixture tool used across the Code Mode tests. */
export const MCP_FIXTURE_TOOL_NAME = "mcp__fixture_probe";

/** Minimal MCP tool registered through `mcpTools`, mirroring the tan presentation fixture. */
export const mcpTool: CustomTool = {
	name: MCP_FIXTURE_TOOL_NAME,
	label: "Fixture probe",
	description: "Probe the fixture server.",
	parameters: type({ query: "string" }),
	mcpServerName: "fixture",
	mcpToolName: "probe",
	async execute() {
		return { content: [{ type: "text", text: "fixture" }] };
	},
};

/**
 * Planned decision shape produced by `resolveCodeMode` and exposed by
 * `AgentSession.getCodeModeDecision()`.
 */
export interface CodeModeDecision {
	enabled: boolean;
	source:
		| "hard-gate:no-eval"
		| "hard-gate:agent-tools"
		| "hard-gate:restricted"
		| "session"
		| "spawn"
		| "frontmatter"
		| "scope.agents"
		| "scope.models"
		| "scope.roles"
		| "scope.main"
		| "default";
	detail?: string;
	denied?: { requested: boolean; reason: string };
}

/** [planned] Session surface added by Code Mode (`src/code-mode/`). */
export interface CodeModeSession extends AgentSession {
	/** Whether this session was created in Code Mode (frozen at creation). */
	isCodeModeActive(): boolean;
	/** Decision that produced this session's state, for `/code-mode status`. */
	getCodeModeDecision(): CodeModeDecision;
	/** Tools reachable through the eval bridge but absent from the wire schema. */
	getBridgeOnlyToolNames(): string[];
}

/** Options accepted by {@link makeCodeModeSession}: the SDK's plus the `[planned]` flag. */
export type MakeCodeModeSessionOptions = Partial<CreateAgentSessionOptions> & {
	/** [planned] `createAgentSession` option that requests Code Mode. */
	codeMode?: boolean;
};

export interface CodeModeSessionResult extends Omit<CreateAgentSessionResult, "session"> {
	session: CodeModeSession;
}

/**
 * Create an agent session with the same discovery-free fixture as
 * `test/tan-tool-presentation.test.ts`, optionally requesting Code Mode.
 *
 * `cwd` is required so callers keep control of the temp directory lifetime
 * (`using dir = TempDir.createSync(...)`); `agentDir` defaults to `cwd`.
 */
export async function makeCodeModeSession(overrides: MakeCodeModeSessionOptions = {}): Promise<CodeModeSessionResult> {
	const { codeMode, ...rest } = overrides;
	const cwd = rest.cwd;
	if (!cwd) throw new Error("makeCodeModeSession requires a cwd (use TempDir.createSync(...))");
	const settings =
		rest.settings ??
		Settings.isolated({
			"marketplace.autoUpdate": "off",
		});
	const options: CreateAgentSessionOptions & { codeMode?: boolean } = {
		agentDir: cwd,
		model: getBundledModel("openai", "gpt-4o-mini"),
		skills: [],
		contextFiles: [],
		promptTemplates: [],
		slashCommands: [],
		enableLsp: false,
		enableMCP: false,
		disableExtensionDiscovery: true,
		skipPythonPreflight: true,
		sessionManager: SessionManager.inMemory(cwd),
		...rest,
		settings,
	};
	if (codeMode !== undefined) options.codeMode = codeMode;
	const result = await createAgentSession(options);
	return { ...result, session: result.session as CodeModeSession };
}

/** Wire tool names: what the provider sees in the tool schema. */
export function wireToolNames(session: AgentSession): string[] {
	return session.agent.state.tools.map(tool => tool.name);
}

/**
 * Import a module that does not exist yet (`[planned]`) through a runtime
 * specifier so this file typechecks today. Paths are relative to
 * `packages/coding-agent/src`, e.g. `code-mode/scope`.
 */
export async function loadPlanned<T>(relPathFromSrc: string): Promise<T> {
	const trimmed = relPathFromSrc.replace(/^\.?\//, "").replace(/\.ts$/, "");
	return (await import(`@oh-my-pi/pi-coding-agent/${trimmed}`)) as T;
}
