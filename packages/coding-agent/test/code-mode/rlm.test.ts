/**
 * Code Mode "long inputs" (phase 3): large pastes become `local://paste-N.md`
 * handles, eval reads them lazily through `inputs[...]`, and the model-facing
 * `elide` tool blanks chosen tool results without touching protected history.
 *
 * Code Mode is `[planned]`; every case is an `it.todo` with a real body so
 * `bun test --todo` runs it as the implementation checklist.
 */
import { afterEach, describe, expect, it, vi } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { getBundledModel } from "@oh-my-pi/pi-catalog/models";
import { Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import { InputController } from "@oh-my-pi/pi-coding-agent/modes/controllers/input-controller";
import type { InteractiveModeContext } from "@oh-my-pi/pi-coding-agent/modes/types";
import type { AgentSession } from "@oh-my-pi/pi-coding-agent/session/agent-session";
import type { AssistantMessage, ToolResultMessage } from "@oh-my-pi/pi-ai";
import { SessionManager } from "@oh-my-pi/pi-coding-agent/session/session-manager";
import { removeWithRetries, TempDir } from "@oh-my-pi/pi-utils";

import { makeCodeModeSession } from "./helpers";

const BASE_SETTINGS = {
	"marketplace.autoUpdate": "off",
	"compaction.enabled": false,
} as const;

function resultText(result: { content: Array<{ type: string; text?: string }> }): string {
	return result.content
		.filter(block => block.type === "text")
		.map(block => block.text ?? "")
		.join("\n");
}

/** Minimal text tool result entry for a given call id. */
function toolResult(toolCallId: string, toolName: string, text: string): ToolResultMessage {
	return {
		role: "toolResult",
		toolCallId,
		toolName,
		content: [{ type: "text", text }],
		isError: false,
		timestamp: Date.now(),
	};
}

/** Assistant message carrying one tool call, paired with {@link toolResult}. */
function toolCallMessage(toolCallId: string, toolName: string, args: Record<string, unknown>): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "toolCall", id: toolCallId, name: toolName, arguments: args }],
		api: "openai-responses",
		provider: "openai",
		model: "mock",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "toolUse",
		timestamp: Date.now(),
	};
}

function userMessage(text: string) {
	return { role: "user" as const, content: [{ type: "text" as const, text }], timestamp: Date.now() };
}

/** `InputController` context for the large-paste path; mirrors test/input-controller-large-paste.test.ts. */
function createPasteController(options: { tokens: number; artifactsDir: string }) {
	const insertText = vi.fn();
	const insertTextAttachment = vi.fn();
	const showStatus = vi.fn();
	const showError = vi.fn();
	const ctx = {
		editor: { insertTextAttachment, insertText, pasteText: vi.fn() } as unknown as InteractiveModeContext["editor"],
		ui: { requestRender: vi.fn() } as unknown as InteractiveModeContext["ui"],
		settings: Settings.isolated({
			"input.largeInputAsHandle": options.tokens,
			"paste.largeMenuThreshold": 100,
		}),
		sessionManager: {
			getCwd: () => process.cwd(),
			getArtifactsDir: () => options.artifactsDir,
			getSessionId: () => "test-session",
		} as unknown as InteractiveModeContext["sessionManager"],
		showHookSelector: vi.fn(async () => undefined),
		showStatus,
		showError,
	} as unknown as InteractiveModeContext;
	return { controller: new InputController(ctx), spies: { insertText, insertTextAttachment, showStatus } };
}

