<code-mode-calls>
- Call shape is the same in both languages: JS `await tool.read({ path: "a.ts" })`, Python `await tool.read({"path": "a.ts"})`. Keyword names come from `tool.describe(name)`; never invent names like `old`/`new`/`oldString`.
- `tool.bash(cmd)` returns stdout and stderr merged plus the exit code; prefer it over `Bun.$`/`subprocess` to run tests.
- For small files, rewriting the whole file with `tool.write({ path, content })` is fine; for edits use `tool.edit` with the grammar from `tool.describe("edit")`.
</code-mode-calls>
