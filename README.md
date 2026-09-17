# agent-bridge

Let Claude Code and Cursor hand work to each other.

You pay for two AI coding subscriptions. Only one of them is working at a time.
This bridge lets each one call the other, so the load spreads across both plans.

## How it works, in plain English

Think of two contractors. Each one sends you a separate invoice.

Either contractor can hand the other a written brief and get an answer back.
Neither one can read the other's notebook. The brief is all they get.
And a brief cannot be handed on a second time, so the work cannot bounce forever.

That is the whole idea. Here are the parts that make it happen.

- **The server.** One small program that sits between the two tools. It speaks MCP,
  the standard both tools use to load extra abilities.
- **Two tools.** `ask_cursor` sends a job to Cursor. `ask_claude` sends a job to
  Claude Code. Each one runs the other program the way a script would, waits, and
  returns the answer.
- **No shared memory.** The other side sees only the text you send. It cannot see
  your chat. So the brief must stand on its own. This is the single most common
  cause of a bad result.
- **A subagent, on the Claude side.** A small helper that tells Claude when to hand
  execution to Cursor. You do not name the tool yourself.
- **A rule, on the Cursor side.** The same idea in reverse. Cursor asks Claude for
  plans and code reviews on its own.
- **A depth guard.** The bridge refuses a second hop. Claude can call Cursor. That
  Cursor cannot call Claude back. Without this, two agents can loop and drain both
  subscriptions.
- **A log.** Every call writes one line to `~/.agent-bridge/log.jsonl`, so you can
  check whether the split is actually happening.

## Why you might want this

- **Spread the cost.** Execution burns the most tokens. Push it to the other plan and
  keep your main allowance for thinking.
- **Two opinions.** Different model families catch different mistakes. Useful for
  architecture calls and code review.
- **Buy quality on the cheaper bill.** Cursor can serve Claude models. Check with
  `cursor-agent models`. If yours does, `ask_cursor` with that model gives you Claude
  output billed to Cursor.

Be honest about the trade. Each call starts cold, so the other tool re-reads your
code every time. You will spend more tokens in total. You are buying a split, not
efficiency.

## Requirements

