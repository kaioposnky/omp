# .omp/AGENTS.md

Project-local agent config for this repo. Root `AGENTS.md` holds the full development rules; this file adds the fork/release operational learnings.

## Fork release ops → skill

Read `skill://omp-fork-release-ops` before any rebase, push, tag, release, or CI-workflow work on this fork.

## Non-negotiables (learned the hard way)

- Branch is `main` (it replaced `truncated-tool-names` on 2026-11-21). It is pinned to upstream `02742bc131`, the last commit before upstream replaced xd:// devices with bash tool commands, because Code Mode is built on xd://. `sync-upstream.yml` is disabled until Code Mode is ported; re-enabling it rebases past the pin. **Fork SHAs change on every rebase**, so compare with `git range-diff`, never by SHA.
- Push after a rebase with `--force-with-lease` only.
- **Never `git add -A` / `git commit -a`.** The tree is routinely dirty with unrelated work; stage explicit paths, verify with `git diff --cached --stat`. An unexamined dirty file will ride into your commit.
- Releases are tagged from **upstream's latest release version**, gated by a `fork-build-sha:<sha>` marker in the release body. Force a rebuild with `gh workflow run release.yml --repo kaioposnky/omp --ref main` (`-f force=true` to rebuild the same commit).
- `bun check` for types (never `tsc`), `bun test <path>` for a package, `bun run test:rs` for Rust.
- Never commit unless asked; never comment on or create GitHub issues/PRs.
