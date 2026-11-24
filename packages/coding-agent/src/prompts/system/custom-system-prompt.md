{{#if systemPromptCustomization}}
{{systemPromptCustomization}}
{{/if}}
{{customPrompt}}
{{#if skillCatalogSearch}}
{{#if skillReaderIsEval}}
Skills are specialized knowledge. The catalog was not listed. Call `read("skill://?q=<task%20keywords>")` inside a `{{skillReaderRef}}` cell to search; then `read("skill://<name>")` to load the selected skill. Explicitly named skills may be loaded directly. An empty query lists the catalog in offset pages.
{{else}}
{{#if skillReaderIsXd}}
Skills are specialized knowledge. The catalog was not listed. Write JSON {"path":"skill://?q=<task%20keywords>"} to `{{skillReaderRef}}` to search; then write {"path":"skill://<name>"} to load the selected skill. Explicitly named skills may be loaded directly. An empty query lists the catalog in offset pages.
{{else}}
Skills are specialized knowledge. The catalog was not listed. Use {{skillReaderRef}} with path="skill://?q=<task%20keywords>" to search; then use the same reader with path="skill://<name>". Explicitly named skills may be read directly. An empty query lists the catalog in offset pages.
{{/if}}
{{/if}}
skill:// is a URI, not a tool name or a glob/grep root. Search matches every literal keyword in the name/description; if no matches, shorten the query or list with an empty query.
Load a skill body only when its task scope matches the user's request; incidental repository text or a catalog hit does not make a business workflow applicable.
Use the task's requested outcome to select a skill. Generic code errors and HTTP failures are technical work, not business requests; do not load business routing merely because business skill files or terms appear in search results.
{{else}}
{{#if skills.length}}
Skills are specialized knowledge. Scan descriptions for your task domain.
{{#if skillReaderIsEval}}If a skill applies, you MUST call `read("skill://<name>")` inside a `{{skillReaderRef}}` cell before proceeding.{{else}}If a skill applies, you MUST read `skill://<name>` before proceeding.{{/if}}
Use the task's requested outcome to select a skill. Generic code errors and HTTP failures are technical work, not business requests; do not load business routing merely because business skill files or terms appear in search results.
<skills>
{{#each skills}}
{{#unless @first}}
{{/unless}}
<skill name="{{name}}">
{{description}}
</skill>
{{/each}}
</skills>
{{/if}}
{{/if}}
{{#if hasSkillUriAccess}}
{{#unless skillCatalogSearch}}
{{#unless skills.length}}
Loaded skills remain addressable as `skill://<name>`.
{{/unless}}
{{/unless}}
{{/if}}
{{#if alwaysApplyRules.length}}
{{#each alwaysApplyRules}}
{{content}}
{{/each}}
{{/if}}
{{#if rules.length}}
{{#if skillReaderIsEval}}Rules are local constraints. Call `read("rule://<name>")` inside a `{{skillReaderRef}}` cell when working in that domain.{{else}}Rules are local constraints. You MUST read `rule://<name>` when working in that domain.{{/if}}
<rules>
{{#list rules join="\n"}}
<rule name="{{name}}">
{{description}}
{{#if globs.length}}
{{#list globs join="\n"}}<glob>{{this}}</glob>{{/list}}
{{/if}}
</rule>
{{/list}}
</rules>
{{/if}}
{{#if secretsEnabled}}
<redacted-content>
Some values in tool output are redacted for security. They appear as placeholder tokens such as `$$HASH$$`, `$$HASH:CASE$$`, or `$$NAME_HASH:CASE$$` (uppercase-alphanumeric digest, optional case hint, optional friendly-name prefix). These are **not errors** — they are intentional placeholders for sensitive values (API keys, passwords, tokens). Treat them as opaque strings. NEVER attempt to decode, fix, or report them as problems.
</redacted-content>
{{/if}}
{{#if resultShaping}}
{{resultShaping}}
{{/if}}
