// Runs the triage agent on every case in evals/triage/golden.json and grades it: category and
// known-bug id deterministically, the evidence optionally with an LLM judge (reported, never
// gated). Each state's cases run in an isolated checkout of that state, with auto memory off and
// the CI triage's instructions, model and tools (scripts/agent-triage.mjs). Exits non-zero when
// the gate in evals/triage/config.json fails.
//
// Usage: npm run eval:triage [-- --repeat 3] [--only <case-id-prefix>] [--judge] [--concurrency 3]
//          [--instructions <file>]   (evaluate other instructions, e.g. a mutant the gate must fail)
//        npm run eval:triage:check   (no model calls: every state still applies to HEAD)
// Needs: `claude` signed in. No browsers: the agent reads the failure and the code, it runs nothing.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { agentInstructions, runHeadless } from '../lib/claude-headless.mjs';
import { createCheckout, loadConfig } from './checkout.mjs';

const MODEL = 'claude-sonnet-5-5'; // the CI triage model
const JUDGE_MODEL = 'claude-haiku-5-5';
const OUT_DIR = 'eval-output';
const PRODUCT_BUGS = new Set(['known-product-bug', 'new-product-bug']);
const CATEGORIES = ['known-product-bug', 'new-product-bug', 'test-bug', 'environment', 'flaky'];

const { values: options } = parseArgs({
  options: {
    repeat: { type: 'string', default: '1' },
    only: { type: 'string' },
    judge: { type: 'boolean', default: false },
    concurrency: { type: 'string', default: '3' },
    check: { type: 'boolean', default: false },
    instructions: { type: 'string' },
    model: { type: 'string', default: MODEL },
    'no-tools': { type: 'boolean', default: false },
  },
});
const repeats = Number(options.repeat);
const concurrency = Number(options.concurrency);

const config = loadConfig();
const golden = JSON.parse(readFileSync('evals/triage/golden.json', 'utf8'));

if (options.check) {
  // A code change can make a state's edit stop matching; catch it in the PR that caused it.
  const missing = golden.cases.filter((c) => !(c.state in config.states)).map((c) => c.id);
  if (missing.length > 0) throw new Error(`Cases with an unknown state: ${missing.join(', ')}`);
  for (const [name, state] of Object.entries(config.states)) createCheckout(name, state).cleanup();
  console.log(
    `${String(Object.keys(config.states).length)} eval states apply to HEAD; ` +
      `${String(golden.cases.length)} cases`,
  );
  process.exit(0);
}
const cases = golden.cases.filter((c) => !options.only || c.id.startsWith(options.only));
const instructions = options.instructions
  ? readFileSync(options.instructions, 'utf8')
  : agentInstructions('triage');

function prompt(c) {
  const { test, file, line, project, message } = c.input;
  return [
    'A CI run of this repository (normal mode: knownBug() markers active) reported this',
    'regression, an unexpected failure in a test without a knownBug() marker:',
    `Test: ${test}. File: ${file}:${String(line)}. Project: ${project}. Error: ${message}`,
    'Classify this one failure. Read the spec, page objects, data and docs/app-exploration.md as',
    'needed, and check the catalogue with find_known_bug. You cannot run tests or see other',
    'failures. Return the classification in the required shape.',
  ].join('\n');
}

