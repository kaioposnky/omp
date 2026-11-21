/**
 * Code Mode F2: settings defaults, CLI flags, session persistence/resume/fork,
 * `/code-mode` slash behavior, and the RPC state field.
 */
import { describe, expect, it } from "bun:test";
// Must evaluate before `builtin-modes`: the SDK graph initializes the slash
// command registry first, avoiding its module-init cycle when this file runs alone.
import { type CodeModeSession, makeCodeModeSession, wireToolNames } from "./helpers";
import type { Message } from "@oh-my-pi/pi-ai";
import { type Args, parseArgs } from "@oh-my-pi/pi-coding-agent/cli/args";
import { Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import { buildRpcWireBundle } from "@oh-my-pi/pi-coding-agent/modes/rpc/wire/index";
import { SessionManager } from "@oh-my-pi/pi-coding-agent/session/session-manager";
import { BUILTIN_MODE_SLASH_COMMANDS } from "@oh-my-pi/pi-coding-agent/slash-commands/builtin-modes";
import type { SlashCommandRuntime } from "@oh-my-pi/pi-coding-agent/slash-commands/types";
import { TempDir } from "@oh-my-pi/pi-utils";

function makeRuntime(session: CodeModeSession, outputs: string[]) {
	return {
		session,
		sessionManager: session.sessionManager,
		settings: session.settings,
		cwd: session.sessionManager.getCwd(),
		output: (text: string) => {
			outputs.push(text);
		},
		refreshCommands: () => {},
		reloadPlugins: async () => {},
	} as unknown as SlashCommandRuntime;
}

const userMessage = (text: string): Message => ({ role: "user", content: text, timestamp: Date.now() });

describe("Code Mode toggle (F2)", () => {
	it("CM-T1 codeMode.default decides the new session's state", async () => {
		using dir = TempDir.createSync("@omp-cm-t1-");
		const cwd = dir.path();
		const { session: on } = await makeCodeModeSession({
			cwd,
			hasUI: true,
			settings: Settings.isolated({ "marketplace.autoUpdate": "off", "codeMode.default": true }),
		});
		const { session: off } = await makeCodeModeSession({
			cwd,
			hasUI: true,
			settings: Settings.isolated({ "marketplace.autoUpdate": "off", "codeMode.default": false }),
			sessionManager: SessionManager.inMemory(cwd),
		});
		try {
			expect(on.isCodeModeActive()).toBe(true);
			expect(wireToolNames(on)).not.toContain("read");
			expect(off.isCodeModeActive()).toBe(false);
			expect(wireToolNames(off)).toContain("read");
		} finally {
			await on.dispose();
			await off.dispose();
		}
	});

	it("CM-T2 --code-mode and --no-code-mode parse into Args.codeMode", () => {
		const enabled = parseArgs(["--code-mode"]) as Args & { codeMode?: boolean };
		const disabled = parseArgs(["--no-code-mode"]) as Args & { codeMode?: boolean };
		const absent = parseArgs([]) as Args & { codeMode?: boolean };
		expect(enabled.codeMode).toBe(true);
		expect(disabled.codeMode).toBe(false);
		expect(absent.codeMode).toBeUndefined();
	});

	it("CM-T3 resume keeps the state recorded in the session file", async () => {
		using dir = TempDir.createSync("@omp-cm-t3-");
		const cwd = dir.path();
		const sessionDir = `${cwd}/sessions`;
		const manager = SessionManager.create(cwd, sessionDir);
		const { session: created } = await makeCodeModeSession({
			cwd,
			hasUI: true,
			codeMode: true,
			settings: Settings.isolated({ "marketplace.autoUpdate": "off" }),
			sessionManager: manager,
		});
		const file = manager.getSessionFile();
		if (!file) throw new Error("expected a persisted session file");
		manager.appendMessage(userMessage("persist code mode"));
		await manager.flush();
		await created.dispose();

		// Resume with the opposite default: the recorded state must win.
		const { session: resumed } = await makeCodeModeSession({
			cwd,
			hasUI: true,
			settings: Settings.isolated({ "marketplace.autoUpdate": "off", "codeMode.default": false }),
			sessionManager: SessionManager.inMemory(cwd),
		});
		try {
			expect(await resumed.switchSession(file)).toBe(true);
			expect(resumed.isCodeModeActive()).toBe(true);
			expect(resumed.messages.length).toBeGreaterThan(0);
		} finally {
			await resumed.dispose();
		}
	});

	it("CM-T4 fork inherits the source session's state", async () => {
		using dir = TempDir.createSync("@omp-cm-t4-");
		const cwd = dir.path();
		const sessionDir = `${cwd}/sessions`;
		const manager = SessionManager.create(cwd, sessionDir);
		const { session: source } = await makeCodeModeSession({
			cwd,
			hasUI: true,
			codeMode: true,
			settings: Settings.isolated({ "marketplace.autoUpdate": "off" }),
			sessionManager: manager,
		});
		const file = manager.getSessionFile();
		if (!file) throw new Error("expected a persisted session file");
		manager.appendMessage(userMessage("fork this transcript"));
		await manager.flush();
		await source.dispose();

		const forked = await SessionManager.forkFrom(file, cwd, sessionDir);
		const { session } = await makeCodeModeSession({
			cwd,
			hasUI: true,
			settings: Settings.isolated({ "marketplace.autoUpdate": "off", "codeMode.default": false }),
			sessionManager: forked,
		});
		try {
			expect(session.isCodeModeActive()).toBe(true);
			expect(session.messages.length).toBeGreaterThan(0);
			expect(session.messages.some(message => message.role === "user")).toBe(true);
		} finally {
			await session.dispose();
		}
	});

	it("CM-T5 /code-mode is a builtin mode command with on/off/status/default", () => {
		const spec = BUILTIN_MODE_SLASH_COMMANDS.find(command => command.name === "code-mode");
		expect(spec).toBeDefined();
		const subcommands = (spec?.subcommands ?? []).map(subcommand => subcommand.name);
		for (const name of ["on", "off", "status", "default"]) expect(subcommands).toContain(name);
		expect(typeof spec?.handle).toBe("function");
	});

	it("CM-T6 /code-mode on only applies in place to an empty session", async () => {
		using dir = TempDir.createSync("@omp-cm-t6-");
		const cwd = dir.path();
		const spec = BUILTIN_MODE_SLASH_COMMANDS.find(command => command.name === "code-mode");
		const handle = spec?.handle;
		if (!handle) throw new Error("/code-mode handler is not registered");

		// Both sessions start in normal mode so `/code-mode on` has something to switch.
		const { session: empty } = await makeCodeModeSession({
			cwd,
			hasUI: true,
			settings: Settings.isolated({ "marketplace.autoUpdate": "off", "codeMode.default": false }),
		});
		const { session: used } = await makeCodeModeSession({
			cwd,
			hasUI: true,
			settings: Settings.isolated({ "marketplace.autoUpdate": "off", "codeMode.default": false }),
			sessionManager: SessionManager.inMemory(cwd),
		});
		try {
			const emptyOutputs: string[] = [];
			await handle({ name: "code-mode", args: "on", text: "/code-mode on" }, makeRuntime(empty, emptyOutputs));
			expect(empty.isCodeModeActive()).toBe(true);

			used.agent.state.messages.push(userMessage("already talking"));
			const wireBefore = wireToolNames(used);
			const usedOutputs: string[] = [];
			await handle({ name: "code-mode", args: "on", text: "/code-mode on" }, makeRuntime(used, usedOutputs));
			expect(used.isCodeModeActive()).toBe(false);
			expect(wireToolNames(used)).toEqual(wireBefore);
			expect(usedOutputs.join("\n")).toMatch(/new session|restart|fresh session/i);
		} finally {
			await empty.dispose();
			await used.dispose();
		}
	});

	it("CM-T7 RPC session state exposes codeModeEnabled", () => {
		const bundle = buildRpcWireBundle();
		const sessionState = bundle.$defs.SessionState as { properties?: Record<string, unknown> } | undefined;
		expect(sessionState?.properties).toHaveProperty("codeModeEnabled");
		expect((sessionState?.properties?.codeModeEnabled as { type?: unknown } | undefined)?.type).toBe("boolean");
	});
});
