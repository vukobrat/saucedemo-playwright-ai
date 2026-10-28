// Reviews the page objects and components a pull request changes with the locator-reviewer agent,
// headless, and writes agent-output/review.json (data) and agent-output/review.md (the comment).
// The agent reads files only and gets no GitHub token; posting the comment is the workflow's job.
//
// Usage: npm run agent:review -- <pr-number>
// Needs: `claude` on PATH and signed in (CLAUDE_CODE_OAUTH_TOKEN in CI), and `gh` signed in with
// read access to pull requests (GH_TOKEN in CI), used here only to list the changed files.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { runHeadless } from './lib/claude-headless.mjs';
import { REVIEW_SCHEMA, reviewArgs, reviewPrompt } from './lib/review-run.mjs';

const pr = process.argv[2];
if (!/^\d+$/.test(pr ?? '')) {
  console.error('Usage: npm run agent:review -- <pr-number>');
  process.exit(2);
}

const OUT_DIR = 'agent-output';
// Marks the comment, so a re-run edits it instead of adding another.
const MARKER = '<!-- locator-review -->';

const changed = execFileSync('gh', ['pr', 'diff', pr, '--name-only'], { encoding: 'utf8' })
  .split('\n')
  .filter((file) => /^src\/(pages|components)\/.+\.ts$/.test(file) && existsSync(file));

let review;
let meta;
if (changed.length === 0) {
  review = {
    verdict: 'clean',
    summary:
      'No page objects or components changed in this pull request, so there is nothing to review.',
    findings: [],
  };
} else {
  // The agent process gets no GitHub token: it only reads the checked-out files.
  const env = { ...process.env };
  delete env.GH_TOKEN;
  delete env.GITHUB_TOKEN;

  ({ output: review, meta } = await runHeadless({
    prompt: reviewPrompt(pr, changed),
    schemaFile: REVIEW_SCHEMA,
    env,
    args: reviewArgs(),
  }));
}

const ORDER = ['must-fix', 'should-fix', 'judgment'];
const findings = [...review.findings].sort(
  (a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity),
);
const lines = [MARKER, '### Locator review', '', review.summary];
if (findings.length > 0) {
  lines.push('');
  for (const finding of findings) {
    lines.push(
      `- **${finding.severity}** \`${finding.file}:${String(finding.line)}\` (${finding.rule}): ` +
        finding.message +
        (finding.suggestion ? ` Suggested: ${finding.suggestion}` : ''),
    );
  }
}
lines.push(
  '',
  meta
    ? `<sub>locator-reviewer agent, headless with read-only tools: ${String(meta.turns)} turns, ` +
        `$${meta.costUsd.toFixed(2)} estimated. Files reviewed: ${changed.join(', ')}.</sub>`
    : '<sub>locator-reviewer agent was not started: no files in scope.</sub>',
);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/review.json`, `${JSON.stringify({ ...review, meta }, null, 2)}\n`);
writeFileSync(`${OUT_DIR}/review.md`, `${lines.join('\n')}\n`);
console.log(lines.join('\n'));