async function triage(c, dir) {
  const mcpServers = JSON.parse(readFileSync(`${dir}/.mcp.json`, 'utf8')).mcpServers;
  return runHeadless({
    prompt: prompt(c),
    schemaFile: 'scripts/schemas/triage-case.schema.json',
    cwd: dir,
    env: { ...process.env, CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' },
    args: [
      ['--append-system-prompt', instructions],
      ['--model', options.model],
      // --no-tools: the failure message alone, no code, no catalogue (a variant the gate must fail).
      options['no-tools']
        ? ['--tools', '', '--strict-mcp-config']
        : [
            ['--tools', 'Read,Grep,Glob'],
            [
              '--strict-mcp-config',
              '--mcp-config',
              JSON.stringify({ mcpServers: { qa: mcpServers.qa } }),
            ],
            ['--allowedTools', 'mcp__qa__find_known_bug'],
          ].flat(),
      ['--permission-mode', 'dontAsk'],
      ['--max-turns', '15'],
      ['--max-budget-usd', '1'],
    ].flat(),
  });
}

async function judge(c, evidence) {
  const { output } = await runHeadless({
    prompt: [
      'A triage agent explained why a test failed. A person wrote down the fact that decides the',
      `case: "${c.decidingFact}". The agent's evidence: "${evidence}".`,
      'Does the evidence state that fact, or an equivalent one? Return pass and a one-sentence reason.',
    ].join('\n'),
    schemaFile: 'scripts/schemas/eval-judge.schema.json',
    args: [
      ['--model', JUDGE_MODEL],
      ['--tools', ''],
      ['--strict-mcp-config'],
      ['--setting-sources', 'user'],
      ['--permission-mode', 'dontAsk'],
      ['--max-turns', '2'],
    ].flat(),
  });
  return output;
}

function grade(c, answer) {
  const label = c.label;
  return {
    categoryCorrect: answer?.category === label.category,
    knownBugIdCorrect: label.knownBugId ? answer?.knownBugId === label.knownBugId : undefined,
    // The costly mistake: a real app defect called a test bug invites "fixing" a correct test.
    critical: PRODUCT_BUGS.has(label.category) && answer?.category === 'test-bug',
  };
}

/** Runs tasks with at most `limit` in flight. */
async function pool(items, limit, work) {
  const results = new Array(items.length);
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
}

const results = [];
for (const stateName of [...new Set(cases.map((c) => c.state))]) {
  const checkout = createCheckout(stateName, config.states[stateName]);
  try {
    const jobs = cases
      .filter((c) => c.state === stateName)
      .flatMap((c) => Array.from({ length: repeats }, (_, repeat) => ({ c, repeat })));
    results.push(
      ...(await pool(jobs, concurrency, async ({ c, repeat }) => {
        let answer;
        let meta;
        let error;
        try {
          ({ output: answer, meta } = await triage(c, checkout.dir));
        } catch (failure) {
          error = failure instanceof Error ? failure.message : String(failure);
        }
        const verdict = options.judge && answer ? await judge(c, answer.evidence) : undefined;
        const graded = grade(c, answer);
        const mark = graded.categoryCorrect && graded.knownBugIdCorrect !== false ? 'ok  ' : 'MISS';
        console.error(`${mark} ${c.id} #${String(repeat + 1)}: ${answer?.category ?? error}`);
        return { id: c.id, repeat, label: c.label, answer, error, meta, verdict, ...graded };
      })),
    );
  } finally {
    checkout.cleanup();
  }
}

// Metrics per repeat; the gate must hold in every repeat.
const percent = (n, d) =>
  d === 0 ? 'n/a' : `${String(n)}/${String(d)} (${String(Math.round((100 * n) / d))}%)`;
const perRepeat = Array.from({ length: repeats }, (_, repeat) => {
  const rows = results.filter((r) => r.repeat === repeat);
  const withId = rows.filter((r) => r.knownBugIdCorrect !== undefined);
  return {
    total: rows.length,
    categoryCorrect: rows.filter((r) => r.categoryCorrect).length,
    idTotal: withId.length,
    idCorrect: withId.filter((r) => r.knownBugIdCorrect).length,
    critical: rows.filter((r) => r.critical).length,
    costUsd: rows.reduce((sum, r) => sum + (r.meta?.costUsd ?? 0), 0),
    judged: rows.filter((r) => r.verdict).length,
    judgePassed: rows.filter((r) => r.verdict?.pass).length,
  };
});
const { gate } = config;
const passed = perRepeat.every(
  (m) =>
    m.categoryCorrect / m.total >= gate.minCategoryAccuracy &&
    (m.idTotal === 0 || m.idCorrect / m.idTotal >= gate.minKnownBugIdAccuracy) &&
    m.critical <= gate.maxCriticalErrors,
);

const lines = [
  `## Triage eval: ${String(cases.length)} cases x ${String(repeats)} repeat(s)`,
  '',
  `**Gate: ${passed ? 'PASS' : 'FAIL'}** (category accuracy >= ${String(100 * gate.minCategoryAccuracy)}%, ` +
    `known-bug id accuracy >= ${String(100 * gate.minKnownBugIdAccuracy)}%, ` +
    `critical errors <= ${String(gate.maxCriticalErrors)}, in every repeat). Model ${options.model}` +
    (options['no-tools'] ? ', no tools' : '') +
    (options.instructions ? `, instructions ${options.instructions}` : '') +
    `, golden set built from ${golden.builtFrom}.`,
  '',
  `| Metric | ${perRepeat.map((_, i) => `Repeat ${String(i + 1)}`).join(' | ')} |`,
  `| --- | ${perRepeat.map(() => '---').join(' | ')} |`,
  `| Category accuracy | ${perRepeat.map((m) => percent(m.categoryCorrect, m.total)).join(' | ')} |`,
  `| Known-bug id accuracy | ${perRepeat.map((m) => percent(m.idCorrect, m.idTotal)).join(' | ')} |`,
  `| Critical errors (product bug called test bug) | ${perRepeat.map((m) => String(m.critical)).join(' | ')} |`,
  `| Evidence judged adequate (${JUDGE_MODEL}) | ${perRepeat.map((m) => (m.judged ? percent(m.judgePassed, m.judged) : 'not run')).join(' | ')} |`,
  `| Estimated cost | ${perRepeat.map((m) => `$${m.costUsd.toFixed(2)}`).join(' | ')} |`,
  '',
  '| Label \\ answer | ' + [...CATEGORIES, 'no answer'].join(' | ') + ' |',
  '| --- | ' + [...CATEGORIES, 'no answer'].map(() => '---').join(' | ') + ' |',
  ...CATEGORIES.filter((label) => results.some((r) => r.label.category === label)).map((label) => {
    const row = results.filter((r) => r.label.category === label);
    const counts = [...CATEGORIES, undefined].map((answer) =>
      String(row.filter((r) => r.answer?.category === answer).length),
    );
    return `| ${label} | ${counts.join(' | ')} |`;
  }),
];
const misses = results.filter((r) => !r.categoryCorrect || r.knownBugIdCorrect === false);
if (misses.length > 0) {
  lines.push('', '| Missed case | Label | Answer | Evidence |', '| --- | --- | --- | --- |');
  for (const miss of misses) {
    const label = [miss.label.category, miss.label.knownBugId].filter(Boolean).join(' ');
    const answer = miss.answer
      ? [miss.answer.category, miss.answer.knownBugId].filter(Boolean).join(' ')
      : `no answer: ${miss.error ?? ''}`;
    const evidence = (miss.answer?.evidence ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ');
    lines.push(`| ${miss.id} #${String(miss.repeat + 1)} | ${label} | ${answer} | ${evidence} |`);
  }
}

mkdirSync(OUT_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
writeFileSync(
  `${OUT_DIR}/triage-${stamp}.json`,
  `${JSON.stringify({ perRepeat, passed, results }, null, 2)}\n`,
);
writeFileSync(`${OUT_DIR}/triage-latest.md`, `${lines.join('\n')}\n`);
console.log(lines.join('\n'));
process.exit(passed ? 0 : 1);
