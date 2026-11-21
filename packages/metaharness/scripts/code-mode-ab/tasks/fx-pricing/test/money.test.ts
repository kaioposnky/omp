import { describe, expect, test } from "bun:test";
import { formatMoney, currencySymbol } from "../src/money";

describe("formatMoney", () => {
	test("defaults to BRL", () => {
		expect(formatMoney(1234)).toBe("R$ 12,34");
	});

	test("supports USD", () => {
		expect(formatMoney(1234, "USD")).toBe("US$ 12,34");
	});

	test("supports EUR", () => {
		expect(formatMoney(1234, "EUR")).toBe("€ 12,34");
	});

	test("keeps the sign", () => {
		expect(formatMoney(-5)).toBe("-R$ 0,05");
	});

	test("pads the cents", () => {
		expect(formatMoney(0)).toBe("R$ 0,00");
	});

	test("rejects unknown currencies", () => {
		expect(() => formatMoney(10, "XYZ")).toThrow();
	});
});

describe("currencySymbol", () => {
	test("resolves known codes", () => {
		expect(currencySymbol("USD")).toBe("US$");
	});
});
