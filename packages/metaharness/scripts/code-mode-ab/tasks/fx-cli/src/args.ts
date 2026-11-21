export interface Options {
	/** Print the selected jobs as JSON instead of a table. */
	json: boolean;
	/** Only print the first N jobs. */
	limit?: number;
}

/** Parse CLI flags. Today no flags are understood. */
export function parseArgs(argv: string[]): Options {
	const options: Options = { json: false };
	for (const argument of argv) {
		if (argument.startsWith("-")) throw new Error(`Unknown flag: ${argument}`);
	}
	return options;
}
