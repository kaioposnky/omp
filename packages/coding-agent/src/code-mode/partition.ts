/**
 * Code Mode tool partition: the wire carries only {@link CODE_MODE_TOP_LEVEL} (plus explicitly
 * pinned tools); everything else stays reachable through the eval bridge only.
 */

/** Tools that stay on the wire in Code Mode. `checkpoint`/`rewind` only work as direct tool results. */
export const CODE_MODE_TOP_LEVEL: readonly string[] = Object.freeze([
	"eval",
	"wait",
	"yield",
	"ask",
	"todo",
	"checkpoint",
	"rewind",
]);

const TOP_LEVEL_SET: ReadonlySet<string> = new Set(CODE_MODE_TOP_LEVEL);

export interface CodeModePartitionOptions {
	/** Tool names pinned to the wire by the caller (explicit `toolNames`, presentation pins). */
	pinned?: Iterable<string>;
}

export interface CodeModePartition {
	topLevel: string[];
	bridgeOnly: string[];
}

/** Splits `names` into wire and bridge-only sets; order and first occurrence are preserved. */
export function applyCodeModePartition(names: Iterable<string>, opts: CodeModePartitionOptions = {}): CodeModePartition {
	const pinned = new Set(opts.pinned ?? []);
	const seen = new Set<string>();
	const topLevel: string[] = [];
	const bridgeOnly: string[] = [];
	for (const name of names) {
		if (seen.has(name)) continue;
		seen.add(name);
		if (TOP_LEVEL_SET.has(name) || pinned.has(name)) topLevel.push(name);
		else bridgeOnly.push(name);
	}
	return { topLevel, bridgeOnly };
}

