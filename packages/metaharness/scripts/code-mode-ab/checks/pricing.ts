#!/usr/bin/env bun
/**
 * Deterministic checker for fx-pricing: runs the fixture's own test suite, then
 * re-verifies the money formatting contract straight from the workspace modules.
 * Usage: bun pricing.ts <workspace>
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";

const workspace = path.resolve(process.argv[2] ?? "");
if (!process.argv[2]) {
	console.error("FAIL: missing workspace argument");
	process.exit(2);
}

function fail(message: string): never {
	console.error(`FAIL: ${message}`);
	process.exit(1);
}

const tests = Bun.spawnSync(["bun", "test"], { cwd: workspace, stdout: "pipe", stderr: "pipe" });
if (tests.exitCode !== 0) {
	const output = `${tests.stdout.toString()}\n${tests.stderr.toString()}`.trim();
	fail(`bun test exited ${tests.exitCode}\n${output.slice(-4000)}`);
}

const money = await import(path.join(workspace, "src/money.ts"));
if (typeof money.formatMoney !== "function") fail("src/money.ts does not export formatMoney");
const cases: Array<[number, string | undefined, string]> = [
	[1234, undefined, "R$ 12,34"],
	[1234, "USD", "US$ 12,34"],
	[1234, "EUR", "€ 12,34"],
	[-5, undefined, "-R$ 0,05"],
	[0, undefined, "R$ 0,00"],
];
for (const [cents, currency, expected] of cases) {
	const actual = currency === undefined ? money.formatMoney(cents) : money.formatMoney(cents, currency);
	if (actual !== expected)
		fail(
			`formatMoney(${cents}, ${currency ?? "default"}) => ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`,
		);
}
try {
	money.formatMoney(10, "XYZ");
	fail("formatMoney accepted an unknown currency");
} catch {}

const cart = await import(path.join(workspace, "src/cart.ts"));
if (cart.cartTotal([1000, 250]) !== "Total: R$ 12,50") fail("cartTotal(…) mismatch");
if (cart.totalCents([1000, 250, 1]) !== 1251) fail("totalCents(…) mismatch");

const invoice = await import(path.join(workspace, "src/invoice.ts"));
if (invoice.invoiceLine({ id: "INV-1", cents: 9999 }) !== "INV-1: R$ 99,99") fail("invoiceLine(…) mismatch");

const receipt = await import(path.join(workspace, "src/receipt.ts"));
if (receipt.receiptLine(4200, "USD") !== "Paid US$ 42,00") fail("receiptLine(…, USD) mismatch");
if (receipt.receiptLine(4200) !== "Paid R$ 42,00") fail("receiptLine(…) mismatch");

for (const relative of ["src/money.ts", "src/cart.ts", "src/invoice.ts", "src/receipt.ts"]) {
	const text = await fs.readFile(path.join(workspace, relative), "utf8");
	if (/\bformatCents\b/.test(text)) fail(`${relative} still references formatCents`);
}

console.log("PASS pricing");
