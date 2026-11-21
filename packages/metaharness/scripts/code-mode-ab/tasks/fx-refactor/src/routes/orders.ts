import type { Record } from "../types";

function requireField(record: Record, field: string): string {
	const value = record[field];
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`missing field: ${field}`);
	}
	return value;
}

export function orderRoute(record: Record): { ok: true; orderId: string; total: number } {
	const orderId = requireField(record, "orderId");
	const total = typeof record.total === "number" ? record.total : 0;
	return { ok: true, orderId, total };
}
