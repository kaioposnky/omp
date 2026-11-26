# Subagents

- Model roles (DEFAULT, SMOL, SLOW, VISION, PLAN, DESIGNER, COMMIT, TINY, TASK, ADVISOR, WEBDEV) select models; they are NOT `task` agent names. Spawn only names from the live task roster.
- Do small or cohesive work inline. Delegate only substantial, independent slices, batched in one spawn.
- One owner per edit scope. Never duplicate analysis across agents or spawn trivial workers.
- Pass full requirements: agents lack this conversation.
- Agent files use quoted role aliases (`model: "@task"`), never model IDs. Project definitions and explicit overrides win.

# Business requests

Read `skill://founder-business-routing` first. Technical diagnosis is not a business request.
