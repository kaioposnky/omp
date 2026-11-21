import { describe, expect, test } from "bun:test";
import { parseArgs } from "../src/args";

describe("parseArgs", () => {
	test("defaults to a table", () => {
		expect(parseArgs([])).toEqual({ json: false });
	});

	test("parses --json", () => {
		expect(parseArgs(["--json"])).toEqual({ json: true });
	});

	test("parses --limit with a value", () => {
		expect(parseArgs(["--limit", "2"])).toEqual({ json: false, limit: 2 });
	});

	test("combines flags in any order", () => {
		expect(parseArgs(["--limit", "3", "--json"])).toEqual({ json: true, limit: 3 });
	});

	test("rejects a non-positive limit", () => {
		expect(() => parseArgs(["--limit", "0"])).toThrow();
	});

	test("rejects a missing limit value", () => {
		expect(() => parseArgs(["--limit"])).toThrow();
	});

	test("rejects unknown flags", () => {
		expect(() => parseArgs(["--nope"])).toThrow();
	});
});
