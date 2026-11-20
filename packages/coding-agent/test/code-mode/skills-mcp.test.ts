/**
 * Code Mode F6: skills, MCP and the extension surface (`pi.isCodeModeActive`,
 * `pi.setActiveTools`) stay usable while only the top-level tools reach the wire.
 *
 * Code Mode is `[planned]` (`src/code-mode/`, `createAgentSession({ codeMode })`,
 * `AgentSession.isCodeModeActive/getBridgeOnlyToolNames`). Every case is an
 * `it.todo` with a real body: `bun test --todo` runs the bodies so an
 * implementation that satisfies them turns "todo that passes" into the signal
 * to drop `.todo`.
 */
import { afterEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { type } from "@oh-my-pi/omptype";
import { createMockModel } from "@oh-my-pi/pi-ai/providers/mock";
import { ModelRegistry } from "@oh-my-pi/pi-coding-agent/config/model-registry";
import { Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import type { ExtensionAPI, ExtensionFactory } from "@oh-my-pi/pi-coding-agent/extensibility/extensions/types";
import { setActiveSkills, type Skill } from "@oh-my-pi/pi-coding-agent/extensibility/skills";
import { TempDir } from "@oh-my-pi/pi-utils";

import { createInMemoryAuthStorage } from "../helpers/agent-session-setup";
import { MCP_FIXTURE_TOOL_NAME, loadPlanned, makeCodeModeSession, mcpTool, wireToolNames } from "./helpers";

const BASE_SETTINGS = {
	"marketplace.autoUpdate": "off",
} as const;

/** A project skill on disk plus the registry entry `skill://` resolves through. */
function writeSkill(root: string, name = "probe-skill"): Skill {
	const baseDir = path.join(root, "skills", name);
	fs.mkdirSync(baseDir, { recursive: true });
	fs.writeFileSync(
		path.join(baseDir, "SKILL.md"),
		[
			"---",
			`name: ${name}`,
			"description: Probe skill for the Code Mode suite.",
			"---",
			"",
			"# Probe Skill",
			"",
			"PROBE_SKILL_BODY",
			"",
		].join("\n"),
	);
	return {
		name,
		description: "Probe skill for the Code Mode suite.",
		filePath: path.join(baseDir, "SKILL.md"),
		baseDir,
		source: "project",
	};
}

/** An extension factory that hands its `ExtensionAPI` back to the test. */
function captureExtension(): { factory: ExtensionFactory; api: () => ExtensionAPI } {
	let captured: ExtensionAPI | undefined;
	return {
		factory: pi => {
			captured = pi;
		},
		api: () => {
			if (!captured) throw new Error("extension factory did not run");
			return captured;
		},
	};
}

/** First text block of an AgentTool result. */
function resultText(result: { content: Array<{ type: string; text?: string }> }): string {
	return result.content
		.filter(block => block.type === "text")
		.map(block => block.text ?? "")
		.join("\n");
}

afterEach(() => {
	setActiveSkills([]);
});

describe("Code Mode skills and MCP (F6)", () => {
	it.todo("CM-C1 code mode keeps the skills block and points it at eval's read()", async () => {
		using dir = TempDir.createSync("@omp-cm-skills-");
		const skill = writeSkill(dir.path());
		setActiveSkills([skill]);
		const { session } = await makeCodeModeSession({
			cwd: dir.path(),
			codeMode: true,
			skills: [skill],
			settings: Settings.isolated(BASE_SETTINGS),
		});
		try {
			const prompt = session.systemPrompt.join("\n\n");
			expect(session.isCodeModeActive()).toBe(true);
			expect(prompt).toContain("# Skills & Rules");
			expect(prompt).toContain(skill.name);
			// The reader instruction must name eval's prelude read(), not a wire `read` tool.
			expect(prompt).toMatch(/read\(\s*["'`]skill:\/\//);
			expect(wireToolNames(session)).not.toContain("read");
		} finally {
			await session.dispose();
		}
	});

	it.todo("CM-C2 skill:// is readable through the bridged read tool", async () => {
		using dir = TempDir.createSync("@omp-cm-skill-read-");
		const skill = writeSkill(dir.path());
		setActiveSkills([skill]);
		const { session } = await makeCodeModeSession({
			cwd: dir.path(),
			codeMode: true,
			settings: Settings.isolated(BASE_SETTINGS),
		});
		try {
			expect(wireToolNames(session)).not.toContain("read");
			const readTool = session.getToolForEvalBridge("read");
			expect(readTool).toBeDefined();
			const result = await readTool!.execute("call-skill", { path: `skill://${skill.name}` });
			expect(resultText(result as { content: Array<{ type: string; text?: string }> })).toContain(
				"PROBE_SKILL_BODY",
			);
		} finally {
			await session.dispose();
		}
	});

	it.todo("CM-C3 code mode replaces the MCP Tool Routes block with the bridge catalog", async () => {
		using dir = TempDir.createSync("@omp-cm-mcp-");
		const { session } = await makeCodeModeSession({
			cwd: dir.path(),
			codeMode: true,
			mcpTools: [mcpTool],
			settings: Settings.isolated(BASE_SETTINGS),
		});
		try {
			const prompt = session.systemPrompt.join("\n\n");
			expect(prompt).not.toContain("MCP Tool Routes");
			expect(wireToolNames(session)).not.toContain(MCP_FIXTURE_TOOL_NAME);

			const catalog = await loadPlanned<{
				renderBridgeCatalog: (tools: unknown[]) => string;
			}>("code-mode/catalog");
			const bridgeTools = session
				.getBridgeOnlyToolNames()
				.map(name => session.getToolForEvalBridge(name))
				.filter((tool): tool is NonNullable<typeof tool> => tool !== undefined);
			expect(bridgeTools.map(tool => tool.name)).toContain(MCP_FIXTURE_TOOL_NAME);
			expect(catalog.renderBridgeCatalog(bridgeTools)).toContain(MCP_FIXTURE_TOOL_NAME);
		} finally {
			await session.dispose();
		}
	});

	it.todo("CM-C4 pi.setActiveTools dropping an MCP tool leaves it bridge-reachable", async () => {
		using dir = TempDir.createSync("@omp-cm-setactive-remove-");
		const auth = createInMemoryAuthStorage();
		auth.keys.setRuntime("mock", "test-key");
		let removed = false;
		// Extensions act per turn (like the jev router), never during load.
		const factory: ExtensionFactory = pi => {
			pi.on("before_agent_start", async () => {
				await pi.setActiveTools(pi.getActiveTools().filter(name => name !== MCP_FIXTURE_TOOL_NAME));
				removed = true;
			});
		};
		const { session } = await makeCodeModeSession({
			cwd: dir.path(),
			codeMode: true,
			mcpTools: [mcpTool],
			model: createMockModel({ handler: { content: ["done"] } }),
			modelRegistry: new ModelRegistry(auth),
			extensions: [factory],
			settings: Settings.isolated(BASE_SETTINGS),
		});
		try {
			expect(session.isCodeModeActive()).toBe(true);
			const wireBefore = wireToolNames(session);
			expect(session.getToolForEvalBridge(MCP_FIXTURE_TOOL_NAME)).toBeDefined();

			await session.prompt("hello");
			await session.waitForIdle();

			expect(removed).toBe(true);
			// Removals of a bridge-only tool are a no-op in Code Mode.
			expect(session.getToolForEvalBridge(MCP_FIXTURE_TOOL_NAME)).toBeDefined();
			expect(wireToolNames(session)).toEqual(wireBefore);
		} finally {
			await session.dispose();
			auth.close();
		}
	});

	it.todo("CM-C5 pi.setActiveTools additions stay bridge-only and leave the prompt intact", async () => {
		using dir = TempDir.createSync("@omp-cm-setactive-add-");
		const auth = createInMemoryAuthStorage();
		auth.keys.setRuntime("mock", "test-key");
		let activated = false;
		const factory: ExtensionFactory = pi => {
			pi.registerTool({
				name: "probe_extra",
				label: "Probe extra",
				description: "Extra tool registered by a Code Mode test extension.",
				parameters: type({}),
				defaultInactive: true,
				async execute() {
					return { content: [{ type: "text" as const, text: "extra" }] };
				},
			});
			pi.on("before_agent_start", async () => {
				await pi.setActiveTools([...pi.getActiveTools(), "probe_extra"]);
				activated = true;
			});
		};
		const { session } = await makeCodeModeSession({
			cwd: dir.path(),
			codeMode: true,
			model: createMockModel({ handler: { content: ["done"] } }),
			modelRegistry: new ModelRegistry(auth),
			extensions: [factory],
			settings: Settings.isolated(BASE_SETTINGS),
		});
		try {
			expect(session.isCodeModeActive()).toBe(true);
			const wireBefore = wireToolNames(session);
			const promptBefore = session.systemPrompt.join("\n\n");

			await session.prompt("hello");
			await session.waitForIdle();
			expect(activated).toBe(true);

			expect(session.getToolForEvalBridge("probe_extra")).toBeDefined();
			expect(session.getBridgeOnlyToolNames()).toContain("probe_extra");
			expect(wireToolNames(session)).toEqual(wireBefore);
			expect(session.systemPrompt.join("\n\n")).toBe(promptBefore);
		} finally {
			await session.dispose();
			auth.close();
		}
	});

	it.todo("CM-C6 pi.isCodeModeActive() matches the session state", async () => {
		using dir = TempDir.createSync("@omp-cm-extension-state-");
		const extension = captureExtension();
		const { session } = await makeCodeModeSession({
			cwd: dir.path(),
			codeMode: true,
			extensions: [extension.factory],
			settings: Settings.isolated(BASE_SETTINGS),
		});
		const normal = await makeCodeModeSession({
			cwd: dir.path(),
			codeMode: false,
			extensions: [captureExtension().factory],
			settings: Settings.isolated(BASE_SETTINGS),
		});
		try {
			const api = extension.api() as ExtensionAPI & { isCodeModeActive?: () => boolean };
			expect(typeof api.isCodeModeActive).toBe("function");
			expect(api.isCodeModeActive?.()).toBe(session.isCodeModeActive());
			expect(session.isCodeModeActive()).toBe(true);
			expect(normal.session.isCodeModeActive()).toBe(false);
		} finally {
			await session.dispose();
			await normal.session.dispose();
		}
	});
});
