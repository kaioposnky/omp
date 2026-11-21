/**
 * Host side of the eval prelude's tool-discovery surface.
 *
 * Both kernels reach these through reserved bridge calls — `__describe__` and
 * `__search__` — exactly like `__status__`/`__wait__`, so the same code answers
 * JavaScript and Python cells and works with or without Code Mode. Discovery
 * walks the session's eval-bridge allowlist, which is the set the model can
 * actually invoke from a cell.
 */
import type { AgentTool } from "@oh-my-pi/pi-agent-core";
import { type Tool as AiTool, jsonSchemaToTypeScript, toolWireSchema } from "@oh-my-pi/pi-ai";
import { truncateHeadBytes } from "@oh-my-pi/pi-tui/tools/streaming-output";
import { ToolError } from "@oh-my-pi/pi-tui/tools/tool-errors";
import type { ToolSession } from "../tools";

/** Synthetic bridge name reserved for `tool.describe(name)`. */
export const EVAL_DESCRIBE_BRIDGE_NAME = "__describe__";
/** Synthetic bridge name reserved for `tool.search(query, k)`. */
export const EVAL_SEARCH_BRIDGE_NAME = "__search__";
/** Synthetic bridge name reserved for the `tool` proxy's real-tool shadow guard. */
export const EVAL_HAS_TOOL_BRIDGE_NAME = "__has_tool__";

/** One search hit: enough metadata to call the tool without loading its full schema. */
export interface ToolSearchEntry {
	name: string;
	summary: string;
	signature: string;
}

const DEFAULT_SEARCH_LIMIT = 5;
const MAX_SEARCH_LIMIT = 50;
const SUMMARY_MAX_WORDS = 12;
const SUMMARY_MAX_BYTES = 80;
const ELLIPSIS = "…";
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g;

/** Query terms that carry no signal when matching a tool's name or docs. */
const STOPWORDS: Record<string, true> = Object.fromEntries(
	[
		"a",
		"an",
		"and",
		"are",
		"as",
		"at",
		"be",
		"by",
		"can",
		"do",
		"for",
		"from",
		"how",
		"i",
		"in",
		"into",
		"is",
		"it",
		"me",
		"my",
		"of",
		"on",
		"or",
		"the",
		"this",
		"to",
		"use",
		"via",
		"what",
		"when",
		"with",
	].map(word => [word, true]),
);

/** Name-match weights: an exact name token beats a prefix, which beats a substring. */
const NAME_EXACT_WEIGHT = 10;
const NAME_PREFIX_WEIGHT = 6;
const NAME_SUBSTRING_WEIGHT = 4;
/** Summary/label occurrences count double a description hit: the summary is the curated one-liner. */
const SUMMARY_OCCURRENCE_WEIGHT = 2;
/** Description occurrences count up to this many per query token. */
const OCCURRENCE_CAP = 5;
/**
 * Byte budget for one result array. Kernel output caps every line at 768 bytes,
 * so a discovery result longer than this would lose its tail — and its JSON —
 * before the model ever sees it. Lowest-ranked entries drop first.
 */
const MAX_RESULT_BYTES = 520;

function bridgeToolNames(session: ToolSession): string[] {
	const names = session.getEvalBridgeToolNames?.() ?? [];
	return [...new Set(names)];
}

/** Same resolution as `tool-bridge.ts`: the bridge allowlist when present, no registry second chance. */
function resolveBridgeTool(session: ToolSession, name: string): AgentTool | undefined {
	return session.getToolForEvalBridge ? session.getToolForEvalBridge(name) : session.getToolByName?.(name);
}

/** Lowercased word tokens; camelCase splits and stopwords are dropped. */
function words(text: string): string[] {
	return text
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter(token => token.length > 1 && STOPWORDS[token] !== true);
}

/**
 * TypeScript parameter list for a tool, on one line: kernel output is capped per
 * line, so a multi-line signature would cost a discovery result its tail.
 */
