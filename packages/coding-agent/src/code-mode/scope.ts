/**
 * Pure Code Mode decision: which rule turns Code Mode on or off for one session.
 *
 * Precedence (first rung that decides wins): hard gates > session (main only) > spawn >
 * frontmatter > scope.agents > scope.models (first glob match) > scope.roles > scope.main (main) /
 * default. No I/O: callers freeze the result at session creation.
 */
import type { CodeModeScope } from "./settings";

export type { CodeModeScope } from "./settings";

export interface CodeModeResolveInput {
	isMain: boolean;
	/** Session-level request (`--code-mode`, `/code-mode`); honored for the main session only. */
	sessionOverride?: boolean;
	/** Spawn request (`agent({ codeMode })`, task item `codeMode`). */
	spawnOverride?: boolean;
	agent?: { name: string; codeMode?: boolean; tools?: string[] };
	role?: string;
	/** Resolved model as `provider/id`. */
	modelId?: string;
	settings: { default: boolean; scope: CodeModeScope };
	evalAvailable: boolean;
	planMode?: boolean;
	restrictedToolNames?: string[];
}

export type CodeModeSource =
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

export interface CodeModeDecision {
	enabled: boolean;
	source: CodeModeSource;
	/** Short text for `/code-mode status` (agent name, matched glob, role). */
	detail?: string;
	/** Present when an explicit request was refused. */
	denied?: { requested: boolean; reason: string };
}

/** Anchored match of `provider/id` against a glob where `*` is any run and `?` one character. */
export function matchModelGlob(pattern: string, modelId: string): boolean {
	let source = "^";
	for (const char of pattern) {
		if (char === "*") source += ".*";
		else if (char === "?") source += ".";
		else source += char.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
	}
	return new RegExp(`${source}$`, "s").test(modelId);
}

function explicitRequest(input: CodeModeResolveInput): boolean | undefined {
	if (input.isMain && input.sessionOverride !== undefined) return input.sessionOverride;
	return input.spawnOverride;
}

function gate(input: CodeModeResolveInput, source: CodeModeSource, reason: string): CodeModeDecision {
	const decision: CodeModeDecision = { enabled: false, source, detail: reason };
	if (explicitRequest(input) === true) decision.denied = { requested: true, reason };
	return decision;
}

/** Own boolean entry of a rule map; ignores inherited keys such as `constructor`. */
function ruleOf(map: Record<string, boolean> | undefined, key: string): boolean | undefined {
	if (!map || !Object.hasOwn(map, key)) return undefined;
	const value = map[key];
	return typeof value === "boolean" ? value : undefined;
}

export function resolveCodeMode(input: CodeModeResolveInput): CodeModeDecision {
	if (!input.evalAvailable) return gate(input, "hard-gate:no-eval", "eval backend unavailable");
	if (input.agent?.tools && !input.agent.tools.includes("eval")) {
		return gate(input, "hard-gate:agent-tools", "agent has no eval");
	}
	if (input.restrictedToolNames && !input.restrictedToolNames.includes("eval")) {
		return gate(input, "hard-gate:restricted", "restricted tool list has no eval");
	}

	if (input.isMain && input.sessionOverride !== undefined) {
		return { enabled: input.sessionOverride, source: "session" };
	}
	if (input.spawnOverride !== undefined) return { enabled: input.spawnOverride, source: "spawn" };

	const agent = input.agent;
	if (agent?.codeMode !== undefined) return { enabled: agent.codeMode, source: "frontmatter", detail: agent.name };

	const { scope } = input.settings;
	const agentRule = agent ? ruleOf(scope.agents, agent.name) : undefined;
	if (agent && agentRule !== undefined) return { enabled: agentRule, source: "scope.agents", detail: agent.name };

	if (input.modelId && scope.models) {
		const modelId = input.modelId;
		const rule = scope.models.find(entry => matchModelGlob(entry.match, modelId));
		if (rule) return { enabled: rule.enabled, source: "scope.models", detail: rule.match };
	}

	if (input.role) {
		const roleRule = ruleOf(scope.roles, input.role);
		if (roleRule !== undefined) return { enabled: roleRule, source: "scope.roles", detail: input.role };
	}

	if (input.isMain && scope.main !== undefined) return { enabled: scope.main, source: "scope.main" };
	return { enabled: input.settings.default, source: "default" };
}
