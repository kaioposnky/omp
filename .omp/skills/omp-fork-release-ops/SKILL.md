---
name: omp-fork-release-ops
description: Maintain and release the kaioposnky/omp fork (branch `main`). Covers rebase-based sync against upstream, force-with-lease push, verifying fork commits survived a rebase via range-diff, the release workflow's fork-build-sha gate, and how to force a rebuild. Use when rebasing, pushing, tagging, releasing, or debugging the fork's binary updater and CI workflows.
---

# omp fork release ops

Fork: `kaioposnky/omp`, branch `main` (it replaced `truncated-tool-names` on 2026-11-21; `kaioposnky/oh-my-pi` is archived). Fork commits sit on top of upstream can1357/oh-my-pi, currently pinned at `02742bc131`, the last commit before upstream replaced xd:// devices with bash tool commands, because Code Mode depends on xd://.

## Branch model

- `.github/workflows/sync-upstream.yml` (cron `37 5 * * *`, `workflow_dispatch`) runs `git rebase upstream/main` and force-pushes. **It is disabled while the fork is pinned**: re-enabling it rebases past the xd:// removal and breaks Code Mode, so only re-enable it after Code Mode is ported to upstream's tool commands. To pick up upstream fixes before then, rebase manually onto a chosen pre-removal commit. A conflicting rebase does not fail the run; it opens or refreshes one issue titled `Upstream sync blocked by a rebase conflict`, and the next clean sync closes it.
- Consequence: **fork commit SHAs change every rebase**. Never compare fork commits by SHA across a rebase — use `range-diff`.
- Push fork work with `--force-with-lease`, never a plain push after a rebase:

```bash
git fetch upstream main origin main
git rev-list --left-right --count origin/main...HEAD   # ahead/behind
git range-diff upstream/main..origin/main upstream/main..HEAD
git push origin main --force-with-lease
```

`range-diff` `=` lines = patch survived the rebase; `!` = upstream touched the same hunk, inspect. Local HEAD being a superset of origin is the expected, correct state — push it.

## Release pipeline

`.github/workflows/release.yml` triggers on: `workflow_run` of "Sync with upstream" (only on success), cron `3 7 * * *`, and `workflow_dispatch`.

- Version comes from **upstream's latest release tag** (`gh api repos/can1357/oh-my-pi/releases/latest`), not from our commits. So fork releases are tagged `v<upstream-latest>`.
- Gate: release body carries `fork-build-sha:<sha>`. If the tag already has that SHA, the run skips. It also skips with a warning when the tree's `@oh-my-pi/pi-natives` version is not on npm (upstream tagged 18.6.2 without publishing natives); the next upstream bump unblocks it. To force a rebuild:

```bash
gh workflow run release.yml --repo kaioposnky/omp --ref main
# or, to rebuild the same commit:  -f force=true
gh run list --repo kaioposnky/omp --workflow=release.yml --limit 3
```

- CI installs with `--minimum-release-age=3600` (1h floor) because the repo's 3-day policy blocks fresh upstream dep bumps. Don't "fix" this back to 3 days.
- `update-cli.ts` resolves versions from this fork's releases only. `REPO` is exported (tests derive fixture URLs from it). Do not reintroduce npm-based version checks.

## Commit hygiene in this repo

The tree is often dirty with unrelated work (fork files, prior session edits). **Never `git add -A` / `git commit -a`.** Stage explicit paths and re-check `git status --short` before committing — an unexamined dirty file silently rides into your commit. Unrelated change in the working tree → its own commit, not yours.

```bash
git status --short          # inspect EVERY line
git add <explicit paths>
git diff --cached --stat    # confirm scope
```

## Verification

- `bun check` (never `tsc`/`npx tsc`).
- `bun test <path>` for a package; `bun run test:rs` for Rust (never bare `cargo test`).
- Never commit unless asked. Never comment on or create GitHub issues/PRs.

## Gotchas

- Antigravity image generation: a stored credential `projectId` can lack the `cloudaicompanion` license → `403 SUBSCRIPTION_REQUIRED`. Resolve the real project via `POST {ANTIGRAVITY_PRIMARY_ENDPOINT}/v1internal:loadCodeAssist` and use its `cloudaicompanionProject`, falling back to the stored id. See `packages/ai/src/images/google-antigravity.ts`.
- Model/provider policy is KDL, not TypeScript: `packages/catalog/src/compat/rules/` → `bun run gen:compat` + commit `rules.json`.
- `packages/catalog/src/models.json` and `compat/rules.json` are generated — never hand-edit.
