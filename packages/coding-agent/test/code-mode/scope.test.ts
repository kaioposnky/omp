/**
 * Code Mode F4: pure `resolveCodeMode` precedence, hard gates, globs, factory
 * defaults and settings validation.
 *
 * `src/code-mode/scope.ts` and `src/code-mode/settings.ts` are `[planned]`, so
 * they load through `loadPlanned` and every test stays `it.todo` until they
 * exist.
 */
import { describe, expect, it } from "bun:test";
import { Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import { type CodeModeDecision, loadPlanned } from "./helpers";

interface CodeModeScope {
	main?: boolean;
	agents?: Record<string, boolean>;
	roles?: Record<string, boolean>;
	models?: Array<{ match: string; enabled: boolean }>;
}

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

interface ScopeModule {
	resolveCodeMode(input: CodeModeResolveInput): CodeModeDecision;
}

interface SettingsModule {
	cfgCodeModeScope: { definition: { default: unknown } };
}

async function resolve(input: CodeModeResolveInput): Promise<CodeModeDecision> {
	const { resolveCodeMode } = await loadPlanned<ScopeModule>("code-mode/scope");
	return resolveCodeMode(input);
}

const NO_SCOPE: CodeModeScope = {};

describe("Code Mode scope resolution (F4)", () => {
	it("CM-S1 each precedence level beats the ones below it", async () => {
		const cases: Array<{ title: string; input: CodeModeResolveInput; source: CodeModeDecision["source"] }> = [
			{
				title: "session beats spawn, frontmatter, agents, models, roles, main and default",
				input: {
					isMain: true,
					sessionOverride: true,
					spawnOverride: false,
					agent: { name: "scout", codeMode: false, tools: ["eval"] },
					role: "smol",
					modelId: "anthropic/claude-haiku-5-5",
					settings: {
						default: false,
						scope: {
							main: false,
							agents: { scout: false },
							roles: { smol: false },
							models: [{ match: "*haiku*", enabled: false }],
						},
					},
					evalAvailable: true,
				},
				source: "session",
			},
			{
				title: "spawn beats frontmatter",
				input: {
					isMain: false,
					spawnOverride: true,
					agent: { name: "scout", codeMode: false, tools: ["eval"] },
					settings: { default: false, scope: NO_SCOPE },
					evalAvailable: true,
				},
				source: "spawn",
			},
			{
				title: "frontmatter beats scope.agents",
				input: {
					isMain: false,
					agent: { name: "scout", codeMode: true },
					settings: { default: false, scope: { agents: { scout: false } } },
					evalAvailable: true,
				},
				source: "frontmatter",
			},
			{
				title: "scope.agents beats scope.models",
				input: {
					isMain: false,
					agent: { name: "scout" },
					modelId: "anthropic/claude-haiku-5-5",
					settings: {
						default: false,
						scope: {
							agents: { scout: true },
							models: [{ match: "*haiku*", enabled: false }],
						},
					},
					evalAvailable: true,
				},
				source: "scope.agents",
			},
			{
				title: "scope.models beats scope.roles",
				input: {
					isMain: false,
					role: "smol",
					modelId: "anthropic/claude-haiku-5-5",
					settings: {
						default: false,
						scope: {
							roles: { smol: false },
							models: [{ match: "*haiku*", enabled: true }],
						},
					},
					evalAvailable: true,
				},
				source: "scope.models",
			},
			{
				title: "scope.roles beats scope.main and default",
				input: {
					isMain: true,
					role: "smol",
					settings: { default: false, scope: { main: false, roles: { smol: true } } },
					evalAvailable: true,
				},
				source: "scope.roles",
			},
			{
				title: "scope.main beats default",
				input: {
					isMain: true,
					settings: { default: false, scope: { main: true } },
					evalAvailable: true,
				},
				source: "scope.main",
			},
			{
				title: "default is the last rule",
				input: {
					isMain: false,
					settings: { default: true, scope: {} },
					evalAvailable: true,
				},
				source: "default",
			},
		];
		for (const entry of cases) {
			expect(await resolve(entry.input), entry.title).toMatchObject({ source: entry.source });
		}
	});

	it("CM-S2 the no-eval hard gate beats the session override", async () => {
		const decision = await resolve({
			isMain: true,
			sessionOverride: true,
			settings: { default: true, scope: { main: true } },
			evalAvailable: false,
		});
		expect(decision.enabled).toBe(false);
		expect(decision.source).toBe("hard-gate:no-eval");
	});

	it("CM-S3 agent frontmatter tools without eval deny the spawn request", async () => {
		const decision = await resolve({
			isMain: false,
			spawnOverride: true,
			agent: { name: "scout", tools: ["read", "bash"] },
			settings: { default: true, scope: { agents: { scout: true } } },
			evalAvailable: true,
		});
		expect(decision.enabled).toBe(false);
		expect(decision.source).toBe("hard-gate:agent-tools");
		expect(decision.denied?.requested).toBe(true);
		expect(decision.denied?.reason).toContain("no eval");
	});

	it("CM-S4 the first matching model glob wins in array order", async () => {
		const decision = await resolve({
			isMain: false,
			modelId: "anthropic/claude-haiku-5-5",
			settings: {
				default: false,
				scope: {
					models: [
						{ match: "*haiku*", enabled: false },
						{ match: "anthropic/*", enabled: true },
					],
				},
			},
			evalAvailable: true,
		});
		expect(decision.enabled).toBe(false);
		expect(decision.source).toBe("scope.models");
	});

	it("CM-S5 a role rule applies when no agent or model rule matches", async () => {
		const decision = await resolve({
			isMain: false,
			role: "smol",
			modelId: "openai/gpt-5",
			settings: { default: true, scope: { roles: { smol: false } } },
			evalAvailable: true,
		});
		expect(decision.enabled).toBe(false);
		expect(decision.source).toBe("scope.roles");
	});

	it("CM-S6 a child does not inherit the parent's session state", async () => {
		const decision = await resolve({
			isMain: false,
			sessionOverride: true,
			settings: { default: false, scope: {} },
			evalAvailable: true,
		});
		expect(decision.enabled).toBe(false);
		expect(decision.source).toBe("default");
	});

	it("CM-S7 factory defaults disable sonic, scout, smol and tiny only", async () => {
		const { cfgCodeModeScope } = await loadPlanned<SettingsModule>("code-mode/settings");
		const factory = cfgCodeModeScope.definition.default as CodeModeScope;
		expect(factory.agents?.sonic).toBe(false);
		expect(factory.agents?.scout).toBe(false);
		expect(factory.roles?.smol).toBe(false);
		expect(factory.roles?.tiny).toBe(false);
		expect(factory.main).toBeUndefined();

		const scout = await resolve({
			isMain: false,
			agent: { name: "scout" },
			settings: { default: true, scope: factory },
			evalAvailable: true,
		});
		expect(scout.enabled).toBe(false);
		expect(scout.source).toBe("scope.agents");
		const task = await resolve({
			isMain: false,
			agent: { name: "task" },
			settings: { default: true, scope: factory },
			evalAvailable: true,
		});
		expect(task.enabled).toBe(true);
		expect(task.source).toBe("default");
	});

	it("CM-S8 settings validation rejects a bad glob and accepts unknown agent names", async () => {
		await loadPlanned<SettingsModule>("code-mode/settings");
		expect(() => Settings.isolated({ "codeMode.scope": { models: [{ match: "[", enabled: true }] } })).toThrow();
		expect(() => Settings.isolated({ "codeMode.scope": { agents: { not_installed_yet: true } } })).not.toThrow();
	});

	it("CM-S9 the decision carries the source and detail shown by /code-mode status", async () => {
		const decision = await resolve({
			isMain: false,
			role: "smol",
			settings: { default: false, scope: { roles: { smol: false } } },
			evalAvailable: true,
		});
		expect(decision.source).toBe("scope.roles");
		expect(decision.detail).toBe("smol");

		const byModel = await resolve({
			isMain: false,
			modelId: "anthropic/claude-haiku-5-5",
			settings: {
				default: false,
				scope: { models: [{ match: "*haiku*", enabled: false }] },
			},
			evalAvailable: true,
		});
		expect(byModel.source).toBe("scope.models");
		expect(byModel.detail).toBeTruthy();
	});

	it("CM-S10 a restricted tool list without eval turns Code Mode off", async () => {
		const decision = await resolve({
			isMain: true,
			sessionOverride: true,
			restrictedToolNames: ["read", "bash"],
			settings: { default: true, scope: {} },
			evalAvailable: true,
		});
		expect(decision.enabled).toBe(false);
		expect(decision.source).toBe("hard-gate:restricted");
	});
});
