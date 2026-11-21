#!/usr/bin/env bun
/**
 * Hidden quality probes (never shown to agents). Usage: bun hidden.ts <task> <workspace>
 * Prints one JSON line: { task, passed, total, failures[] }.
 */
// Workspace modules are imported dynamically on purpose: each run's workspace path is chosen at runtime.
import * as fs from "node:fs";
import * as path from "node:path";

const [task, wsArg] = process.argv.slice(2);
const ws = path.resolve(wsArg!);
const failures: string[] = [];
let total = 0;
const check = (name: string, fn: () => boolean | Promise<boolean>) => async () => {
	total++;
	try {
		if (!(await fn())) failures.push(name);
	} catch (e) {
		failures.push(`${name}: threw ${String(e).slice(0, 120)}`);
	}
};
const throws = (fn: () => unknown) => {
	try {
		fn();
		return false;
	} catch {
		return true;
	}
};
const cli = (args: string[]) => {
	const r = Bun.spawnSync(["bun", "src/cli.ts", ...args], { cwd: ws, stdout: "pipe", stderr: "pipe" });
	return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
};

const probes: Record<string, Array<() => Promise<void>>> = {
	pricing: [
		check(
			"large amount 123456789 BRL",
			async () => (await import(`${ws}/src/money.ts`)).formatMoney(123456789) === "R$ 1234567,89",
		),
		check(
			"negative USD -1999",
			async () => (await import(`${ws}/src/money.ts`)).formatMoney(-1999, "USD") === "-US$ 19,99",
		),
		check(
			"fractional cents truncate 1234.9",
			async () => (await import(`${ws}/src/money.ts`)).formatMoney(1234.9) === "R$ 12,34",
		),
		check("lowercase code rejected or mapped consistently", async () => {
			const m = await import(`${ws}/src/money.ts`);
			try {
				const v = m.formatMoney(100, "usd");
				return v === "US$ 1,00";
			} catch {
				return true;
			}
		}),
		check("prototype key 'toString' rejected", async () =>
			throws(() => require(`${ws}/src/money.ts`).formatMoney(100, "toString")),
		),
		check("empty code rejected", async () => throws(() => require(`${ws}/src/money.ts`).formatMoney(100, ""))),
		check(
			"receipt EUR forwarded",
			async () => (await import(`${ws}/src/receipt.ts`)).receiptLine(150, "EUR") === "Paid € 1,50",
		),
		check(
			"no formatCents left anywhere in src",
			async () =>
				!fs.readdirSync(`${ws}/src`).some(f => /\bformatCents\b/.test(fs.readFileSync(`${ws}/src/${f}`, "utf8"))),
		),
	],
	parser: [
		check(
			"10 - 2 - 3 = 5 (left assoc)",
			async () => (await import(`${ws}/src/eval.ts`)).evaluate("10 - 2 - 3") === 5,
		),
		check("100 / 10 / 5 = 2", async () => (await import(`${ws}/src/eval.ts`)).evaluate("100 / 10 / 5") === 2),
		check(
			"2 * 3 + 4 * 5 - 6 / 2 = 23",
			async () => (await import(`${ws}/src/eval.ts`)).evaluate("2 * 3 + 4 * 5 - 6 / 2") === 23,
		),
		check(
			"nested parens ((2+3)*(4-1))-5 = 10",
			async () => (await import(`${ws}/src/eval.ts`)).evaluate("((2+3)*(4-1))-5") === 10,
		),
		check(
			"multi-digit 1234 + 5678 = 6912",
			async () => (await import(`${ws}/src/eval.ts`)).evaluate("1234 + 5678") === 6912,
		),
		check("whitespace-free 8-4-2 = 2", async () => (await import(`${ws}/src/eval.ts`)).evaluate("8-4-2") === 2),
		check("trailing operator throws", async () => throws(() => require(`${ws}/src/eval.ts`).evaluate("1 +"))),
		check("unbalanced paren throws", async () => throws(() => require(`${ws}/src/eval.ts`).evaluate("(1 + 2"))),
		check("trailing garbage throws", async () => throws(() => require(`${ws}/src/eval.ts`).evaluate("1 + 2 )"))),
		check("empty input throws", async () => throws(() => require(`${ws}/src/eval.ts`).evaluate(""))),
	],
	cli: [
		check("--limit=2 or --limit 2 both work (space form)", async () => cli(["--limit", "2"]).code === 0),
		check("--limit 0 rejected (non-zero exit)", async () => cli(["--limit", "0"]).code !== 0),
		check("--limit -1 rejected", async () => cli(["--limit", "-1"]).code !== 0),
		check("--limit abc rejected", async () => cli(["--limit", "abc"]).code !== 0),
		check("--limit 1.5 rejected", async () => cli(["--limit", "1.5"]).code !== 0),
		check("--limit missing value rejected", async () => cli(["--limit"]).code !== 0),
		check("--limit followed by flag rejected", async () => cli(["--limit", "--json"]).code !== 0),
		check(
			"--limit 99 clamps to 5 records",
			async () => JSON.parse(cli(["--json", "--limit", "99"]).out).length === 5,
		),
		check(
			"flags reversed --limit 2 --json",
			async () => JSON.parse(cli(["--limit", "2", "--json"]).out).length === 2,
		),
		check("unknown flag still rejected", async () => cli(["--nope"]).code !== 0),
		check("parseArgs exported shape", async () => {
			const o = (await import(`${ws}/src/args.ts`)).parseArgs(["--json", "--limit", "3"]);
			return o.json === true && o.limit === 3;
		}),
	],
	refactor: [
		check(
			"validate.ts exports validateField",
			async () => typeof (await import(`${ws}/src/validate.ts`)).validateField === "function",
		),
		check(
			"no requireField definition left in routes",
			async () =>
				!fs
					.readdirSync(`${ws}/src/routes`)
					.some(f => /function\s+requireField/.test(fs.readFileSync(`${ws}/src/routes/${f}`, "utf8"))),
		),
		check("each route imports validateField", async () =>
			fs
				.readdirSync(`${ws}/src/routes`)
				.every(f =>
					/import\s*\{[^}]*validateField[^}]*\}\s*from\s*["']\.\.\/validate["']/.test(
						fs.readFileSync(`${ws}/src/routes/${f}`, "utf8"),
					),
				),
		),
		check("empty string rejected with exact message", async () => {
			try {
				(await import(`${ws}/src/validate.ts`)).validateField({ name: "" }, "name");
				return false;
			} catch (e) {
				return String((e as Error).message) === "missing field: name";
			}
		}),
		check("non-string rejected", async () =>
			throws(() => require(`${ws}/src/validate.ts`).validateField({ name: 5 }, "name")),
		),
		check(
			"value returned unchanged",
			async () => (await import(`${ws}/src/validate.ts`)).validateField({ sku: " A-1 " }, "sku") === " A-1 ",
		),
		check(
			"no stray helper files besides validate.ts",
			async () =>
				fs
					.readdirSync(`${ws}/src`)
					.filter(f => f.endsWith(".ts"))
					.sort()
					.join(",") === "types.ts,validate.ts",
		),
	],
};

for (const probe of probes[task!] ?? []) await probe();
console.log(JSON.stringify({ task, passed: total - failures.length, total, failures }));
