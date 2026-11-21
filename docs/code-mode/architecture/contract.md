# Code Mode — contrato compartilhado (testes ↔ docs ↔ implementação)

Parent: [architecture/index.md](index.md)

Repo: `oh-my-pi` (fork kaioposnky/omp). Implementação na branch `feat/code-mode` (ver [orchestration.md](orchestration.md)).
Source docs: `docs/code-mode-plan.md`, `docs/code-mode-requirements.md`.
Module names, API shapes, test file paths and test IDs below are fixed: tests and docs cite them verbatim; implementation must match them.

## Planned implementation modules (new, concentrated to reduce upstream merge conflicts)
`packages/coding-agent/src/code-mode/`
- `settings.ts`: `cfgCodeModeDefault` (`codeMode.default`, boolean, default false), `cfgCodeModeScope` (`codeMode.scope`, record: `{ main?: boolean; agents?: Record<string, boolean>; roles?: Record<string, boolean>; models?: Array<{ match: string; enabled: boolean }> }`, with `validate`). Factory default scope: `agents: { sonic: false, scout: false }`, `roles: { smol: false, tiny: false }`.
- `scope.ts`: `resolveCodeMode(input: CodeModeResolveInput): CodeModeDecision`
  - `CodeModeResolveInput = { isMain: boolean; sessionOverride?: boolean; spawnOverride?: boolean; agent?: { name: string; codeMode?: boolean; tools?: string[] }; role?: string; modelId?: string /* "provider/id" */; settings: { default: boolean; scope: CodeModeScope }; evalAvailable: boolean; planMode?: boolean; restrictedToolNames?: string[] }`
  - `CodeModeDecision = { enabled: boolean; source: "hard-gate:no-eval" | "hard-gate:agent-tools" | "hard-gate:restricted" | "session" | "spawn" | "frontmatter" | "scope.agents" | "scope.models" | "scope.roles" | "scope.main" | "default"; detail?: string; denied?: { requested: boolean; reason: string } }`
  - Precedence: hard gates > session (main only) > spawn > frontmatter > scope.agents > scope.models (first match, glob) > scope.roles > scope.main (main) / default.
  - Hard gates: `!evalAvailable` → off; agent `tools` list present and lacking `eval` → off; `restrictedToolNames` present and lacking `eval` → off. A denied spawn request sets `denied.reason` (e.g. `"agent has no eval"`).
- `partition.ts`: `CODE_MODE_TOP_LEVEL = ["eval","wait","yield","ask","todo","checkpoint","rewind","elide"]`; `applyCodeModePartition(names, opts) → { topLevel: string[]; bridgeOnly: string[] }`.
- `catalog.ts`: `renderBridgeCatalog(tools) → string` (stable sorted, one line `name: summary` ≤12 words; MCP servers with >20 tools collapse to `mcp__<server>__* (N tools)`).
- `hints.ts`: router-hint message contract `customType: "router-hints"`, budget ≤ 600 tokens, appended AFTER the user message.

Session/API surface (to be added):
- `AgentSession.isCodeModeActive(): boolean` (frozen at session creation), `AgentSession.getCodeModeDecision(): CodeModeDecision`, `AgentSession.getBridgeOnlyToolNames(): string[]`.
- `createAgentSession({ codeMode?: boolean, ... })` option (resolved decision passed in; main session computes from settings when omitted).
- ExtensionAPI: `pi.isCodeModeActive(): boolean`.
- Extension `setActiveTools` in Code Mode: additions → bridge-only; removals of bridge-only → no-op; top-level set immutable; wire tools (`session.agent.state.tools`) and `session.systemPrompt` unchanged.
- Eval prelude: `tool.describe(name)` → TS signature string; `tool.search(query, k=5)` → `{ name, summary, signature }[]`.
- `agent()` / `workpool()` / task item: `codeMode?: boolean`.
- CLI: `--code-mode`, `--no-code-mode` → `Args.codeMode: boolean | undefined`.
- Slash: `/code-mode [on|off|status|default on|default off]` in `BUILTIN_MODE_SLASH_COMMANDS` (`src/slash-commands/builtin-modes.ts`).
- Status line: host `isCodeModeActive()`, theme symbol `icon.codeMode`, startup snapshot field `codeMode`.
- RPC state: `codeModeEnabled`.
- Phase-3: setting `input.largeInputAsHandle` (token threshold); tool `elide` `{ toolCallIds: string[]; reason?: string }` gated by `compaction.experimentalContextManagement`.

