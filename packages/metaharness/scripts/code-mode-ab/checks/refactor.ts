#!/usr/bin/env bun
/**
 * Deterministic checker for fx-refactor: runs the fixture's tests, verifies the
 * shared validator exists and is used by every route, with behavior unchanged.
 * Usage: bun refactor.ts <workspace>
 */
import * as fs from "node:fs/promises";
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

let validate: { validateField?: unknown };
try {
	validate = await import(path.join(workspace, "src/validate.ts"));
} catch (error) {
	fail(`cannot import src/validate.ts: ${(error as Error).message}`);
}
if (typeof validate.validateField !== "function") fail("src/validate.ts does not export validateField");
const validateField = validate.validateField as (record: Record<string, unknown>, field: string) => string;
if (validateField({ a: "x" }, "a") !== "x") fail("validateField did not return the field value");
for (const record of [{} as Record<string, unknown>, { a: "" }, { a: 7 }]) {
	try {
		validateField(record, "a");
		fail(`validateField accepted ${JSON.stringify(record)}`);
	} catch {}
}

for (const relative of ["src/routes/users.ts", "src/routes/orders.ts", "src/routes/products.ts"]) {
	const text = await fs.readFile(path.join(workspace, relative), "utf8");
	if (!/from\s+["']\.\.\/validate(\.ts)?["']/.test(text)) fail(`${relative} does not import ../validate`);
	if (/function\s+requireField\b/.test(text)) fail(`${relative} still defines a local requireField`);
}

const users = await import(path.join(workspace, "src/routes/users.ts"));
const orders = await import(path.join(workspace, "src/routes/orders.ts"));
const products = await import(path.join(workspace, "src/routes/products.ts"));
if (JSON.stringify(users.userRoute({ name: "ada" })) !== '{"ok":true,"name":"ada"}') fail("userRoute behavior changed");
if (JSON.stringify(orders.orderRoute({ orderId: "o-1", total: 42 })) !== '{"ok":true,"orderId":"o-1","total":42}')
	fail("orderRoute behavior changed");
if (JSON.stringify(products.productRoute({ sku: "s-9", active: true })) !== '{"ok":true,"sku":"s-9","active":true}')
	fail("productRoute behavior changed");
try {
	users.userRoute({ name: "" });
	fail("userRoute stopped rejecting empty names");
} catch (error) {
	if (!String((error as Error).message).includes("missing field: name"))
		fail(`userRoute error message changed: ${(error as Error).message}`);
}

console.log("PASS refactor");
