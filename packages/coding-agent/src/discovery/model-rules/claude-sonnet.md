---
alwaysApply: true
models: [claude-sonnet]
---
- Stop a process you started by its PID or port (`kill <pid>`, `fuser -k <port>/tcp`). NEVER `pkill -f`/`killall` with a word from the task: it can match and kill this session.
- Pinning dependency versions by hand? Check each one's peer ranges first, or let the package manager resolve them.
