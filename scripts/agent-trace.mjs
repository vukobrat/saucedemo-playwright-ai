// Summarizes a Claude Code headless run recorded with
//   claude -p "<task>" --output-format stream-json --verbose > run.jsonl
// into a readable timeline: turns, tool calls and results, denials, stop reason, cost, context.
//
// Usage: node scripts/agent-trace.mjs <run.jsonl>   (or: npm run agent:trace -- <run.jsonl>)
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/agent-trace.mjs <stream-json file>');
  process.exit(2);
}

const events = readFileSync(file, 'utf8')
  .split('\n')
  .filter((line) => line.trim() !== '')
  .map((line) => JSON.parse(line));

const short = (value, max = 90) => {
  const text = (typeof value === 'string' ? value : JSON.stringify(value)).replace(/\s+/g, ' ');
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
};
const number = (n) => (n ?? 0).toLocaleString('en-US');
const contextOf = (usage = {}) =>
  (usage.input_tokens ?? 0) +
  (usage.cache_creation_input_tokens ?? 0) +
  (usage.cache_read_input_tokens ?? 0);

/** Text of a tool result, whether a string or a list of content blocks. */
const resultText = (content) =>
  typeof content === 'string'
    ? content
    : (content ?? []).map((block) => block.text ?? `[${block.type}]`).join(' ');

const init = events.find((e) => e.type === 'system' && e.subtype === 'init');
const result = events.find((e) => e.type === 'result');

// One model response can arrive as several assistant events (one per content block); group them
// by message id, so a response with three parallel tool calls counts as one turn.
const responses = new Map();
const toolResults = new Map();
for (const event of events) {
  if (event.type === 'assistant') {
    const id = event.message.id;
    if (!responses.has(id)) responses.set(id, { blocks: [], usage: event.message.usage });
    responses.get(id).blocks.push(...event.message.content);
  }
  if (event.type === 'user' && Array.isArray(event.message.content)) {
    for (const block of event.message.content) {
      if (block.type === 'tool_result') toolResults.set(block.tool_use_id, block);
    }
  }
}

if (init) {
  const servers = init.mcp_servers ?? [];
  const byStatus = Object.entries(
    servers.reduce((acc, s) => ({ ...acc, [s.status]: (acc[s.status] ?? 0) + 1 }), {}),
  )
    .map(([status, count]) => `${count} ${status}`)
    .join(', ');
  const connected = servers.filter((s) => s.status === 'connected').map((s) => s.name);
  console.log(
    `Session ${init.session_id?.slice(0, 8)} | model ${init.model} | mode ${init.permissionMode} | ` +
      `${init.tools?.length ?? 0} tools`,
  );
  console.log(
    `MCP servers: ${servers.length ? `${byStatus}${connected.length ? ` (connected: ${connected.join(', ')})` : ''}` : 'none'}`,
  );
}

let turn = 0;
for (const { blocks, usage } of responses.values()) {
  turn += 1;
  console.log(`\nTurn ${turn}  (context ${number(contextOf(usage))} tokens)`);
  for (const block of blocks) {
    if (block.type === 'thinking') console.log('  [thinking]');
    if (block.type === 'text') console.log(`  says: ${short(block.text)}`);
    if (block.type === 'tool_use') {
      console.log(`  -> ${block.name} ${short(block.input, 80)}`);
      const reply = toolResults.get(block.id);
      if (reply) {
        const status = reply.is_error ? 'ERROR' : 'ok';
        console.log(`     <- ${status}: ${short(resultText(reply.content), 80)}`);
      }
    }
  }
}

if (result) {
  const denials = result.permission_denials ?? [];
  console.log(
    `\nResult: ${result.subtype} | stop_reason ${result.stop_reason} | ${result.num_turns} turns | ` +
      `${((result.duration_ms ?? 0) / 1000).toFixed(1)} s | $${(result.total_cost_usd ?? 0).toFixed(3)} | ` +
      `${denials.length} permission denial(s)`,
  );
  for (const denial of denials) {
    console.log(`  denied: ${denial.tool_name} ${short(denial.tool_input, 80)}`);
  }
  if (result.result) console.log(`Final answer: ${short(result.result, 200)}`);
} else {
  console.log('\nNo result event: the run crashed or was interrupted.');
}
