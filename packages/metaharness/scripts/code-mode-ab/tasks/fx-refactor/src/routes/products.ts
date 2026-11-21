import type { Record } from "../types";

function requireField(record: Record, field: string): string {
	const value = record[field];
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`missing field: ${field}`);
	}
	return value;
}

export function productRoute(record: Record): { ok: true; sku: string; active: boolean } {
	const sku = requireField(record, "sku");
	return { ok: true, sku, active: record.active === true };
}
