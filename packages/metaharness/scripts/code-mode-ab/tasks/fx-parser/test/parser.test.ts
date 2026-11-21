import { describe, expect, test } from "bun:test";
import { evaluate } from "../src/eval";
import { tokenize } from "../src/tokenizer";

describe("tokenizer", () => {
	test("keeps multi-digit numbers whole", () => {
		expect(tokenize("12 + 30")).toEqual([
			{ kind: "number", value: 12 },
			{ kind: "op", value: "+" },
			{ kind: "number", value: 30 },
		]);
	});

	test("rejects unknown characters", () => {
		expect(() => tokenize("1 % 2")).toThrow();
	});
});

describe("evaluate", () => {
	test("adds", () => {
		expect(evaluate("1 + 2")).toBe(3);
	});

	test("multiplication binds tighter than addition", () => {
		expect(evaluate("2 + 3 * 4")).toBe(14);
	});

	test("subtraction is left-associative", () => {
		expect(evaluate("10 - 3 - 2")).toBe(5);
	});

	test("division is left-associative", () => {
		expect(evaluate("100 / 4 / 5")).toBe(5);
	});

	test("parentheses win", () => {
		expect(evaluate("(2 + 3) * 4")).toBe(20);
	});

	test("division by zero is rejected", () => {
		expect(() => evaluate("1 / 0")).toThrow();
	});
});
