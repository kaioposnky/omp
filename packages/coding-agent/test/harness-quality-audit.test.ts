import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { unregisterCustomApis } from "@oh-my-pi/pi-ai";
import { createMockModel, type MockResponse, registerMockApi } from "@oh-my-pi/pi-ai/providers/mock";
import { ModelRegistry } from "../src/config/model-registry";
import type { Skill } from "../src/extensibility/skills";
import { SessionManager } from "../src/session/session-manager";
import { createAgentSession } from "../src/sdk";
import { buildSystemPrompt } from "../src/system-prompt";
import {
	ACCEPTANCE_REPEATS,
	assertIdentity,
	auditSettings,
	AuditPolicyError,
	type AuditFixturePaths,
	auditToolMetadata,
	authorizeTool,
	CASE_IDS,
	type CaseId,
	caseDefinitions,
	expectedSchedule,
	fixtureSandbox,
	gateResults,
	hashFixtureTree,
	loadBaseline,
	measureCatalogComparison,
	parseArgs,
	renderPrompt,
	report,
	REQUESTED_MODEL,
	requiredChecks,
	runFixtureCommand,
	snapshot,
	syntheticCatalog,
	trial,
	type TrialRecord,
	validateAuditResults,
} from "../scripts/harness-quality-audit";
import { createInMemoryAuthStorage } from "./helpers/agent-session-setup";

const roots: string[] = [];
afterEach(async () => {
	for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
	unregisterCustomApis("pi-ai/mock");
});

async function makeRoot(): Promise<string> {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "harness-audit-test-"));
	roots.push(root);
	return root;
}

interface GuardedFixture {
	paths: AuditFixturePaths;
	skills: Skill[];
}

async function makeGuardedFixture(
	skills: Array<{ name: string; description: string; body: string }> = [
		{ name: "alpha-skill", description: "Alpha procedure.", body: "ALPHA_BODY" },
	],
): Promise<GuardedFixture> {
	const root = await makeRoot();
	const paths: AuditFixturePaths = {
		root,
		workspace: path.join(root, "workspace"),
		skillsDir: path.join(root, "skills"),
	};
	await fs.mkdir(paths.workspace, { recursive: true });
	await fs.mkdir(paths.skillsDir, { recursive: true });
	await fs.writeFile(path.join(paths.workspace, "allowed.txt"), "synthetic");
	await fs.writeFile(path.join(paths.workspace, "notes.txt"), "notes");
	const mounted: Skill[] = [];
	for (const skill of skills) {
		const baseDir = path.join(paths.skillsDir, skill.name);
		await fs.mkdir(baseDir, { recursive: true });
		const filePath = path.join(baseDir, "SKILL.md");
		await fs.writeFile(filePath, `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n${skill.body}\n`);
		mounted.push({ name: skill.name, description: skill.description, filePath, baseDir, source: "project" });
	}
	return { paths, skills: mounted };
}

const readText = (result: unknown): string => {
	if (result === null || typeof result !== "object" || !("content" in result)) return "";
	const content = result.content;
	if (!Array.isArray(content)) return "";
	return content
		.map(part => {
			if (part === null || typeof part !== "object" || !("type" in part) || part.type !== "text") return "";
			return "text" in part && typeof part.text === "string" ? part.text : "";
		})
		.join("\n");
};

const rejection = (promise: Promise<unknown>): Promise<unknown> =>
	promise.then(
		() => undefined,
		error => error,
	);

describe("harness quality audit synthetic catalog", () => {
	test("strict CLI validation and bounded concurrency", () => {
		expect(parseArgs(["run", "--baseline", "b", "--output", "o"]).values.concurrency).toBe("2");
		for (const args of [
			["run"],
			["snapshot", "--output"],
			["report", "--input", "x", "--unknown", "y"],
			["run", "--baseline", "b", "--output", "o", "--concurrency", "3"],
			["snapshot", "--output", "x", "--output", "y"],
		])
			expect(() => parseArgs(args)).toThrow();
	});

	test("catalog keeps literal all-token search evidence for the target skill", () => {
		const catalog = syntheticCatalog();
		expect(catalog).toHaveLength(300);
		const target = catalog.find(skill => skill.name === "static-page-verify");
		const description = target?.description.toLowerCase() ?? "";
		for (const token of ["static", "page", "verification"]) expect(description).toContain(token);
		expect(
			catalog
				.filter(skill => skill.name.startsWith("irrelevant-"))
				.every(skill => skill.description.includes("Astronomy") && !skill.description.includes("static")),
		).toBe(true);
	});

	test("nine cases split the former combined business boundary", () => {
		expect(CASE_IDS).toHaveLength(9);
		expect(CASE_IDS).toContain("technical-boundary");
		expect(CASE_IDS).toContain("business-routing");
		expect(CASE_IDS).not.toContain("business-boundary" as CaseId);
		const definitions = caseDefinitions();
		for (const caseId of CASE_IDS) {
			expect(definitions[caseId]).toBeDefined();
			expect(requiredChecks(caseId)).toContain("fixture integrity");
			expect(requiredChecks(caseId)).toContain("trial limits");
		}
		expect(definitions["skill-routing"].catalog).toHaveLength(300);
		expect(definitions["technical-boundary"].catalog.map(skill => skill.name)).toEqual([
			"founder-business-routing",
			"pricing-strategist",
		]);
		expect(Object.keys(definitions["technical-boundary"].files).sort()).toEqual(["context.txt", "handler.ts"]);
		expect(definitions["business-routing"].appendPrompt.baseline).toBe(
			definitions["business-routing"].appendPrompt.candidate,
		);
	});
});

