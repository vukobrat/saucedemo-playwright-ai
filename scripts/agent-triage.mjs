// Triages one run of the CI workflow with the triage agent, headless, and writes a schema-validated
// report: agent-output/triage.json (data) and agent-output/triage.md (for people). The agent gets
// read-only tools and the qa MCP server; it runs no tests, edits nothing and posts nothing.
//
// Usage: npm run agent:triage -- <run-id>
// Needs: `claude` on PATH and signed in (CLAUDE_CODE_OAUTH_TOKEN in CI), and `gh` signed in with
// read access to Actions (GH_TOKEN in CI), which the qa server uses to download the run's report.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cell, repoLink, runHeadless } from './lib/claude-headless.mjs';
import {
  TRIAGE_MODEL,
  TRIAGE_REPORT_SCHEMA,
  triageRunArgs,
  triageRunPrompt,
} from './lib/triage-run.mjs';

const runId = process.argv[2];
if (!/^\d+$/.test(runId ?? '')) {
  console.error('Usage: npm run agent:triage -- <run-id>');
  process.exit(2);
}

const OUT_DIR = 'agent-output';
const MAX_TESTS_SHOWN = 8;

// The qa server is defined once, in .mcp.json.
const { mcpServers } = JSON.parse(readFileSync('.mcp.json', 'utf8'));

const { output, meta } = await runHeadless({
  prompt: triageRunPrompt(runId),
  schemaFile: TRIAGE_REPORT_SCHEMA,
  args: triageRunArgs({ qaServer: mcpServers.qa }),
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
    // A mass failure lists every test; the summary shows the first few, triage.json has them all.
    const shown = failure.tests.slice(0, MAX_TESTS_SHOWN).map((test) => `\`${cell(test)}\``);
    const more = failure.tests.length - shown.length;
    if (more > 0) {
      shown.push(`and ${String(more)} more (all in triage.json, artifact triage-report)`);
    }
    const tests = shown.join('<br>');
    lines.push(
      `| ${cell(category)} | ${tests} | ${cell(failure.evidence)} | ${cell(failure.action)} |`,
    );
  }
}
lines.push(
  '',
  `<sub>Triage agent (${TRIAGE_MODEL}), headless with read-only tools: ${String(meta.turns)} turns, ` +
    `$${meta.costUsd.toFixed(2)} estimated, ${String(Math.round(meta.durationMs / 1000))} s.</sub>`,
);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/triage.json`, `${JSON.stringify({ ...output, meta }, null, 2)}\n`);
writeFileSync(`${OUT_DIR}/triage.md`, `${lines.join('\n')}\n`);
console.log(lines.join('\n'));
