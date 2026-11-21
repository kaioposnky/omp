import { type } from "@oh-my-pi/omptype";
import type {
	AgentTool,
	AgentToolContext,
	AgentToolResult,
	AgentToolUpdateCallback,
	ToolApprovalDecision,
} from "@oh-my-pi/pi-agent-core";
import { invalidateMessageCache } from "@oh-my-pi/pi-agent-core/compaction";
import {
	collectToolCallsById,
	getToolResultMessage,
	isSkillReadToolResult,
} from "@oh-my-pi/pi-agent-core/compaction/tool-protection";
import type { ToolResultMessage } from "@oh-my-pi/pi-ai";
import * as natives from "@oh-my-pi/pi-natives";
import { resolvePromptCacheLookback } from "@oh-my-pi/pi-catalog/compat/prompt-cache-lookback";
import { ToolError } from "@oh-my-pi/pi-tui/tools/tool-errors";
import { prompt } from "@oh-my-pi/pi-utils";
import contextNotesDescription from "../prompts/tools/context-notes.md" with { type: "text" };
import contextNotesTextDescription from "../prompts/tools/context-notes-text.md" with { type: "text" };
import newContextDescription from "../prompts/tools/new-context.md" with { type: "text" };
import {
	CONTEXT_NOTES_ENTRY_TYPE,
	type ContextNotesEntry,
	getContextNotes,
	MAX_CONTEXT_NOTES_BYTES,
} from "../session/context-notes";
import { cfgCompactionExperimentalContextManagement } from "../session/context-settings";
import { getLatestCompactionEntry } from "../session/session-context";
import type { ToolSession } from ".";
import { throwIfAborted } from "./tool-errors";

const contextNotesSchema = type({
	"text?": type("string").describe(prompt.render(contextNotesTextDescription, { maxBytes: MAX_CONTEXT_NOTES_BYTES })),
});

const newContextSchema = type({});

const elideSchema = type({
	toolCallIds: "string[]",
	"reason?": "string",
});

export type ContextNotesParams = typeof contextNotesSchema.infer;
export type NewContextParams = typeof newContextSchema.infer;
export type ElideParams = typeof elideSchema.infer;

export interface ContextNotesToolDetails {
	entryId?: string;
	text: string;
	bytes?: number;
}

export interface NewContextToolDetails {
	requested: true;
}

/** Outcome of one `elide` call; every requested id lands in exactly one list. */
export interface ElideToolDetails {
	elided: string[];
	/** Targets before the compaction boundary or reads of `skill://`. */
	protected: string[];
	/** Targets inside the warm prompt-cache lookback window; retried later. */
	deferred: string[];
	missing: string[];
	tokensSaved: number;
	/** True when at least one target waits for the prompt cache to cool. */
	scheduled?: boolean;
}

type ExperimentalContextSessionManager = NonNullable<ToolSession["sessionManager"]>;

function resolveExperimentalContextSession(session: ToolSession): ExperimentalContextSessionManager | undefined {
	if (cfgCompactionExperimentalContextManagement.get(session.settings) !== true || session.isDisposed?.()) {
		return undefined;
	}
	const manager = session.sessionManager;
	const ownerId = session.getSessionId?.();
	if (!manager || !ownerId || manager.getSessionId?.() !== ownerId) return undefined;
	return manager;
}

/**
 * Resolves the live session journal only when experimental context management is enabled and
 * owned by this ToolSession. The identity comparison prevents advisor tools from writing the
 * parent agent's notebook or resolving its raw history.
 */
export function getExperimentalContextSession(session: ToolSession): ExperimentalContextSessionManager {
	const manager = resolveExperimentalContextSession(session);
	if (manager) return manager;
	if (cfgCompactionExperimentalContextManagement.get(session.settings) !== true) {
		throw new ToolError("Experimental context management is disabled.");
	}
	if (session.isDisposed?.()) {
		throw new ToolError("Experimental context management is unavailable because this session is disposed.");
	}
	throw new ToolError("Experimental context management is unavailable for this session.");
}

function createIfSupported<T extends ContextNotesTool | NewContextTool | ElideTool>(
	session: ToolSession,
	ToolClass: new (session: ToolSession) => T,
): T | null {
	return resolveExperimentalContextSession(session) ? new ToolClass(session) : null;
}