describe("harness quality audit path guard", () => {
	test("rejects aliases, schemes, lists and traversal before access", async () => {
		const { paths, skills } = await makeGuardedFixture();
		const outside = await makeRoot();
		const denied: Array<[string, string]> = [
			["read", "../allowed.txt"],
			["read", path.join(outside, "allowed.txt")],
			["read", "memory://private"],
			["read", "https://example.com"],
			["read", "file:///etc/passwd"],
			["read", "@~/secret.txt"],
			["read", "@/home/kaio/secret.txt"],
			["read", ":/home/kaio/secret.txt"],
			["read", "allowed.txt notes.txt"],
			["read", "allowed.txt,notes.txt"],
			["read", '["allowed.txt","notes.txt"]'],
			["read", "allowed.txt;@~/secret.txt"],
			["read", "~root/**"],
			["read", "..\\allowed.txt"],
			["read", "allowed.txt:table"],
			["read", "archive.zip:member"],
			["read", "skill:///../private"],
			["read", "skill://alpha-skill/extra"],
			["read", "skill://unknown-skill"],
			["grep", "skill://?q=static"],
			["glob", "../**/*.txt"],
			["glob", "**/../*.txt"],
		];
		for (const [tool, target] of denied) {
			const allowed = tool === "read" ? ["read", "grep", "glob"] : [tool];
			await expect(authorizeTool(paths, skills, allowed, tool, { path: target })).rejects.toThrow();
		}
		await expect(authorizeTool(paths, [], ["read"], "bash", { command: "true" })).rejects.toThrow();
	});

	test("classifies malformed input separately from policy denials", async () => {
		const { paths, skills } = await makeGuardedFixture();
		const alias = await rejection(authorizeTool(paths, skills, ["read"], "read", { path: "@~/secret" }));
		const list = await rejection(authorizeTool(paths, skills, ["read"], "read", { path: "a.txt b.txt" }));
		expect(alias).toBeInstanceOf(AuditPolicyError);
		expect((alias as AuditPolicyError).category).toBe("policy_denied");
		expect(list).toBeInstanceOf(AuditPolicyError);
		expect((list as AuditPolicyError).category).toBe("invalid_input");
	});

	test("allows ordinary paths, raw selectors, globs and encoded skill queries", async () => {
		const { paths, skills } = await makeGuardedFixture();
		await expect(
			authorizeTool(paths, skills, ["read"], "read", { path: "allowed.txt:1-2:raw" }),
		).resolves.toBeUndefined();
		await expect(
			authorizeTool(paths, skills, ["read"], "read", { path: "allowed.txt:20-22:raw" }),
		).resolves.toBeUndefined();
		await expect(
			authorizeTool(paths, skills, ["read"], "read", { path: "allowed.txt;notes.txt" }),
		).resolves.toBeUndefined();
		await expect(
			authorizeTool(paths, skills, ["read"], "read", { path: "skill://alpha-skill" }),
		).resolves.toBeUndefined();
		await expect(
			authorizeTool(paths, skills, ["read"], "read", { path: "skill://?q=static%20page" }),
		).resolves.toBeUndefined();
		await expect(authorizeTool(paths, skills, ["glob"], "glob", { path: "**/*.txt" })).resolves.toBeUndefined();
		await expect(authorizeTool(paths, skills, ["grep"], "grep", { pattern: "synthetic" })).resolves.toBeUndefined();
	});

	test("edits cannot create, delete, move or target outside fixtures", async () => {
		const { paths, skills } = await makeGuardedFixture();
		for (const input of [
			"[allowed.txt#AAAA]\nREM",
			"[allowed.txt#AAAA]\nMV notes.txt",
			"[../outside#AAAA]\nPUT 1.=1:\n+x",
			"garbage",
			"[missing.txt#AAAA]\nPUT 1.=1:\n+x",
		])
			await expect(authorizeTool(paths, skills, ["edit"], "edit", { input })).rejects.toThrow();
	});
});

describe("harness quality audit fixture sandbox", () => {
	test("missing sandbox fails closed before any fixture code executes", async () => {
		const root = await makeRoot();
		await fs.writeFile(path.join(root, "unsafe.ts"), 'throw new Error("must never execute")');
		await expect(fixtureSandbox(root, () => null)).rejects.toThrow("Missing prerequisite: bubblewrap");
	});

	test("read-only mount denies grader mutation and keeps host fixtures intact", async () => {
		const root = await makeRoot();
		const outside = await makeRoot();
		const sentinel = path.join(outside, "allowed.txt");
		await fs.writeFile(sentinel, "synthetic");
		await fs.writeFile(path.join(root, "allowed.txt"), "synthetic");
		await fs.writeFile(
			path.join(root, "range.ts"),
			"export const upperExclusive = (n: number) => Array.from({length: n}, (_, i) => i);\n",
		);
		const sandbox = await fixtureSandbox(root);
		process.env.OMP_AUDIT_PRIVATE_SENTINEL = "private-host-value";
		try {
			await fs.writeFile(
				path.join(root, "escape.test.ts"),
				`import {test,expect} from "bun:test";
import * as fs from "node:fs";
import {upperExclusive} from "./range.ts";
test("fixture is read-only", () => {
 expect(fs.readFileSync("allowed.txt", "utf8")).toBe("synthetic");
 expect(() => fs.writeFileSync("range.ts", "tampered")).toThrow();
 expect(() => fs.writeFileSync("injected.txt", "tampered")).toThrow();
 expect(() => fs.symlinkSync("allowed.txt", "link")).toThrow();
 expect(() => fs.readFileSync(${JSON.stringify(sentinel)}, "utf8")).toThrow();
 expect(() => fs.readFileSync("/proc/1/root" + ${JSON.stringify(sentinel)}, "utf8")).toThrow();
 expect(process.env.OMP_AUDIT_PRIVATE_SENTINEL).toBeUndefined();
 expect(process.env.HOME).toBe("/tmp");
 expect(() => fs.writeFileSync("/runtime/bun", "changed")).toThrow();
});
test("range boundary still runs", () => {
 expect(upperExclusive(0)).toEqual([]);
 expect(upperExclusive(3)).toEqual([0,1,2]);
});`,
			);
			const before = await hashFixtureTree(root);
			const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("host network") });
			try {
				expect(await runFixtureCommand(sandbox, ["test", "escape.test.ts"])).toBe(0);
				expect(
					await runFixtureCommand(sandbox, [
						"-e",
						`if (await fetch("http://127.0.0.1:${server.port}", {signal:AbortSignal.timeout(300)}).then(()=>true,()=>false)) process.exit(1);`,
					]),
				).toBe(0);
			} finally {
				server.stop(true);
			}
			const after = await hashFixtureTree(root);
			expect(after.hash).toBe(before.hash);
			expect(after.files).toEqual(before.files);
			expect(await fs.readFile(path.join(root, "range.ts"), "utf8")).toContain("Array.from({length: n}");
			expect(await fs.readFile(path.join(root, "allowed.txt"), "utf8")).toBe("synthetic");
			expect(await fs.readFile(sentinel, "utf8")).toBe("synthetic");
			expect((await fs.readdir(root)).sort()).toEqual(["allowed.txt", "escape.test.ts", "range.ts"]);
		} finally {
			delete process.env.OMP_AUDIT_PRIVATE_SENTINEL;
		}
	});

	test("fixture hashing detects mutation and refuses symlinks", async () => {
		const { paths } = await makeGuardedFixture();
		const before = await hashFixtureTree(paths.root);
		await fs.writeFile(path.join(paths.workspace, "allowed.txt"), "mutated");
		const after = await hashFixtureTree(paths.root);
		expect(after.hash).not.toBe(before.hash);
		await fs.symlink(path.join(paths.workspace, "notes.txt"), path.join(paths.workspace, "link"));
		await expect(hashFixtureTree(paths.root)).rejects.toThrow();
	});
});

