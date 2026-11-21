import { describe, expect, test } from "bun:test";
import { orderRoute } from "../src/routes/orders";
import { productRoute } from "../src/routes/products";
import { userRoute } from "../src/routes/users";

describe("routes", () => {
	test("users resolve the name", () => {
		expect(userRoute({ name: "ada" })).toEqual({ ok: true, name: "ada" });
	});

	test("users reject an empty name", () => {
		expect(() => userRoute({ name: "" })).toThrow("missing field: name");
	});

	test("orders resolve the id and total", () => {
		expect(orderRoute({ orderId: "o-1", total: 42 })).toEqual({ ok: true, orderId: "o-1", total: 42 });
	});

	test("orders default the total", () => {
		expect(orderRoute({ orderId: "o-2" })).toEqual({ ok: true, orderId: "o-2", total: 0 });
	});

	test("orders reject a missing id", () => {
		expect(() => orderRoute({})).toThrow("missing field: orderId");
	});

	test("products resolve the sku and active flag", () => {
		expect(productRoute({ sku: "s-9", active: true })).toEqual({ ok: true, sku: "s-9", active: true });
	});

	test("products reject a missing sku", () => {
		expect(() => productRoute({ active: true })).toThrow("missing field: sku");
	});
});
