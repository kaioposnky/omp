#!/usr/bin/env bun
/**
 * W5.5 — Code Mode A/B harness (see docs/code-mode/architecture/orchestration.md §W5.5).
 *
 * Runs the same small, tool-heavy task set against the same model twice: once with
 * `--code-mode` and once with `--no-code-mode`. Reports input/output/cache tokens,
 * computed USD cost, success (deterministic checker), wall time and model requests.
 *
 * Isolation: every run gets its own temp workspace (a copy of a task fixture) and an
 * isolated agent directory (PI_CODING_AGENT_DIR) holding a minimal `models.yml` with
 * only the 9router provider (`auth: none`, localhost). The user's settings, skills,
 * extensions, MCP servers, sessions and memories never enter the measurement. Both
 * arms get the exact same flags, prompt, workspace copy and fixture hashes.
 *
 * Budget: a hard cumulative USD cap (default $5). Before each run the next run's cost
 * is estimated from the largest observed cost for that model (or a documented prior);
 * if the estimate would cross the cap the run is skipped. During a run, streamed token
 * usage is priced continuously and the child is killed if the cap would be crossed.
 *
 * Pricing: gateway models report `usage.cost.total = 0`, so cost is computed from the
 * token buckets with the official models.dev snapshot (2026-11-20, USD per 1M tokens).
 * Long-context tiers are applied per request when its billed input exceeds the threshold.
 *
 * Usage:
 *   bun scripts/code-mode-ab.ts --smoke
 *   bun scripts/code-mode-ab.ts --reps 3
 *   bun scripts/code-mode-ab.ts --models 9router/cc/claude-haiku-5-5:low --tasks pricing --reps 1
 */
import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dir, "../../..");
const CLI_ENTRY = path.join(REPO_ROOT, "packages/coding-agent/src/cli.ts");
const AB_DIR = path.join(import.meta.dir, "code-mode-ab");
const RESULTS_DIR = path.join(AB_DIR, "results");

// =============================================================================
// Model catalog: priority order approved for W5.5.
// =============================================================================

interface ModelSpec {
	/** Provider-qualified id passed to `--model`. */
	id: string;
	thinking: "off" | "minimal" | "low" | "medium" | "high";
	/** Falls back to this per-run cost estimate until a run is observed. */
	priorRunCostUsd: number;
}

const DEFAULT_MODELS: ModelSpec[] = [
	{ id: "9router/cc/claude-opus-5-5", thinking: "low", priorRunCostUsd: 0.9 },
	{ id: "9router/cc/claude-haiku-5-5", thinking: "low", priorRunCostUsd: 0.03 },
	{ id: "9router/cc/claude-sonnet-5-5", thinking: "low", priorRunCostUsd: 0.35 },
	{ id: "9router/cx/gpt-6.2-sol", thinking: "medium", priorRunCostUsd: 0.3 },
	{ id: "9router/cx/gpt-6.1-terra", thinking: "medium", priorRunCostUsd: 0.2 },
	{ id: "9router/cmc/deepseek/deepseek-v4.1-flash", thinking: "max", priorRunCostUsd: 0 },
	{ id: "9router/cmc/z-ai/glm-5.3-flash", thinking: "max", priorRunCostUsd: 0 },
];

/** USD per 1M tokens, models.dev snapshot 2026-11-20. Keys are ids without provider. */
interface PriceCard {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	longContext?: { threshold: number; input: number; output: number; cacheRead: number; cacheWrite: number };
}