describe("harness quality audit skill presentation", () => {
	test("default template search mode names the reader and hides the catalog", async () => {
		const { paths, skills } = await makeGuardedFixture();
		const template = await fs.readFile(path.join(import.meta.dir, "../src/prompts/system/system-prompt.md"), "utf8");
		const search = await renderPrompt(template, "", paths.workspace, skills, "search", ["read", "grep", "glob"]);
		expect(search).toContain('Use read with path="skill://?q=');
		expect(search).toContain("skill:// is a URI, not a tool name or a glob/grep root");
		expect(search).toContain("incidental repository text or a catalog hit");
		expect(search).not.toContain("Alpha procedure.");
		const full = await renderPrompt(template, "", paths.workspace, skills, "full", ["read", "grep", "glob"]);
		expect(full).toContain("Alpha procedure.");
		expect(full).not.toContain('path="skill://?q=');
	});

	test("mounted-only reader is addressed as xd://", async () => {
		const { paths, skills } = await makeGuardedFixture();
		const template = await fs.readFile(path.join(import.meta.dir, "../src/prompts/system/system-prompt.md"), "utf8");
		const built = await buildSystemPrompt({
			systemPromptTemplate: template,
			cwd: paths.workspace,
			skills,
			skillsSettings: { catalogMode: "search" },
			tools: new Map([
				[
					"skill-read",
					{ label: "skill-read", description: "Mounted reader.", wireName: "skill-read", readsSkillUris: true },
				],
			]),
			toolNames: [],
			xdevTools: [{ name: "skill-read", summary: "Mounted device." }],
			contextFiles: [],
			rules: [],
			alwaysApplyRules: [],
			resolvedAppendSystemPrompt: "",
			nativeTools: true,
			inlineToolDescriptors: false,
			activeRepoContext: null,
			workspaceTree: { rootPath: paths.workspace, rendered: "", truncated: false, totalLines: 0, agentsMdFiles: [] },
			taskIrcEnabled: false,
			autoQaEnabled: false,
			includeModelInPrompt: false,
		});
		const text = built.systemPrompt.join("\n\n");
		expect(text).toContain("to `xd://skill-read` to search");
		expect(text).toContain('{"path":"skill://<name>"}');
		expect(text).not.toContain("Use skill-read with");
	});

	test("no reader means no unusable search instruction", async () => {
		const template = await fs.readFile(path.join(import.meta.dir, "../src/prompts/system/system-prompt.md"), "utf8");
		const rendered = await renderPrompt(
			template,
			"",
			await makeRoot(),
			[
				{
					name: "static-page-verify",
					description: "Static page verification.",
					filePath: "/nonexistent/SKILL.md",
					baseDir: "/nonexistent",
					source: "project",
				},
			],
			"search",
			["grep", "glob"],
		);
		expect(rendered).not.toContain('path="skill://?q=');
		const empty = await renderPrompt(template, "", await makeRoot(), [], "search", ["read"]);
		expect(empty).not.toContain('path="skill://?q=');
	});

	test("plain custom prompt keeps search guidance in search mode", async () => {
		const { paths, skills } = await makeGuardedFixture();
		const query = (catalogMode: "full" | "search") =>
			buildSystemPrompt({
				resolvedCustomPrompt: "Plain custom policy.",
				cwd: paths.workspace,
				skills,
				skillsSettings: { catalogMode },
				tools: auditToolMetadata(["read"]),
				toolNames: ["read"],
				contextFiles: [],
				rules: [],
				alwaysApplyRules: [],
				resolvedAppendSystemPrompt: "",
				nativeTools: true,
				inlineToolDescriptors: false,
				activeRepoContext: null,
				workspaceTree: {
					rootPath: paths.workspace,
					rendered: "",
					truncated: false,
					totalLines: 0,
					agentsMdFiles: [],
				},
				taskIrcEnabled: false,
				autoQaEnabled: false,
				includeModelInPrompt: false,
			}).then(built => built.systemPrompt.join("\n\n"));
		const full = await query("full");
		expect(full).toContain("Plain custom policy.");
		expect(full).toContain("Alpha procedure.");
		const search = await query("search");
		expect(search).toContain("Plain custom policy.");
		expect(search).toContain('path="skill://?q=');
		expect(search).not.toContain("Alpha procedure.");
	});

	test("catalog search works through the real ReadTool", async () => {
		const { paths, skills } = await makeGuardedFixture([
			{
				name: "static-page-verify",
				description: syntheticCatalog()[0]!.description,
				body: "Return VERIFY_STATIC_42 after reading this procedure.",
			},
			{ name: "code-review", description: "Review Git diffs only.", body: "Diff only." },
		]);
		const auth = createInMemoryAuthStorage();
		const model = createMockModel({ provider: "kgdev", id: "cmd/reflection/beam:free" }).model;
		auth.keys.setRuntime("kgdev", "synthetic-test-key");
		const registry = new ModelRegistry(auth, path.join(paths.root, "models.yml"), { settings: auditSettings() });
		const { session } = await createAgentSession({
			cwd: paths.workspace,
			agentDir: paths.root,
			settings: auditSettings(),
			authStorage: auth,
			modelRegistry: registry,
			model,
			sessionManager: SessionManager.inMemory(paths.workspace),
			skills,
			contextFiles: [],
			toolNames: ["read"],
			systemPrompt: "Synthetic.",
		});
		try {
			const reader = session.getToolByName("read");
			expect(reader).toBeDefined();
			const matches = await reader!.execute("catalog-1", { path: "skill://?q=static%20page%20verification" });
			expect(readText(matches)).toContain("skill://static-page-verify");
			const empty = await reader!.execute("catalog-2", { path: "skill://?q=" });
			expect(readText(empty)).toContain("Showing 1-2 of 2");
			const none = await reader!.execute("catalog-3", { path: "skill://?q=nonexistent" });
			expect(readText(none)).toContain("No matching skills");
			const body = await reader!.execute("catalog-4", { path: "skill://static-page-verify" });
			expect(readText(body)).toContain("VERIFY_STATIC_42");
			const invalid = await rejection(reader!.execute("catalog-5", { path: "skill://?q=static&page=verification" }));
			const invalidText = invalid instanceof Error ? invalid.message : readText(invalid);
			expect(invalidText).toContain("Invalid skill catalog query");
		} finally {
			await session.dispose();
			auth.close();
		}
	});

	test("rendering excludes ambient AGENTS instructions", async () => {
		const root = await makeRoot();
		const marker = "PRIVATE_AMBIENT_CONTEXT_NOT_FOR_PROVIDER";
		await fs.writeFile(path.join(root, "AGENTS.md"), marker);
		const rendered = await renderPrompt("Synthetic policy only.", "", root);
		expect(rendered).not.toContain(marker);
		expect(rendered).toStartWith("Synthetic policy only.");
	});

	test("same-template catalog measurement varies only the catalog mode", async () => {
		const cwd = path.join(os.tmpdir(), "omp-audit-measure");
		const catalog = syntheticCatalog();
		const template = await fs.readFile(path.join(import.meta.dir, "../src/prompts/system/system-prompt.md"), "utf8");
		const measurement = await measureCatalogComparison(cwd, template, "Personality block.", catalog);
		for (const pair of [measurement.default, measurement.custom]) {
			expect(pair.searchBytes * 2).toBeLessThanOrEqual(pair.fullBytes);
		}
		const grown = await measureCatalogComparison(cwd, template, "Personality ".repeat(4000), catalog);
		expect(grown.default.fullBytes - grown.default.searchBytes).toBe(
			measurement.default.fullBytes - measurement.default.searchBytes,
		);
		expect(grown.custom.fullBytes).toBe(measurement.custom.fullBytes);
	});
});