/** Find a tool by name on the session's wire surface (Code Mode keeps `elide` there). */
function sessionTool(session: AgentSession, name: string) {
	const tool = session.agent.state.tools.find(candidate => candidate.name === name);
	if (!tool) throw new Error(`tool ${name} is not registered`);
	return tool;
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("Code Mode long inputs (RLM)", () => {
	it.todo("CM-R1 a paste over input.largeInputAsHandle becomes local://paste-N.md plus its size", async () => {
		const artifactsDir = await fs.mkdtemp(path.join(os.tmpdir(), "omp-cm-paste-"));
		try {
			const { controller, spies } = createPasteController({ tokens: 120, artifactsDir });
			const payload = Array.from({ length: 50 }, (_, index) => `line ${index} ${"z".repeat(20)}`).join("\n");

			const handled = await controller.handleLargePaste(payload, 50);

			expect(handled).toBe(true);
			expect(spies.insertTextAttachment).not.toHaveBeenCalled();
			expect(spies.insertText).toHaveBeenCalledWith(expect.stringMatching(/^local:\/\/paste-\d+\.md $/));
			const inserted = spies.insertText.mock.calls.at(-1)?.[0] as string;
			const name = inserted.trim().replace("local://", "");
			expect(await Bun.file(path.join(artifactsDir, "local", name)).text()).toBe(payload);
			expect(spies.showStatus).toHaveBeenCalledWith(expect.stringMatching(/\d+ lines|\d+ bytes/));
		} finally {
			await removeWithRetries(artifactsDir);
		}
	});

	it.todo("CM-R2 eval exposes a saved paste lazily through inputs[...] in code mode", async () => {
		using dir = TempDir.createSync("@omp-cm-inputs-");
		const sessionsDir = path.join(dir.path(), "sessions");
		const manager = SessionManager.create(dir.path(), sessionsDir);
		const artifactsDir = manager.getArtifactsDir();
		if (artifactsDir === null) throw new Error("expected the in-memory session to own an artifacts dir");
		await fs.mkdir(path.join(artifactsDir, "local"), { recursive: true });
		const body = "PASTE_BODY_LINE_1\nPASTE_BODY_LINE_2\n";
		await fs.writeFile(path.join(artifactsDir, "local", "paste-1.md"), body);

		const { session } = await makeCodeModeSession({
			cwd: dir.path(),
			codeMode: true,
			sessionManager: manager,
			settings: Settings.isolated(BASE_SETTINGS),
		});
		try {
			expect(session.isCodeModeActive()).toBe(true);
			const evalTool = sessionTool(session, "eval");
			const result = await evalTool.execute("call-inputs", {
				language: "js",
				code: 'const text = await inputs["paste-1"]; console.log(text.length);',
			});
			expect(resultText(result as { content: Array<{ type: string; text?: string }> })).toContain(
				String(body.length),
			);
		} finally {
			await session.dispose();
		}
	});

	it.todo("CM-R3 elide is registered only with compaction.experimentalContextManagement", async () => {
		using dir = TempDir.createSync("@omp-cm-elide-gate-");
		const off = await makeCodeModeSession({
			cwd: dir.path(),
			codeMode: true,
			settings: Settings.isolated({ ...BASE_SETTINGS, "compaction.experimentalContextManagement": false }),
		});
		const on = await makeCodeModeSession({
			cwd: dir.path(),
			codeMode: true,
			settings: Settings.isolated({ ...BASE_SETTINGS, "compaction.experimentalContextManagement": true }),
		});
		try {
			expect(off.session.getEnabledToolNames()).not.toContain("elide");
			expect(on.session.getEnabledToolNames()).toContain("elide");
			expect(sessionTool(on.session, "elide")).toBeDefined();
		} finally {
			await off.session.dispose();
			await on.session.dispose();
		}
	});

	it.todo("CM-R4 elide blanks its targets, sparing keepBoundaryId history and skill:// reads", async () => {
		using dir = TempDir.createSync("@omp-cm-elide-");
		const manager = SessionManager.create(dir.path(), path.join(dir.path(), "sessions"));
		manager.appendMessage(userMessage("start"));
		manager.appendMessage(toolCallMessage("tc-old", "read", { path: "src/old.ts" }));
		manager.appendMessage(toolResult("tc-old", "read", "OLD_RESULT_BODY"));
		const boundaryId = manager.appendMessage(userMessage("boundary"));
		manager.appendMessage(toolCallMessage("tc-new", "bash", { command: "ls" }));
		manager.appendMessage(toolResult("tc-new", "bash", "NEW_RESULT_BODY"));
		manager.appendMessage(toolCallMessage("tc-skill", "read", { path: "skill://probe-skill" }));
		manager.appendMessage(toolResult("tc-skill", "read", "SKILL_BODY"));
		manager.appendCompaction("summary", "s", boundaryId, 1_000);
		await manager.flush();

		const { session } = await makeCodeModeSession({
			cwd: dir.path(),
			codeMode: true,
			sessionManager: manager,
			settings: Settings.isolated({ ...BASE_SETTINGS, "compaction.experimentalContextManagement": true }),
		});
		try {
			const elide = sessionTool(session, "elide");
			await elide.execute("call-elide", { toolCallIds: ["tc-old", "tc-new", "tc-skill"], reason: "test" });

			const results = manager
				.getBranch()
				.flatMap(entry => (entry.type === "message" && entry.message.role === "toolResult" ? [entry.message] : []));
			const byCall = new Map(results.map(message => [message.toolCallId, message]));
			expect(resultText(byCall.get("tc-new")!)).toMatch(/\[Elided by model - \d+ tokens\]/);
			expect(resultText(byCall.get("tc-old")!)).toBe("OLD_RESULT_BODY");
			expect(resultText(byCall.get("tc-skill")!)).toBe("SKILL_BODY");
		} finally {
			await session.dispose();
		}
	});

	it.todo("CM-R5 elide defers a target inside the warm prompt-cache lookback window", async () => {
		using dir = TempDir.createSync("@omp-cm-elide-warm-");
		const manager = SessionManager.create(dir.path(), path.join(dir.path(), "sessions"));
		manager.appendMessage(userMessage("start"));
		manager.appendMessage(toolCallMessage("tc-warm", "bash", { command: "ls" }));
		manager.appendMessage(toolResult("tc-warm", "bash", "WARM_RESULT_BODY"));
		// The target sits at the tail of the branch, inside Anthropic's 20-block lookback.
		for (let index = 0; index < 4; index++) manager.appendMessage(userMessage(`filler ${index}`));
		await manager.flush();

		const model = getBundledModel("anthropic", "claude-sonnet-4-5");
		if (!model) throw new Error("expected bundled anthropic model");
		const { session } = await makeCodeModeSession({
			cwd: dir.path(),
			codeMode: true,
			model,
			sessionManager: manager,
			settings: Settings.isolated({ ...BASE_SETTINGS, "compaction.experimentalContextManagement": true }),
		});
		try {
			const elide = sessionTool(session, "elide");
			const result = await elide.execute("call-elide-warm", { toolCallIds: ["tc-warm"] });
			const details = result.details as { scheduled?: boolean; deferred?: boolean } | undefined;
			const scheduled = details?.scheduled === true || details?.deferred === true;
			expect(
				scheduled ||
					/schedul|defer/i.test(resultText(result as { content: Array<{ type: string; text?: string }> })),
			).toBe(true);
			const warm = manager
				.getBranch()
				.flatMap(entry => (entry.type === "message" && entry.message.role === "toolResult" ? [entry.message] : []))
				.find(message => message.toolCallId === "tc-warm");
			expect(resultText(warm!)).toBe("WARM_RESULT_BODY");
		} finally {
			await session.dispose();
		}
	});
});
