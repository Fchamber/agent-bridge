#!/usr/bin/env node
// MCP bridge: lets Claude Code delegate to Cursor, and Cursor delegate to Claude Code.
// Both directions just drive the other CLI's headless print mode.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { z } from 'zod';

const MAX_DEPTH = 1;
const DEFAULT_TIMEOUT_MS = 600_000;
// Prefer whatever is on PATH. Fall back to Cursor's default install location.
// Note: the binary is `cursor-agent`. A bare `agent` may be a different vendor's CLI.
function findCursor() {
  if (process.env.AGENT_BRIDGE_CURSOR_BIN) return process.env.AGENT_BRIDGE_CURSOR_BIN;
  try {
    return execSync('command -v cursor-agent', { encoding: 'utf8', shell: '/bin/sh' }).trim();
  } catch {
    return `${process.env.HOME}/.local/bin/cursor-agent`;
  }
}
const CURSOR_BIN = findCursor();
const CLAUDE_BIN = process.env.AGENT_BRIDGE_CLAUDE_BIN ?? 'claude';

const depth = Number(process.env.AGENT_BRIDGE_DEPTH ?? 0);
const LOG = process.env.AGENT_BRIDGE_LOG ?? `${process.env.HOME}/.agent-bridge/log.jsonl`;

// One row per delegated call. Cursor's CLI does not report token counts,
// so task/output size and duration are the only cost proxy we get.
function log(row) {
  try {
    mkdirSync(dirname(LOG), { recursive: true });
    appendFileSync(LOG, `${JSON.stringify({ timestamp: new Date().toISOString(), ...row })}\n`);
  } catch { /* never fail a call because logging failed */ }
}

function run(bin, args, cwd, timeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(bin, args, {
      cwd,
      timeout: timeoutMs,
      killSignal: 'SIGKILL',
      env: { ...process.env, AGENT_BRIDGE_DEPTH: String(depth + 1) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => resolve({ code: -1, out, err: `${err}\n${e.message}`, duration_ms: Date.now() - started }));
    child.on('close', (code, signal) => resolve({ code, signal, out, err, duration_ms: Date.now() - started }));
  });
}

function result({ code, signal, out, err }) {
  const timedOut = signal === 'SIGKILL';
  const text = [
    timedOut ? 'TIMED OUT (partial output below)' : null,
    out.trim() || null,
    err.trim() ? `stderr:\n${err.trim()}` : null,
  ].filter(Boolean).join('\n\n') || `no output (exit ${code})`;
  return { content: [{ type: 'text', text }], isError: timedOut || code !== 0 };
}

function logged(tool, { mode, model, dir, task }, ran) {
  log({
    tool, mode, model: model ?? null, cwd: dir,
    task_chars: task.length,
    output_chars: ran.out.length,
    duration_ms: ran.duration_ms,
    exit_code: ran.code,
    timed_out: ran.signal === 'SIGKILL',
  });
  return result(ran);
}

const shared = {
  task: z.string().describe('The full task brief. Self-contained: the other agent sees none of this conversation.'),
  mode: z.enum(['plan', 'write']).default('plan').describe('plan = read-only analysis (default). write = allowed to edit files and run commands.'),
  model: z.string().optional().describe('Optional model id passed straight through to the other CLI. Omit it to let the CLI choose. Call list_cursor_models first for current ids, never guess one. Choose by job, not by habit: a large reasoning model for architecture, debugging and review; a dedicated coding model for writing and refactoring code; a small fast model for mechanical edits, renames and boilerplate. Paying for a large model on a mechanical edit wastes the very budget this bridge exists to protect.'),
  cwd: z.string().optional().describe('Working directory. Defaults to this server process cwd.'),
  timeout_seconds: z.number().int().min(10).max(3600).default(600),
};

function resolveCwd(cwd) {
  if (!cwd) return process.cwd();
  if (!existsSync(cwd)) throw new Error(`cwd does not exist: ${cwd}`);
  return cwd;
}

function depthGuard() {
  if (depth >= MAX_DEPTH) {
    return { content: [{ type: 'text', text: `Refused: delegation depth ${depth} reached the limit of ${MAX_DEPTH}. An agent called by the bridge cannot call back through the bridge.` }], isError: true };
  }
  return null;
}

const server = new McpServer({ name: 'agent-bridge', version: '1.0.0' });

server.registerTool('ask_cursor', {
  title: 'Delegate a task to Cursor',
  description: 'Run a task in Cursor Agent and return its answer. Use PROACTIVELY for any work Cursor can reach, not only code: implementation and refactoring, tracing how a codebase works, reading or summarising many files, bulk and repetitive edits, data pulls and analysis through MCP servers both sides share, research, and a second opinion on any decision. Do not send work needing a tool or skill only this assistant has. Cursor bills to a separate subscription, so this preserves the Claude allowance for planning and review. Cursor sees none of this conversation, so the task string must be a complete self-contained brief. Read-only by default; pass mode=write to allow edits. Pass a model chosen for the job; call list_cursor_models first if unsure.',
  inputSchema: shared,
}, async ({ task, mode, model, cwd, timeout_seconds }) => {
  const blocked = depthGuard();
  if (blocked) return blocked;
  const dir = resolveCwd(cwd);
  const args = ['-p', '--output-format', 'text', '--trust', '--workspace', dir];
  args.push(...(mode === 'write' ? ['--force'] : ['--mode', 'plan']));
  if (model) args.push('--model', model);
  args.push(task);
  return logged('ask_cursor', { mode, model, dir, task }, await run(CURSOR_BIN, args, dir, timeout_seconds * 1000));
});

server.registerTool('ask_claude', {
  title: 'Delegate a task to Claude Code',
  description: 'Run a task in Claude Code and return its answer. Use PROACTIVELY from Cursor for planning, architecture decisions and review, when stuck after two failed attempts, and for any work needing a tool or skill Cursor does not have. Claude bills to a separate subscription, so this splits cost away from Cursor. Claude sees none of this conversation, so the task string must be a complete self-contained brief. Read-only by default; pass mode=write to allow edits.',
  inputSchema: shared,
}, async ({ task, mode, model, cwd, timeout_seconds }) => {
  const blocked = depthGuard();
  if (blocked) return blocked;
  const dir = resolveCwd(cwd);
  const args = ['-p', '--output-format', 'text', '--permission-mode', mode === 'write' ? 'acceptEdits' : 'plan'];
  if (model) args.push('--model', model);
  args.push(task);
  return logged('ask_claude', { mode, model, dir, task }, await run(CLAUDE_BIN, args, dir, timeout_seconds * 1000));
});

server.registerTool('list_cursor_models', {
  title: 'List the models Cursor can run',
  description: 'Return the live list of model ids available to cursor-agent on this machine. Call this before passing a model to ask_cursor, because the available ids change over time. Do not guess a model id from memory.',
  inputSchema: {},
}, async () => result(await run(CURSOR_BIN, ['models'], process.cwd(), 60000)));

await server.connect(new StdioServerTransport());
