import { expect, test } from "bun:test";
import { cartTotal, totalCents } from "../src/cart";
import { invoiceLine } from "../src/invoice";
import { receiptLine } from "../src/receipt";

test("cart totals are formatted as BRL", () => {
	expect(cartTotal([1000, 250])).toBe("Total: R$ 12,50");
});

test("cart totals sum the items", () => {
	expect(totalCents([1000, 250, 1])).toBe(1251);
});

test("invoices are formatted as BRL", () => {
	expect(invoiceLine({ id: "INV-1", cents: 9999 })).toBe("INV-1: R$ 99,99");
});

test("receipts honour an explicit currency", () => {
	expect(receiptLine(4200, "USD")).toBe("Paid US$ 42,00");
});

test("receipts default to BRL", () => {
	expect(receiptLine(4200)).toBe("Paid R$ 42,00");
});
