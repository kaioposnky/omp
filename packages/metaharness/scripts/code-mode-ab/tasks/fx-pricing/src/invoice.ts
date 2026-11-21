import { formatCents } from "./money";

export interface Invoice {
	id: string;
	cents: number;
}

export function invoiceLine(invoice: Invoice): string {
	return `${invoice.id}: ${formatCents(invoice.cents)}`;
}
