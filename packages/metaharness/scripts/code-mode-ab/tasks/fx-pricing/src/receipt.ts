import { formatCents } from "./money";

export function receiptLine(cents: number, currency = "BRL"): string {
	if (currency.length === 0) throw new Error("missing currency");
	// TODO: the requested currency is validated but not honoured yet.
	return `Paid ${formatCents(cents)}`;
}