describe("harness quality audit recording", () => {
	const modelIdentity = `${REQUESTED_MODEL}/mock`;

	function fakeHost(): { host: Parameters<typeof trial>[0]; auth: ReturnType<typeof createInMemoryAuthStorage> } {
		const auth = createInMemoryAuthStorage();
		const model = createMockModel({ provider: "kgdev", id: "cmd/reflection/beam:free" }).model;
		auth.keys.setRuntime("kgdev", "synthetic-test-key");
		const registry = new ModelRegistry(auth, path.join(os.tmpdir(), `audit-registry-${crypto.randomUUID()}.yml`), {
			settings: auditSettings(),
		});
		return { host: { model, registry, auth }, auth };
	}

	test("records denied, unknown and catalog outcomes against one id each", async () => {
		registerMockApi();
		const { host, auth } = fakeHost();
		const calls: MockResponse[] = [
			{
				content: [
					{ type: "toolCall", id: "call-unknown", name: "skill", arguments: { path: "skill://?q=static" } },
				],
			},
			{ content: [{ type: "toolCall", id: "call-denied", name: "read", arguments: { path: "/etc/passwd" } }] },
			{
				content: [
					{
						type: "toolCall",
						id: "call-catalog",
						name: "read",
						arguments: { path: "skill://?q=static%20page%20verification" },
					},
				],
			},
			{
				content: [
					{ type: "toolCall", id: "call-empty", name: "read", arguments: { path: "skill://?q=nonexistent" } },
				],
			},
			{
				content: [
					{
						type: "toolCall",
						id: "call-invalid",
						name: "read",
						arguments: { path: "skill://?q=static&page=verification" },
					},
				],
			},
			{
				content: [
					{ type: "toolCall", id: "call-body", name: "read", arguments: { path: "skill://static-page-verify" } },
				],
			},
			{ content: [{ type: "text", text: "VERIFY_STATIC_42" }] },
		];
		let turn = 0;
		const mocked = createMockModel({
			provider: "kgdev",
			id: "cmd/reflection/beam:free",
			handler: () => calls[Math.min(turn++, calls.length - 1)]!,
		});
		try {
			const record = await trial(
				{ ...host, model: mocked.model },
				{
					template: "Synthetic isolated audit policy.",
					personality: "",
					definitions: caseDefinitions(),
					caseId: "skill-routing",
					arm: "candidate",
					repeat: 1,
				},
			);
			expect(record.status).not.toBe("infrastructure_error");
			expect(record.observedModels).toEqual([modelIdentity]);
			const byId = new Map(record.toolCalls.map(call => [call.id, call]));
			expect(byId.size).toBe(record.toolCalls.length);
			expect(byId.get("call-unknown")).toMatchObject({ outcome: "error", category: "unknown_tool" });
			expect(byId.get("call-denied")).toMatchObject({ outcome: "denied", category: "policy_denied" });
			expect(byId.get("call-catalog")).toMatchObject({ outcome: "ok", catalogResult: "matches" });
			expect(byId.get("call-empty")).toMatchObject({ outcome: "ok", catalogResult: "no_matches" });
			expect(byId.get("call-invalid")).toMatchObject({ outcome: "error", category: "invalid_catalog_query" });
			expect(byId.get("call-body")).toMatchObject({ outcome: "ok", skillName: "static-page-verify" });
			expect(byId.get("call-catalog")?.skillName).toBeUndefined();
			expect(byId.get("call-denied")?.skillName).toBeUndefined();
			expect(record.toolCalls.filter(call => call.skillName !== undefined)).toHaveLength(1);
			expect(record.checks.find(check => check.name === "correct body read")?.pass).toBe(true);
			expect(record.checks.find(check => check.name === "no policy denial")?.pass).toBe(false);
			expect(record.status).toBe("fail");
		} finally {
			auth.close();
		}
	});

	test("guarded glob and grep calls are denied before access", async () => {
		registerMockApi();
		const { host, auth } = fakeHost();
		const calls: MockResponse[] = [
			{ content: [{ type: "toolCall", id: "glob-escape", name: "glob", arguments: { path: "../**/*.txt" } }] },
			{
				content: [
					{
						type: "toolCall",
						id: "grep-uri",
						name: "grep",
						arguments: { path: "skill://?q=static", pattern: "static" },
					},
				],
			},
			{ content: [{ type: "toolCall", id: "glob-local", name: "glob", arguments: { path: "**/*.txt" } }] },
			{ content: [{ type: "text", text: "done" }] },
		];
		let turn = 0;
		const mocked = createMockModel({
			provider: "kgdev",
			id: "cmd/reflection/beam:free",
			handler: () => calls[Math.min(turn++, calls.length - 1)]!,
		});
		try {
			const record = await trial(
				{ ...host, model: mocked.model },
				{
					template: "Synthetic isolated audit policy.",
					personality: "",
					definitions: caseDefinitions(),
					caseId: "untrusted-file",
					arm: "candidate",
					repeat: 1,
				},
			);
			const byId = new Map(record.toolCalls.map(call => [call.id, call]));
			expect(byId.get("glob-escape")).toMatchObject({ outcome: "denied", category: "policy_denied" });
			expect(byId.get("grep-uri")).toMatchObject({ outcome: "denied", category: "policy_denied" });
			expect(byId.get("glob-local")?.outcome).toBe("ok");
		} finally {
			auth.close();
		}
	});

	test("a business body read fails the technical boundary without hiding the evidence", async () => {
		registerMockApi();
		const { host, auth } = fakeHost();
		const calls: MockResponse[] = [
			{ content: [{ type: "toolCall", id: "read-handler", name: "read", arguments: { path: "handler.ts" } }] },
			{ content: [{ type: "toolCall", id: "read-context", name: "read", arguments: { path: "context.txt" } }] },
			{
				content: [
					{
						type: "toolCall",
						id: "read-business",
						name: "read",
						arguments: { path: "skill://founder-business-routing" },
					},
				],
			},
			{
				content: [
					{
						type: "text",
						text: '{"cause":"missing_service_token","action":"provide_required_config"}',
					},
				],
			},
		];
		let turn = 0;
		const mocked = createMockModel({
			provider: "kgdev",
			id: "cmd/reflection/beam:free",
			handler: () => calls[Math.min(turn++, calls.length - 1)]!,
		});
		try {
			const record = await trial(
				{ ...host, model: mocked.model },
				{
					template: "Synthetic isolated audit policy.",
					personality: "",
					definitions: caseDefinitions(),
					caseId: "technical-boundary",
					arm: "candidate",
					repeat: 1,
				},
			);
			const checks = new Map(record.checks.map(check => [check.name, check.pass]));
			expect(checks.get("source files read")).toBe(true);
			expect(checks.get("grounded JSON")).toBe(true);
			expect(checks.get("no business skill body")).toBe(false);
			expect(record.toolCalls.find(call => call.id === "read-business")?.skillName).toBe("founder-business-routing");
			expect(record.status).toBe("fail");
		} finally {
			auth.close();
		}
	});

	test("successful business routing passes in order and duplicate memory is deduplicated", async () => {
		registerMockApi();
		const { host, auth } = fakeHost();
		const calls: MockResponse[] = [
			{
				content: [
					{ type: "toolCall", id: "route", name: "read", arguments: { path: "skill://founder-business-routing" } },
				],
			},
			{
				content: [
					{ type: "toolCall", id: "price", name: "read", arguments: { path: "skill://pricing-strategist" } },
				],
			},
			{
				content: [
					{
						type: "text",
						text: '{"status":"synthetic","token":"SYNTHETIC_PRICING","actionsTaken":false}',
					},
				],
			},
		];
		let turn = 0;
		const mocked = createMockModel({
			provider: "kgdev",
			id: "cmd/reflection/beam:free",
			handler: () => calls[Math.min(turn++, calls.length - 1)]!,
		});
		try {
			const record = await trial(
				{ ...host, model: mocked.model },
				{
					template: "Synthetic isolated audit policy.",
					personality: "",
					definitions: caseDefinitions(),
					caseId: "business-routing",
					arm: "candidate",
					repeat: 1,
				},
			);
			expect(record.status).toBe("pass");
			expect(record.toolCalls.map(call => call.skillName)).toEqual([
				"founder-business-routing",
				"pricing-strategist",
			]);
		} finally {
			auth.close();
		}
	});

	test("candidate memory fixture uses complete deduplicated production recall", async () => {
		registerMockApi();
		const { host, auth } = fakeHost();
		const mocked = createMockModel({
			provider: "kgdev",
			id: "cmd/reflection/beam:free",
			handler: () => ({ content: ["alpha-7"] }),
		});
		try {
			const record = await trial(
				{ ...host, model: mocked.model },
				{
					template: "Synthetic isolated audit policy.",
					personality: "",
					definitions: caseDefinitions(),
					caseId: "memory-quality",
					arm: "candidate",
					repeat: 1,
				},
			);
			expect(record.status).toBe("pass");
			const injected = mocked.calls[0]?.context.systemPrompt;
			const text = typeof injected === "string" ? injected : (injected ?? []).join("\n");
			expect(text.match(/Deployment host is alpha-7/g)).toHaveLength(1);
			expect(text).not.toContain("Synthetic transcript");
			expect(text).toContain("</memories>");
		} finally {
			auth.close();
		}
	});

	test("fake provider identity mismatch is infrastructure, not a quality verdict", async () => {
		registerMockApi();
		const { host, auth } = fakeHost();
		const mocked = createMockModel({
			provider: "other",
			id: "cmd/reflection/beam:free",
			handler: () => ({ content: ["x"] }),
		});
		try {
			const record = await trial(
				{ ...host, model: mocked.model },
				{
					template: "Synthetic isolated audit policy.",
					personality: "",
					definitions: caseDefinitions(),
					caseId: "format-and-blocker",
					arm: "candidate",
					repeat: 1,
				},
			);
			expect(record.status).toBe("infrastructure_error");
			expect(record.output).not.toContain("synthetic-test-key");
		} finally {
			auth.close();
		}
	});

	test("turn limit is a failed bounded trial, not a quality pass", async () => {
		registerMockApi();
		const { host, auth } = fakeHost();
		const mocked = createMockModel({
			provider: "kgdev",
			id: "cmd/reflection/beam:free",
			handler: () => ({ content: ["still working"] }),
		});
		try {
			const record = await trial(
				{ ...host, model: mocked.model },
				{
					template: "Synthetic isolated audit policy.",
					personality: "",
					definitions: caseDefinitions(),
					caseId: "format-and-blocker",
					arm: "candidate",
					repeat: 1,
					limits: { turns: 0, timeoutMs: 5000 },
				},
			);
			expect(record.status).not.toBe("pass");
			expect(record.checks.find(check => check.name === "trial limits")?.pass).toBe(false);
		} finally {
			auth.close();
		}
	});
});

