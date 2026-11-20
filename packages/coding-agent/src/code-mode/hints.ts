/**
 * Router-hint message contract for Code Mode: a `customType: "router-hints"` message appended
 * AFTER the user message of the turn (never in the system prompt), capped at
 * {@link ROUTER_HINTS_TOKEN_BUDGET} tokens.
 */
import * as natives from "@oh-my-pi/pi-natives";

export const ROUTER_HINTS_CUSTOM_TYPE = "router-hints";
export const ROUTER_HINTS_TOKEN_BUDGET = 600;

export type TokenCounter = (text: string) => number;

/** Default counter: offline Claude encoding, matching `omp toks`. */
export function countHintTokens(text: string): number {
	return natives.countTokens(text, natives.Encoding.ClaudeV5);
}

/**
 * Fits hint text into {@link ROUTER_HINTS_TOKEN_BUDGET} by dropping trailing lines (producers list
 * highest-score items first). Returns `undefined` when not even the first line fits, meaning
 * "send no hints".
 */
export function fitRouterHints(content: string, count: TokenCounter = countHintTokens): string | undefined {
	if (count(content) <= ROUTER_HINTS_TOKEN_BUDGET) return content.length > 0 ? content : undefined;
	const lines = content.split("\n");
	let low = 0;
	let high = lines.length;
	// Largest prefix of lines within budget (token count is monotonic in prefix length).
	while (low < high) {
		const mid = Math.ceil((low + high) / 2);
		if (count(lines.slice(0, mid).join("\n")) <= ROUTER_HINTS_TOKEN_BUDGET) low = mid;
		else high = mid - 1;
	}
	if (low === 0) return undefined;
	return lines.slice(0, low).join("\n");
}
