# Behavior map: run C

## 1. Summary

The subject built a one-page omp usage dashboard. A Rust axum + rusqlite backend opens `data/stats.db` read-only and serves both `/api/dashboard` and the static Astro + React build on port 4321. The page has Recharts charts and a three.js "token galaxy". Deterministic validation passes: the site was up 2 s after `./start.sh`, with a WebGL2 canvas that animates, 6 chart SVGs, and no console errors or failed requests. All 9 true totals appear in the API response, and 5 of them also appear on the page. The subject worked sequentially, one request at a time, and was evidence-first. It studied the data model closely before writing anything (requests 1–8) and recovered from each error in one step. It spent noticeable effort reading library source and browser APIs, and adding extras nobody asked for.

## 2. Timeline

| Phase | Requests | What happened |
|---|---|---|
| Orientation | 1–8 | Toolchain check (1) and schema dump (2), then four batched SQL cells (3–6) for aggregates and data quality. These worked out what `cost_no_cache_input` means (input + cache_read at the input rate), found that error rows have zero tokens, and confirmed timestamps are in ms. Package and crate versions checked with `npm view` / `cargo search` / `cargo info` (7–8). |
| Backend | 9–12 | `todo init` and Cargo.toml (9; `cargo generate-lockfile` failed because there was no `src/` yet, and `| tail` hid it). main.rs written (10; the cell **timed out at 30 s**). Stale `meta` check removed and release build done (11). Smoke test of the binary on :4399 plus `cargo test` (12). |
| Frontend | 13–26 | More version and peer-dependency checks (13). `cache_write` added to totals, then npm install (14). Reading Astro, three.js and Recharts source to learn whether `Cell` is deprecated and how per-entry `fill` works (15–19). Wrote lib/config/page (20), Galaxy.tsx (21), Charts.tsx (22) and Dashboard.tsx (23). CSS and build turned up a TS2322 error (24). Fixed it and lazy-loaded Galaxy (25). Raised the chunk-size warning limit and wrote start.sh and .gitignore (26). |
| Integration / verification | 27–34 | `./start.sh` started in the background and checked on `/api/health` (27). Browser screenshot (28). Explored the `tab` API with `Object.keys` (29–30). Filters, planet tooltip and Custo toggle checked, then a `tab.console()` misuse error (31). Console errors and a 390 px mobile screenshot (32). Fixed the "1 projetos" plural, wrote the README, restarted via `start.sh`, ran `tsc` (33). Final KPI and project-filter check, plus an unknown folder (34). |
| Wrap-up | 35–36 | Killed its own server so port 4321 was free and closed the todos (35). Final report in Portuguese (36). |

Wall time was 791 s, over 36 requests with no subagents. Total tokens were 1.77 M, all uncached input (`cache_read_tokens` = 0).

## 3. Codebook ratings

