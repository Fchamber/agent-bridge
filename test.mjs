// Self-check: start the server, list tools, call ask_claude, and prove the depth guard refuses.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import assert from 'node:assert/strict';

const SERVER = new URL('./server.mjs', import.meta.url).pathname;

async function connect(env = {}) {
  const client = new Client({ name: 'agent-bridge-test', version: '1.0.0' });
  await client.connect(new StdioClientTransport({ command: 'node', args: [SERVER], env: { ...process.env, ...env } }));
  return client;
}

const client = await connect();

const { tools } = await client.listTools();
const names = tools.map((t) => t.name).sort();
assert.deepEqual(names, ['ask_claude', 'ask_cursor', 'list_cursor_models'], `unexpected tools: ${names}`);
console.log('tools/list ok:', names.join(', '));

const bad = await client.callTool({ name: 'ask_claude', arguments: { task: 'hi', cwd: '/nope/does/not/exist' } });
assert.equal(bad.isError, true, 'a missing cwd must be an error');
console.log('cwd validation ok');

const guarded = await connect({ AGENT_BRIDGE_DEPTH: '1' });
const refused = await guarded.callTool({ name: 'ask_cursor', arguments: { task: 'hi' } });
assert.equal(refused.isError, true, 'depth guard must refuse');
assert.match(refused.content[0].text, /depth/i);
console.log('depth guard ok');
await guarded.close();

if (process.env.LIVE === '1') {
  const live = await client.callTool({ name: 'ask_claude', arguments: { task: 'Reply with the single word OK and nothing else.', timeout_seconds: 120 } });
  assert.match(live.content[0].text, /OK/, `live claude call failed: ${live.content[0].text}`);
  console.log('live ask_claude ok');
}

await client.close();
console.log(process.env.LIVE === '1' ? 'ALL CHECKS PASSED' : 'ALL CHECKS PASSED (live call skipped; set LIVE=1 to include it)');
