## Behavior map: run D (omp metrics site)

### 1. Summary
The subject built an Astro + React dashboard with Recharts charts and a three.js "orbiting models" hero, served by a Rust backend (axum + rusqlite) that opens `data/stats.db` read-only on every request. `./start.sh` builds the API, installs frontend dependencies if they are missing and runs `astro dev` on :4321, which proxies `/api` to the backend. In a fresh sandbox the site was ready in 2 s. `validation.json` shows WebGL2 that animates, 6 chart SVGs, all 9 true totals in the API and 8 of 9 on the page, and only a favicon 404. The subject worked quickly and directly: 15 requests, about 5 minutes of wall time, 481k tokens, no subagents and no todo list. It probed the database once and checked the API with curl before writing any frontend. At the end it verified the site through `start.sh`, a headless browser, one visual fix and a click test of the date filter, then gave an accurate report.

### 2. Timeline

| Phase | Requests | What happened |
|---|---|---|
| Orientation | 1–4 | Req 1: toolchain and directory probe; the cell exited 2 only because `~/.omp/stats.db` was missing. Req 2: schema and row counts. Req 3: ten SQL probes in one cell (samples, totals, model, stop-reason and agent-type splits). Req 4: journal mode, `npm view` versions and `cargo info`; a quoting error broke one `sqlite3` statement, which did not matter. |
| Backend | 5–6 | Req 5: wrote `Cargo.toml` and the whole `main.rs` in one cell; the first `cargo build --release` passed. Req 6: started the API, curled `/api/overview` and checked that the totals matched the req 3 ground truth, and that a bad parameter returns 400. |
| Frontend scaffold | 7–8 | Req 7: hand-written `package.json` with TypeScript 7 and `@astrojs/check` failed `npm install` with ERESOLVE (peer dependency wants TS ≤6). Req 8: removed `@astrojs/check`, pinned TS 6, changed the `check` script to `tsc --noEmit`; the install worked. |
| Frontend code | 9–10 | Req 9: types, format helpers, OrbitScene, astro config with the Vite proxy, index page, styles (7 writes). Req 10: Dashboard, `start.sh`, README, then `tsc --noEmit` with no output. |
| Integration and verification | 11–14 | Req 11: ran `./start.sh` in the background and curled `/` (200) and a filtered `/api` call. Req 12: headless browser showed h1, a canvas, 20 SVGs, 10 stat cards, plus a screenshot. Req 13: fixed the overlapping pie labels (switched to bars plus an agent-vs-subagent donut) and the background cut-off, then took a second screenshot. Req 14: clicked "7 dias", confirmed the stats changed, stopped the process group with SIGINT and checked with `pgrep` that nothing was left. |
| Wrap-up | 15 | Final report in Portuguese, with caveats (dev server, TypeScript 6, no git repository). |

### 3. Codebook ratings

