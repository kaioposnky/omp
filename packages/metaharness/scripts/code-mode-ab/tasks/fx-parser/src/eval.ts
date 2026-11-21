import { parse, type Node } from "./parser";

function evaluateNode(node: Node): number {
	if (node.kind === "number") return node.value;
	const left = evaluateNode(node.left);
	const right = evaluateNode(node.right);
	switch (node.op) {
		case "+":
			return left + right;
		case "-":
			return left - right;
		case "*":
			return left * right;
		case "/":
			if (right === 0) throw new Error("Division by zero");
			return left / right;
	}
}

export function evaluate(input: string): number {
	return evaluateNode(parse(input));
}