## Test files (EXACT paths; docs must link these)
All under `packages/coding-agent/test/code-mode/` (bun:test) unless noted:
| File | Covers | IDs |
| --- | --- | --- |
| `partition.test.ts` | F1 core partition, bridge reach, approval, late MCP, setActiveToolsByName, no-eval fallback | CM-P1..CM-P7 |
| `toggle.test.ts` | F2 settings, CLI flags, persistence/resume/fork, /code-mode spec, RPC field | CM-T1..CM-T7 |
| `indicator.test.ts` | F3 status-line icon, muted divergence, startup snapshot, theme symbol | CM-I1..CM-I4 |
| `scope.test.ts` | F4 resolveCodeMode precedence, hard gates, globs, validation, factory defaults | CM-S1..CM-S10 |
| `skills-mcp.test.ts` | F6 skills block, skill:// via bridge, extension setActiveTools, pi.isCodeModeActive | CM-C1..CM-C6 |
| `token-economy.test.ts` | §12 prefix stability, prompt+schema tokens, catalog collapse, hints placement/budget, eval output cap | CM-E1..CM-E6 |
| `spawn.test.ts` | spawn `codeMode` param, denial reason | CM-A1..CM-A3 |
| `rlm.test.ts` | large input handle, `elide` | CM-R1..CM-R5 |
| `vendor/pi-jev/test/code-mode.test.ts` (node:test) | RF6.5 pi-jev adjustments | JEV-CM1..JEV-CM6 |
| `harnesses-improver/needle-spike/` | F5 Needle 3 measurement harness | NDL-1..NDL-3 |

Test style rules:
- Tests for unimplemented behavior use `it.todo(name, fn)` WITH a real body (bun runs them only under `--todo` and reports a todo that passes as a failure, which is the "now implemented, remove .todo" signal). pi-jev uses `test(name, { todo: "code-mode" }, fn)`.
- Must typecheck today (`tsgo -p packages/coding-agent/tsconfig.json --noEmit`): never import modules/symbols that don't exist yet with a static import. Load planned modules via `const mod = (await import(PLANNED_MODULE as string)) as Contract` with a local contract interface; access planned session methods via a local interface cast; pass planned settings by string id (`Settings.isolated({ "codeMode.default": true })`).
- Behavior through public interfaces only (createAgentSession, session.agent.state.tools, session.systemPrompt, getToolForEvalBridge, parseArgs, renderSegment, ExtensionFactory). No source-text assertions, no wiring-only tests.
- Test names start with the ID, e.g. `it.todo("CM-P1 code mode advertises only the top-level set", ...)`.
- Reuse fixtures from `test/tan-tool-presentation.test.ts` (createAgentSession with `enableMCP:false`, `disableExtensionDiscovery:true`, `skipPythonPreflight:true`, `mcpTools`, `Settings.isolated`, `SessionManager.inMemory`, `TempDir`).

