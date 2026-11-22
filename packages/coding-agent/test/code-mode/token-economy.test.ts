/**
 * Code Mode token economy: prompt-prefix stability, wire-token reduction,
 * bridge catalog output, suffix router hints, and eval output limits.
 */
import { describe, expect, it } from "bun:test";
import { type } from "@oh-my-pi/omptype";
import { createMockModel } from "@oh-my-pi/pi-ai/providers/mock";
import { toolWireSchema } from "@oh-my-pi/pi-ai/utils/schema";
import * as natives from "@oh-my-pi/pi-natives";
import { ModelRegistry } from "@oh-my-pi/pi-coding-agent/config/model-registry";
import { Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import type { ExtensionFactory } from "@oh-my-pi/pi-coding-agent/extensibility/extensions/types";
import type { AgentSession } from "@oh-my-pi/pi-coding-agent/session/agent-session";
import { TempDir } from "@oh-my-pi/pi-utils";

import { createInMemoryAuthStorage } from "../helpers/agent-session-setup";
import { loadPlanned, makeCodeModeSession, mcpTool } from "./helpers";

const BASE_SETTINGS = {
	"marketplace.autoUpdate": "off",
	"compaction.enabled": false,
	"retry.enabled": false,
	"todo.enabled": false,
} as const;

/** Bytes that identify the provider-visible prefix: system prompt + wire tool schemas. */
function wirePrefix(session: AgentSession): string {
	return JSON.stringify({
		systemPrompt: session.systemPrompt,
		tools: session.agent.state.tools.map(tool => ({ name: tool.name, schema: toolWireSchema(tool) })),
	});
}

function tokenCount(text: string): number {
	return natives.countTokens(text, natives.Encoding.ClaudeV5);
}

function resultText(result: { content: Array<{ type: string; text?: string }> }): string {
	return result.content
		.filter(block => block.type === "text")
		.map(block => block.text ?? "")
		.join("\n");
}

describe("Code Mode token economy (§12)", () => {
	it("CM-E1 extension setActiveTools calls leave the wire prefix byte-identical", async () => {
		using dir = TempDir.createSync("@omp-cm-prefix-");
		const auth = createInMemoryAuthStorage();
		auth.keys.setRuntime("mock", "test-key");
		let toggled = 0;
		// Extensions act per turn (like the jev router), never during load.
		const factory: ExtensionFactory = pi => {
			for (let index = 0; index < 3; index++) {
				const name = `probe_toggle_${index}`;
				pi.registerTool({
					name,
					label: `Probe toggle ${index}`,
					description: `Inactive probe tool ${index}.`,
					parameters: type({}),
					defaultInactive: true,
					async execute() {
						return { content: [{ type: "text" as const, text: name }] };
					},
				});
			}
			pi.on("before_agent_start", async () => {
				const wire = pi.getActiveTools();
				await pi.setActiveTools([...wire, "probe_toggle_0"]);
				await pi.setActiveTools([...wire]);
				await pi.setActiveTools([...wire, "probe_toggle_1", "probe_toggle_2"]);
				toggled++;
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
			const before = wirePrefix(session);

			await session.prompt("hello");
			await session.waitForIdle();

			expect(toggled).toBeGreaterThan(0);
			expect(wirePrefix(session)).toBe(before);
		} finally {
			await session.dispose();
			auth.close();
		}
	});

	it("CM-E2 code-mode wire costs fewer ClaudeV5 tokens than the normal wire", async () => {
		using dir = TempDir.createSync("@omp-cm-tokens-");
		const settings = Settings.isolated(BASE_SETTINGS);
		const normal = await makeCodeModeSession({ cwd: dir.path(), codeMode: false, mcpTools: [mcpTool], settings });
		const code = await makeCodeModeSession({ cwd: dir.path(), codeMode: true, mcpTools: [mcpTool], settings });
		try {
			expect(normal.session.isCodeModeActive()).toBe(false);
			expect(code.session.isCodeModeActive()).toBe(true);
			const normalWire = wirePrefix(normal.session);
			const codeWire = wirePrefix(code.session);
			const normalTokens = tokenCount(normalWire);
			const codeTokens = tokenCount(codeWire);
			expect(normalTokens).toBeGreaterThan(0);
			expect(codeTokens).toBeLessThan(normalTokens);
		} finally {
			await normal.session.dispose();
			await code.session.dispose();
		}
	});

	it("CM-E3 bridge catalog sorts stably and collapses a >20-tool MCP server to one line", async () => {
		const catalog = await loadPlanned<{ renderBridgeCatalog: (tools: unknown[]) => string }>("code-mode/catalog");
		const small = [
			{ name: "read", description: "Read a file." },
			{ name: "bash", description: "Run a command." },
			{ name: "edit", description: "Edit a file." },
		];
		const sorted = catalog.renderBridgeCatalog(small);
		expect(sorted).toBe(catalog.renderBridgeCatalog([...small].reverse()));
		expect(sorted.indexOf("bash")).toBeLessThan(sorted.indexOf("edit"));
		expect(sorted.indexOf("edit")).toBeLessThan(sorted.indexOf("read"));

		const bigServer = Array.from({ length: 21 }, (_, index) => ({
			name: `mcp__big__tool_${String(index).padStart(2, "0")}`,
			description: `Big server tool ${index}.`,
			mcpServerName: "big",
		}));
		const collapsed = catalog.renderBridgeCatalog(bigServer);
		const serverLines = collapsed.split("\n").filter(line => line.includes("mcp__big__"));
		expect(serverLines).toHaveLength(1);
		expect(serverLines[0]).toMatch(/mcp__big__\*\s*\(21 tools\)/);
	});

	it("CM-E4 router hints land after the user message and never change the system prompt", async () => {
		using dir = TempDir.createSync("@omp-cm-hints-");
		const auth = createInMemoryAuthStorage();
		auth.keys.setRuntime("mock", "test-key");
		const hintText = "tool.read: Read a file.\nskill://probe-rule: probe routing";
		const { session } = await makeCodeModeSession({
			cwd: dir.path(),
			codeMode: true,
			model: createMockModel({ handler: { content: ["done"] } }),
			modelRegistry: new ModelRegistry(auth),
			extensions: [
				pi => {
					pi.on("before_agent_start", () => ({
						message: { customType: "router-hints", content: hintText, display: false },
					}));
				},
			],
			settings: Settings.isolated(BASE_SETTINGS),
		});
		try {
			expect(session.isCodeModeActive()).toBe(true);
			const promptBefore = session.systemPrompt.join("\n\n");

			await session.prompt("hello");
			await session.waitForIdle();

			const messages = session.messages as Array<{ role?: string; customType?: string; content?: unknown }>;
			const lastUserIndex = messages.findLastIndex(message => message.role === "user");
			const hintIndex = messages.findIndex(message => message.customType === "router-hints");
			expect(lastUserIndex).toBeGreaterThanOrEqual(0);
			expect(hintIndex).toBeGreaterThan(lastUserIndex);
			expect(session.systemPrompt.join("\n\n")).toBe(promptBefore);
		} finally {
			await session.dispose();
			auth.close();
		}
	});

	it("CM-E5 router hints over 600 tokens are trimmed or dropped", async () => {
		using dir = TempDir.createSync("@omp-cm-hints-budget-");
		const auth = createInMemoryAuthStorage();
		auth.keys.setRuntime("mock", "test-key");
		const oversized = Array.from({ length: 600 }, (_, index) => `hint line ${index} ${"x".repeat(40)}`).join("\n");
		const { session } = await makeCodeModeSession({
			cwd: dir.path(),
			codeMode: true,
			model: createMockModel({ handler: { content: ["done"] } }),
			modelRegistry: new ModelRegistry(auth),
			extensions: [
				pi => {
					pi.on("before_agent_start", () => ({
						message: { customType: "router-hints", content: oversized, display: false },
					}));
				},
			],
			settings: Settings.isolated(BASE_SETTINGS),
		});
		try {
			await session.prompt("hello");
			await session.waitForIdle();

			const messages = session.messages as Array<{ customType?: string; content?: unknown }>;
			const hint = messages.find(message => message.customType === "router-hints");
			// Trimmed to the budget, or dropped entirely; never forwarded verbatim.
			let hintTokens = 0;
			if (hint !== undefined && typeof hint.content === "string") hintTokens = tokenCount(hint.content);
			else if (hint !== undefined) hintTokens = tokenCount(JSON.stringify(hint.content));
			expect(hintTokens).toBeLessThanOrEqual(600);
		} finally {
			await session.dispose();
			auth.close();
		}
	});

	it("CM-E6 code-mode eval caps inline output below normal and spills the rest to a readable local:// file", async () => {
		using dir = TempDir.createSync("@omp-cm-eval-cap-");
		const settings = Settings.isolated(BASE_SETTINGS);
		const normal = await makeCodeModeSession({ cwd: dir.path(), codeMode: false, settings });
		const code = await makeCodeModeSession({ cwd: dir.path(), codeMode: true, settings });
		const cell = "for (let i = 0; i < 400; i++) console.log(`line-${i} ` + 'y'.repeat(200));";
		try {
			const run = async (session: AgentSession, source: string) => {
				const evalTool = session.agent.state.tools.find(tool => tool.name === "eval");
				expect(evalTool).toBeDefined();
				const result = await evalTool!.execute("call-eval", { language: "js", code: source });
				return resultText(result as { content: Array<{ type: string; text?: string }> });
			};
			const normalText = await run(normal.session, cell);
			const codeText = await run(code.session, cell);
			expect(normalText.length).toBeGreaterThan(10_000);
			expect(normalText).not.toContain("[raw output:");
			expect(codeText.length).toBeLessThan(normalText.length);
			const url = codeText.match(/\[raw output: (local:\/\/\d+\.log)\]/)?.[1];
			expect(url).toBeDefined();
			// The footer must name a link the cell can follow, with the elided middle intact.
			const readBack = await run(
				code.session,
				`const t = await read(${JSON.stringify(url)}); console.log(t.includes("line-200 "), t.includes("line-399 "));`,
			);
			expect(readBack).toContain("true true");
		} finally {
			await normal.session.dispose();
			await code.session.dispose();
		}
	});
});
