#!/usr/bin/env bun
/**
 * Deterministic checker for fx-parser: runs the fixture's tests, then re-checks
 * the operator semantics directly.
 * Usage: bun parser.ts <workspace>
 */
import * as path from "node:path";

if (!process.argv[2]) {
	console.error("FAIL: missing workspace argument");
	process.exit(2);
}
const workspace = path.resolve(process.argv[2]);

function fail(message: string): never {
	console.error(`FAIL: ${message}`);
	process.exit(1);
}

const tests = Bun.spawnSync(["bun", "test"], { cwd: workspace, stdout: "pipe", stderr: "pipe" });
if (tests.exitCode !== 0) {
	const output = `${tests.stdout.toString()}\n${tests.stderr.toString()}`.trim();
	fail(`bun test exited ${tests.exitCode}\n${output.slice(-4000)}`);
}

const tokenizer = await import(path.join(workspace, "src/tokenizer.ts"));
const tokens = tokenizer.tokenize("12 + 30");
const numbers = tokens
	.filter((token: { kind: string }) => token.kind === "number")
	.map((token: { value: number }) => token.value);
if (JSON.stringify(numbers) !== "[12,30]") fail(`tokenize("12 + 30") numbers => ${JSON.stringify(numbers)}`);

const evaluator = await import(path.join(workspace, "src/eval.ts"));
const cases: Array<[string, number]> = [
	["1 + 2", 3],
	["12 + 30", 42],
	["2 + 3 * 4", 14],
	["10 - 3 - 2", 5],
	["100 / 4 / 5", 5],
	["(2 + 3) * 4", 20],
	["7 * (1 + 1) - 4 / 2", 12],
];
for (const [expression, expected] of cases) {
	const actual = evaluator.evaluate(expression);
	if (actual !== expected) fail(`evaluate(${JSON.stringify(expression)}) => ${actual}, expected ${expected}`);
}
try {
	evaluator.evaluate("1 % 2");
	fail("evaluate accepted an unknown operator");
} catch {}
try {
	evaluator.evaluate("1 / 0");
	fail("evaluate accepted division by zero");
} catch {}

console.log("PASS parser");