- Node 18 or newer.
- [Claude Code](https://claude.com/claude-code), logged in.
- [Cursor CLI](https://cursor.com), logged in. The binary is `cursor-agent`.
  A bare `agent` on your PATH may be a different vendor's tool. Check with
  `cursor-agent status`.

You can install with only one of the two. The installer skips what it cannot find.

## Install

```
git clone <this repo> agent-bridge
cd agent-bridge
./install.sh
```

Then do the three manual steps it prints. Restart both tools.

To remove it, run `./uninstall.sh`.

## The one permission you must grant

Claude Code blocks the bridge until you allow it. Without this you get a prompt on
every single delegation, which defeats the purpose.

Add to `permissions.allow` in `~/.claude/settings.json`:

```
"mcp__agent-bridge__ask_cursor"
```

The installer does not write this for you. It is a security decision, so you should
make it yourself. Read the next section before you do.

## What write mode does

Both tools default to `plan` mode, which is read only. Safe.

`mode: "write"` is different. On the Cursor side it runs `cursor-agent --force`.
That means Cursor can edit your files **and run shell commands with no confirmation**.

Combine that with the permission above and there is no human check before the change
happens. Your only gate is reading the diff afterwards. Always read the diff.

If that is too loose for you, leave the permission ungranted and approve each call by
hand. You lose the automatic routing and keep the control.

## Picking the right model

Cursor can run several model families: Claude, GPT and Codex, Gemini, Composer,
Kimi and GLM. The `model` option passes an id straight through.

**Never guess an id.** The list changes. Call `list_cursor_models` first, or run
`cursor-agent models` in a terminal.

Choose by job, not by habit.

| Job | Pick |
|---|---|
| Architecture, debugging, review | A large reasoning model. |
| Writing or refactoring code | A dedicated coding model. |
| Renames, boilerplate, mechanical edits | A small fast model. |

Paying for a large model on a mechanical edit wastes the budget this bridge exists
to protect. Omit `model` entirely to let Cursor choose for you.

### Check the data retention label first

Some models in the list are marked **(NO ZDR)**. That means no zero data retention:
the vendor may keep what you send.

Do not route client code, customer data or anything under a confidentiality
obligation through a NO ZDR model. If you work under ISO 27001 or a similar regime,
check the label before you pass an id, every time. The list marks it plainly.

## Tools

| Tool | Runs | Use it for |
|---|---|---|
| `ask_cursor` | `cursor-agent -p` | Implementation, once the approach is settled. |
| `ask_claude` | `claude -p` | Planning, architecture, code review. |
| `list_cursor_models` | `cursor-agent models` | Checking which model ids exist right now. |

Both take the same options.

- `task` (required): the full brief. The other side sees nothing else.
- `mode`: `plan` (read only, the default) or `write`.
- `model`: optional passthrough, for example `gpt-5.3-codex` or `claude-opus-5-thinking-high`.
- `cwd`: working directory. Defaults to the server's directory.
- `timeout_seconds`: default 600, max 3600.

## Writing a good brief

The other tool has no context. A vague brief costs more than a long one, because the
work comes back wrong and you pay twice.

Include all five of these:

1. The repository root and the exact files in scope.
2. The change, stated as an outcome rather than a goal.
3. An existing file to copy the conventions from.
4. The command that proves it worked.
5. What it must not touch.

## Automatic routing

You should never have to name a tool. Three pieces handle it.

| Piece | Installed to | Effect |
|---|---|---|
| Tool descriptions | the server | Each side learns when to reach for the other. |
| `cursor-delegate` subagent | `~/.claude/agents/` | Claude hands any reachable work to Cursor by itself. |
| `agent-bridge.mdc` rule | `~/.cursor/rules/` | Cursor asks Claude for plans and reviews by itself. |

### What to delegate

The split is not coding versus everything else. It is what the other side can reach.

Send to Cursor: implementation and refactoring, tracing how a codebase works, reading
or summarising many files, bulk and repetitive edits, data pulls and analysis through
any MCP server both sides share, research, and a second opinion on any decision.

Keep in Claude Code: anything needing a tool or skill only it has. On a typical setup
that means email, calendar and chat connectors, and any branded document generated by
a Claude Code skill. Cursor has neither, and it will produce something that looks
finished and is wrong.

Both installed rule files carry this split, so each side knows its own limits. Edit
them to match your own tooling, because the exact list differs per machine.

This is instruction, not enforcement. The model decides. Only a `PreToolUse` hook
would force it, and that hook would block ordinary work in every project. Check the
log to see whether the routing is really happening.

The subagent runs on Haiku and holds a single tool, so its own cost is negligible.
The real work happens inside Cursor.

There is also `install/claude-md-snippet.md`. Paste it into a project's `CLAUDE.md`
if you want the rule in one repository only. Do not put it in your global `CLAUDE.md`,
or you will push delegation into every project you own, including client work.

## Reading the log

Every call appends one row to `~/.agent-bridge/log.jsonl`. Override the path with
`AGENT_BRIDGE_LOG`.

```json
{"timestamp":"...","tool":"ask_cursor","mode":"write","model":null,"cwd":"...",
 "task_chars":333,"output_chars":0,"duration_ms":1281,"exit_code":1,"timed_out":false}
```

Cursor's CLI reports no token counts. So size and duration are the only in-band cost
proxy. Read real spend from each vendor's dashboard.

```
python3 -c "
import json,collections,os
rows=[json.loads(l) for l in open(os.path.expanduser('~/.agent-bridge/log.jsonl'))]
c=collections.Counter(r['tool'] for r in rows)
print('calls:', dict(c))
for t in c:
    d=[r['duration_ms'] for r in rows if r['tool']==t]
    print(t, 'total minutes', round(sum(d)/60000,1))
"
```

## Measuring whether it works

The metric is not dollars. Both plans bind on caps, not on spend. So measure the
share of each cap you burn per unit of work delivered.

Run two weeks. Week one, one tool only, as a baseline. Week two, with routing on.
Record each cap reading at the start and end, the log rows, and one quality gate:
did the tests pass, and did you have to redo the work? If quality drops, the saving
is not real.

## Using it from the Cursor Agents browser

Cloud agents run in Cursor's own machines. Those machines have no Claude Code login.
Using `ask_claude` there needs an API key, which bills the API instead of your
subscription. That defeats the point.

Worker mode is the path. It runs the browser-launched agent on your own machine,
where Claude Code is already signed in.

```
cursor-agent worker --pool --worker-dir ~/code/<one-repo>
```

Three rules:

- Scope `--worker-dir` to one code repository. Never your home directory.
- Use `--pool`, so one cloud agent claims the worker at a time.
- Copy the rule file and the `agent-bridge` entry from `~/.cursor/mcp.json` into that
  repository's own `.cursor/` directory. A worker-claimed agent may only read the
  repository config.

## What is tested, and what is not

### Restart both tools after installing

A Claude Code session that started before the install cannot see the new tools. The
`cursor-delegate` subagent then fails with:

```
Agent 'cursor-delegate' would be spawned with zero tools
unrecognized [mcp__agent-bridge__ask_cursor]
```

That is not a broken install. Quit Claude Code and start it again. Same for Cursor.

### What is tested

Tested on macOS with Claude Code and Cursor CLI 2026.08.11:

- The server, the two tools, and the self-test.
- `ask_claude` returning a real answer.
- Claude selecting the subagent on its own and reaching the bridge.
- The depth guard surviving a real Claude Code spawn.

Not yet tested:

- The Cursor rule firing without being asked.
- Whether the depth guard survives Cursor's own spawn. If Cursor drops the
  environment variable, a loop could run across both subscriptions. Check with:
  `AGENT_BRIDGE_DEPTH=1 cursor-agent -p --trust "call the ask_claude tool with task hi"`
- Whether worker mode is available on your Cursor plan. It looks like a Teams or
  Enterprise feature.

Reports welcome, especially from Linux and Windows.

## Test

```
npm test           # fast checks only
LIVE=1 npm test    # adds a real Claude Code round trip
```

`LIVE=1` calls Claude Code for real. Allow `mcp__agent-bridge__ask_claude` first, or
approve the prompt when it appears.

## Notes

- A Claude Code plugin could wrap the Claude half one day. It would not cover the
  Cursor half, so a script that does both is the honest unit for now.
- MIT licensed.
