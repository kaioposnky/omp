export type Token =
	| { kind: "number"; value: number }
	| { kind: "op"; value: "+" | "-" | "*" | "/" }
	| { kind: "paren"; value: "(" | ")" };

const OPERATORS = new Set(["+", "-", "*", "/"]);

export function tokenize(input: string): Token[] {
	const tokens: Token[] = [];
	let index = 0;
	while (index < input.length) {
		const char = input[index]!;
		if (/\s/.test(char)) {
			index++;
			continue;
		}
		if (char >= "0" && char <= "9") {
			tokens.push({ kind: "number", value: Number(char) });
			index++;
			continue;
		}
		if (OPERATORS.has(char)) {
			tokens.push({ kind: "op", value: char as "+" | "-" | "*" | "/" });
			index++;
			continue;
		}
		if (char === "(" || char === ")") {
			tokens.push({ kind: "paren", value: char });
			index++;
			continue;
		}
		throw new Error(`Unexpected character: ${char}`);
	}
	return tokens;
}