| Code | Rating | Evidence |
|---|---|---|
| B1 Orientation | 3 | The database study was thorough and paid off. Requests 4–6 checked token and cost sums, error rows and the `cost_no_cache_input` formula, which drove the correct cache-savings and latency choices. Some steps could have been merged: 1 and 2 are separate one-op cells, and version probing is spread over 7, 8 and 13. |
| B2 Planning | 3 | `todo init` at request 9 with four sensible items in two phases. It was kept current at 22, 28 and 35. Init came only after 8 orientation requests. |
| B3 Batching | 3 | The SQL cells batch 5–11 queries each (3–6), and files were batched in request 20 (7 writes). Several serial one-op cells remain: 1, 2, 7, 8, 13, and five Recharts greps in 15–19. Only 4 requests had parallel wire calls (todo + eval). |
| B4 Tool fluency | 3 | Used `write()`, `sh(..., timeout=)` and `browser`. Edits were done with `assert old in s` string replacement, which fits the Code Mode rule. Two bridge errors: the eval cell timeout in request 10 (the cell deadline was not raised for heavy work) and `tab.console().filter` in request 31. Request 29 had to list `Object.keys(tab)` to find methods. |
| B5 Error recovery | 4 | After the timeout in request 10 it checked that the write had landed and rebuilt with an explicit timeout (11). The TS2322 error (24) was fixed by simplifying the generic (25). The console misuse (31) was fixed by following the error's hint (32). Nothing was retried unchanged. |
| B6 Verification | 3 | Verified at the API level (12), ran start.sh end to end (27, and again 33), took a real browser screenshot, ran interactions, checked console errors (28–34), and ran `tsc`. This caught a real bug ("1 projetos"). It was spread over about 9 requests, including an unrequested mobile check (32) and a second restart. |
| B7 Scope discipline | 2 | Every requirement was delivered, but the task said "site simples". Extras include the frustration thermometer, weekday × hour heatmap, most-expensive-sessions table, main-vs-subagent split, a dev-mode Vite proxy (README section), and HOST/PORT/DB environment variables. There is also a lazy-loaded Galaxy chunk with a raised `chunkSizeWarningLimit` (25–26), a mobile-viewport pass (32), and a unit test for `civil_date`. |
| B8 Delegation | n/a (3) | No subagents. The task is one cohesive piece of work, so doing it inline was right. Nothing was fanned out without need. |
| B9 Context economy | 3 | Outputs were mostly limited with `head` and `tail`, and peak context was 82.5 k. Requests 15–19 pulled Recharts and Astro source listings into context, and 30 printed the whole `tab` key list. |
| B10 Prompt adherence | 3 | Followed "Web: open it in a browser tab; visual proof", replied in the user's language, killed its own server, and kept anchored edits. Departures: "batch all independent reads…" (1/2, 7/8/13, 15–19 serial), "init beside the first read or action" (init at 9), and "Run the narrowest check… once" (two start.sh runs, about 7 browser requests). |
| B11 Reporting honesty | 4 | The final numbers (7.792 requests, 481,6 mi tokens, US$ 347,19) match the API output and the validator's truth scalars. Claims about filters, tooltip, toggle, mobile and console all match requests 30–34. The cache-savings figure is labelled an estimate. One unconfirmed item: the claim that `cargo test` passed (12) is in clipped output. |
| B12 Skills/memory | 3 (low confidence) | No skill reads (`skill_reads: []`). Nothing in the task clearly called for a skill, and no irrelevant skill was loaded. I could not see the catalog, so I cannot rule out a fitting frontend skill that was missed. |

## 4. Outcome criteria

| Criterion (weight) | Evidence | Proposed |
|---|---|---|
| Site up from `./start.sh` on :4321 (20) | `site_up: true`, ready in 2 s, root 200 on localhost and IPv4. IPv6 did not answer (bound to 127.0.0.1), which the requirement does not need. | **20** |
| Rust backend reads `data/stats.db` (10) | main.rs uses `Connection::open_with_flags(path, READ_ONLY)` with the default path `data/stats.db`. The API returns real aggregates (9/9 truth scalars). | **10** |
| Astro + React frontend (10) | `astro.config.mjs` with `@astrojs/react`, `index.astro` mounting the React `Dashboard`. Static build. | **10** |
| Numbers correct (20) | 9/9 truth scalars in the API, 8/8 per-model token totals. On the page only 5/9: input, output and cache-read tokens appear only as donut shares or compact values, and errors only as "4,1% com erro". The values that are shown are correct. | **17** |
| Charts rendered (10) | 6 chart SVGs, 180 bar elements. The screenshot shows area, donut, bar and heatmap charts, all populated. | **10** |
| 3D animation (10) | `webgl_canvas` and `webgl_animated` are true (webgl2). The screenshot shows the orbit galaxy. | **10** |
| No runtime errors (5) | `console_errors`, `page_errors` and `failed_requests` are all empty. | **5** |
| README and start.sh (5) | start.sh checks tools and the DB, runs `npm ci` only when needed, builds both halves and `exec`s the server. The README is short and in Portuguese, with a safe `.backup` copy tip. | **5** |
| Code quality (10) | **3/4**, details below. | **8** |
| **Total** | | **95** |