const PRICE_BY_MODEL: Record<string, PriceCard> = {
	"cc/claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
	"cc/claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
	"cc/claude-haiku-5-5": {
		input: 0.1,
		output: 0.5,
		cacheRead: 0.01,
		cacheWrite: 0.125,
		longContext: { threshold: 100_000, input: 0.5, output: 2.5, cacheRead: 0.05, cacheWrite: 0.625 },
	},
	"cx/gpt-6.2-sol": {
		input: 2,
		output: 10,
		cacheRead: 0.1,
		cacheWrite: 2.5,
		longContext: { threshold: 272_000, input: 4, output: 15, cacheRead: 0.2, cacheWrite: 5 },
	},
	"cx/gpt-6.1-terra": {
		input: 1,
		output: 5,
		cacheRead: 0.05,
		cacheWrite: 1.25,
		longContext: { threshold: 272_000, input: 2, output: 7.5, cacheRead: 0.1, cacheWrite: 2.5 },
	},
	// Unpriced: compared on tokens/requests only; computed cost reads $0.
	"cmc/deepseek/deepseek-v4.1-flash": { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	"cmc/z-ai/glm-5.3-flash": { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};

// =============================================================================
// Task fixtures: small repos that need many tool calls, checked deterministically.
// =============================================================================

interface TaskSpec {
	id: string;
	fixtureDir: string;
	check: string;
	prompt: string;
	/** Fixture-relative paths that must keep their exact bytes (anti-tamper). */
	protectedPaths: string[];
}

const TASKS: TaskSpec[] = [
	{
		id: "pricing",
		fixtureDir: path.join(AB_DIR, "tasks/fx-pricing"),
		check: path.join(AB_DIR, "checks/pricing.ts"),
		prompt: [
			'In this repository, rename the money-formatting helper `formatCents` to `formatMoney` and add an optional second parameter `currency` (an ISO code, default `"BRL"`) that selects the symbol: `BRL` maps to `R$`, `USD` maps to `US$`, `EUR` maps to `€`.',
			"Unknown currency codes must throw an `Error`. Keep the existing output shape (`SYMBOL whole,cents`, comma as the decimal separator, leading minus for negative values).",
			"Update every call site so each one passes an appropriate currency (the cart and invoice use BRL, the receipt must forward its own currency argument), and do not change anything under `test/`.",
			"Run `bun test` and make the whole suite pass.",
		].join(" "),
		protectedPaths: ["test"],
	},
	{
		id: "parser",
		fixtureDir: path.join(AB_DIR, "tasks/fx-parser"),
		check: path.join(AB_DIR, "checks/parser.ts"),
		prompt: [
			"This repository is a small arithmetic expression parser with failing tests.",
			"Fix the implementation so every test in `test/` passes: multi-digit numbers, operator precedence and left associativity must all be correct, and invalid input must keep throwing.",
			"Do not edit anything under `test/`. Run `bun test` to confirm.",
		].join(" "),
		protectedPaths: ["test"],
	},
	{
		id: "cli",
		fixtureDir: path.join(AB_DIR, "tasks/fx-cli"),
		check: path.join(AB_DIR, "checks/cli.ts"),
		prompt: [
			"This repository prints a fixed table of jobs. Add two flags to `src/cli.ts`, wired through `parseArgs` in `src/args.ts`:",
			"`--json` prints the selected jobs as a JSON array with all fields instead of a table; `--limit <n>` prints/serializes only the first `n` jobs.",
			"`--limit` must require a positive integer value (reject 0, negatives, non-numbers and a missing value), and flags may appear in any order.",
			"Do not edit anything under `test/`. Run `bun test` and make it pass.",
		].join(" "),
		protectedPaths: ["test"],
	},
	{
		id: "refactor",
		fixtureDir: path.join(AB_DIR, "tasks/fx-refactor"),
		check: path.join(AB_DIR, "checks/refactor.ts"),
		prompt: [
			"The three route modules under `src/routes/` each define the same private `requireField` helper.",
			"Extract it once into a new module `src/validate.ts` that exports `validateField(record, field)`, and update all three routes to import and use it.",
			"Behavior must stay identical, including the `missing field: <name>` error message. Do not edit anything under `test/`. Run `bun test` to confirm.",
		].join(" "),
		protectedPaths: ["test"],
	},
];

// =============================================================================
// Config
// =============================================================================

const SHARED_CLI_FLAGS = ["--no-extensions", "--no-skills", "--no-rules", "--no-lsp", "--no-title", "--no-session"];

interface Config {
	models: ModelSpec[];
	tasks: TaskSpec[];
	reps: number;
	maxUsd: number;
	/** Optional per-model budget ceiling so later models still get measured. */
	perModelCapUsd?: number;
	outDir: string;
	runTimeoutMs: number;
	checkTimeoutMs: number;
	maxTurns: number;
	keep: boolean;
	smoke: boolean;
	/** Arms to execute (default both); useful to finish an unpaired cell. */
	arms: Arm[];
	/** Rebuild the summary from an existing run directory instead of running models. */
	summarizeDir?: string;
	/** File appended to the code arm's system prompt (`--append-system-prompt`) to test prompt variants. */
	codeAppendPrompt?: string;
	/** Save each run's JSON event stream and final diff vs the fixture under `<out>/transcripts/`. */
	transcripts: boolean;
}

function parseModelSpecs(raw: string): ModelSpec[] {
	const wanted = raw
		.split(",")
		.map(entry => entry.trim())
		.filter(Boolean);
	const specs: ModelSpec[] = [];
	for (const entry of wanted) {
		const [id, thinking] = entry.split(":") as [string, ModelSpec["thinking"] | undefined];
		const known = DEFAULT_MODELS.find(model => model.id === id);
		if (!known)
			throw new Error(`Unknown model in --models: ${id} (known: ${DEFAULT_MODELS.map(m => m.id).join(", ")})`);
		specs.push({ ...known, thinking: thinking ?? known.thinking });
	}
	return specs;
}

function parseTasks(raw: string): TaskSpec[] {
	const wanted = new Set(
		raw
			.split(",")
			.map(entry => entry.trim())
			.filter(Boolean),
	);
	const selected = TASKS.filter(task => wanted.has(task.id));
	if (selected.length !== wanted.size) throw new Error(`Unknown task in --tasks: ${[...wanted].join(", ")}`);
	return selected;
}

function parseConfig(argv: string[]): Config {
	const config: Config = {
		models: DEFAULT_MODELS,
		tasks: TASKS,
		reps: 3,
		maxUsd: 5,
		outDir: "",
		runTimeoutMs: 900_000,
		checkTimeoutMs: 180_000,
		maxTurns: 40,
		keep: false,
		smoke: false,
		arms: ["normal", "code"],
		transcripts: false,
	};
	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index]!;
		const value = () => {
			const next = argv[++index];
			if (next === undefined) throw new Error(`Missing value for ${arg}`);
			return next;
		};
		switch (arg) {
			case "--models":
				config.models = parseModelSpecs(value());
				break;
			case "--tasks":
				config.tasks = parseTasks(value());
				break;
			case "--reps":
				config.reps = Number(value());
				break;
			case "--max-usd":
				config.maxUsd = Number(value());
				break;
			case "--per-model-cap":
				config.perModelCapUsd = Number(value());
				break;
			case "--out":
				config.outDir = path.resolve(value());
				break;
			case "--timeout-ms":
				config.runTimeoutMs = Number(value());
				break;
			case "--check-timeout-ms":
				config.checkTimeoutMs = Number(value());
				break;
			case "--max-turns":
				config.maxTurns = Number(value());
				break;
			case "--keep":
				config.keep = true;
				break;
			case "--summarize":
				config.summarizeDir = path.resolve(value());
				break;
			case "--arms": {
				const wanted = value()
					.split(",")
					.map(entry => entry.trim())
					.filter(Boolean);
				if (wanted.length === 0 || wanted.some(arm => arm !== "normal" && arm !== "code")) {
					throw new Error("--arms accepts a comma list of normal, code");
				}
				config.arms = wanted as Arm[];
				break;
			}
			case "--code-append-prompt":
				config.codeAppendPrompt = path.resolve(value());
				break;
			case "--transcripts":
				config.transcripts = true;
				break;
			case "--smoke":
				config.smoke = true;
				break;
			case "--help":
			case "-h":
				console.log(
					[
						"Code Mode A/B runner (W5.5)",
						"",
						"  --smoke                 one haiku pair: task=pricing, rep=1",
						"  --models <specs>        comma list of id[:thinking] (default: approved priority order)",
						"  --tasks <ids>           comma list (pricing, parser, cli, refactor)",
						"  --reps <n>              repetitions per arm (default 3)",
						"  --max-usd <usd>         hard cumulative budget (default 5)",
						"  --per-model-cap <usd>   optional per-model ceiling so later models still get measured",
						"  --out <dir>             results dir (default scripts/code-mode-ab/results/ab-<stamp>)",
						"  --timeout-ms <ms>       per-run wall clock limit",
						"  --max-turns <n>         CLI turn bound per run",
						"  --keep                  keep temp workspaces/agent dirs",
						"  --summarize <dir>       rebuild summary.md/json from an existing runs.jsonl",
						"  --arms <list>           normal|code (default both; use one to finish an unpaired cell)",
						"  --code-append-prompt <file>  append this file to the code arm's system prompt (variant testing)",
						"  --transcripts           save each run's JSON event stream and final diff under <out>/transcripts/",
					].join("\n"),
				);
				process.exit(0);
			default:
				throw new Error(`Unknown argument: ${arg}`);
		}
	}
	if (!Number.isFinite(config.reps) || config.reps < 1) throw new Error("--reps must be >= 1");
	if (!Number.isFinite(config.maxUsd) || config.maxUsd <= 0) throw new Error("--max-usd must be > 0");
	if (config.perModelCapUsd !== undefined && (!Number.isFinite(config.perModelCapUsd) || config.perModelCapUsd <= 0)) {
		throw new Error("--per-model-cap must be > 0");
	}
	for (const model of config.models) {
		if (!PRICE_BY_MODEL[modelKey(model.id)])
			throw new Error(`No price card for ${model.id}; the budget guard cannot price this model`);
	}
	if (config.smoke) {
		config.models = config.models.filter(model => model.id === "9router/cc/claude-haiku-5-5");
		if (config.models.length === 0) config.models = [DEFAULT_MODELS[1]!];
		config.tasks = TASKS.filter(task => task.id === "pricing");
		config.reps = 1;
	}
	if (!config.outDir) {
		const stamp = new Date().toISOString().replace(/[:.]/g, "-");
		config.outDir = path.join(RESULTS_DIR, `${config.smoke ? "smoke" : "ab"}-${stamp}`);
	}
	return config;
}

