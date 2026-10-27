// Runs Claude Code headless with a JSON Schema and returns the validated output with run metadata.
// Shared by the CI agent scripts (agent-triage.mjs, agent-review.mjs), so local runs and CI runs
// use the same command line.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** Spawns a command with an empty stdin (so `claude -p` never waits for piped input). */
function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'inherit'] });
    let stdout = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => {
      stdout += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, stdout });
    });
  });
}

/**
 * @param {object} options
 * @param {string} options.prompt Task for the agent.
 * @param {string} options.schemaFile JSON Schema the final answer must match.
 * @param {string[]} options.args Further CLI flags (agent, model, tools, permissions, caps).
 * @param {NodeJS.ProcessEnv} [options.env] Environment for the claude process.
 */
export async function runHeadless({ prompt, schemaFile, args, env = process.env }) {
  const schema = readFileSync(schemaFile, 'utf8');
  const { code, stdout } = await run(
    'claude',
    ['-p', prompt, '--output-format', 'json', '--json-schema', schema, ...args],
    env,
  );

  let result;
  try {
    result = JSON.parse(stdout);
  } catch {
    throw new Error(`claude exited with code ${String(code)} without a JSON result`);
  }
  // A run can end without structured output (turn or budget cap, refusal); never treat that as
  // an empty report.
  if (result.is_error || result.structured_output === undefined) {
    const detail = String(result.result ?? '').slice(0, 500);
    throw new Error(`claude returned no structured output (${String(result.subtype)}): ${detail}`);
  }

  return {
    output: result.structured_output,
    meta: {
      sessionId: result.session_id,
      turns: result.num_turns,
      costUsd: result.total_cost_usd,
      durationMs: result.duration_ms,
      permissionDenials: result.permission_denials?.length ?? 0,
    },
  };
}

/**
 * The instructions of a project subagent (`.claude/agents/<name>.md` without its frontmatter), for
 * `--append-system-prompt`. Not `--agent <name>`: the agent's `tools` list then becomes the
 * session's whole toolset, and `--json-schema` silently returns no structured output.
 */
export function agentInstructions(name) {
  const file = readFileSync(`.claude/agents/${name}.md`, 'utf8');
  return file.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
}

/** Makes text safe for one Markdown table cell. */
export function cell(text) {
  return String(text)
    .replace(/\|/g, '\\|')
    .replace(/\s*\n\s*/g, ' ');
}

/** Link to a page of this repository on GitHub, when running in GitHub Actions. */
export function repoLink(path) {
  const { GITHUB_SERVER_URL: server, GITHUB_REPOSITORY: repo } = process.env;
  return server && repo ? `${server}/${repo}/${path}` : undefined;
}