| Code | Rating | Evidence |
|---|---|---|
| B1 Orientation | 3 | It inspected the toolchain, schema, real totals and package versions before writing anything (main requests 1–4), and that ground truth paid off in request 6. This was spread over 4 requests: requests 2 and 3 could have been one cell, and requests 1 and 4 hit avoidable probe errors. |
| B2 Planning | 3 | The plan lived in the thinking of requests 4–5 and fit the task. No `todo` call at all. The design changed back and forth: CORS with tower-http vs a Vite proxy (requests 4, 5, 9), and a 3D weekday-by-hour bar heatmap planned in requests 4 and 7 and then dropped for the orbit scene in request 9. None of this cost a rewrite. |
| B3 Batching | 3 | Ten queries in one cell (request 3), the whole backend plus the build (request 5), seven writes (request 9), and edit plus re-check in parallel calls (requests 13, 14). Overall 2.81 ops per wire call. Orientation was still serial over requests 1–4. |
| B4 Tool fluency | 3 | No cell validation errors. It used the prelude `write` and `sh` and the `browser` namespace correctly, and killed the background `start.sh` cleanly by process group (request 14). Edits went through raw Python `open().write` and `str.replace` (requests 8, 13) instead of `tool.edit`; some of those replacements would not fail if the anchor were missing. All paths were absolute. |
| B5 Error recovery | 4 | Request 7 ERESOLVE: it read the peer-dependency conflict and fixed the cause in one step (request 8: removed `@astrojs/check`, pinned TS 6). No blind retries, no `--force` or `--legacy-peer-deps`. |
| B6 Verification | 4 | API smoke test with ground-truth comparison and a 400 check (request 6), `tsc` (request 10), the real `start.sh` (request 11), browser DOM checks and screenshot (request 12), one fix with one re-shot (request 13), and an interaction test (request 14). One pass, no repeated audits. |
| B7 Scope discipline | 3 | Nothing required was dropped. Unrequested extras: date-range presets, a tz parameter, a heatmap, a projects table, a `/api/health` endpoint and environment overrides. They are modest and fit a "consultar métricas" site. |
| B8 Delegation | n/a | No subagents. That is appropriate for one cohesive 5-minute build, in line with AGENTS.md "Do small or cohesive work inline". |
| B9 Context economy | 4 | Outputs were bounded (`tail -15`, `head -c 200`, a Python summary of the JSON in request 6). Peak context was 48.9k. The only waste was about 30 lines of cargo compile log (request 5). |
| B10 Prompt adherence | 3 | It followed "UI: verify the actual surface … open it in a browser tab", "stop and report" and the user's language. It ignored the todo init rule and "Prefer relative paths", and only partly followed the throw-on-missing-anchor edit rule (see section 7). |
| B11 Reporting honesty | 4 | Every claim in request 15 is backed by an observed step: the script run, the browser check, the 7-day filter, the shutdown and the `tsc` pass. It disclosed that the frontend runs the dev server, the TypeScript downgrade and that there was no git repository. It did not mention the Astro dev toolbar visible in its own screenshot, but made no false claim about it. |
| B12 Skills/memory | n/a (3) | No skill reads or memory recalls. No skill clearly fit, and the memory bank for this directory was empty by design. It also never searched the catalog, so a fitting frontend or design skill could have been missed. |

### 4. Outcome criteria

| Criterion | Weight | Evidence | Proposed |
|---|---|---|---|
| Site comes up from `./start.sh` on :4321 | 20 | `site_up: true`, ready in 2 s, localhost, IPv4 and IPv6 all 200 | **20** |
| Backend is Rust and reads `data/stats.db` | 10 | `backend/src/main.rs` (axum + rusqlite, `OMP_STATS_DB` defaults to `$ROOT/data/stats.db`). API calls go through the proxy, and the start log shows `db: …/data/stats.db` | **10** |
| Frontend is Astro + React | 10 | `astro.config.mjs` with `@astrojs/react`; `index.astro` mounts `<Dashboard client:only="react" />` | **10** |
| Numbers shown are correct | 20 | 9/9 truth scalars in the API, 8/9 on the page, 8/8 per-model totals in the API. `errors` is missing on the page: the page shows 403 "erros/abortos" (`error` 316 + `aborted` 87, request 3) and the stop-reason bars have no value labels. This is a defined and labelled aggregate, not a wrong number. [INFERENCE: the truth value is probably the `error` count alone.] | **18** |
| Charts present and rendered | 10 | 6 chart SVGs, 176 bar-like elements. The screenshot shows area, line, donut, bar charts and a heatmap, all with data | **10** |
| 3D animation present and animating | 10 | `webgl_canvas`, `webgl_animated`, context `webgl2`. The hero shows planets orbiting a wireframe core and responds to the pointer | **10** |
| No runtime errors | 5 | No page errors. One console error from the `/favicon.ico` 404 | **4** |
| README and start script as asked | 5 | Short Portuguese README with requirements, run command and environment variables. `start.sh` checks tools and the DB, waits on health, uses trap cleanup and `wait -n` | **5** |
| Code quality | 10 | 3/4, see below | **8** |
| **Total** | 100 | | **95** |

**Code quality: 3/4.**
- **Strengths:**
  - The backend is one well-organised file. A typed `ApiError` maps bad parameters to 400 and database errors to 500.
  - All SQL uses bound parameters. Ranges are `from` inclusive and `to` exclusive, with `COALESCE` on empty ranges.
  - The tz offset is clamped and applied consistently to day and heatmap buckets.
  - The read-only connection is opened per request inside `spawn_blocking`; the comment explains why (a fresh `stats.db` copy is picked up without a restart).
  - `cache_hit_rate` has its formula documented.
  - The frontend has typed API models, an `AbortController` on refetch, loading, error and empty states, and full three.js disposal with `prefers-reduced-motion` support.
  - The date presets are anchored to the newest message in the data rather than to today. That is a correct, non-obvious choice for a copied database, and the README and final report mention it.
  - No fabricated data. Only the star field is random, which is decorative.