// =============================================================================
// Usage, pricing, statistics
// =============================================================================

interface UsageTotals {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	totalTokens: number;
}

const EMPTY_USAGE: UsageTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 };

function addUsage(target: UsageTotals, usage: Partial<UsageTotals>): void {
	target.input += usage.input ?? 0;
	target.output += usage.output ?? 0;
	target.cacheRead += usage.cacheRead ?? 0;
	target.cacheWrite += usage.cacheWrite ?? 0;
	target.totalTokens +=
		usage.totalTokens ?? (usage.input ?? 0) + (usage.output ?? 0) + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0);
}

function modelKey(modelId: string): string {
	return modelId.split("/").slice(1).join("/");
}

function priceUsage(card: PriceCard, usage: UsageTotals): number {
	const billedInput = usage.input + usage.cacheRead + usage.cacheWrite;
	const tier = card.longContext && billedInput > card.longContext.threshold ? card.longContext : card;
	return (
		(usage.input * tier.input +
			usage.output * tier.output +
			usage.cacheRead * tier.cacheRead +
			usage.cacheWrite * tier.cacheWrite) /
		1_000_000
	);
}

function mean(values: number[]): number {
	return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Two-tailed 95% critical value of Student's t for integer df (table for 1..30). */
function tCritical95(df: number): number {
	const table = [
		12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12,
		2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042,
	];
	if (df <= 0) return Number.NaN;
	if (df <= table.length) return table[df - 1]!;
	return 1.96;
}

function logBetaContinuedFraction(a: number, b: number, x: number): number {
	const MAX_ITERATIONS = 200;
	const EPSILON = 3e-12;
	const FPMIN = 1e-300;
	const qab = a + b;
	const qap = a + 1;
	const qam = a - 1;
	let c = 1;
	let d = 1 - (qab * x) / qap;
	if (Math.abs(d) < FPMIN) d = FPMIN;
	d = 1 / d;
	let h = d;
	for (let m = 1; m <= MAX_ITERATIONS; m++) {
		const m2 = 2 * m;
		let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
		d = 1 + aa * d;
		if (Math.abs(d) < FPMIN) d = FPMIN;
		c = 1 + aa / c;
		if (Math.abs(c) < FPMIN) c = FPMIN;
		d = 1 / d;
		h *= d * c;
		aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
		d = 1 + aa * d;
		if (Math.abs(d) < FPMIN) d = FPMIN;
		c = 1 + aa / c;
		if (Math.abs(c) < FPMIN) c = FPMIN;
		d = 1 / d;
		const del = d * c;
		h *= del;
		if (Math.abs(del - 1) < EPSILON) break;
	}
	return h;
}

function regularizedIncompleteBeta(a: number, b: number, x: number): number {
	if (x <= 0) return 0;
	if (x >= 1) return 1;
	const bt = Math.exp(gammaLn(a + b) - gammaLn(a) - gammaLn(b) + a * Math.log(x) + b * Math.log(1 - x));
	if (x < (a + 1) / (a + b + 2)) return (bt * logBetaContinuedFraction(a, b, x)) / a;
	return 1 - (bt * logBetaContinuedFraction(b, a, 1 - x)) / b;
}

const LANCZOS = [
	0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
	12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

function gammaLn(z: number): number {
	if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - gammaLn(1 - z);
	const zz = z - 1;
	let sum = LANCZOS[0]!;
	for (let i = 1; i < LANCZOS.length; i++) sum += LANCZOS[i]! / (zz + i);
	const t = zz + 7.5;
	return 0.5 * Math.log(2 * Math.PI) + (zz + 0.5) * Math.log(t) - t + Math.log(sum);
}

function tTwoTailedP(t: number, df: number): number {
	if (!Number.isFinite(t) || df <= 0) return Number.NaN;
	const x = df / (df + t * t);
	return regularizedIncompleteBeta(df / 2, 0.5, x);
}

interface PairedStats {
	n: number;
	meanDiff: number;
	sd: number;
	se: number;
	t: number;
	df: number;
	ci95: [number, number];
	p: number;
}

function pairedStats(diffs: number[]): PairedStats | undefined {
	const n = diffs.length;
	if (n < 2) return undefined;
	const average = mean(diffs);
	const variance = diffs.reduce((sum, diff) => sum + (diff - average) ** 2, 0) / (n - 1);
	const sd = Math.sqrt(variance);
	const se = sd / Math.sqrt(n);
	const df = n - 1;
	const t = se === 0 ? (average === 0 ? 0 : Number.POSITIVE_INFINITY) : average / se;
	const critical = tCritical95(df);
	return {
		n,
		meanDiff: average,
		sd,
		se,
		t,
		df,
		ci95: [average - critical * se, average + critical * se],
		p: tTwoTailedP(t, df),
	};
}

// =============================================================================
// Isolation
// =============================================================================

const MINIMAL_MODELS_YML = `providers:
  9router:
    api: openai-completions
    baseUrl: "http://localhost:20128/v1"
    auth: none
    discovery:
      type: openai-models-list
    modelOverrides:
      # Every measured model is capped at 16k output tokens: these tasks need a few
      # hundred per turn, and the 128k default turns a degenerate stream into a
      # multi-minute stall instead of a bounded failure.
      cc/claude-opus-5-5:
        maxTokens: 16384
      cc/claude-haiku-5-5:
        maxTokens: 16384
      cc/claude-sonnet-5-5:
        maxTokens: 16384
      # The proxy advertises effort support as unsupported for its Codex routes, but accepts
      # \`reasoning_effort\`; without these the approved \`--thinking medium\` would be dropped.
      cx/gpt-6.2-sol:
        maxTokens: 16384
        reasoning: true
        thinking:
          mode: effort
          efforts: [minimal, low, medium, high, xhigh, max]
        compat:
          supportsReasoningEffort: true
          thinkingFormat: openai
      cx/gpt-6.1-terra:
        maxTokens: 16384
        reasoning: true
        thinking:
          mode: effort
          efforts: [minimal, low, medium, high, xhigh, max]
        compat:
          supportsReasoningEffort: true
          thinkingFormat: openai
      cmc/deepseek/deepseek-v4.1-flash:
        maxTokens: 16384
      cmc/z-ai/glm-5.3-flash:
        maxTokens: 16384
`;

const STRIPPED_ENV_KEYS = [
	"PI_PROFILE",
	"OMP_PROFILE",
	"PI_CONFIG_DIR",
	"PI_SESSION_FILE",
	"PI_ARTIFACTS_DIR",
	"PI_TOOL_BRIDGE_URL",
	"PI_TOOL_BRIDGE_TOKEN",
	"PI_TOOL_BRIDGE_SESSION",
	"PI_EVAL_LOCAL_ROOTS",
	"OMP_MCP_REQUIRE_READY",
];

function isolatedEnv(agentDir: string): Record<string, string> {
	const env: Record<string, string> = {};
	for (const [key, value] of Object.entries(process.env)) {
		if (value !== undefined) env[key] = value;
	}
	for (const key of STRIPPED_ENV_KEYS) delete env[key];
	env.PI_CODING_AGENT_DIR = agentDir;
	return env;
}

async function makeAgentDir(root: string, slug: string): Promise<string> {
	const agentDir = path.join(root, `agent-${slug}`);
	await fs.mkdir(agentDir, { recursive: true });
	await fs.writeFile(path.join(agentDir, "models.yml"), MINIMAL_MODELS_YML);
	return agentDir;
}

async function copyFixture(fixtureDir: string, target: string): Promise<void> {
	await fs.cp(fixtureDir, target, { recursive: true });
}

async function hashTree(root: string, relativePaths: string[]): Promise<Record<string, string>> {
	const hashes: Record<string, string> = {};
	async function walk(absolute: string, relative: string): Promise<void> {
		const stats = await fs.stat(absolute);
		if (stats.isDirectory()) {
			const entries = (await fs.readdir(absolute)).sort();
			for (const entry of entries) await walk(path.join(absolute, entry), path.join(relative, entry));
			return;
		}
		const bytes = await fs.readFile(absolute);
		hashes[relative] = crypto.createHash("sha256").update(bytes).digest("hex");
	}
	for (const relative of relativePaths) await walk(path.join(root, relative), relative);
	return hashes;
}

function sameHashes(a: Record<string, string>, b: Record<string, string>): boolean {
	const keysA = Object.keys(a).sort();
	const keysB = Object.keys(b).sort();
	if (keysA.length !== keysB.length || keysA.some((key, index) => key !== keysB[index])) return false;
	return keysA.every(key => a[key] === b[key]);
}

// =============================================================================
// RPC preflight: proves which arm really started and which tools were on the wire.
// =============================================================================

interface WireInfo {
	codeModeEnabled: boolean;
	tools: string[];
	modelId: string;
	thinkingLevel: string;
}

async function rpcPreflight(
	model: ModelSpec,
	arm: Arm,
	agentDir: string,
	workspace: string,
	timeoutMs: number,
): Promise<WireInfo> {
	const args = [
		"bun",
		CLI_ENTRY,
		"--mode",
		"rpc",
		"--no-ui",
		"--model",
		model.id,
		"--thinking",
		model.thinking,
		...SHARED_CLI_FLAGS,
		arm === "code" ? "--code-mode" : "--no-code-mode",
	];
	const proc = Bun.spawn(args, {
		cwd: workspace,
		env: isolatedEnv(agentDir),
		stdin: "pipe",
		stdout: "pipe",
		stderr: "pipe",
	});
	proc.stdin.write(`${JSON.stringify({ id: "state-1", type: "get_state" })}\n`);
	proc.stdin.flush();

	const reader = proc.stdout.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	const { promise: deadline, reject: rejectDeadline } = Promise.withResolvers<never>();
	const timeout = setTimeout(() => rejectDeadline(new Error("rpc get_state timed out")), timeoutMs);
	try {
		while (true) {
			const chunk = await Promise.race([reader.read(), deadline]);
			if (chunk.done) break;
			buffer += decoder.decode(chunk.value);
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";
			for (const line of lines) {
				if (!line.trim()) continue;
				let event: {
					type?: string;
					command?: string;
					success?: boolean;
					data?: {
						codeModeEnabled?: boolean;
						thinkingLevel?: string;
						model?: { id?: string };
						dumpTools?: Array<{ name: string }>;
					};
				};
				try {
					event = JSON.parse(line);
				} catch {
					continue;
				}
				if (event.type === "response" && event.command === "get_state" && event.data) {
					const data = event.data;
					return {
						codeModeEnabled: data.codeModeEnabled === true,
						tools: (data.dumpTools ?? []).map(tool => tool.name),
						modelId: data.model?.id ?? "",
						thinkingLevel: data.thinkingLevel ?? "",
					};
				}
			}
		}
	} finally {
		clearTimeout(timeout);
		reader.releaseLock();
		proc.kill();
		await proc.exited;
	}
	throw new Error(`rpc get_state produced no state (stderr: ${(await new Response(proc.stderr).text()).slice(-800)})`);
}

// =============================================================================
// One measured run.
// =============================================================================

type Arm = "normal" | "code";

interface RunRecord {
	schema: 1;
	runId: string;
	timestamp: string;
	model: string;
	thinking: string;
	arm: Arm;
	task: string;
	rep: number;
	success: boolean;
	successReason?: string;
	exitCode: number;
	wallMs: number;
	timeout: boolean;
	budgetKilled: boolean;
	requests: number;
	usage: UsageTotals;
	/** Cost used for the budget guard: max(reported, computed-from-prices). */
	costUsd: number;
	reportedCostUsd: number;
	computedCostUsd: number;
	toolCalls: number;
	toolNames: string[];
	stopReasons: string[];
	error?: string;
	wire: WireInfo;
	wireViolations: string[];
	/** Tool calls whose arguments reach outside the workspace (sibling runs, artifacts, `/tmp` scans). */
	escapeCalls: number;
	checkerOutput?: string;
	workspace: string;
	spentBefore: number;
	spentAfter: number;
}

interface BudgetState {
	limitUsd: number;
	spentUsd: number;
	maxObservedUsd: Map<string, number>;
	spentByModelUsd: Map<string, number>;
}

function estimateNextRun(state: BudgetState, model: ModelSpec): number {
	return state.maxObservedUsd.get(model.id) ?? model.priorRunCostUsd;
}

interface AssistantMessageEvent {
	type?: string;
	message?: {
		role?: string;
		model?: string;
		provider?: string;
		stopReason?: string;
		errorMessage?: string;
		usage?: Partial<UsageTotals> & { cost?: { total?: number } };
		content?: Array<{ type?: string; name?: string; arguments?: unknown }>;
	};
}

/**
 * Whether a tool call's serialized arguments try to reach outside the run's own workspace:
 * another run root (`omp-ws-*`, `w-*`, legacy `ws-*`), a scan rooted at `/tmp`, or a listing
 * of the parent directory. The sandbox already hides those paths; this counts the attempts.
 * The run's own absolute workspace path is fine (models `cd` into it).
 */
function reachesOutsideWorkspace(serializedArgs: string, workspace: string): boolean {
	const withoutOwn = serializedArgs.split(workspace).join("<ws>");
	return /omp-ws-|\/w-[A-Za-z0-9]{6}\b|ws-[A-Za-z0-9-]{8,}|(?:find|grep[^"\n]*-R[^"\n]*|ls[^"\n]*)\s+\/tmp\b|(?:ls|find)\s+(?:-\S+\s+)*\.\.(?:\s|\/|")/.test(
		withoutOwn,
	);
}

/**
 * Wraps `args` in bubblewrap: a fresh tmpfs on `/tmp` with only `sandboxRoot` bound back in,
 * so a run cannot list or read other runs' workspaces or eval artifacts. Everything outside
 * `/tmp` (repo, toolchains, provider proxy) stays as on the host.
 */
function sandboxed(args: string[], sandboxRoot: string, workspace: string): string[] {
	return [
		"bwrap",
		"--dev-bind",
		"/",
		"/",
		"--tmpfs",
		"/tmp",
		"--bind",
		sandboxRoot,
		sandboxRoot,
		"--chdir",
		workspace,
		"--",
		...args,
	];
}

/** Unified diff of the run's workspace against its pristine fixture (`node_modules` excluded). */
function workspaceDiff(fixtureDir: string, workspace: string): string {
	const diff = Bun.spawnSync(["diff", "-ruN", "--exclude=node_modules", "--exclude=.git", fixtureDir, workspace], {
		stdout: "pipe",
		stderr: "pipe",
	});
	return diff.stdout.toString().split(fixtureDir).join("a").split(workspace).join("b");
}

async function runOne(options: {
	config: Config;
	model: ModelSpec;
	arm: Arm;
	task: TaskSpec;
	rep: number;
	runRoot: string;
	agentDir: string;
	wire: WireInfo;
	state: BudgetState;
}): Promise<RunRecord> {
	const { config, model, arm, task, rep, runRoot, agentDir, wire, state } = options;
	const runId = `${model.id.replace(/[^a-zA-Z0-9]+/g, "-")}-${arm}-${task.id}-r${rep}`;
	// Private root per run: under the sandbox the run sees a fresh `/tmp` holding only its own
	// workspace and agent dir, so no sibling run, fixture copy, or eval artifact is reachable.
	// The directory name is neutral so the path does not reveal the model, arm, or experiment.
	const sandboxRoot = await fs.mkdtemp(path.join(runRoot, "w-"));
	await fs.writeFile(path.join(runRoot, `${path.basename(sandboxRoot)}.run`), runId);
	const workspace = path.join(sandboxRoot, "ws");
	const runAgentDir = path.join(sandboxRoot, "agent");
	await copyFixture(task.fixtureDir, workspace);
	await fs.cp(agentDir, runAgentDir, { recursive: true });
	const protectedBefore = await hashTree(workspace, task.protectedPaths);

	const args = [
		"bun",
		CLI_ENTRY,
		"-p",
		"--mode",
		"json",
		"--model",
		model.id,
		"--thinking",
		model.thinking,
		"--max-turns",
		String(config.maxTurns),
		...SHARED_CLI_FLAGS,
		arm === "code" ? "--code-mode" : "--no-code-mode",
		...(arm === "code" && config.codeAppendPrompt ? ["--append-system-prompt", config.codeAppendPrompt] : []),
		task.prompt,
	];
	const transcriptLines: string[] = [];
	const spentBefore = state.spentUsd;
	const startedAt = Date.now();
	const proc = Bun.spawn(sandboxed(args, sandboxRoot, workspace), {
		cwd: workspace,
		env: isolatedEnv(runAgentDir),
		stdin: "ignore",
		stdout: "pipe",
		stderr: "pipe",
	});

	const usage: UsageTotals = { ...EMPTY_USAGE };
	let requests = 0;
	let computedCostUsd = 0;
	let reportedCostUsd = 0;
	let budgetKilled = false;
	let timedOut = false;
	const toolNames: string[] = [];
	const stopReasons: string[] = [];
	let error: string | undefined;
	let escapeCalls = 0;

	const card = PRICE_BY_MODEL[modelKey(model.id)];
	const reader = proc.stdout.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let currentRunCost = 0;

	const consumeLine = (line: string): void => {
		if (!line.trim()) return;
		let event: AssistantMessageEvent;
		try {
			event = JSON.parse(line);
		} catch {
			return;
		}
		if (event.type !== "message_end" || event.message?.role !== "assistant") return;
		const message = event.message;
		requests += 1;
		const messageUsage: UsageTotals = {
			input: message.usage?.input ?? 0,
			output: message.usage?.output ?? 0,
			cacheRead: message.usage?.cacheRead ?? 0,
			cacheWrite: message.usage?.cacheWrite ?? 0,
			totalTokens: message.usage?.totalTokens ?? 0,
		};
		addUsage(usage, messageUsage);
		reportedCostUsd += message.usage?.cost?.total ?? 0;
		if (card) {
			const messageCost = priceUsage(card, messageUsage);
			computedCostUsd += messageCost;
			currentRunCost += messageCost;
		}
		if (message.stopReason) stopReasons.push(message.stopReason);
		if (message.errorMessage) error = message.errorMessage;
		for (const part of message.content ?? []) {
			if (part.type !== "toolCall" || !part.name) continue;
			toolNames.push(part.name);
			if (reachesOutsideWorkspace(JSON.stringify(part.arguments ?? ""), workspace)) escapeCalls += 1;
		}
		if (spentBefore + currentRunCost >= state.limitUsd - 0.02) {
			budgetKilled = true;
			proc.kill();
		}
	};

	const killTimer = setTimeout(() => {
		timedOut = true;
		proc.kill();
	}, config.runTimeoutMs);

	try {
		while (true) {
			const chunk = await reader.read();
			if (chunk.done) break;
			buffer += decoder.decode(chunk.value);
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";
			for (const line of lines) {
				if (config.transcripts && line.includes('"type":"message_end"')) transcriptLines.push(line);
				consumeLine(line);
				if (budgetKilled) break;
			}
			if (budgetKilled) break;
		}
		if (buffer.trim()) consumeLine(buffer);
	} finally {
		clearTimeout(killTimer);
		reader.releaseLock();
	}
	const exitCode = await proc.exited;
	if (config.transcripts) {
		await Bun.write(path.join(config.outDir, "transcripts", `${runId}.jsonl`), `${transcriptLines.join("\n")}\n`);
		await Bun.write(
			path.join(config.outDir, "transcripts", `${runId}.diff`),
			workspaceDiff(task.fixtureDir, workspace),
		);
	}
	const wallMs = Date.now() - startedAt;
	const stderrText = (await new Response(proc.stderr).text()).trim();
	if (!error && stderrText && exitCode !== 0) error = stderrText.slice(-1200);

	const costUsd = Math.max(reportedCostUsd, computedCostUsd);
	state.spentUsd += costUsd;
	state.spentByModelUsd.set(model.id, (state.spentByModelUsd.get(model.id) ?? 0) + costUsd);
	state.maxObservedUsd.set(model.id, Math.max(state.maxObservedUsd.get(model.id) ?? 0, costUsd));

	const wireViolations: string[] = [];
	if (arm === "code") {
		const directTools = new Set(["read", "bash", "edit", "write", "grep", "glob", "task", "web_search"]);
		for (const name of new Set(toolNames))
			if (directTools.has(name)) wireViolations.push(`code arm called wire tool ${name}`);
		if (requests > 0 && !toolNames.includes("eval")) wireViolations.push("code arm never called eval");
	} else {
		const allowed = new Set(wire.tools);
		for (const name of new Set(toolNames))
			if (allowed.size > 0 && !allowed.has(name)) wireViolations.push(`normal arm called unknown tool ${name}`);
	}
	if ((arm === "code") !== wire.codeModeEnabled)
		wireViolations.push(`preflight codeModeEnabled=${wire.codeModeEnabled} for arm ${arm}`);

	const protectedAfter = await hashTree(workspace, task.protectedPaths);
	const protectedIntact = sameHashes(protectedBefore, protectedAfter);

	let success = false;
	let successReason: string | undefined;
	let checkerOutput: string | undefined;
	if (budgetKilled) successReason = "budget-killed";
	else if (timedOut) successReason = "timeout";
	else if (exitCode !== 0) successReason = `exit ${exitCode}`;
	else if (!protectedIntact) successReason = "protected fixture files were modified";
	else if (wireViolations.length > 0) successReason = `wire: ${wireViolations.join("; ")}`;
	else {
		const check = Bun.spawnSync(["bun", task.check, workspace], {
			cwd: REPO_ROOT,
			env: isolatedEnv(agentDir),
			stdout: "pipe",
			stderr: "pipe",
			timeout: config.checkTimeoutMs,
		});
		checkerOutput = `${check.stdout.toString()}${check.stderr.toString()}`.trim().slice(-2000);
		success = check.exitCode === 0;
		if (!success) successReason = `checker exited ${check.exitCode}: ${checkerOutput.slice(-600)}`;
	}

	return {
		schema: 1,
		runId,
		timestamp: new Date().toISOString(),
		model: model.id,
		thinking: model.thinking,
		arm,
		task: task.id,
		rep,
		success,
		successReason,
		exitCode,
		wallMs,
		timeout: timedOut,
		budgetKilled,
		requests,
		usage,
		costUsd,
		reportedCostUsd,
		computedCostUsd,
		toolCalls: toolNames.length,
		toolNames,
		stopReasons,
		error,
		wire,
		wireViolations,
		escapeCalls,
		checkerOutput,
		workspace,
		spentBefore,
		spentAfter: state.spentUsd,
	};
}

// =============================================================================
// Report
// =============================================================================

interface ArmAggregate {
	arm: Arm;
	n: number;
	successRate: number;
	meanInput: number;
	meanOutput: number;
	meanCacheRead: number;
	meanCacheWrite: number;
	meanTotalTokens: number;
	meanCost: number;
	meanWallMs: number;
	meanRequests: number;
	meanToolCalls: number;
}

function aggregate(records: RunRecord[], arm: Arm): ArmAggregate {
	const rows = records.filter(record => record.arm === arm);
	return {
		arm,
		n: rows.length,
		successRate: rows.length === 0 ? 0 : rows.filter(row => row.success).length / rows.length,
		meanInput: mean(rows.map(row => row.usage.input)),
		meanOutput: mean(rows.map(row => row.usage.output)),
		meanCacheRead: mean(rows.map(row => row.usage.cacheRead)),
		meanCacheWrite: mean(rows.map(row => row.usage.cacheWrite)),
		meanTotalTokens: mean(rows.map(row => row.usage.totalTokens)),
		meanCost: mean(rows.map(row => row.costUsd)),
		meanWallMs: mean(rows.map(row => row.wallMs)),
		meanRequests: mean(rows.map(row => row.requests)),
		meanToolCalls: mean(rows.map(row => row.toolCalls)),
	};
}

function pairsByTaskRep(records: RunRecord[], arm: Arm): Map<string, RunRecord> {
	const map = new Map<string, RunRecord>();
	for (const record of records) if (record.arm === arm) map.set(`${record.task}#${record.rep}`, record);
	return map;
}

interface ModelVerdict {
	model: string;
	normal: ArmAggregate;
	code: ArmAggregate;
	costLower: boolean;
	successOk: boolean;
	costPaired?: PairedStats;
	tokensPaired?: PairedStats;
	costCiExcludesZero: boolean;
	tokensCiExcludesZero: boolean;
}

function buildVerdicts(records: RunRecord[], models: ModelSpec[]): ModelVerdict[] {
	const verdicts: ModelVerdict[] = [];
	for (const model of models) {
		const rows = records.filter(record => record.model === model.id);
		if (rows.length === 0) continue;
		const normal = aggregate(rows, "normal");
		const code = aggregate(rows, "code");
		const normalByKey = pairsByTaskRep(rows, "normal");
		const codeByKey = pairsByTaskRep(rows, "code");
		const costDiffs: number[] = [];
		const tokenDiffs: number[] = [];
		for (const [key, normalRecord] of normalByKey) {
			const codeRecord = codeByKey.get(key);
			if (!codeRecord) continue;
			costDiffs.push(codeRecord.costUsd - normalRecord.costUsd);
			tokenDiffs.push(codeRecord.usage.totalTokens - normalRecord.usage.totalTokens);
		}
		const costPaired = pairedStats(costDiffs);
		const tokensPaired = pairedStats(tokenDiffs);
		verdicts.push({
			model: model.id,
			normal,
			code,
			costLower: code.meanCost < normal.meanCost,
			successOk: code.successRate >= normal.successRate,
			costPaired,
			tokensPaired,
			costCiExcludesZero: costPaired !== undefined && costPaired.ci95[1] < 0,
			tokensCiExcludesZero: tokensPaired !== undefined && tokensPaired.ci95[1] < 0,
		});
	}
	return verdicts;
}

function formatUsd(value: number): string {
	return `$${value.toFixed(5)}`;
}

function formatNumber(value: number): string {
	return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatPaired(label: string, stats: PairedStats | undefined): string {
	if (!stats) return `- ${label}: n<2, no paired test`;
	const ci = `[${stats.ci95[0].toFixed(4)}, ${stats.ci95[1].toFixed(4)}]`;
	return `- ${label}: n=${stats.n}, mean diff=${stats.meanDiff.toFixed(5)}, t(${stats.df})=${stats.t.toFixed(2)}, p=${stats.p.toFixed(4)}, 95% CI ${ci}`;
}

function buildMarkdown(records: RunRecord[], verdicts: ModelVerdict[], config: Config, state: BudgetState): string {
	const lines: string[] = [];
	lines.push(`# Code Mode A/B — ${config.smoke ? "smoke" : "full"} run`, "");
	lines.push(`- Generated: ${new Date().toISOString()}`);
	lines.push(`- Reps per arm: ${config.reps}; tasks: ${config.tasks.map(task => task.id).join(", ")}`);
	lines.push(`- Budget: ${formatUsd(config.maxUsd)} (spent ${formatUsd(state.spentUsd)})`);
	if (config.perModelCapUsd !== undefined) lines.push(`- Per-model cap: ${formatUsd(config.perModelCapUsd)}`);
	for (const [modelId, usd] of state.spentByModelUsd) lines.push(`- Spent on ${modelId}: ${formatUsd(usd)}`);
	lines.push(`- Pricing: models.dev snapshot 2026-11-20, USD per 1M tokens, per-request long-context tiers`);
	lines.push("");
	lines.push("## Per model and arm", "");
	lines.push(
		"| model | arm | n | success | mean input | mean output | cache read | cache write | mean tokens | mean cost | mean wall s | mean requests | mean tool calls |",
	);
	lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
	for (const verdict of verdicts) {
		for (const arm of [verdict.normal, verdict.code]) {
			lines.push(
				`| ${verdict.model} | ${arm.arm} | ${arm.n} | ${(arm.successRate * 100).toFixed(0)}% | ${formatNumber(arm.meanInput)} | ${formatNumber(arm.meanOutput)} | ${formatNumber(arm.meanCacheRead)} | ${formatNumber(arm.meanCacheWrite)} | ${formatNumber(arm.meanTotalTokens)} | ${formatUsd(arm.meanCost)} | ${(arm.meanWallMs / 1000).toFixed(1)} | ${arm.meanRequests.toFixed(2)} | ${arm.meanToolCalls.toFixed(2)} |`,
			);
		}
	}
	lines.push("", "## Paired tests (code − normal, paired by task×rep)", "");
	for (const verdict of verdicts) {
		lines.push(`### ${verdict.model}`, "");
		lines.push(formatPaired("cost USD", verdict.costPaired));
		lines.push(formatPaired("total tokens", verdict.tokensPaired));
		lines.push(
			`- cost lower: ${verdict.costLower}; success >= normal: ${verdict.successOk}; cost CI excludes 0: ${verdict.costCiExcludesZero}; tokens CI excludes 0: ${verdict.tokensCiExcludesZero}`,
			"",
		);
	}
	const qualifying = verdicts.filter(verdict => verdict.costLower && verdict.successOk && verdict.costCiExcludesZero);
	const hasAnthropic = qualifying.some(verdict => verdict.model.includes("claude"));
	const hasOpenAi = qualifying.some(verdict => verdict.model.includes("gpt"));
	const recommendDefaultOn = qualifying.length >= 2 && hasAnthropic && hasOpenAi;
	lines.push("## Decision rule", "");
	lines.push(
		"`codeMode.default: true` only if cost is lower and success is not worse in at least two models (one Anthropic, one OpenAI/Codex), with the paired cost CI excluding 0.",
		"",
	);
	lines.push(`- Qualifying models: ${qualifying.map(verdict => verdict.model).join(", ") || "none"}`);
	lines.push(`- Anthropic qualifier: ${hasAnthropic}; OpenAI/Codex qualifier: ${hasOpenAi}`);
	lines.push(
		`- Verdict: ${recommendDefaultOn ? "`default: true` supported" : "`default: true` NOT supported by this data"}`,
	);
	lines.push("", "## Runs", "");
	lines.push("| run | arm | task | rep | ok | reason | requests | tokens | cost | wall s | escapes |");
	lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
	for (const record of records) {
		lines.push(
			`| ${record.runId} | ${record.arm} | ${record.task} | ${record.rep} | ${record.success ? "yes" : "no"} | ${record.successReason ?? ""} | ${record.requests} | ${record.usage.totalTokens} | ${formatUsd(record.costUsd)} | ${(record.wallMs / 1000).toFixed(1)} | ${record.escapeCalls ?? 0} |`,
		);
	}
	lines.push("");
	return lines.join("\n");
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
	const config = parseConfig(process.argv.slice(2));
	if (config.summarizeDir) {
		await summarizeRunDir(config.summarizeDir, config);
		return;
	}
	await fs.mkdir(config.outDir, { recursive: true });
	const jsonlPath = path.join(config.outDir, "runs.jsonl");
	const runRoot = await fs.mkdtemp(path.join(os.tmpdir(), "omp-ws-"));
	const state: BudgetState = {
		limitUsd: config.maxUsd,
		spentUsd: 0,
		maxObservedUsd: new Map(),
		spentByModelUsd: new Map(),
	};
	const records: RunRecord[] = [];
	const wireByModel = new Map<string, { normal?: WireInfo; code?: WireInfo }>();

	console.log(`[ab] out=${config.outDir}`);
	console.log(
		`[ab] budget=${formatUsd(config.maxUsd)} models=${config.models.map(model => `${model.id}:${model.thinking}`).join(", ")}`,
	);
	console.log(`[ab] tasks=${config.tasks.map(task => task.id).join(", ")} reps=${config.reps}`);

	try {
		for (const model of config.models) {
			const slug = model.id.replace(/[^a-zA-Z0-9]+/g, "-");
			const agentDir = await makeAgentDir(runRoot, slug);
			const wires = wireByModel.get(model.id) ?? {};
			wireByModel.set(model.id, wires);
			const scratchWorkspace = path.join(runRoot, `preflight-${slug}`);
			await copyFixture(config.tasks[0]!.fixtureDir, scratchWorkspace);

			const perModelCap = config.perModelCapUsd;
			let modelBudgetExhausted = false;
			for (const [taskIndex, task] of config.tasks.entries()) {
				if (modelBudgetExhausted) break;
				for (let rep = 1; rep <= config.reps; rep++) {
					if (modelBudgetExhausted) break;
					// Alternate arm order per rep so cache warm-up and drift cancel out.
					const armOrder: Arm[] = (taskIndex + rep) % 2 === 0 ? ["code", "normal"] : ["normal", "code"];
					const arms = armOrder.filter(arm => config.arms.includes(arm));
					for (const arm of arms) {
						const estimate = estimateNextRun(state, model);
						if (state.spentUsd + estimate > config.maxUsd) {
							console.warn(
								`[ab] SKIP ${model.id} ${arm} ${task.id} r${rep}: spent ${formatUsd(state.spentUsd)} + estimate ${formatUsd(estimate)} > cap ${formatUsd(config.maxUsd)}`,
							);
							continue;
						}
						const modelSpent = state.spentByModelUsd.get(model.id) ?? 0;
						if (perModelCap !== undefined && modelSpent + estimate > perModelCap) {
							console.warn(
								`[ab] MODEL CAP ${model.id}: spent ${formatUsd(modelSpent)} + estimate ${formatUsd(estimate)} > cap ${formatUsd(perModelCap)}; moving to the next model`,
							);
							modelBudgetExhausted = true;
							break;
						}
						const wire = wires[arm];
						if (!wire) {
							const info = await rpcPreflight(model, arm, agentDir, scratchWorkspace, 120_000);
							if (info.thinkingLevel !== model.thinking) {
								throw new Error(
									`${model.id}: --thinking ${model.thinking} was not applied (session reports ${JSON.stringify(info.thinkingLevel)})`,
								);
							}
							wires[arm] = info;
							console.log(
								`[ab] wire ${model.id} ${arm}: codeModeEnabled=${info.codeModeEnabled} tools=[${info.tools.join(", ")}]`,
							);
						}
						const record = await runOne({
							config,
							model,
							arm,
							task,
							rep,
							runRoot,
							agentDir,
							wire: wires[arm]!,
							state,
						});
						records.push(record);
						await fs.appendFile(jsonlPath, `${JSON.stringify(record)}\n`);
						console.log(
							`[ab] ${record.runId} ok=${record.success} req=${record.requests} in=${record.usage.input} out=${record.usage.output} cost=${formatUsd(record.costUsd)} wall=${(record.wallMs / 1000).toFixed(1)}s spent=${formatUsd(state.spentUsd)}${record.successReason ? ` reason=${record.successReason}` : ""}`,
						);
						if (state.spentUsd >= config.maxUsd - 0.02) {
							console.warn(`[ab] budget exhausted (${formatUsd(state.spentUsd)}); stopping`);
							throw new BudgetExhausted();
						}
					}
				}
			}
		}
	} catch (error) {
		if (!(error instanceof BudgetExhausted)) throw error;
	} finally {
		const markdown = await writeSummary(config.outDir, records, config, state);
		console.log(`\n${markdown}`);
		console.log(
			`[ab] spent ${formatUsd(state.spentUsd)} of ${formatUsd(config.maxUsd)}; results in ${config.outDir}`,
		);
		if (!config.keep) await fs.rm(runRoot, { recursive: true, force: true });
	}
}

/** Later attempts replace earlier ones for the same model×task×rep×arm cell. */
function dedupeRecords(records: RunRecord[]): RunRecord[] {
	const byCell = new Map<string, RunRecord>();
	for (const record of records) byCell.set(`${record.model}|${record.task}|${record.rep}|${record.arm}`, record);
	return [...byCell.values()];
}

async function writeSummary(dir: string, records: RunRecord[], config: Config, state: BudgetState): Promise<string> {
	const analyzed = dedupeRecords(records);
	const verdicts = buildVerdicts(analyzed, config.models);
	const markdown = buildMarkdown(analyzed, verdicts, config, state);
	await fs.writeFile(path.join(dir, "summary.md"), markdown);
	await fs.writeFile(
		path.join(dir, "summary.json"),
		JSON.stringify(
			{
				config: { ...config, models: config.models, tasks: config.tasks.map(task => task.id) },
				spentUsd: state.spentUsd,
				spentByModelUsd: Object.fromEntries(state.spentByModelUsd),
				verdicts,
				records: analyzed,
			},
			null,
			2,
		),
	);
	return markdown;
}

/** Rebuild summary.md/json from a run directory's incremental runs.jsonl. */
async function summarizeRunDir(dir: string, config: Config): Promise<void> {
	const raw = await fs.readFile(path.join(dir, "runs.jsonl"), "utf8");
	const records = raw
		.split("\n")
		.filter(line => line.trim().length > 0)
		.map(line => JSON.parse(line) as RunRecord);
	if (records.length === 0) throw new Error(`${dir}/runs.jsonl has no records`);
	const state: BudgetState = {
		limitUsd: config.maxUsd,
		spentUsd: 0,
		maxObservedUsd: new Map(),
		spentByModelUsd: new Map(),
	};
	for (const record of records) {
		state.spentUsd += record.costUsd;
		state.spentByModelUsd.set(record.model, (state.spentByModelUsd.get(record.model) ?? 0) + record.costUsd);
		state.maxObservedUsd.set(record.model, Math.max(state.maxObservedUsd.get(record.model) ?? 0, record.costUsd));
	}
	const markdown = await writeSummary(dir, records, config, state);
	console.log(markdown);
	console.log(`[ab] summarized ${records.length} runs, spent ${formatUsd(state.spentUsd)}; ${dir}`);
}

class BudgetExhausted extends Error {}

await main();