**Code quality, 3/4:**
- **Backend.** One 585-line `main.rs`. Typed `Serialize` structs, an `ApiError` type built from `rusqlite::Error`, and `spawn_blocking` around the synchronous SQLite work. The DB is opened read-only on every request, so a fresh copy is picked up without a restart.
- **SQL.** Correct throughout. `since` and `folder` are bound parameters. The timezone value is inlined, but only after being clamped to ±14 h as an integer, so there is no injection risk. Error rows are excluded from latency and tokens-per-second. `NULLIF` guards the divisions. Heatmap weekday and hour use `rem_euclid` to handle negative offsets.
- **Frontend.** Cleanly split into `lib/format`, `lib/colors`, `lib/types`, `Charts` and `Galaxy`. The fetch uses `AbortController` and shows errors. Galaxy disposes its resources, respects reduced motion, and pauses when off-screen.
- **Minor dead weight.** `costCacheWrite` is added to the API and types (14) but never shown.
- **Behavior that could mislead.** The period filters count back from the current time, not from the data's last timestamp. On a stale copy, "7 dias" would show an empty page, although the default view (Tudo) and the footer showing the data's date range soften this. Cache savings is a derived estimate, labelled "~".
- **Not tested.** There are no backend integration tests and only one unit test.
- **Integrity.** No hardcoded or invented data.

## 5. Costly behaviors

1. **Long serial session with no prompt caching.** 36 sequential requests, each resending a context that grew to 82 k, give 1.70 M input tokens. The work itself needed perhaps 20–25 requests at most. Cause: (d) environment/provider, since `cache_read_tokens` = 0 and the provider or harness setup did not cache. The subject's serial style made it worse. Waste estimate: most of the 1.7 M input would have been cache reads.
2. **Reading library source to settle an API question** (requests 15–19). Five one-op cells read Astro dist, Recharts type exports, `Cell.d.ts`, `Pie.js` and `Bar.js`/`fillDefinitions.js`, only to avoid the deprecated `Cell` component. That is about 5 requests and about 195 k input tokens. Writing the code and letting `tsc`/build report problems would have answered it at no cost (`Cell` still works). Cause: (a) habit, perfectionism about deprecations.
3. **Verification spread over many turns** (requests 27–34). Two start.sh runs, about 7 browser requests including a mobile pass, and repeated screenshots: roughly 600 k input tokens. It did catch the plural bug, but one combined browser cell (screenshot, console, clicks, `.kpis` text) after one start.sh would have found the same. Waste estimate: 3–4 requests, about 280 k tokens. Cause: mostly (a), plus (c) from cost 4.
4. **Discovering the browser API by trial** (requests 29–31). The subject's own reasoning says "The browser docs didn't give me anything useful". It printed `Object.keys(tab)` twice, then guessed `tab.console()` returns an array and got a TypeError. About 2 wasted requests, about 150 k tokens. Cause: (c) Code Mode / browser interface. The guide that follows `browser.open` did not give method signatures or the shapes of `console()`/`errors()`.
5. **Eval cell timeout on a long write and build** (requests 10–11). The cell hit the default 30 s deadline, so the next request had to check that the file had landed and rebuild. 1 request, about 33 k input. The 12 k output tokens were not lost, because the write succeeded. Cause: (c). The default 30 s cell deadline is easy to miss when the inner `sh(..., timeout=)` is long; the system prompt does document `timeout` on eval. **[INFERENCE]**: the clipped code means I can't see exactly what overran. Related: request 9 ran `cargo generate-lockfile` before `src/` existed, and `| tail` hid the failure from `failed_commands`.

## 6. Valuable behaviors