- **Weaknesses:**
  - The deliverable runs `astro dev`. Its dev toolbar is visible over the "Tokens por dia" chart in `home.png`, even though the request 5 thinking said it would be disabled.
  - `server.host: true` exposes the dev server on the network.
  - "Erros" counts aborted messages as errors. It is labelled, but it differs from the error count you get by filtering on `stop_reason = 'error'`.
  - `@types/react` and `@types/react-dom` are runtime dependencies instead of devDependencies.
  - No favicon.
  - `tsconfig` includes `.astro/types.d.ts`, which only exists after the first dev or build run.

### 5. Costly behaviors

1. **Hand-pinned latest versions without a peer-dependency check (requests 4, 7, 8).** Request 4 ran `npm view <pkg> version` for 11 packages one at a time and copied the results into `package.json`. TypeScript 7 conflicted with `@astrojs/check`'s peer range, so `npm install` failed. The request 7 thinking even says it would check that the peers line up, and it never did. Waste: about 1 request (~28k input tokens, ~6% of the total) plus 20 s of install. Cause: **(a)** habit.
2. **No prompt caching across 15 requests.** `cache_read_tokens: 0`, so all 448k input tokens were re-sent uncached. This is by far the largest token cost (each request re-sent 14k–49k), but it is not something the subject chose. Cause: **(d)** environment or provider.
3. **Orientation split into four turns with probe errors (requests 1–4).** Request 1 raised `ShellError` because the last command (`ls ~/.omp/stats.db`) failed, even though everything useful printed. Request 4 lost a `sqlite3` statement to nested quoting. Requests 2 and 3 were sequential but independent. Waste: about 1–2 requests (~30k input tokens). Cause: **(a)** habit, helped along by **(c)**: `sh()` raises on the exit code of the last command in a compound probe, so a harmless trailing probe makes the whole cell look like a failure.
4. **Design back-and-forth in thinking (requests 4, 5, 7, 9).** It switched between CORS (it even fetched `tower-http` metadata) and a Vite proxy, and planned a raycasting 3D heatmap twice before choosing the orbit scene. Waste: a few thousand output and thinking tokens (11.7k thinking characters in total) and one unused crate lookup. Cause: **(a)**.
5. **A stated intention that was not carried out: hiding the dev toolbar (request 5 thinking → request 9 config).** No extra requests, but the toolbar shows up over a chart in the delivered page, and the request 13 screenshot review did not catch it. Cause: **(a)**.

### 6. Valuable behaviors

1. **Ground truth before code (request 3), checked against the API (request 6).** The SQL totals (481,637,673 tokens; $347.19) were later matched exactly in the API response, which is why 9/9 truth scalars come out right.
2. **Backend finished and tested before any frontend work (requests 5–6).** One cell wrote and compiled the whole API on the first try. The curl smoke test also covered the 400 path, so the frontend had a known-good contract.
3. **A robust `start.sh` (request 10).** Tool and DB pre-checks, `npm install` only when needed, a health-wait loop that notices if the API died, `wait -n` plus trap cleanup, and a proxy target of `127.0.0.1` because `localhost` can resolve to IPv6. Validation shows `start.sh` worked first time in a fresh sandbox, on all loopback families.
4. **Real-surface verification with one targeted fix (requests 11–14).** It ran the real script, read the DOM and a screenshot, fixed the two visual defects it saw, re-checked once, tested the date filter, and confirmed no stray processes. It stopped there.
5. **Honest, user-language reporting (request 15).** The final message lists what was verified and discloses the tradeoffs: dev server, TypeScript 6 instead of 7, no git and no commit, and data anchored to 23/11/2026.

### 7. Instructions misread, ignored or over-applied

