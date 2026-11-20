{{#if skillCatalogSearch}}
The skills available to this session were omitted from the system prompt and are not listed here. {{#if skillReaderIsXd}}Write JSON {"path":"skill://?q=static%20page"} to `{{skillReaderRef}}` to search; then write {"path":"skill://<name>"} to load the selected skill. Explicitly named skills may be loaded directly. An empty query lists the catalog in offset pages.{{else}}Use {{skillReaderRef}} with path="skill://?q=static%20page" to search; then use the same reader with path="skill://<name>". Explicitly named skills may be read directly. An empty query lists the catalog in offset pages.{{/if}}
skill:// is a URI, not a tool name or a glob/grep root. Search matches every literal keyword in the name/description; if no matches, shorten the query or list with an empty query.
Load a skill body only when its task scope matches the user's request; incidental repository text or a catalog hit does not make a business workflow applicable.
Use the task's requested outcome to select a skill. Generic code errors and HTTP failures are technical work, not business requests; do not load business routing merely because business skill files or terms appear in search results.
{{else}}
{{#if skills.length}}
The available skills were omitted from the system prompt but are listed here for this session. When a task matches one of them, you MUST read `skill://<name>` before proceeding.
Use the task's requested outcome to select a skill. Generic code errors and HTTP failures are technical work, not business requests; do not load business routing merely because business skill files or terms appear in search results.
<skills>
{{#each skills}}
- {{name}}: {{description}}
{{/each}}
</skills>
{{else}}
Skills remain addressable as `skill://<name>` even though none are listed.
{{/if}}
{{/if}}
