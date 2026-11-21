/**
 * Code Mode F1: core partition, bridge reachability, approval gate, late MCP
 * reconciliation, `setActiveToolsByName` reconcile, and the no-eval fallback.
 */
import { describe, expect, it } from "bun:test";
import { type } from "@oh-my-pi/omptype";
import { Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import type { CustomTool } from "@oh-my-pi/pi-coding-agent/sdk";
import type {
	ClientBridge,
	ClientBridgePermissionOutcome,
	ClientBridgePermissionToolCall,
} from "@oh-my-pi/pi-coding-agent/session/client-bridge";
import { SessionManager } from "@oh-my-pi/pi-coding-agent/session/session-manager";
import { TempDir } from "@oh-my-pi/pi-utils";
import { MCP_FIXTURE_TOOL_NAME, loadPlanned, makeCodeModeSession, mcpTool, wireToolNames } from "./helpers";

const LATE_MCP_TOOL_NAME = "mcp__fixture_late";

const lateMcpTool: CustomTool = {
	name: LATE_MCP_TOOL_NAME,
	label: "Late fixture probe",
	description: "Registered after startup.",
	parameters: type({ query: "string" }),
	mcpServerName: "fixture",
	mcpToolName: "late",
	async execute() {
		return { content: [{ type: "text", text: "late" }] };
	},
};

function makeBridge(outcome: ClientBridgePermissionOutcome, calls: ClientBridgePermissionToolCall[]): ClientBridge {
	return {
		capabilities: { requestPermission: true },
		async requestPermission(toolCall) {
			calls.push(toolCall);
			return outcome;
		},
	};
}

describe("Code Mode partition (F1)", () => {
	it("CM-P1 code mode advertises only the top-level set", async () => {
		const { CODE_MODE_TOP_LEVEL } = await loadPlanned<{ CODE_MODE_TOP_LEVEL: string[] }>("code-mode/partition");
		using dir = TempDir.createSync("@omp-cm-p1-");
		const cwd = dir.path();
		const { session } = await makeCodeModeSession({
			cwd,
			hasUI: true,
			mcpTools: [mcpTool],
			codeMode: true,
		});
		try {
			const wire = wireToolNames(session);
			expect(wire.length).toBeGreaterThan(0);
			for (const name of wire) expect(CODE_MODE_TOP_LEVEL).toContain(name);
			expect(wire).toContain("eval");
			for (const name of ["read", "edit", "bash", "grep", "write", MCP_FIXTURE_TOOL_NAME]) {
				expect(wire).not.toContain(name);
			}
			expect(session.isCodeModeActive()).toBe(true);

			// Explicit `toolNames` are pinned top-level even when absent from the
			// partition constant ([planned] `presentationPinnedToolNames` path).
			const { session: pinned } = await makeCodeModeSession({
				cwd,
				codeMode: true,
				toolNames: ["eval", "read"],
				sessionManager: SessionManager.inMemory(cwd),
			});
			try {
				expect(wireToolNames(pinned)).toContain("read");
			} finally {
				await pinned.dispose();
			}
		} finally {
			await session.dispose();
		}
	});

	it("CM-P2 bridge-only tools stay reachable through the eval bridge", async () => {
		using dir = TempDir.createSync("@omp-cm-p2-");
		const { session } = await makeCodeModeSession({
			cwd: dir.path(),
			hasUI: true,
			mcpTools: [mcpTool],
			codeMode: true,
		});
		try {
			expect(session.getToolForEvalBridge("read")).toBeDefined();
			expect(session.getToolForEvalBridge(MCP_FIXTURE_TOOL_NAME)).toBeDefined();
			const enabled = session.getEnabledToolNames();
			expect(enabled).toContain("read");
			expect(enabled).toContain("edit");
			expect(enabled).toContain(MCP_FIXTURE_TOOL_NAME);
			expect(session.getBridgeOnlyToolNames()).toEqual(
				expect.arrayContaining(["read", "edit", MCP_FIXTURE_TOOL_NAME]),
			);
		} finally {
			await session.dispose();
		}
	});

	it("CM-P3 checkpoint, rewind, yield, ask and todo stay top-level when registered", async () => {
		using dir = TempDir.createSync("@omp-cm-p3-");
		const cwd = dir.path();
		// Default tool registration: an explicit `toolNames` list would pin every listed tool to the
		// wire (CM-P1), so these sessions let the partition decide what stays top-level.
		const { session } = await makeCodeModeSession({
			cwd,
			hasUI: true,
			codeMode: true,
			settings: Settings.isolated({ "marketplace.autoUpdate": "off", "checkpoint.enabled": true }),
		});
		const { session: yieldSession } = await makeCodeModeSession({
			cwd,
			codeMode: true,
			requireYieldTool: true,
			settings: Settings.isolated({ "marketplace.autoUpdate": "off" }),
			sessionManager: SessionManager.inMemory(cwd),
		});
		try {
			const wire = wireToolNames(session);
			for (const name of ["checkpoint", "rewind", "ask", "todo"]) expect(wire).toContain(name);
			expect(wire).not.toContain("read");
			expect(wire).not.toContain("bash");
			expect(session.getBridgeOnlyToolNames()).toEqual(expect.arrayContaining(["read", "bash"]));
			expect(wireToolNames(yieldSession)).toContain("yield");
			expect(wireToolNames(yieldSession)).not.toContain("read");
		} finally {
			await session.dispose();
			await yieldSession.dispose();
		}
	});

	it("CM-P4 MCP tools registered after startup land in the bridge-only layer", async () => {
		using dir = TempDir.createSync("@omp-cm-p4-");
		const { session } = await makeCodeModeSession({
			cwd: dir.path(),
			hasUI: true,
			mcpTools: [mcpTool],
			codeMode: true,
		});
		try {
			await session.refreshMCPTools([mcpTool, lateMcpTool]);
			expect(wireToolNames(session)).not.toContain(LATE_MCP_TOOL_NAME);
			expect(session.getEnabledToolNames()).toContain(LATE_MCP_TOOL_NAME);
			expect(session.getToolForEvalBridge(LATE_MCP_TOOL_NAME)).toBeDefined();
			expect(session.getBridgeOnlyToolNames()).toContain(LATE_MCP_TOOL_NAME);
		} finally {
			await session.dispose();
		}
	});

	it("CM-P5 setActiveToolsByName reconcile keeps the bridge-only layer", async () => {
		using dir = TempDir.createSync("@omp-cm-p5-");
		const { session } = await makeCodeModeSession({
			cwd: dir.path(),
			hasUI: true,
			codeMode: true,
		});
		try {
			const before = session.getBridgeOnlyToolNames();
			expect(before.length).toBeGreaterThan(0);
			// Goal-mode style reconcile: the top-level list gains `goal` and must
			// not collapse the bridge-only layer ([planned] `setActiveToolsByName`).
			await session.setActiveToolsByName([...session.getActiveToolNames(), "goal"]);
			expect(session.getBridgeOnlyToolNames()).toEqual(before);
			for (const name of ["read", "edit", "bash"]) expect(wireToolNames(session)).not.toContain(name);
			expect(session.getToolForEvalBridge("read")).toBeDefined();
		} finally {
			await session.dispose();
		}
	});

	it("CM-P6 eval backend unavailable falls back to normal mode", async () => {
		using dir = TempDir.createSync("@omp-cm-p6-");
		const cwd = dir.path();
		const settings = Settings.isolated({
			"marketplace.autoUpdate": "off",
			"eval.js": false,
			"eval.py": false,
		});
		const { session: normal } = await makeCodeModeSession({
			cwd,
			hasUI: true,
			settings,
		});
		const { session: requested } = await makeCodeModeSession({
			cwd,
			hasUI: true,
			codeMode: true,
			settings,
			sessionManager: SessionManager.inMemory(cwd),
		});
		try {
			expect(requested.isCodeModeActive()).toBe(false);
			expect(wireToolNames(requested).sort()).toEqual(wireToolNames(normal).sort());
			expect(wireToolNames(requested)).toContain("read");
		} finally {
			await normal.dispose();
			await requested.dispose();
		}
	});

	it("CM-P7 a bridged edit call goes through the same approval gate as direct dispatch", async () => {
		using dir = TempDir.createSync("@omp-cm-p7-");
		const cwd = dir.path();
		const settings = Settings.isolated({
			"marketplace.autoUpdate": "off",
			"edit.mode": "apply_patch",
		});
		const args = {
			input: `*** Begin Patch\n*** Delete File: ${cwd}/victim.txt\n*** End Patch`,
		};
		const reject = (): ClientBridgePermissionOutcome => ({ outcome: "selected", optionId: "reject_once" });

		const bridgeCalls: ClientBridgePermissionToolCall[] = [];
		const { session } = await makeCodeModeSession({ cwd, hasUI: true, codeMode: true, settings });
		const directCalls: ClientBridgePermissionToolCall[] = [];
		const { session: normal } = await makeCodeModeSession({
			cwd,
			hasUI: true,
			codeMode: false,
			settings,
			sessionManager: SessionManager.inMemory(cwd),
		});
		try {
			// Code Mode itself must be active: a normal session also exposes a
			// permission-wrapped `edit`, which would make this test pass without F1.
			expect(session.isCodeModeActive()).toBe(true);
			expect(wireToolNames(session)).not.toContain("edit");
			session.setClientBridge(makeBridge(reject(), bridgeCalls));
			const bridged = session.getToolForEvalBridge("edit");
			if (!bridged) throw new Error("bridged edit tool is not reachable");
			await expect(bridged.execute("cm-p7-bridged", args as never)).rejects.toThrow(/rejected/i);
			expect(bridgeCalls).toHaveLength(1);
			expect(bridgeCalls[0]?.toolName).toBe("edit");

			normal.setClientBridge(makeBridge(reject(), directCalls));
			const direct = normal.agent.state.tools.find(tool => tool.name === "edit");
			expect(direct).toBeDefined();
			await expect(direct!.execute("cm-p7-direct", args as never)).rejects.toThrow(/rejected/i);
			expect(directCalls).toHaveLength(1);
			expect(directCalls[0]?.toolName).toBe("edit");
		} finally {
			await session.dispose();
			await normal.dispose();
		}
	});
});
