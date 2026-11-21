#!/usr/bin/env bun
/**
 * Deterministic checker for fx-cli: runs the fixture's tests, then drives the
 * real CLI entrypoint and validates the JSON/limit output contract.
 * Usage: bun cli.ts <workspace>
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

function runCli(args: string[]): string {
	const result = Bun.spawnSync(["bun", "src/cli.ts", ...args], { cwd: workspace, stdout: "pipe", stderr: "pipe" });
	if (result.exitCode !== 0) {
		fail(`bun src/cli.ts ${args.join(" ")} exited ${result.exitCode}\n${result.stderr.toString().slice(-2000)}`);
	}
	return result.stdout.toString();
}

const jsonTwo = runCli(["--json", "--limit", "2"]);
let parsed: unknown;
try {
	parsed = JSON.parse(jsonTwo);
} catch {
	fail(`--json output is not JSON: ${jsonTwo.slice(0, 400)}`);
}
if (!Array.isArray(parsed) || parsed.length !== 2)
	fail(`--json --limit 2 returned ${Array.isArray(parsed) ? parsed.length : typeof parsed} records`);
const ids = parsed.map((job: { id?: string }) => job.id);
if (JSON.stringify(ids) !== '["j-01","j-02"]') fail(`--limit 2 ids => ${JSON.stringify(ids)}`);
for (const job of parsed as Array<Record<string, unknown>>) {
	for (const key of ["id", "name", "status", "score"]) {
		if (!(key in job)) fail(`JSON record missing ${key}: ${JSON.stringify(job)}`);
	}
}

const jsonAll = runCli(["--json"]);
const all = JSON.parse(jsonAll) as unknown[];
if (all.length !== 5) fail(`--json returned ${all.length} records, expected 5`);

const table = runCli(["--limit", "1"]);
if (!table.includes("j-01")) fail(`table output does not mention j-01: ${table.slice(0, 400)}`);
if (table.includes("j-02")) fail("--limit 1 table still includes j-02");

console.log("PASS cli");
