// Triages one run of the CI workflow with the triage agent, headless, and writes a schema-validated
// report: agent-output/triage.json (data) and agent-output/triage.md (for people). The agent gets
// read-only tools and the qa MCP server; it runs no tests, edits nothing and posts nothing.
//
// Usage: npm run agent:triage -- <run-id>
// Needs: `claude` on PATH and signed in (CLAUDE_CODE_OAUTH_TOKEN in CI), and `gh` signed in with
// read access to Actions (GH_TOKEN in CI), which the qa server uses to download the run's report.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { agentInstructions, cell, repoLink, runHeadless } from './lib/claude-headless.mjs';

const runId = process.argv[2];
if (!/^\d+$/.test(runId ?? '')) {
  console.error('Usage: npm run agent:triage -- <run-id>');
  process.exit(2);
}

const OUT_DIR = 'agent-output';
// Pinned for reproducible CI behaviour; triage reads one report, so the full model is not needed.
const MODEL = 'claude-sonnet-5-5';

// Only the qa server, defined once in .mcp.json; reading a report needs no browser.
const { mcpServers } = JSON.parse(readFileSync('.mcp.json', 'utf8'));
const mcpConfig = JSON.stringify({ mcpServers: { qa: mcpServers.qa } });

const prompt = [
  `Triage run ${runId} of this repository's CI workflow.`,
  `Call analyze_ci_run with run id ${runId}. Check failures you cannot place against the`,
  'catalogue with find_known_bug, and read specs, page objects or docs/app-exploration.md only',
  'when the report alone does not decide the category.',
  'Tests that failed as expected under a knownBug() marker are not failures: count them in',
  'expectedKnownBugFailures. A known-bug test that passed means its marker may be stale.',
  'You cannot run tests or edit files in this run. Return the report in the required shape.',
].join(' ');

const { output, meta } = await runHeadless({
  prompt,
  schemaFile: 'scripts/schemas/triage-report.schema.json',
  args: [
    ['--append-system-prompt', agentInstructions('triage')],
    ['--model', MODEL],
    ['--tools', 'Read,Grep,Glob'],
    ['--strict-mcp-config', '--mcp-config', mcpConfig],
    ['--allowedTools', 'mcp__qa__analyze_ci_run,mcp__qa__find_known_bug,mcp__qa__list_ci_runs'],
    ['--permission-mode', 'dontAsk'],
    ['--max-turns', '25'],
    ['--max-budget-usd', '3'],
  ].flat(),
});

const VERDICTS = {
  green: 'green - nothing needs an owner action',
  'needs-attention': 'needs attention',
  infrastructure: 'infrastructure - the run broke before tests could report',
  inconclusive: 'inconclusive',
};

const runUrl = repoLink(`actions/runs/${runId}`);
const lines = [
  `## CI triage: run ${runUrl ? `[${runId}](${runUrl})` : runId}`,
  '',
  `**Verdict: ${VERDICTS[output.verdict]}.** ${output.summary}`,
  '',
  `Expected known-bug failures: ${String(output.expectedKnownBugFailures)}.`,
];
if (output.failures.length > 0) {
  lines.push('', '| Category | Tests | Evidence | Action |', '| --- | --- | --- | --- |');
  for (const failure of output.failures) {
    const category = failure.knownBugId
      ? `${failure.category} (${failure.knownBugId})`
      : failure.category;
    const tests = failure.tests.map((test) => `\`${cell(test)}\``).join('<br>');
    lines.push(
      `| ${cell(category)} | ${tests} | ${cell(failure.evidence)} | ${cell(failure.action)} |`,
    );
  }
}
lines.push(
  '',
  `<sub>Triage agent (${MODEL}), headless with read-only tools: ${String(meta.turns)} turns, ` +
    `$${meta.costUsd.toFixed(2)} estimated, ${String(Math.round(meta.durationMs / 1000))} s.</sub>`,
);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/triage.json`, `${JSON.stringify({ ...output, meta }, null, 2)}\n`);
writeFileSync(`${OUT_DIR}/triage.md`, `${lines.join('\n')}\n`);
console.log(lines.join('\n'));