- **Todo (tool description):** "Before work, init for 3+ steps, requested task sets, or new instructions. MUST list EVERY user item separately". The system prompt also says "Update todos; skip trivial requests". The task had 7 user requirements and there were 0 todo calls, so this was ignored. No requirement was dropped, so it did no visible harm here. The two wordings also conflict about what counts as "trivial".
- **Code Mode scope:** "Edit the specific lines that need to change (`tool.edit`, or a string replacement that throws when its anchor is missing)."
  - Request 8 (`package.json`) used plain `str.replace`, which silently does nothing if the anchor is missing.
  - Request 13 did the same on `styles.css`.
  - The `Dashboard.tsx` edit in request 13 used `s.index(...)`, which does throw. So the rule was only partly followed.
- **Tool I/O:** "Prefer relative paths." Every write and `sh` call used `/home/kaio/work/omp-metrics/...` absolute paths. Ignored, but harmless.
- **Critical:** "NEVER re-audit applied edits or run git to validate them". Request 14 ran `git status --short`. Borderline: it checked whether a repository existed (for the commit decision), not whether the edits applied. Harmless.
- **Skills:** "Use `read("skill://?q=…")` … to search". The subject never searched, which is defensible since the task was technical and no skill was named.
- **Followed well:** "UI: verify the actual surface. Web: open it in a browser tab; visual proof" (requests 12–14), "Once the change is verified, stop and report" (request 15), "NEVER fabricate output" (request 15), and AGENTS.md "Do small or cohesive work inline" (no subagents).

### 8. Proposed rules

1. **Dependency scaffolding** (system prompt, Engineering section, or a per-model rule). Targets behavior 1 in section 5.
   > "When scaffolding a JS/TS project, let the package manager resolve versions (`npm install astro @astrojs/react react …`) instead of hand-writing ranges from `npm view <pkg> version`; if you must pin, check `npm view <pkg> peerDependencies` for every pinned devtool first."
2. **`sh()` probe semantics** (harness behavior plus the prelude doc). Targets behavior 3 in section 5.
   - Add `sh(cmd, check=False)`, which returns output and exit code without raising.
   - Document in the prelude: "Discovery probes chaining several commands: pass `check=False` or append `|| true`; otherwise the last command's exit status raises even when all output printed."
3. **A safe replace helper** (harness: a prelude helper, referenced in the Code Mode scope text). Targets the raw `str.replace` edits in requests 8 and 13.
   - Add `replace(path, old, new, count=1)`, which raises when `old` is not found exactly `count` times.
   - Change the scope bullet to: "Edit with `tool.edit` or the `replace()` helper; never raw `str.replace` + `open().write`."
4. **Clarify when todo is required** (todo tool description). Targets the ambiguity in section 7.
   - Replace "Before work, init for 3+ steps…" and "skip trivial requests" with one rule: "Init a todo list when the user message lists 3+ requirements or the work will span 5+ requests; otherwise, enumerate each user requirement in the final answer with its verification."
   - This keeps the guard against dropped requirements without forcing ceremony.
5. **Delivered dev servers** (system prompt, Verify section, UI bullet). Targets behavior 5 in section 5.
   > "When the deliverable runs a dev server, disable dev-only overlays (e.g. Astro `devToolbar.enabled: false`) or serve a production build, and check the screenshot for framework overlays."
6. **Prompt caching** (harness or provider configuration, not prompt text). Targets behavior 2 in section 5. Enable it for this provider route; 448k uncached input tokens over 15 requests is the largest single lever on cost.

### 9. Confidence and gaps

- **Truncated transcript:** the thinking for requests 4, 5, 9 and 10 and the full code of several cells are clipped. I inferred that the request 10 `run` was `tsc --noEmit` from the "(no output)" result plus the final claim. Code that changed between writes and was later overwritten cannot be seen.
- **The `errors` truth value:** its definition is not in the files. My reading that the page's 403 = `error` + `aborted` comes from the request 3 output, and that the truth value is the `error` count alone is [INFERENCE].
- **Dev toolbar:** I identified it from the icon cluster over the "Tokens por dia" chart in `home.png` plus the missing `devToolbar` setting in the config. That is reasonably certain but not confirmed in the DOM.
- **Caching:** I could not tell whether caching was unavailable or disabled, so I classed it as (d).
- **Confidence:** high for the outcome scores, which rest on the deterministic files. Moderate-to-high for the codebook ratings: the run is short and coherent, but with one run, ratings of 3 vs 4 on B1–B4 are judgment calls.