describe("harness quality audit gate", () => {
	const modelApi = "mock";
	const identity = `${REQUESTED_MODEL}/${modelApi}`;

	function evidence(caseId: CaseId, repeat: number) {
		const id = (suffix: string) => `${caseId}-${repeat}-${suffix}`;
		switch (caseId) {
			case "skill-routing":
				return [
					{
						id: id("body"),
						name: "read",
						input: { path: "skill://static-page-verify" },
						outcome: "ok" as const,
						skillName: "static-page-verify",
						catalogResult: "matches" as const,
					},
				];
			case "business-routing":
				return [
					{
						id: id("route"),
						name: "read",
						input: { path: "skill://founder-business-routing" },
						outcome: "ok" as const,
						skillName: "founder-business-routing",
					},
					{
						id: id("price"),
						name: "read",
						input: { path: "skill://pricing-strategist" },
						outcome: "ok" as const,
						skillName: "pricing-strategist",
					},
				];
			case "technical-boundary":
				return [
					{
						id: id("handler"),
						name: "read",
						input: { path: "handler.ts" },
						outcome: "ok" as const,
						readTarget: "handler.ts",
					},
					{
						id: id("context"),
						name: "read",
						input: { path: "context.txt" },
						outcome: "ok" as const,
						readTarget: "context.txt",
					},
				];
			case "read-selectors":
				return [
					{ id: id("range"), name: "read", input: { path: "numbered.txt:20-22:raw" }, outcome: "ok" as const },
				];
			default:
				return [{ id: id("read"), name: "read", input: { path: "context.txt" }, outcome: "ok" as const }];
		}
	}

	function record(caseId: CaseId, arm: "baseline" | "candidate", repeat: number): TrialRecord {
		return {
			caseId,
			arm,
			repeat,
			requestedModel: REQUESTED_MODEL,
			observedModels: [identity],
			status: "pass",
			checks: requiredChecks(caseId).map(name => ({ name, pass: true })),
			toolCalls: evidence(caseId, repeat),
			toolErrors: 0,
			elapsedMs: 10,
			usage: [],
			promptBytes: 100,
			promptTokens: 25,
			output:
				caseId === "technical-boundary"
					? '{"cause":"missing_service_token","action":"provide_required_config"}'
					: caseId === "business-routing"
						? '{"status":"synthetic","token":"SYNTHETIC_PRICING","actionsTaken":false}'
						: caseId === "skill-routing"
							? "VERIFY_STATIC_42"
							: "{}",
			fixtureHash: "f".repeat(64),
		};
	}

	function dataset(): Record<string, unknown> {
		const schedule = expectedSchedule();
		return {
			version: 2,
			requestedModel: REQUESTED_MODEL,
			model: { provider: "kgdev", id: "cmd/reflection/beam:free", api: modelApi },
			fixtureHash: "a".repeat(64),
			fixtureSources: {},
			identityScope: "synthetic",
			catalogComparison: {
				default: { fullBytes: 1000, searchBytes: 400, templateSha256: "t", personalitySha256: "p" },
				custom: { fullBytes: 1000, searchBytes: 450, templateSha256: "t", personalitySha256: "p" },
			},
			schedule,
			results: schedule.map(entry => record(entry.caseId, entry.arm, entry.repeat)),
			complete: true,
		};
	}

	test("a complete nine-case dataset passes and a routing-only dataset never does", () => {
		// Synthetic gate-logic fixture only: it exercises acceptance rules without any model evidence.
		const payload = dataset();
		expect(validateAuditResults(payload).complete).toBe(true);
		const gate = gateResults(payload);
		expect(gate.reasons).toEqual([]);
		expect(gate.passed).toBe(true);

		const routingOnly = {
			...payload,
			schedule: expectedSchedule().filter(entry => entry.caseId === "skill-routing"),
			results: (payload.results as TrialRecord[]).filter(row => row.caseId === "skill-routing"),
			complete: true,
		};
		const routingGate = gateResults(routingOnly);
		expect(routingGate.passed).toBe(false);
		expect(routingGate.reasons.join(" ")).toContain("coverage");
	});

	test("coverage, identity and metric defects block the gate", () => {
		const missing = dataset();
		missing.results = (missing.results as TrialRecord[]).slice(1);
		expect(gateResults(missing).passed).toBe(false);

		const duplicate = dataset();
		duplicate.results = [...(duplicate.results as TrialRecord[]), (duplicate.results as TrialRecord[])[0]];
		expect(validateAuditResults(duplicate).ok).toBe(false);

		const duplicateSchedule = dataset();
		duplicateSchedule.schedule = [
			...(duplicateSchedule.schedule as { caseId: string; arm: string; repeat: number }[]),
			(duplicateSchedule.schedule as { caseId: string; arm: string; repeat: number }[])[0],
		];
		expect(validateAuditResults(duplicateSchedule).reasons.join(" ")).toContain("duplicate schedule entry");
		expect(gateResults(duplicateSchedule).passed).toBe(false);

		const malformedSchedule = dataset();
		malformedSchedule.schedule = [
			...(malformedSchedule.schedule as { caseId: string; arm: string; repeat: number }[]),
			{ caseId: "skill-routing", arm: "candidate", repeat: 0 },
		];
		expect(validateAuditResults(malformedSchedule).reasons.join(" ")).toContain("malformed schedule entry");
		expect(gateResults(malformedSchedule).passed).toBe(false);

		const badIdentity = dataset();
		badIdentity.results = (badIdentity.results as TrialRecord[]).map(row => ({
			...row,
			observedModels: ["other/model/api"],
		}));
		expect(validateAuditResults(badIdentity).ok).toBe(false);
		expect(gateResults(badIdentity).passed).toBe(false);

		const emptyIdentity = dataset();
		emptyIdentity.results = (emptyIdentity.results as TrialRecord[]).map(row => ({ ...row, observedModels: [] }));
		expect(gateResults(emptyIdentity).passed).toBe(false);

		const wrongModel = dataset();
		wrongModel.requestedModel = "other/model";
		expect(gateResults(wrongModel).passed).toBe(false);

		const badMetrics = dataset();
		badMetrics.results = (badMetrics.results as TrialRecord[]).map(row => ({ ...row, promptBytes: -1 }));
		expect(gateResults(badMetrics).passed).toBe(false);

		const absentCandidate = dataset();
		absentCandidate.results = (absentCandidate.results as TrialRecord[]).filter(
			row => !(row.arm === "candidate" && row.caseId === "business-routing"),
		);
		const absentGate = gateResults(absentCandidate);
		expect(absentGate.passed).toBe(false);
		expect(absentGate.reasons.join(" ")).toContain("candidate business-routing");
		expect(absentGate.reasons.join(" ")).toContain("coverage");

		const failingCandidate = dataset();
		failingCandidate.results = (failingCandidate.results as TrialRecord[]).map(row =>
			row.arm === "candidate" ? { ...row, status: "fail" as const } : row,
		);
		expect(gateResults(failingCandidate).passed).toBe(false);
	});

	test("behavioral and catalog defects block the gate", () => {
		const bothFail = dataset();
		bothFail.results = (bothFail.results as TrialRecord[]).map(row =>
			row.caseId === "technical-boundary"
				? {
						...row,
						status: "fail" as const,
						checks: row.checks.map(check =>
							check.name === "source files read" ? { name: check.name, pass: false } : check,
						),
					}
				: row,
		);
		expect(gateResults(bothFail).passed).toBe(false);

		const denial = dataset();
		denial.results = (denial.results as TrialRecord[]).map(row =>
			row.arm === "candidate" && row.caseId === "skill-routing"
				? {
						...row,
						toolCalls: [
							{
								id: "denied",
								name: "read",
								input: { path: "/etc/passwd" },
								outcome: "denied" as const,
								category: "policy_denied" as const,
							},
						],
					}
				: row,
		);
		expect(gateResults(denial).passed).toBe(false);

		const lowSavings = dataset();
		lowSavings.catalogComparison = {
			default: { fullBytes: 1000, searchBytes: 600, templateSha256: "t", personalitySha256: "p" },
			custom: { fullBytes: 1000, searchBytes: 400, templateSha256: "t", personalitySha256: "p" },
		};
		const savingsGate = gateResults(lowSavings);
		expect(savingsGate.passed).toBe(false);
		expect(savingsGate.reasons.join(" ")).toContain("default catalog presentation");

		const forgedBusiness = dataset();
		forgedBusiness.results = (forgedBusiness.results as TrialRecord[]).map(row =>
			row.arm === "candidate" && row.caseId === "business-routing" ? { ...row, output: "{}" } : row,
		);
		expect(validateAuditResults(forgedBusiness).reasons.join(" ")).toContain("exact synthetic JSON");
		expect(gateResults(forgedBusiness).passed).toBe(false);
	});

	test("invalidation marker makes evidence inadmissible", () => {
		const gate = gateResults(
			dataset(),
			"invalidation marker present at /tmp/invalidated.json; evidence inadmissible",
		);
		expect(gate.passed).toBe(false);
		expect(gate.reasons[0]).toContain("invalidation marker");
	});

	test("forged pass evidence, substituted metadata and incoherent calls are rejected", () => {
		// A `pass` claim without the technical reads it says it performed.
		const forgedTechnical = dataset();
		forgedTechnical.results = (forgedTechnical.results as TrialRecord[]).map(row =>
			row.caseId === "technical-boundary" ? { ...row, toolCalls: [], output: "{}" } : row,
		);
		const forgedReasons = validateAuditResults(forgedTechnical).reasons.join(" ");
		expect(forgedReasons).toContain("technical source reads missing");
		expect(forgedReasons).toContain("grounded literal");
		expect(gateResults(forgedTechnical).passed).toBe(false);

		// Provider metadata cannot be substituted just because observed identities agree with it.
		const substituted = dataset();
		substituted.model = { provider: "other", id: "cmd/reflection/beam:free", api: "mock" };
		substituted.results = (substituted.results as TrialRecord[]).map(row => ({
			...row,
			observedModels: ["other/cmd/reflection/beam:free/mock"],
		}));
		expect(validateAuditResults(substituted).ok).toBe(false);
		expect(gateResults(substituted).passed).toBe(false);

		// A denial without a category must not slip past the gate's category checks.
		const uncategorized = dataset();
		uncategorized.results = (uncategorized.results as TrialRecord[]).map(row =>
			row.arm === "candidate" && row.caseId === "skill-routing"
				? {
						...row,
						toolCalls: [{ id: "denied", name: "glob", input: { path: "skill://" }, outcome: "denied" as const }],
					}
				: row,
		);
		expect(validateAuditResults(uncategorized).reasons.join(" ")).toContain("uncategorized tool failure");
		expect(gateResults(uncategorized).passed).toBe(false);

		// A failed call cannot be evidence of a body read.
		const failedBody = dataset();
		failedBody.results = (failedBody.results as TrialRecord[]).map(row =>
			row.arm === "candidate" && row.caseId === "skill-routing"
				? {
						...row,
						toolCalls: [
							{
								id: "failed",
								name: "read",
								input: { path: "skill://static-page-verify" },
								outcome: "error" as const,
								category: "tool_error" as const,
								skillName: "static-page-verify",
							},
						],
					}
				: row,
		);
		expect(validateAuditResults(failedBody).reasons.join(" ")).toContain("success-only evidence");
		expect(gateResults(failedBody).passed).toBe(false);
	});

	test("v1 results are legacy evidence and never pass", () => {
		const gate = gateResults({ version: 1, results: [], schedule: [], complete: true });
		expect(gate.passed).toBe(false);
		expect(gate.reasons.join(" ")).toContain("results version 2 required");
	});
});

