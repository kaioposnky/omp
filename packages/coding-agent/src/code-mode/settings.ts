/**
 * Code Mode settings (see `config/registry.ts`). `config/all-settings.ts` registers every domain.
 */
import { register } from "../config/registry";

/** Per-scope Code Mode rules, resolved by `resolveCodeMode` (`code-mode/scope.ts`). */
export interface CodeModeScope {
	/** Main-session rule; unset falls through to `codeMode.default`. */
	main?: boolean;
	/** Agent name → enabled. Unknown names are accepted (configs are shared across projects). */
	agents?: Record<string, boolean>;
	/** Model role → enabled. */
	roles?: Record<string, boolean>;
	/** Ordered `provider/id` globs (`*`, `?`); the first match wins. */
	models?: Array<{ match: string; enabled: boolean }>;
}

const FACTORY_SCOPE: CodeModeScope = {
	agents: { sonic: false, scout: false },
	roles: { smol: false, tiny: false },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateBooleanMap(raw: unknown, key: string): void {
	if (raw === undefined) return;
	if (!isPlainObject(raw)) throw new Error(`codeMode.scope.${key} must be an object of booleans`);
	for (const [name, enabled] of Object.entries(raw)) {
		if (typeof enabled !== "boolean") throw new Error(`codeMode.scope.${key}.${name} must be a boolean`);
	}
}

/**
 * Rejects a model glob the matcher cannot honor: empty, or using glob syntax beyond `*`/`?`
 * (classes, braces, escapes), which would otherwise silently match literally.
 */
export function validateModelGlob(pattern: string): void {
	if (pattern.length === 0) throw new Error("codeMode.scope.models[].match must not be empty");
	const bad = /[[\]{}\\]/.exec(pattern);
	if (bad) {
		throw new Error(
			`codeMode.scope.models[].match "${pattern}": unsupported glob character "${bad[0]}" (only * and ? are supported)`,
		);
	}
}

/** `undefined` = not configured (the registry validates unset settings too). */
function validateScope(raw: unknown): void {
	if (raw === undefined) return;
	if (!isPlainObject(raw)) throw new Error("codeMode.scope must be an object");
	if (raw.main !== undefined && typeof raw.main !== "boolean")
		throw new Error("codeMode.scope.main must be a boolean");
	validateBooleanMap(raw.agents, "agents");
	validateBooleanMap(raw.roles, "roles");
	if (raw.models === undefined) return;
	if (!Array.isArray(raw.models)) throw new Error("codeMode.scope.models must be an array");
	for (const [index, rule] of raw.models.entries()) {
		if (!isPlainObject(rule) || typeof rule.match !== "string" || typeof rule.enabled !== "boolean") {
			throw new Error(`codeMode.scope.models[${index}] must be { match: string; enabled: boolean }`);
		}
		validateModelGlob(rule.match);
	}
}

export const cfgCodeModeDefault = register({
	id: "codeMode.default",
	type: "boolean",
	default: true,
	ui: {
		tab: "tools",
		group: "Discovery & MCP",
		label: "Code Mode by default",
		description:
			"Start new sessions in Code Mode: the model sees only eval and a few control tools; every other tool is reached through the eval bridge.",
	},
});

/**
 * Token threshold above which a paste becomes a `local://paste-N.md` handle instead of inline
 * text. The eval prelude exposes each saved paste lazily as `inputs["paste-N"]`. `0` disables it.
 */
export const cfgInputLargeInputAsHandle = register({
	id: "input.largeInputAsHandle",
	type: "number",
	default: 0,
	ui: {
		tab: "interaction",
		group: "Input",
		label: "Large Paste Handles",
		description:
			'Pastes above this many tokens are saved to local://paste-N.md and only the handle is inserted; eval reads the content on demand as inputs["paste-N"]. 0 disables it.',
		options: [
			{ value: "0", label: "Off" },
			{ value: "2000", label: "2k tokens" },
			{ value: "10000", label: "10k tokens" },
			{ value: "50000", label: "50k tokens" },
		],
	},
});

/** Per-agent/role/model Code Mode rules. Config-file only; validated on load and write. */
export const cfgCodeModeScope = register({
	id: "codeMode.scope",
	type: "record",
	default: FACTORY_SCOPE as Readonly<Record<string, unknown>>,
	validate: validateScope,
});
