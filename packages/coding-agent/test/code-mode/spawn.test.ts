/**
 * Code Mode spawn surface (F4/RF4.6b): the `task` item and `agent()` accept a
 * per-spawn `codeMode` flag, denials explain themselves to the model, and
 * `agent({ fork: true })` builds the child session from the parent's history.
 *
 * Code Mode is `[planned]`; every case is an `it.todo` with a real body so
 * `bun test --todo` runs it as the implementation checklist.
 */
import { afterEach, describe, expect, it, vi } from "bun:test";
import { AsyncJobManager } from "@oh-my-pi/pi-coding-agent/async";
import { Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import {
	type EvalAgentBridgeOptions,
	type EvalAgentResult,
	runEvalAgent,
} from "@oh-my-pi/pi-coding-agent/eval/agent-bridge";
import { runEvalWait } from "@oh-my-pi/pi-coding-agent/eval/handle-bridge";
import { SessionManager } from "@oh-my-pi/pi-coding-agent/session/session-manager";
import * as taskDiscovery from "@oh-my-pi/pi-coding-agent/task/discovery";
import * as taskExecutor from "@oh-my-pi/pi-coding-agent/task/executor";
import { getTaskSchema } from "@oh-my-pi/pi-coding-agent/task/types";
import type { AgentDefinition } from "@oh-my-pi/pi-coding-agent/task/types";
import type { ToolSession } from "@oh-my-pi/pi-coding-agent/tools";
import type { SingleResult } from "@oh-my-pi/pi-tui/tools/task";
import { TempDir } from "@oh-my-pi/pi-utils";

const jobManagers = new Set<AsyncJobManager>();

function createResult(overrides: Partial<SingleResult> = {}): SingleResult {
	return {
		index: 0,
		id: "0-Task",
		agent: "task",
		agentSource: "bundled",
		task: "do work",
		exitCode: 0,
		output: "done",
		stderr: "",
		truncated: false,
		durationMs: 1,
		tokens: 0,
		requests: 0,
		...overrides,
	};
}

function createSession(sessionFile: string | null): ToolSession {
	return {
		cwd: "/tmp",
		settings: Settings.isolated({ "compaction.enabled": false }),
		getSessionSpawns: () => "*",
		getSessionFile: () => sessionFile,
		asyncJobManager: undefined,
	} as unknown as ToolSession;
}

function agentDefinition(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
	return {
		name: "task",
		description: "Task agent",
		systemPrompt: "Handle task",
		source: "bundled",
		...overrides,
	};
}

function isEvalAgentResult(value: unknown): value is EvalAgentResult {
	return value !== null && typeof value === "object" && "text" in value && typeof value.text === "string";
}

async function runEvalAgentAndWait(args: unknown, options: EvalAgentBridgeOptions): Promise<EvalAgentResult> {
	let manager = options.session.asyncJobManager;
	if (!manager) {
		manager = new AsyncJobManager({});
		Object.assign(options.session, { asyncJobManager: manager });
	}
	jobManagers.add(manager);
	const handle = await runEvalAgent(args, options);
	const waited = await runEvalWait({ items: [{ kind: "agent", id: handle.id }] }, options);
	const snapshot = waited.items[0];
	if (!snapshot || snapshot.status === "running") throw new Error(`Agent handle ${handle.id} did not settle`);
	if (snapshot.status === "failed" || snapshot.status === "cancelled") {
		throw new Error(snapshot.error || `Agent handle ${handle.id} failed`);
	}
	const result = manager.getJob(handle.id)?.latestDetails?.evalResult;
	if (!isEvalAgentResult(result)) throw new Error(`Agent handle ${handle.id} returned no eval result`);
	return result;
}

afterEach(async () => {
	vi.restoreAllMocks();
	await Promise.all([...jobManagers].map(manager => manager.dispose()));
	jobManagers.clear();
});

describe("Code Mode spawn surface (F4)", () => {
	it.todo("CM-A1 agent() args schema accepts codeMode and rejects a non-boolean", async () => {
		vi.spyOn(taskDiscovery, "discoverAgents").mockResolvedValue({
			agents: [agentDefinition({ tools: ["read", "eval"] })],
			projectAgentsDir: null,
		});
		vi.spyOn(taskExecutor, "runSubprocess").mockResolvedValue(createResult());

		const session = createSession(null);
		const accepted = await runEvalAgentAndWait({ prompt: "do work", agent: "task", codeMode: true }, { session });
		expect(accepted.text).toBeDefined();

		// The field is validated, not silently dropped: a non-boolean must be refused.
		await expect(runEvalAgent({ prompt: "do work", agent: "task", codeMode: "yes" }, { session })).rejects.toThrow();
	});

	it.todo("CM-A2 a spawn without eval in its tools explains the codeMode denial", async () => {
		vi.spyOn(taskDiscovery, "discoverAgents").mockResolvedValue({
			agents: [agentDefinition({ name: "scout", tools: ["read", "grep"], model: ["anthropic/claude-haiku-5-5"] })],
			projectAgentsDir: null,
		});
		vi.spyOn(taskExecutor, "runSubprocess").mockResolvedValue(createResult({ agent: "scout", output: "done" }));

		const result = await runEvalAgentAndWait(
			{ prompt: "do work", agent: "scout", codeMode: true },
			{ session: createSession(null) },
		);
		expect(result.text).toContain("codeMode ignored: agent has no eval");
	});

	it.todo("CM-A3 the task item wire schema carries codeMode through to the spawn", () => {
		const schema = getTaskSchema({ isolationEnabled: false, batchEnabled: true });
		// ArkType schemas parse by call; the exported union type cannot express that call signature.
		const parse = schema as unknown as (value: unknown) => { tasks: Array<{ codeMode?: boolean }> };
		const parsed = parse({
			context: "team context",
			tasks: [{ agent: "task", task: "do work", solutionSpace: "one fix: given", codeMode: true }],
		});
		expect(parsed.tasks[0]?.codeMode).toBe(true);
	});

	it.todo("CM-A4 agent({ fork: true }) forks the child from the parent's persisted session", async () => {
		using dir = TempDir.createSync("@omp-cm-fork-");
		const sessionsDir = `${dir.path()}/sessions`;
		const parent = SessionManager.create(dir.path(), sessionsDir);
		parent.appendMessage({
			role: "user",
			content: [{ type: "text", text: "PARENT_FORK_MESSAGE" }],
			timestamp: Date.now(),
		});
		await parent.flush();
		const parentFile = parent.getSessionFile();
		if (!parentFile) throw new Error("persisted parent has no session file");

		vi.spyOn(taskDiscovery, "discoverAgents").mockResolvedValue({
			agents: [agentDefinition()],
			projectAgentsDir: null,
		});
		let forkedFrom: string | undefined;
		vi.spyOn(taskExecutor, "runSubprocess").mockImplementation(async options => {
			forkedFrom = options.preparedSession?.fork?.sourceFile;
			return createResult();
		});

		const result = await runEvalAgentAndWait(
			{ prompt: "do work", agent: "task", fork: true },
			{ session: createSession(parentFile) },
		);
		expect(result.text).toBeDefined();
		expect(forkedFrom).toBe(parentFile);

		const child = await SessionManager.forkFrom(parentFile, dir.path(), sessionsDir);
		const childText = JSON.stringify(child.getBranch());
		expect(childText).toContain("PARENT_FORK_MESSAGE");
	});

	it.todo("CM-A5 fork: true without a persisted parent session fails with a clear message", async () => {
		vi.spyOn(taskDiscovery, "discoverAgents").mockResolvedValue({
			agents: [agentDefinition()],
			projectAgentsDir: null,
		});
		vi.spyOn(taskExecutor, "runSubprocess").mockResolvedValue(createResult());

		// Keep the eval job manager available so the failure is fork-specific, not plumbing.
		const session = createSession(null);
		const manager = new AsyncJobManager({});
		jobManagers.add(manager);
		Object.assign(session, { asyncJobManager: manager });

		await expect(runEvalAgent({ prompt: "do work", agent: "task", fork: true }, { session })).rejects.toThrow(
			/fork.*(persisted|session file)|persisted.*session/i,
		);
	});
});
