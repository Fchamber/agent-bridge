## Splitting work across Claude and Cursor

Claude and Cursor bill to separate subscriptions. Execution burns the most tokens.

- Plan and review here. Delegate execution to the `cursor-executor` subagent.
- Use it once the approach is settled and the work is writing or changing code.
- Keep planning, architecture and review in Claude.
- Always review the diff Cursor returns. You cannot verify its work from its own report.
