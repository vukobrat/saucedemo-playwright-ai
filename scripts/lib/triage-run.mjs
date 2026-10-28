// The triage of one CI run as one prompt and one command line. scripts/agent-triage.mjs runs it in
// the nightly triage workflow, and the whole-run triage eval (scripts/eval/run-triage-runs-eval.mjs)
// replays it on saved reports, so the eval measures exactly what CI runs.
import { agentInstructions } from './claude-headless.mjs';

// Pinned for reproducible CI behaviour; triage reads one report, so the full model is not needed.
export const TRIAGE_MODEL = 'claude-sonnet-5-5';
export const TRIAGE_REPORT_SCHEMA = 'scripts/schemas/triage-report.schema.json';

/** @param {string} runId */
export function triageRunPrompt(runId) {
  return [
    `Triage run ${runId} of this repository's CI workflow.`,
    `Call analyze_ci_run with run id ${runId}. Check failures you cannot place against the`,
    'catalogue with find_known_bug, and read specs, page objects or docs/app-exploration.md only',
    'when the report alone does not decide the category.',
    'Tests that failed as expected under a knownBug() marker are not failures: count them in',
    'expectedKnownBugFailures. A known-bug test that passed means its marker may be stale.',
    'Every other test the report names goes in failures, under its cause, even when the action',
    'for it is to leave it alone.',
    'You cannot run tests or edit files in this run. Return the report in the required shape.',
  ].join(' ');
}

/**
 * CLI flags for the triage of a run: the triage agent's instructions, read-only tools and only the
 * qa MCP server; reading a report needs no browser.
 * @param {object} options
 * @param {object} options.qaServer The qa server's entry in .mcp.json.
 * @param {string} [options.model]
 * @param {string} [options.instructions] Instead of the triage agent's (an eval variant).
 */
export function triageRunArgs({
  qaServer,
  model = TRIAGE_MODEL,
  instructions = agentInstructions('triage'),
}) {
  return [
    ['--append-system-prompt', instructions],
    ['--model', model],
    ['--tools', 'Read,Grep,Glob'],
    ['--strict-mcp-config', '--mcp-config', JSON.stringify({ mcpServers: { qa: qaServer } })],
    ['--allowedTools', 'mcp__qa__analyze_ci_run,mcp__qa__find_known_bug,mcp__qa__list_ci_runs'],
    ['--permission-mode', 'dontAsk'],
    ['--max-turns', '25'],
    ['--max-budget-usd', '3'],
  ].flat();
}
