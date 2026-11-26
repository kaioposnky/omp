One cell per call; top-level state persists, including across compaction.{{#if spawns}} Subagents have separate kernels.{{/if}}
{{#if spawns}}
{{#if eagerDelegation}}
For 2+ independent items, use a named `workpool()`; results auto-deliver.
{{#if waitTool}}
If blocked, leave `eval` and call `wait`.
{{/if}}
{{/if}}
{{/if}}
{{#if py}}
Python: plain Python subprocess, not IPython (no `get_ipython()`, `obj?`, or %matplotlib).
Magics like %pip, %load, %time and `!cmd` are rewritten to Python.
Top-level `await` works; `asyncio.run(…)` fails.
{{/if}}
{{#if js}}JS: Bun (Bun.file, Bun.write, Bun.$); top-level `await`/`return` work.{{/if}}
On error, retry only the failed step; earlier steps may have taken effect.
Printing an image{{#if py}} or figure{{/if}} attaches it.

<prelude>
{{#ifAll py js}}
Python helpers take kwargs; JS helpers take the same parameters (camelCase) as positional args or ONE trailing options object.
`await` marks async helpers; the rest are sync.
```
print(value, ...)  log(message)  phase(title)  env(key?, value?)
read(path, offset?, limit?)  write(path, content)  output(*ids, format?, query?, offset?, limit?); JS: await read(…)  await write(…)  await output(…)
wait(handles, timeout?=None, raise_errors?=True); JS: await wait(…) — agent/completion barrier, ordered results; raise_errors=False retains failures
await tool.<name>(args) — session tool; `args` is its parameter object
sh(command, cwd?, timeout?); JS: await sh(…) or await sh`cmd ${arg}` — embedded bash engine, runs to completion (never backgrounded); `timeout` in seconds
  returns stdout+stderr; non-zero exit raises ShellError (.exit_code/.exitCode, .output)
  JS interpolations are shell-quoted; starts in the session cwd unless cwd is given
```
{{else}}
`await` marks async helpers; the rest are sync.
{{#if py}}
Python (kwargs):
```py
print(value, ...)  log(message)  phase(title)  env(key?, value?)
read(path, offset?, limit?)  write(path, content)  output(*ids, format?, query?, offset?, limit?)
wait(handles, timeout?=None, raise_errors?=True) — agent/completion barrier, ordered results; `raise_errors=False` retains failures.
await tool.<name>(args) — session tool; `args` is its parameter object
sh(command, cwd?, timeout?) — embedded bash engine, runs to completion (never backgrounded); `timeout` in seconds
  returns stdout+stderr; non-zero exit raises ShellError (`.exit_code`, `.output`); starts in the session cwd unless `cwd` is given
```
{{/if}}
{{#if js}}
JS (positional args or ONE trailing options object):
```js
print(value, ...)  log(message)  phase(title)  env(key?, value?)
await read(path, offset?, limit?)  await write(path, content)  await output(...ids, { format?, query?, offset?, limit? })
await wait(handles, { timeout?, raiseErrors? }) — agent/completion barrier, ordered results; `raiseErrors: false` retains failures.
await tool.<name>(args) — session tool; `args` is its parameter object
await sh(command, { cwd?, timeout? })  await sh`cmd ${arg}` — embedded bash engine, runs to completion (never backgrounded); `timeout` in seconds
  resolves to stdout+stderr; non-zero exit throws ShellError (`.exitCode`, `.output`)
  interpolations are shell-quoted; starts in the session cwd unless `cwd` is given
```
{{/if}}
{{/ifAll}}
{{#unless codeMode}}{{#if toolNames}}Session tool names: {{#each toolNames}}{{this}}{{#unless @last}}, {{/unless}}{{/each}}.{{/if}}{{/unless}}
</prelude>

{{#if codeMode}}
<code-mode>
Code Mode: `eval` is the only execution surface. Only `eval` and the control tools are on the wire, so call every other tool as `tool.<name>(args)` inside a cell — `read`, `write`, `edit`, `grep`, `glob`, `bash`, MCP tools and the rest all run that way, through the same approval gate and hooks as a direct call.
- Arguments are one object (`tool.read({ path })`); a tool with a single required string field also takes that string (`tool.bash("ls")`).
- One cell does a whole step: batch independent calls with `Promise.all` and print only what you need — every extra `eval` call resends the conversation.
- `await tool.describe("<name>")` — TypeScript signature of that tool's arguments; an unknown name throws.
- `await tool.search("<query>", k)` — up to `k` (default 5) tools as `{ name, summary, signature }`, best match first.
Never tell the user to call a tool you can reach through the bridge, and never report a tool as missing before searching for it.
{{#if cellWorkflow}}
<cell-workflow>
Work in as few `eval` cells as possible; each extra cell resends the whole conversation.
1. Discover in ONE cell: a single `tool.bash` that lists the files, prints every relevant source and test file with headers, and runs the tests (`… | tail -30`). New project: inspect the inputs and the toolchain instead.
2. Edit and verify in ONE cell: do every write/replacement for the task, then in the same cell run the tests, quick edge-case probes, and a grep for leftovers. Make edits throw when the anchor text is missing instead of re-reading to confirm.
3. Answer as soon as verification passes. No extra re-reads.
File bodies go through `write`/`tool.edit`, NEVER a shell heredoc or `cat >`: quoting nested inside a cell breaks.
A cell shows about 4 KB inline; the rest is cut and saved to `local://N.log`. When output is cut, read the needed range of that log instead of re-running the command.
Never send `todo` as its own turn: update it inside the working cell with `await tool.todo({...})`, or skip it on small tasks.
</cell-workflow>
{{/if}}
{{#if scopeRule}}
<code-mode-scope>
Change only what the task asks for. Inside a cell:
- Edit the specific lines that need to change (`tool.edit`, or a string replacement that throws when its anchor is missing). Do not rewrite a whole existing file to change part of it.
- Keep every existing behavior, guard, error message, and code path the task does not mention, even if a rewrite would look cleaner. Do not restructure data (e.g. object → Map) or add error handling, exits, or files that were not requested.
- Before answering, re-read your diff and undo anything outside the task.
</code-mode-scope>
{{/if}}
{{#if bridgeCatalog}}
<bridge-tools>
{{{bridgeCatalog}}}
</bridge-tools>
{{/if}}
</code-mode>
{{/if}}

{{#if inlineTopics}}
{{{inlineTopics}}}
{{else}}
<namespaces>
More globals; {{#if codeMode}}`tool.read({ path })`{{else}}`read`{{/if}} the linked docs before first use:
- `judge`, `{{#if py}}judge_batch{{else}}judgeBatch{{/if}}`, `completion`: classification, bulk judgment, model calls → xd://eval/judge
- `%load`{{#if py}}, `%pip`{{/if}}{{#if js}}, `%bun add`{{/if}}, `budget`{{#if evalTools}}, `@tool`/`tool(fn)`{{/if}}: setup, installs, utilities → xd://eval/helpers
{{#if spawns}}
- `agent`, `workpool`: background subagents, DAG waves → xd://eval/agents
{{/if}}
{{#each preludes}}
- `{{name}}`{{#if summary}}: {{summary}}{{/if}} → xd://eval/{{name}}
{{/each}}
{{#if firstCallPreludes}}
No `read` needed before first use; the guide follows the first call's result (full reference linked):
{{#each firstCallPreludes}}
- `{{name}}`{{#if summary}}: {{summary}}{{/if}} → `xd://eval/{{name}}`
{{/each}}
{{/if}}
</namespaces>
{{#each inlinePreludes}}

<{{name}}>
Global `{{name}}`, documented here in full (no `read` needed):
{{{documentation}}}
</{{name}}>
{{/each}}
{{/if}}

<critical>
NEVER repeat successful setup. Kernel-loss notice means reload setup.
</critical>

{{#if autoBackgroundEnabled}}
Long cells may auto-background and deliver later; the kernel stays busy.
`timeout: 0` disables the cell deadline, not the foreground wait.
{{/if}}
