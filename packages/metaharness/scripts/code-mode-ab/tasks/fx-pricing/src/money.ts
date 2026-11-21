const SYMBOLS: Record<string, string> = {
	BRL: "R$",
	USD: "US$",
	EUR: "€",
};

export function currencySymbol(code: string): string {
	return SYMBOLS[code] ?? "R$";
}

/** Format a cents amount as "SYMBOL whole,cents", sign preserved. */
export function formatCents(cents: number): string {
	const truncated = Math.trunc(cents);
	const sign = truncated < 0 ? "-" : "";
	const absolute = Math.abs(truncated);
	const whole = Math.floor(absolute / 100);
	const fraction = String(absolute % 100).padStart(2, "0");
	return `${sign}${currencySymbol("BRL")} ${whole},${fraction}`;
}
