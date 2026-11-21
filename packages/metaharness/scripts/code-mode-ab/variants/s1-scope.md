<code-mode-scope>
Change only what the task asks for. Inside a cell:
- Edit the specific lines that need to change (`tool.edit`, or a string replacement that throws when its anchor is missing). Do not rewrite a whole existing file to change part of it.
- Keep every existing behavior, guard, error message, and code path the task does not mention, even if a rewrite would look cleaner. Do not restructure data (e.g. object → Map) or add error handling, exits, or files that were not requested.
- Before answering, re-read your diff and undo anything outside the task.
</code-mode-scope>