/** Reads or replaces the current branch's durable experimental notebook. */
export class ContextNotesTool implements AgentTool<typeof contextNotesSchema, ContextNotesToolDetails> {
	readonly name = "context_notes";
	readonly approval = (args: unknown): ToolApprovalDecision =>
		args !== null && typeof args === "object" && Object.hasOwn(args, "text") ? "write" : "read";
	readonly label = "Context Notes";
	readonly description = contextNotesDescription;
	readonly parameters = contextNotesSchema;
	// Strict-mode providers mark every property required, so an optional `text`
	// would force models to send `""` (a clear) just to read. Stay non-strict
	// so omitted `text` keeps meaning "read" while an explicit empty string clears.
	readonly strict = false;
	readonly loadMode = "essential" as const;
	readonly summary = "Read or replace persistent experimental context notes";

	constructor(private readonly session: ToolSession) {}

	static createIf(session: ToolSession): ContextNotesTool | null {
		return createIfSupported(session, ContextNotesTool);
	}

	async execute(
		_id: string,
		params: ContextNotesParams,
		signal?: AbortSignal,
		_onUpdate?: AgentToolUpdateCallback<ContextNotesToolDetails>,
		_context?: AgentToolContext,
	): Promise<AgentToolResult<ContextNotesToolDetails>> {
		const manager = getExperimentalContextSession(this.session);
		throwIfAborted(signal);
		if (params.text !== undefined && typeof params.text !== "string") {
			throw new ToolError("context_notes text must be a string.");
		}
		if (params.text === undefined) {
			const notes = getContextNotes(manager.getBranch());
			return {
				content: [{ type: "text", text: notes?.text ?? "No context notes are stored for this session branch." }],
				details: notes ? { entryId: notes.entryId, text: notes.text } : { entryId: undefined, text: "" },
			};
		}

		const bytes = Buffer.byteLength(params.text, "utf8");
		if (bytes > MAX_CONTEXT_NOTES_BYTES) {
			throw new ToolError(
				`Context notes are ${bytes} bytes; the limit is ${MAX_CONTEXT_NOTES_BYTES} UTF-8 bytes. Shorten the notebook and use history://current/full to recover raw detail.`,
			);
		}

		const ownerId = this.session.getSessionId?.();
		const branchLeafId = manager.getBranch().at(-1)?.id;
		await manager.ensureOnDisk();
		throwIfAborted(signal);
		const currentManager = getExperimentalContextSession(this.session);
		if (
			currentManager !== manager ||
			this.session.isDisposed?.() ||
			!ownerId ||
			this.session.getSessionId?.() !== ownerId ||
			manager.getSessionId?.() !== ownerId ||
			manager.getBranch().at(-1)?.id !== branchLeafId
		) {
			throw new ToolError("Experimental context notes were not saved because the session branch changed.");
		}

		const data: ContextNotesEntry = { version: 1, text: params.text };
		const entryId = manager.appendCustomEntry(CONTEXT_NOTES_ENTRY_TYPE, data);
		await manager.flush();
		return {
			content: [{ type: "text", text: "Context notes saved." }],
			details: { entryId, text: params.text, bytes },
		};
	}
}

/** Requests a fresh context window; the owning lifecycle consumes this turn-local signal. */
export class NewContextTool implements AgentTool<typeof newContextSchema, NewContextToolDetails> {
	readonly name = "new_context";
	readonly approval = "write" as const;
	readonly label = "New Context";
	readonly description = newContextDescription;
	readonly parameters = newContextSchema;
	readonly strict = true;
	readonly loadMode = "essential" as const;
	readonly summary = "Request a fresh context window";

	constructor(private readonly session: ToolSession) {}

	static createIf(session: ToolSession): NewContextTool | null {
		return createIfSupported(session, NewContextTool);
	}

	async execute(
		_id: string,
		_params: NewContextParams,
		signal?: AbortSignal,
		_onUpdate?: AgentToolUpdateCallback<NewContextToolDetails>,
		_context?: AgentToolContext,
	): Promise<AgentToolResult<NewContextToolDetails>> {
		getExperimentalContextSession(this.session);
		throwIfAborted(signal);
		return {
			content: [{ type: "text", text: "New context window requested." }],
			details: { requested: true },
		};
	}
}

/**
 * Model-initiated elision of tool results it has already consumed: each target is blanked to
 * `[Elided by model - N tokens]`, leaving the raw output recoverable through `history://` and
 * artifacts. Mirrors the automatic prune pass's guardrails — never before the latest compaction's
 * `keepBoundaryId`, never a `skill://` read, and never inside the provider's warm prompt-cache
 * lookback window (those targets are reported as deferred instead).
 */
