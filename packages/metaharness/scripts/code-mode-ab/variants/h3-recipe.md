<code-mode-workflow>
Work in as few `eval` cells as possible; each extra cell resends the whole conversation.
1. Discover in ONE cell: a single `tool.bash` that lists the files, prints every relevant source and test file with headers, and runs the tests (`… | tail -30`).
2. Edit and verify in ONE cell: do every write/replacement for the task, then in the same cell run the tests, quick edge-case probes, and a grep for leftovers. Make edits throw when the anchor text is missing instead of re-reading to confirm.
3. Answer as soon as verification passes. No extra re-reads.
Print `.text` of tool results, not whole result objects.
</code-mode-workflow>
