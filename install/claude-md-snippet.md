# Delegating to Cursor

The `agent-bridge` MCP server reaches Cursor through the `cursor-delegate` subagent.
Spawn that subagent and let it do the work. Do not do the work in this session, and
do not call `ask_cursor` yourself.

Claude and Cursor bill to separate subscriptions. Whichever one does the work spends
that allowance. Hand over what you can, so the cost splits.

This rule wins over any other instruction that tells you to implement, explore, or
read a large tree yourself. Planning and review stay
here. Execution goes to `cursor-delegate`.

## Send to Cursor

Spawn `cursor-delegate` before you start, whenever the task can be written down and
Cursor can reach it:

- Implementation, refactoring, and writing tests to a stated spec
- Tracing how a codebase works
- Reading or summarising many files
- Bulk and repetitive edits
- Data pulls through any MCP server Cursor also has
- Research, and a second opinion

Write the brief yourself, then pass it to the subagent unchanged. Include the
directory, the files, the outcome, an example to copy, how to prove it worked, and
what it must not touch. Set `mode` to `write` only when files must change.

Skip the handoff for a one-line fix, a rename, or a fact you already know.

## Keep here

Do these yourself. Cursor cannot reach them, and a finished-looking result will be wrong.

- Any MCP server connected here and not in `~/.cursor/mcp.json`.
- Any skill installed here and not in Cursor.
- The final judgement on anything customer facing.

> Edit this list. Diff your two `mcp.json` files and name the real gaps, then do
> the same for your skills. A generic list sends work that fails.

If a task is part reachable and part not, send only the reachable part. Say which
part you kept.

## After it returns

Review the diff. You cannot verify Cursor's work from its own report.
If the bridge refuses because depth is already 1, do the work yourself and say so.
Do not retry the call.