## Test IDs (fixed; tests implement exactly these, docs cite exactly these)
partition.test.ts
- CM-P1 code mode on: `session.agent.state.tools` names ⊆ CODE_MODE_TOP_LEVEL (+ tools pinned explicitly via `toolNames`); `read`, `edit`, `bash`, MCP fixture absent from wire.
- CM-P2 bridge-only tools reachable: `session.getToolForEvalBridge("read")` and `("mcp__fixture_probe")` return a tool; `getEnabledToolNames()` contains them.
- CM-P3 checkpoint/rewind/yield/ask/todo stay top-level when registered.
- CM-P4 MCP tool registered after startup (refreshMCPTools / setActiveToolsByName path) lands in bridge-only, not wire.
- CM-P5 `setActiveToolsByName([...top, "goal"])`-style reconcile keeps the bridge-only layer.
- CM-P6 eval backend unavailable + code mode requested → wire equals normal mode, `isCodeModeActive() === false`.
- CM-P7 approval mode: a bridged `edit` call goes through the ACP/approval wrapper (same wrapper object identity/behavior as direct dispatch).
toggle.test.ts
- CM-T1 `codeMode.default` true → new session active; false → inactive.
- CM-T2 `parseArgs(["--code-mode"]).codeMode === true`; `["--no-code-mode"]` → false; absent → undefined.
- CM-T3 state persisted in session file; resume with opposite default keeps the recorded state.
- CM-T4 fork (`SessionManager.forkFrom`) inherits the source state.
- CM-T5 `/code-mode` spec exists in BUILTIN_MODE_SLASH_COMMANDS with subcommands on/off/status/default.
- CM-T6 `/code-mode on` on a session with messages does not change the current session's wire tools (new session instead); on an empty session applies in place.
- CM-T7 RPC state exposes `codeModeEnabled`.
indicator.test.ts
- CM-I1 model segment renders `icon.codeMode` when `isCodeModeActive()` is true and not when false.
- CM-I2 rule/state divergence renders the icon muted (different style than active).
- CM-I3 startup snapshot validator accepts and round-trips a `codeMode` boolean field.
- CM-I4 theme defines `icon.codeMode` in both unicode and nerd symbol sets.
scope.test.ts (pure, `resolveCodeMode`)
- CM-S1 precedence ladder: each level beats the ones below (table-driven).
- CM-S2 hard gate no-eval beats session override.
- CM-S3 agent frontmatter `tools` without eval → off with source `hard-gate:agent-tools`, even with spawn override true; `denied.reason` contains "no eval".
- CM-S4 `scope.models` first match wins in array order; glob `*haiku*` matches `anthropic/claude-haiku-5-5`.
- CM-S5 role rule applies when no agent/model rule matches.
- CM-S6 child does not inherit parent state (isMain false ignores sessionOverride).
- CM-S7 factory default scope: sonic/scout/smol/tiny off, task/main inherit default.
- CM-S8 settings validation: invalid glob rejected; unknown agent name accepted.
- CM-S9 decision carries `source` + `detail` used by `/code-mode status` (e.g. `scope.roles` / `smol`).
- CM-S10 restricted tool list without eval → off `hard-gate:restricted`.
skills-mcp.test.ts
- CM-C1 code mode on with skills → system prompt still contains the skills block / `skill://` search instructions referencing eval `read(`.
- CM-C2 `skill://<name>` readable through the bridged `read` tool in code mode.
- CM-C3 no "MCP Tool Routes" xd:// block in code mode; bridge catalog lists the MCP tool instead.
- CM-C4 extension `pi.setActiveTools(without mcp tool)` in code mode → MCP tool still reachable via `getToolForEvalBridge`; wire unchanged.
- CM-C5 extension `pi.setActiveTools(with extra tool)` in code mode → tool reachable via bridge, absent from wire, systemPrompt unchanged.
- CM-C6 `pi.isCodeModeActive()` exposed to extensions and matches session state.
token-economy.test.ts
- CM-E1 prefix freeze: systemPrompt + wire tool schemas byte-identical before/after N extension setActiveTools calls in code mode.
- CM-E2 code-mode wire (systemPrompt + JSON of tool schemas) token count < normal-mode wire for the same fixture (natives.countTokens, ClaudeV5).
- CM-E3 `renderBridgeCatalog` stable sort + MCP server with >20 tools collapses to one line.
- CM-E4 router-hints message is placed after the user message, never alters systemPrompt.
- CM-E5 router-hints over 600 tokens are trimmed/rejected.
- CM-E6 eval inline output cap in code mode smaller than normal; overflow goes to artifact.
spawn.test.ts
- CM-A1 `agent({ prompt, codeMode: true })` args schema accepts `codeMode` (runEvalAgent no longer rejects it).
- CM-A2 spawn decision for agent without eval returns result text containing `codeMode ignored: agent has no eval`.
- CM-A3 task item schema accepts `codeMode`.
rlm.test.ts
- CM-R1 paste over `input.largeInputAsHandle` threshold is stored as `local://paste-N.md` and the prompt carries only handle + size.
- CM-R2 eval prelude exposes `inputs["paste-N"]` lazily.
- CM-R3 `elide` tool registered only with `compaction.experimentalContextManagement`.
- CM-R4 `elide` blanks the target tool results with `[Elided by model - N tokens]` and never touches entries before `keepBoundaryId` or `skill://` reads.
- CM-R5 `elide` defers (returns scheduled) when the target sits inside the warm-cache lookback window.
vendor/pi-jev/test/code-mode.test.ts
- JEV-CM1 McpGate.route makes no setActiveTools call when `pi.isCodeModeActive()` is true.
- JEV-CM2 router auto activation skips setActiveTools in code mode and returns hint names instead.
- JEV-CM3 jev_find_tools in code mode returns `tool.<name>` suggestions without activating.
- JEV-CM4 ToolGuard ignores toolName `eval`.
- JEV-CM5 skill hint message uses `skill://<name>` form.
- JEV-CM6 fallback: pi without `isCodeModeActive` keeps current behavior (setActiveTools called).
needle-spike (harnesses-improver/needle-spike/)
- NDL-1 dump omp tool wire schemas to a fixture (script).
- NDL-2 arg-validity accuracy run over a labeled prompt set (selector + repair), report % valid.
- NDL-3 latency p50/p95 on CPU; go/no-go per RF5.2 (≥95% valid, p95 < 150 ms).
gap.test.ts (added later; `packages/coding-agent/test/code-mode/gap.test.ts`)
- CM-G1 eval JS prelude `tool.describe("read")` returns a TS signature string naming `path`; unknown name throws.
- CM-G2 eval JS prelude `tool.search("file contents", 5)` returns ≤5 `{ name, summary, signature }` entries including `read`; bridge-only tools are searchable.
- CM-G3 Python prelude exposes the same `tool.describe` / `tool.search` (skipped when no Python backend, via existing probe helpers).
- CM-G4 plan mode + code mode: bridge reaches only plan-mode-allowed tools (`getToolForEvalBridge("edit")` undefined while plan mode enabled; `read` reachable).
- CM-G5 a bridged `tool.edit`/`tool.read` call from an eval cell fires the extension `tool_call` hook exactly once with `toolName` of the inner tool (not `eval`).
- CM-G6 writing `codeMode.scope` through the settings API (`Settings` set + persist path used by /settings) round-trips agents/roles/models (ordered) and is read back by `resolveCodeMode`.