export class ElideTool implements AgentTool<typeof elideSchema, ElideToolDetails> {
	readonly name = "elide";
	readonly approval = "write" as const;
	readonly label = "Elide Tool Results";
	readonly description =
		"Blank tool results you have already read, replacing each with a short `[Elided by model - N tokens]` notice to free context. Targets before the latest compaction boundary and `skill://` reads are kept; targets inside the warm prompt-cache lookback are reported as deferred and can be retried after the next turn. Returns which ids were elided, kept, or deferred.";
	readonly parameters = elideSchema;
	readonly strict = true;
	readonly loadMode = "essential" as const;
	readonly summary = "Blank consumed tool results to save context";

	constructor(private readonly session: ToolSession) {}

	static createIf(session: ToolSession): ElideTool | null {
		return createIfSupported(session, ElideTool);
	}

	async execute(
		_id: string,
		params: ElideParams,
		signal?: AbortSignal,
		_onUpdate?: AgentToolUpdateCallback<ElideToolDetails>,
		_context?: AgentToolContext,
	): Promise<AgentToolResult<ElideToolDetails>> {
		const manager = getExperimentalContextSession(this.session);
		throwIfAborted(signal);
		const toolCallIds = [...new Set(params.toolCallIds.map(id => id.trim()).filter(id => id.length > 0))];
		if (toolCallIds.length === 0) {
			throw new ToolError("elide requires at least one toolCallId.");
		}

		const branch = manager.getBranch();
		const boundaryId = getLatestCompactionEntry(branch)?.firstKeptEntryId;
		const boundaryIndex = Math.max(
			0,
			boundaryId === undefined ? -1 : branch.findIndex(entry => entry.id === boundaryId),
		);
		const toolCalls = collectToolCallsById(branch);
		// Latest result wins for a call id that appears more than once on the branch.
		const results = new Map<string, { message: ToolResultMessage; index: number }>();
		for (let index = branch.length - 1; index >= 0; index--) {
			const message = getToolResultMessage(branch[index]!);
			if (!message || results.has(message.toolCallId)) continue;
			results.set(message.toolCallId, { message, index });
		}
		const activeModel = this.session.getActiveModel?.();
		const lookback = activeModel ? resolvePromptCacheLookback(activeModel) : undefined;
		// First index the provider cache still covers; without a known lookback nothing defers.
		const lookbackFloor = lookback === undefined ? Number.POSITIVE_INFINITY : branch.length - lookback;

		const elided: string[] = [];
		const kept: string[] = [];
		const deferred: string[] = [];
		const missing: string[] = [];
		let tokensSaved = 0;
		const prunedAt = Date.now();
		for (const toolCallId of toolCallIds) {
			const target = results.get(toolCallId);
			if (!target) {
				missing.push(toolCallId);
				continue;
			}
			if (
				target.index < boundaryIndex ||
				isSkillReadToolResult({ toolResult: target.message, toolCall: toolCalls.get(toolCallId) })
			) {
				kept.push(toolCallId);
				continue;
			}
			if (target.index >= lookbackFloor) {
				deferred.push(toolCallId);
				continue;
			}
			const text = target.message.content.map(block => (block.type === "text" ? block.text : "")).join("\n");
			const tokens = natives.countTokens(text, natives.Encoding.ClaudeV5);
			target.message.content = [{ type: "text", text: `[Elided by model - ${tokens} tokens]` }];
			target.message.prunedAt = prunedAt;
			invalidateMessageCache(target.message);
			tokensSaved += tokens;
			elided.push(toolCallId);
		}
		if (elided.length > 0) await manager.rewriteEntries?.();

		const parts: string[] = [];
		if (elided.length > 0) {
			parts.push(`Elided ${elided.length} tool result(s), saving ${tokensSaved} tokens: ${elided.join(", ")}.`);
		}
		if (deferred.length > 0) {
			parts.push(
				`Deferred ${deferred.length} target(s) inside the warm prompt-cache lookback window: ${deferred.join(", ")}. Retry after the next turn.`,
			);
		}
		if (kept.length > 0) {
			parts.push(
				`Kept ${kept.length} protected target(s) (before the compaction boundary or a skill:// read): ${kept.join(", ")}.`,
			);
		}
		if (missing.length > 0) parts.push(`No tool result found for: ${missing.join(", ")}.`);
		const reason = params.reason?.trim();
		if (reason) parts.push(`Reason: ${reason}`);
		return {
			content: [{ type: "text", text: parts.length > 0 ? parts.join(" ") : "Nothing to elide." }],
			details: {
				elided,
				protected: kept,
				deferred,
				missing,
				tokensSaved,
				...(deferred.length > 0 ? { scheduled: true } : {}),
			},
		};
	}
}
