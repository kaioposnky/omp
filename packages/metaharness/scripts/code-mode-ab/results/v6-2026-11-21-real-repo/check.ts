#!/usr/bin/env bun
/**
 * Hidden checker for the real-repo tasks. Usage: bun check.ts <task> <repoRoot>
 * Prints one JSON line { task, ok, passed, total, failures[], testsOk, touchedOutside[] }.
 * The repo's module is imported dynamically on purpose: each run's checkout path is chosen at runtime.
 */
import * as path from "node:path";

const [task, rootArg] = process.argv.slice(2);
const root = path.resolve(rootArg!);
const utils = path.join(root, "packages/utils");
const failures: string[] = [];
let total = 0;
const eq = (name: string, actual: unknown, expected: unknown) => {
	total++;
	if (actual !== expected) failures.push(`${name}: got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`);
};
const safe = (name: string, fn: () => void) => {
	try {
		fn();
	} catch (e) {
		total++;
		failures.push(`${name}: threw ${String(e).slice(0, 100)}`);
	}
};

const fmt = await import(path.join(utils, "src/format.ts"));
const ALLOWED: Record<string, string[]> = {
	bytes: ["packages/utils/src/format.ts", "packages/utils/test/format.test.ts"],
	age: ["packages/utils/src/format.ts", "packages/utils/test/format-age.test.ts"],
	lru: ["packages/utils/src/lru.ts", "packages/utils/test/lru.test.ts"],
	truncate: ["packages/utils/src/format.ts", "packages/utils/test/format.test.ts"],
};

if (task === "bytes") {
	const f = fmt.formatBytes;
	safe("bytes", () => {
		eq("512", f(512), "512B");
		eq("0", f(0), "0B");
		eq("1023", f(1023), "1023B");
		eq("1024", f(1024), "1KB");
		eq("1536", f(1536), "1.5KB");
		eq("2048", f(2048), "2KB");
		eq("1048575", f(1048575), "1MB");
		eq("1048576", f(1048576), "1MB");
		eq("2.3MB", f(Math.round(2.3 * 1024 * 1024)), "2.3MB");
		eq("1GB", f(1024 ** 3), "1GB");
		eq("1.2GB", f(Math.round(1.2 * 1024 ** 3)), "1.2GB");
		eq("1TB", f(1024 ** 4), "1TB");
		eq("almost TB", f(1024 ** 4 - 1), "1TB");
		eq("-5", f(-5), "0B");
		eq("NaN", f(Number.NaN), "0B");
		eq("Inf", f(Number.POSITIVE_INFINITY), "0B");
	});
} else if (task === "age") {
	const f = fmt.formatAge;
	safe("age", () => {
		eq("null", f(null), "");
		eq("undefined", f(undefined), "");
		eq("0", f(0), "just now");
		eq("-5", f(-5), "just now");
		eq("NaN", f(Number.NaN), "just now");
		eq("-Inf", f(Number.NEGATIVE_INFINITY), "just now");
		eq("30", f(30), "just now");
		eq("90", f(90), "1m ago");
		eq("2h", f(7200), "2h ago");
		eq("3d", f(3 * 86400), "3d ago");
		eq("2w", f(15 * 86400), "2w ago");
		eq("2mo", f(65 * 86400), "2mo ago");
	});
} else if (task === "lru") {
	const { LRUCache } = await import(path.join(utils, "src/lru.ts"));
	safe("lru", () => {
		const disposed: string[] = [];
		const c = new LRUCache<string, number>({ max: 3, dispose: (_v: number, k: string) => disposed.push(k) });
		c.set("a", 1).set("b", 2).set("c", 3);
		eq("order", JSON.stringify(c.oldestKeys()), '["a","b","c"]');
		c.get("a");
		eq("after get", JSON.stringify(c.oldestKeys()), '["b","c","a"]');
		c.oldestKeys();
		eq("oldestKeys keeps recency", JSON.stringify(c.oldestKeys()), '["b","c","a"]');
		c.peek("b");
		eq("peek keeps recency", JSON.stringify(c.oldestKeys()), '["b","c","a"]');
		c.set("d", 4);
		eq("after evict", JSON.stringify(c.oldestKeys()), '["c","a","d"]');
		eq("returns array", Array.isArray(c.oldestKeys()), true);
		eq("no extra dispose", JSON.stringify(disposed), '["b"]');
		const realPerfNow = performance.now.bind(performance);
		let clock = 1_000_000;
		performance.now = (() => clock) as typeof performance.now;
		try {
			const tc = new LRUCache<string, number>({ max: 5, ttl: 1000 });
			tc.set("x", 1);
			clock += 500;
			tc.set("y", 2);
			clock += 700;
			eq("expired excluded", JSON.stringify(tc.oldestKeys()), '["y"]');
		} finally {
			performance.now = realPerfNow;
		}
		const t = new LRUCache<string, number>({ max: 5 });
		t.set("z", 1);
		t.clear();
		eq("empty", JSON.stringify(t.oldestKeys()), "[]");
	});
} else if (task === "truncate") {
	const f = fmt.truncate;
	safe("truncate", () => {
		eq("fits", f("hello", 5), "hello");
		eq("short", f("hello", 10), "hello");
		eq("cut", f("hello world", 8), "hello w…");
		eq("custom", f("hello world", 8, "..."), "hello...");
		eq("0", f("hello", 0), "");
		eq("1", f("hello", 1), "…");
		eq("2 with ...", f("hello", 2, "..."), "..");
		eq("3 with ...", f("hello", 3, "..."), "...");
		eq("neg", f("hello", -3), "");
		eq("NaN", f("hello", Number.NaN), "");
		eq("empty str", f("", 0), "");
		for (const n of [0, 1, 2, 3, 4, 7]) {
			total++;
			if (f("abcdefghij", n, "...").length > n) failures.push(`length>${n}`);
		}
	});
}

const tests = Bun.spawnSync(["bun", "test"], { cwd: utils, stdout: "pipe", stderr: "pipe" });
const testsOk = tests.exitCode === 0;
const diff = Bun.spawnSync(["git", "status", "--porcelain"], { cwd: root, stdout: "pipe" }).stdout.toString();
const touched = diff
	.split("\n")
	.filter(Boolean)
	.map(l => l.slice(3).trim());
const touchedOutside = touched.filter(p => !ALLOWED[task!]!.includes(p));
console.log(
	JSON.stringify({
		task,
		ok: failures.length === 0 && testsOk,
		passed: total - failures.length,
		total,
		failures,
		testsOk,
		touchedOutside,
	}),
);
