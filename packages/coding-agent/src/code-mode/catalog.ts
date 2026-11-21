/**
 * Bridge-only tool catalog for the Code Mode eval prompt: one stable line per tool, MCP servers
 * with more than {@link MCP_COLLAPSE_THRESHOLD} tools collapsed to one line.
 */
import { truncateHeadBytes } from "@oh-my-pi/pi-tui/tools/streaming-output";

export interface CatalogTool {
	name: string;
	description?: string;
	summary?: string;
	label?: string;
	mcpServerName?: string;
}

/** MCP servers with more tools than this collapse to `mcp__<server>__* (N tools)`. */
export const MCP_COLLAPSE_THRESHOLD = 20;
const SUMMARY_MAX_WORDS = 12;
const SUMMARY_MAX_BYTES = 160;
const SUMMARY_CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g;
const ELLIPSIS = "…";

function rawSummary(tool: CatalogTool): string {
	if (tool.summary) return tool.summary;
	const firstLine = (tool.description ?? "").split("\n").find(line => line.trim().length > 0);
	return firstLine?.trim() ?? tool.label ?? tool.name;
}

/** One-line summary: control chars stripped, ≤12 words, byte-bounded on a code point boundary. */
function catalogSummary(tool: CatalogTool): string {
	const cleaned = rawSummary(tool).replace(SUMMARY_CONTROL_CHARS, " ").trim();
	const words = cleaned.split(/\s+/).filter(Boolean);
	let text =
		words.length > SUMMARY_MAX_WORDS ? `${words.slice(0, SUMMARY_MAX_WORDS).join(" ")}${ELLIPSIS}` : words.join(" ");
	if (Buffer.byteLength(text, "utf-8") > SUMMARY_MAX_BYTES) {
		const budget = SUMMARY_MAX_BYTES - Buffer.byteLength(ELLIPSIS, "utf-8");
		text = `${truncateHeadBytes(text, budget).text.trimEnd()}${ELLIPSIS}`;
	}
	return text || tool.name;
}

/** Renders the catalog; deterministic for the same tool set regardless of input order. */
export function renderBridgeCatalog(tools: readonly CatalogTool[]): string {
	const unique = new Map<string, CatalogTool>();
	for (const tool of tools) if (!unique.has(tool.name)) unique.set(tool.name, tool);

	const byServer = new Map<string, number>();
	for (const tool of unique.values()) {
		if (tool.mcpServerName) byServer.set(tool.mcpServerName, (byServer.get(tool.mcpServerName) ?? 0) + 1);
	}

	const lines = new Map<string, string>();
	for (const tool of unique.values()) {
		const server = tool.mcpServerName;
		const count = server ? (byServer.get(server) ?? 0) : 0;
		if (server && count > MCP_COLLAPSE_THRESHOLD) {
			const key = `mcp__${server}__*`;
			lines.set(key, `${key} (${count} tools)`);
		} else {
			lines.set(tool.name, `${tool.name}: ${catalogSummary(tool)}`);
		}
	}
	return (
		[...lines.keys()]
			// UTF-8 byte order is Unicode code point order (unlike UTF-16 `<` or locale-dependent `localeCompare`).
			.sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
			.map(key => lines.get(key) as string)
			.join("\n")
	);
}
