import type { Record } from "../types";

function requireField(record: Record, field: string): string {
	const value = record[field];
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`missing field: ${field}`);
	}
	return value;
}

export function userRoute(record: Record): { ok: true; name: string } {
	return { ok: true, name: requireField(record, "name") };
}