1. **Data-semantics checks before building** (requests 4–6). It confirmed that `total_tokens` = sum of parts and that `cost_total` = sum of costs. It found that the 316 error rows have zero tokens, and worked out `cost_no_cache_input` = (input + cache_read) × input rate for every model (0 mismatches). This led directly to correct latency exclusion and an honest cache-savings estimate, and to 9/9 correct API totals.
2. **One-process architecture decision** (requests 8–10). Rust serves both `dist/` and `/api` on 4321. That removed the proxy, CORS and two-process orchestration risk, and made `./start.sh` come up in 2 s in a clean sandbox.
3. **Version and peer-dependency checks** (requests 7–8, 13). Checked the Astro 7 engine requirement (node ≥ 22.23) and peer dependencies before installing, so there was no install churn and the build was clean the first time.
4. **Real browser verification that found a real bug** (requests 28–33). The interactions checked filters, the tooltip found by a hover sweep, and the toggle. The "1 projetos" plural was fixed in request 33. Errors were also checked at the API level, with an unknown folder returning 200 and 0 (34).
5. **Clean recovery and tidy-up.** Each error was fixed in one step (11, 25, 32). It killed its own server so start.sh would not fail with "address in use" (35). It added a `.gitignore` for build artifacts (26).

## 7. Instructions misread, ignored or over-applied

- **"Every turn costs seconds: batch all independent reads/searches/checks into one turn."** Not followed in requests 1–2 (toolchain check, then schema), 7/8/13 (three separate version-probe cells), and 15–19 (five serial greps of library source).
- **todo: "`init` beside the first read or action".** The todo list was created only at request 9, after 8 orientation turns. Minor.
- **"Run the narrowest check that exercises the change, once."** Over-ran: start.sh at 27 and again at 33, plus about 7 browser requests including a mobile viewport nobody asked for. Partly justified, since 33 re-verified after code changes.
- **"Feature: prove via throwaway script; new tests ONLY for uncertain edges or on request."** It added a `civil_date` unit test. Arguably allowed, since the date conversion is an uncertain edge.
- **"Solve the real ask: no extra scope"** set against the task's "site simples… Todas as outras decisões são suas". These are ambiguous together. The subject read the delegation broadly: dev-mode proxy, environment variables, frustration thermometer, sessions table, chunk tuning.
- **Ambiguous harness text.** The system prompt contains both "Proactive multi-agent delegation active…" and "No subagents unless user… explicitly requests". Which one rendered depends on mode. Not doing delegation was right either way.
- No case of ignoring a hard rule (for example, editing outside scope, destructive git, or invented output).

## 8. Proposed rules

1. **Harness behavior: enable prompt caching for this provider path.** Target: cost 1. This is the highest lever by far. With caching, about 1.6 M of the 1.7 M input tokens would have been cheap cache reads, with no behavior change needed.
2. **Eval tool description, add:** "The cell deadline (default 30 s) is separate from `sh(..., timeout=)`. For builds or installs, set the cell `timeout` at least as high as the longest inner command." Target: request 10.
3. **Browser guide (returned on the first `browser.open`), add a one-screen cheat sheet:** "`tab.console()` / `tab.errors()` return `{ entries, nextSeq, dropped }`; common calls: `click(sel)`, `select(sel, value)`, `text(sel)`, `count(sel)`, `box(sel)`, `mouseMove(x, y)`, `emulate({viewport})`, `screenshot({fullPage})`." Target: requests 29–31.
4. **System prompt, Workflow §1, add:** "Confirm a library API by compiling and type-checking your use of it; read dependency source only after a build or type error points there. Deprecated-but-working APIs are acceptable." Target: requests 15–19.
5. **System prompt, Verify, change the Web bullet to:** "Web: open it in a browser tab; one cell covering screenshot, console errors and one interaction per stated requirement. Re-run only after changing code." Target: requests 27–34. This keeps the bug-finding pass but caps how far it spreads.

## 9. Confidence and gaps

- **Clipped transcript.** Long cells are clipped (requests 10, 12, 33). I could not see exactly what overran the cell in request 10, nor the full `cargo test` result in 12. The final "test passes" claim is therefore accepted on the subject's word.
- **Screenshots.** I saw `home.png`. I did not see the subject's own webp screenshots, so its mobile-layout claim (32) is unverified beyond the fact that it took the shot.
- **Skills.** The skill catalog visible to the subject is unknown, so the B12 rating has low confidence.
- **Token waste figures.** These are rough, computed as request count × the context size at that point.
- **Reliability of ratings.** Outcome points rest on deterministic files and I'm confident in them (±2). Behavior ratings: B5, B6, B11 high; B3, B7, B10 medium, because they turn on how strictly "simples" and the batching rule are read.