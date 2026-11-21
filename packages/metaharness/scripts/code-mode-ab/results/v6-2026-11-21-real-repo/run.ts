#!/usr/bin/env bun
/**
 * Real-repo A/B on oh-my-pi itself. Usage:
 *   bun run.ts <model:thinking> <arms comma> <tasks comma> <reps> <outDir>
 * Each run gets a fresh `git worktree` of HEAD inside a private bwrap /tmp, node_modules symlinked
 * read-only from the main checkout. Records tokens/requests, hidden-check result, diff, transcript.
 */
import * as fs from "node:fs";
import * as path from "node:path";

const REPO = path.resolve(import.meta.dir, "../../../../../..");
const CLI = path.join(REPO, "packages/coding-agent/src/cli.ts");
const MODELS_YML = path.join(REPO, "packages/metaharness/scripts/code-mode-ab.ts");
const [spec, armsArg, tasksArg, repsArg, outDir] = process.argv.slice(2);
const [modelId, thinking] = spec!.split(":");
const arms = armsArg!.split(",");
const tasks = JSON.parse(fs.readFileSync(path.join(import.meta.dir, "tasks.json"), "utf8")).filter(
	(t: { id: string }) => tasksArg!.split(",").includes(t.id),
);
const reps = Number(repsArg);
fs.mkdirSync(path.join(outDir!, "transcripts"), { recursive: true });

// Same minimal models.yml the A/B runner uses (extracted from its source).
const ymlSource = fs.readFileSync(MODELS_YML, "utf8");
const yml = ymlSource
	.slice(ymlSource.indexOf("const MINIMAL_MODELS_YML = `") + "const MINIMAL_MODELS_YML = `".length)
	.split("\n`;")[0]!
	.replaceAll("\\`", "`");

const sh = (cmd: string[], cwd?: string) => {
	const r = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
	if (r.exitCode !== 0) throw new Error(`${cmd.join(" ")}: ${r.stderr.toString()}`);
	return r.stdout.toString();
};

for (const task of tasks) {
	for (let rep = 1; rep <= reps; rep++) {
		for (const arm of rep % 2 ? arms : [...arms].reverse()) {
			const runId = `${modelId!.replace(/[^a-zA-Z0-9]+/g, "-")}-${arm}-${task.id}-r${rep}`;
			const root = fs.mkdtempSync("/tmp/omp-ws-");
			const repo = path.join(root, "repo");
			const agent = path.join(root, "agent");
			fs.mkdirSync(agent);
			fs.writeFileSync(path.join(agent, "models.yml"), yml);
			sh(["git", "worktree", "add", "-q", "--detach", repo, "HEAD"], REPO);
			fs.symlinkSync(path.join(REPO, "node_modules"), path.join(repo, "node_modules"));
			const started = Date.now();
			const args = [
				"bwrap",
				"--dev-bind",
				"/",
				"/",
				"--tmpfs",
				"/tmp",
				"--bind",
				root,
				root,
				"--chdir",
				repo,
				"--",
				"env",
				`PI_CODING_AGENT_DIR=${agent}`,
				"bun",
				CLI,
				"-p",
				"--mode",
				"json",
				"--model",
				modelId!,
				"--thinking",
				thinking!,
				"--max-turns",
				"40",
				"--no-extensions",
				"--no-skills",
				"--no-rules",
				"--no-lsp",
				"--no-title",
				"--no-session",
				arm === "code" ? "--code-mode" : "--no-code-mode",
				task.prompt,
			];
			const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
			const timer = setTimeout(() => proc.kill(), 600_000);
			const out = await new Response(proc.stdout).text();
			const exitCode = await proc.exited;
			clearTimeout(timer);
			const lines = out.split("\n").filter(l => l.includes('"type":"message_end"'));
			let requests = 0;
			let tokens = 0;
			let error: string | undefined;
			for (const l of lines) {
				const m = JSON.parse(l).message;
				if (m?.role !== "assistant") continue;
				requests++;
				tokens += m.usage?.totalTokens ?? 0;
				if (m.errorMessage) error = m.errorMessage;
			}
			const check = JSON.parse(
				sh(["bun", path.join(import.meta.dir, "check.ts"), task.id, repo], "/tmp")
					.trim()
					.split("\n")
					.at(-1)!,
			);
			const diff = Bun.spawnSync(["git", "diff", "HEAD"], { cwd: repo, stdout: "pipe" }).stdout.toString();
			const untracked = sh(["git", "ls-files", "--others", "--exclude-standard"], repo)
				.split("\n")
				.filter(Boolean)
				.filter(p => p !== "node_modules");
			let fullDiff = diff;
			for (const p of untracked) {
				fullDiff += Bun.spawnSync(["git", "diff", "--no-index", "/dev/null", p], {
					cwd: repo,
					stdout: "pipe",
				}).stdout.toString();
			}
			fs.writeFileSync(path.join(outDir!, "transcripts", `${runId}.jsonl`), `${lines.join("\n")}\n`);
			fs.writeFileSync(path.join(outDir!, "transcripts", `${runId}.diff`), fullDiff);
			const record = {
				runId,
				model: modelId,
				thinking,
				arm,
				task: task.id,
				rep,
				exitCode,
				wallMs: Date.now() - started,
				requests,
				tokens,
				error,
				success: check.ok,
				check,
				untracked,
			};
			fs.appendFileSync(path.join(outDir!, "runs.jsonl"), `${JSON.stringify(record)}\n`);
			console.log(
				`${runId} ok=${check.ok} req=${requests} tok=${tokens} hidden=${check.passed}/${check.total} outside=${check.touchedOutside.length}`,
			);
			sh(["git", "worktree", "remove", "--force", repo], REPO);
			fs.rmSync(root, { recursive: true, force: true });
		}
	}
}