describe("harness quality audit baselines and reports", () => {
	test("v2 snapshot round-trips and rejects a v1 baseline", async () => {
		const root = await makeRoot();
		const output = path.join(root, "baseline");
		await snapshot(output);
		const manifest: Record<string, unknown> = JSON.parse(
			await fs.readFile(path.join(output, "manifest.json"), "utf8"),
		);
		expect(manifest.version).toBe(2);
		expect(manifest.fixtureHash).toBeDefined();
		const loaded = await loadBaseline(output);
		expect(loaded.fixtures.caseIds).toEqual([...CASE_IDS]);
		expect(loaded.fixtures.cases["skill-routing"].catalog).toHaveLength(300);

		const v1 = path.join(root, "v1");
		await fs.mkdir(v1);
		await fs.writeFile(path.join(v1, "manifest.json"), JSON.stringify({ version: 1, hashes: {} }));
		await expect(loadBaseline(v1)).rejects.toThrow(
			"Version 2 baseline required for revised fixtures; historical artifacts must not be regenerated",
		);

		await fs.writeFile(path.join(output, "system-prompt.md"), "tampered");
		await expect(loadBaseline(output)).rejects.toThrow("integrity");
	});

	test("report states incomplete coverage and refuses to overwrite", async () => {
		const root = await makeRoot();
		const input = path.join(root, "paired");
		await fs.mkdir(input);
		const payload = {
			version: 2,
			requestedModel: REQUESTED_MODEL,
			model: null,
			fixtureHash: "a".repeat(64),
			fixtureSources: {},
			identityScope: "synthetic",
			catalogComparison: null,
			schedule: [],
			results: [],
			infrastructureError: "synthetic unavailable",
			complete: false,
		};
		await fs.writeFile(path.join(input, "results.json"), JSON.stringify(payload));
		const file = await report(input);
		const content = await fs.readFile(file, "utf8");
		expect(content).toContain("not passed");
		expect(content).toContain("not statistical proof");
		expect(content).toContain("run complete: false");
		await expect(report(input)).rejects.toThrow();
		expect(await fs.readFile(file, "utf8")).toBe(content);
	});

	test("report refuses gated evidence when an invalidation marker exists", async () => {
		const root = await makeRoot();
		const input = path.join(root, "paired");
		await fs.mkdir(input);
		await fs.writeFile(
			path.join(input, "results.json"),
			JSON.stringify({
				version: 2,
				requestedModel: REQUESTED_MODEL,
				model: { provider: "kgdev", id: "cmd/reflection/beam:free", api: "mock" },
				fixtureHash: "a".repeat(64),
				fixtureSources: {},
				identityScope: "synthetic",
				catalogComparison: null,
				schedule: [],
				results: [],
				complete: false,
			}),
		);
		await fs.writeFile(path.join(root, "invalidated.json"), "{ malformed");
		const content = await fs.readFile(await report(input), "utf8");
		expect(content).toContain("invalidation marker present");
		expect(content).toContain("Gate: not passed");
	});

	test("report survives a malformed catalog comparison and a dangling marker", async () => {
		const root = await makeRoot();
		const input = path.join(root, "paired");
		await fs.mkdir(input);
		const resultsPath = path.join(input, "results.json");
		await fs.writeFile(
			resultsPath,
			JSON.stringify({
				version: 2,
				requestedModel: REQUESTED_MODEL,
				model: { provider: "kgdev", id: "cmd/reflection/beam:free", api: "mock" },
				fixtureHash: "a".repeat(64),
				fixtureSources: {},
				identityScope: "synthetic",
				catalogComparison: { default: null, custom: null },
				schedule: [],
				results: [],
				complete: false,
			}),
		);
		const content = await fs.readFile(await report(input), "utf8");
		expect(content).toContain("Gate: not passed");
		expect(content).toContain("same-template catalog comparison missing");
		expect(content).not.toContain("## Same-template catalog presentation");

		const secondRoot = await makeRoot();
		const secondInput = path.join(secondRoot, "paired");
		await fs.mkdir(secondInput);
		await fs.copyFile(resultsPath, path.join(secondInput, "results.json"));
		await fs.symlink(path.join(secondRoot, "missing.json"), path.join(secondRoot, "invalidated.json"));
		const second = await fs.readFile(await report(secondInput), "utf8");
		expect(second).toContain("invalidation marker present");
		expect(second).toContain("Gate: not passed");
	});

	test("legacy v1 results are reported as historical only", async () => {
		const root = await makeRoot();
		const input = path.join(root, "paired");
		await fs.mkdir(input);
		await fs.writeFile(
			path.join(input, "results.json"),
			JSON.stringify({
				version: 1,
				schedule: [{ caseId: "skill-routing", arm: "candidate", repeat: 1 }],
				results: [],
				complete: false,
				infrastructureError: "synthetic unavailable",
			}),
		);
		const content = await fs.readFile(await report(input), "utf8");
		expect(content).toContain("legacy evidence; follow-up gate unavailable");
		expect(content).not.toContain("Gate: passed");
	});
});

describe("harness quality audit model pin", () => {
	test("exact model pin rejects proxy selector substitutions", () => {
		expect(ACCEPTANCE_REPEATS).toBe(5);
		expect(() => assertIdentity({ provider: "kgdev", id: "cmd/reflection/beam:free" })).not.toThrow();
		expect(() => assertIdentity({ provider: "other", id: "cmd/reflection/beam:free" })).toThrow();
		expect(() => assertIdentity({ provider: "kgdev", id: "beam" })).toThrow();
	});
});
