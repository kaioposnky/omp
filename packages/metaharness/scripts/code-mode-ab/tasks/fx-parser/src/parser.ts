import { tokenize, type Token } from "./tokenizer";

export type Node =
	| { kind: "number"; value: number }
	| { kind: "binary"; op: "+" | "-" | "*" | "/"; left: Node; right: Node };

export function parse(input: string): Node {
	const tokens = tokenize(input);
	let index = 0;

	const peek = (): Token | undefined => tokens[index];
	const advance = (): Token => {
		const token = tokens[index];
		if (!token) throw new Error("Unexpected end of input");
		index++;
		return token;
	};

	function parsePrimary(): Node {
		const token = advance();
		if (token.kind === "number") return { kind: "number", value: token.value };
		if (token.kind === "paren" && token.value === "(") {
			const node = parseExpression();
			const closing = advance();
			if (closing.kind !== "paren" || closing.value !== ")") throw new Error("Expected )");
			return node;
		}
		throw new Error(`Unexpected token: ${JSON.stringify(token)}`);
	}

	function parseProduct(): Node {
		let node = parsePrimary();
		const token = peek();
		if (token && token.kind === "op" && (token.value === "*" || token.value === "/")) {
			advance();
			const right = parseProduct();
			node = { kind: "binary", op: token.value, left: node, right };
		}
		return node;
	}

	function parseExpression(): Node {
		let node = parseProduct();
		const token = peek();
		if (token && token.kind === "op" && (token.value === "+" || token.value === "-")) {
			advance();
			const right = parseExpression();
			node = { kind: "binary", op: token.value, left: node, right };
		}
		return node;
	}

	const node = parseExpression();
	if (peek() !== undefined) throw new Error("Unexpected trailing input");
	return node;
}