function parameterTypes(tool: AgentTool, comments: boolean): string {
	const schema = jsonSchemaToTypeScript(toolWireSchema(tool as AiTool), { comments });
	const flat = schema
		.replace(/\s*\n\s*/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	return flat.replace(/^\{\s*/, "").replace(/\s*\}$/, "");
}

/** `(path: string; offset?: number)` — the entry's `name` already names the tool. */
function toolSignature(tool: AgentTool): string {
	return `(${parameterTypes(tool, false)})`;
}

/** `summary`, else the first non-empty description line, else the label — one line, byte-bounded. */
function toolSummary(tool: AgentTool): string {
	const raw =
		tool.summary ||
		(tool.description ?? "")
			.split("\n")
			.map(line => line.trim())
			.find(line => line.length > 0) ||
		tool.label ||
		tool.name;
	const words = raw.replace(CONTROL_CHARS, " ").trim().split(/\s+/).filter(Boolean);
	let text = words.slice(0, SUMMARY_MAX_WORDS).join(" ");
	if (words.length > SUMMARY_MAX_WORDS) text = `${text}${ELLIPSIS}`;
	if (Buffer.byteLength(text, "utf-8") > SUMMARY_MAX_BYTES) {
		const budget = SUMMARY_MAX_BYTES - Buffer.byteLength(ELLIPSIS, "utf-8");
		text = `${truncateHeadBytes(text, budget).text.trimEnd()}${ELLIPSIS}`;
	}
	return text || tool.name;
}

function searchLimit(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_SEARCH_LIMIT;
	return Math.min(MAX_SEARCH_LIMIT, Math.max(1, Math.floor(value)));
}

interface RankedTool {
	tool: AgentTool;
	/** Distinct query tokens the tool matched; primary sort key. */
	coverage: number;
	/** Weighted lexical score; tie-breaker inside a coverage band. */
	score: number;
}

function tokenCounts(text: string): Map<string, number> {
	const counts = new Map<string, number>();
	for (const token of words(text)) counts.set(token, (counts.get(token) ?? 0) + 1);
	return counts;
}

/** Long descriptions repeat a word; the cap keeps frequency from beating relevance. */
function cappedHits(counts: Map<string, number>, token: string): number {
	return Math.min(counts.get(token) ?? 0, OCCURRENCE_CAP);
}

function rankTool(tool: AgentTool, queryTokens: readonly string[]): RankedTool {
	const nameTokens = new Set(words(tool.name));
	const nameLower = tool.name.toLowerCase();
	const headline = tokenCounts(`${tool.summary ?? ""}\n${tool.label ?? ""}`);
	const description = tokenCounts(tool.description ?? "");

	let coverage = 0;
	let score = 0;
	for (const token of queryTokens) {
		let tokenScore = 0;
		if (nameTokens.has(token)) tokenScore += NAME_EXACT_WEIGHT;
		else if (token.length >= 3 && [...nameTokens].some(name => name.startsWith(token))) {
			tokenScore += NAME_PREFIX_WEIGHT;
		} else if (token.length >= 3 && nameLower.includes(token)) tokenScore += NAME_SUBSTRING_WEIGHT;

		tokenScore += cappedHits(headline, token) * SUMMARY_OCCURRENCE_WEIGHT;
		tokenScore += cappedHits(description, token);
		if (tokenScore > 0) coverage += 1;
		score += tokenScore;
	}
	return { tool, coverage, score };
}

/**
 * Rank bridge tools against `query` and return at most `k` entries.
 *
 * Deterministic: coverage first, then weighted score, then name code-point order.
 * An empty query lists tools alphabetically. Results stop at `MAX_RESULT_BYTES`
 * even below `k`, so the array always survives the kernel's per-line output cap.
 */
export function searchBridgeTools(session: ToolSession, query: unknown, limit: unknown): ToolSearchEntry[] {
	const text = typeof query === "string" ? query : "";
	const k = searchLimit(limit);
	const tools: AgentTool[] = [];
	for (const name of bridgeToolNames(session)) {
		// `eval` is the discovery surface itself: its description embeds the bridge
		// catalog, so ranking it would match almost any query and outrank the tool
		// the caller actually needs.
		if (name === "eval") continue;
		const tool = resolveBridgeTool(session, name);
		if (tool) tools.push(tool);
	}
	const queryTokens = [...new Set(words(text))];
	const ranked: { tool: AgentTool }[] =
		queryTokens.length === 0
			? [...tools].sort((a, b) => Buffer.compare(Buffer.from(a.name), Buffer.from(b.name))).map(tool => ({ tool }))
			: tools
					.map(tool => rankTool(tool, queryTokens))
					.filter(entry => entry.coverage > 0)
					.sort(
						(a, b) =>
							b.coverage - a.coverage ||
							b.score - a.score ||
							Buffer.compare(Buffer.from(a.tool.name), Buffer.from(b.tool.name)),
					);
	const entries: ToolSearchEntry[] = [];
	let bytes = 0;
	for (const { tool } of ranked.slice(0, k)) {
		const entry: ToolSearchEntry = {
			name: tool.name,
			summary: toolSummary(tool),
			signature: toolSignature(tool),
		};
		const cost =
			Buffer.byteLength(entry.name) + Buffer.byteLength(entry.summary) + Buffer.byteLength(entry.signature) + 40;
		if (entries.length > 0 && bytes + cost > MAX_RESULT_BYTES) break;
		entries.push(entry);
		bytes += cost;
	}
	return entries;
}

/**
 * Whether a real tool with this exact name is reachable through the bridge. The `tool` proxy
 * consults it so a genuine `describe`/`search` tool wins over the discovery helpers.
 */
export function bridgeToolExists(session: ToolSession, name: unknown): boolean {
	const toolName = typeof name === "string" ? name.trim() : "";
	return toolName.length > 0 && resolveBridgeTool(session, toolName) !== undefined;
}

/** TypeScript signature for one bridge tool; an unknown or truncated name throws. */
export function describeBridgeTool(session: ToolSession, name: unknown): string {
	const toolName = typeof name === "string" ? name.trim() : "";
	if (!toolName) throw new ToolError("tool.describe(name) needs the exact name of a bridge tool.");
	const tool = resolveBridgeTool(session, toolName);
	if (!tool) {
		throw new ToolError(
			`Unknown tool "${toolName}": it is not reachable through the eval bridge. Use tool.search("query") to find one.`,
		);
	}
	return `function ${tool.name}(${parameterTypes(tool, true)}): Promise<unknown>`;
}
