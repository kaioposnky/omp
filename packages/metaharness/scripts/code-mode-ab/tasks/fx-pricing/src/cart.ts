import { formatCents } from "./money";

/** Sum of the item prices, in cents. */
export function totalCents(prices: number[]): number {
	return prices.reduce((sum, price) => sum + price, 0);
}

export function cartTotal(prices: number[]): string {
	return `Total: ${formatCents(totalCents(prices))}`;
}