## Doc tree (EXACT layout, `oh-my-pi/docs/code-mode/`, follows skill://architecture-doc-tree templates)
Language: Portuguese (pt-BR) prose; code identifiers in English. Evidence rule: existing code cited as `packages/...#symbol` (must resolve); planned code marked `[planned]`; unmeasured claims `[unverified]`.
- `architecture/index.md` (root; owner DocsCore) - Functionalities lists ALL macros below; Structure lists the detail files.
- `architecture/orchestration.md` (detail; owner DocsCore) - implementation waves for subagent orchestration: wave → tasks → owned files → test IDs that must flip from todo to pass → gate command. Waves: W0 contract modules (`code-mode/` scope/partition/catalog/settings) · W1 core partition+settings+CLI · W2 toggle/slash/RPC + indicator · W3 scope + spawn param · W4 skills/MCP/extension API + pi-jev · W5 token economy (catalog, hints, output cap) + A/B · W6 RLM (large input, elide) · Needle spike parallel anytime.
- `architecture/testing.md` (detail; owner DocsCore) - test map: every test file, ID range, how to run (`bun test --todo <file>`), the todo→pass flip protocol, typecheck command.
- macros (slug → owner):
  - `macro/core.md` (DocsCore), `macro/toggle.md` (DocsCore), `macro/indicator.md` (DocsCore), `macro/scope.md` (DocsCore)
  - `macro/integration.md` (DocsExt: skills, MCP, ExtensionAPI, pi-jev), `macro/token-economy.md` (DocsExt), `macro/spawn.md` (DocsExt: spawn codeMode), `macro/rlm.md` (DocsExt: large-input handle + elide), `macro/needle.md` (DocsExt)
- micro: `micro/<feature>-<requirement>.md`, one per externally observable requirement, each with acceptance criteria that cite the exact test IDs + file path covering them.
- nano: only non-obvious parts (e.g. `nano/core-partition-bridge-layer.md`, `nano/scope-resolution-precedence.md`, `nano/integration-set-active-tools-guard.md`, `nano/token-economy-prefix-freeze.md`, `nano/indicator-status-line-invalidation.md`, `nano/rlm-elide-cache-deferral.md`). Each nano: Code locator(s), How it works, Invariants, Gotchas, and a "Tarefa de implementação" block: owned files, steps, test IDs, done-when.
