// Runs /write-test on every case in evals/write-test/config.json, each in an isolated checkout of
// HEAD without the specs that already cover the case's behaviour, and grades the checkout, not the
// report: lint, types and format; conventions ESLint cannot see; whether the new tests pass; and
// whether they fail once the behaviour breaks. A behaviour the app gets right is broken by running
// the new tests as the case's mutant persona, whose catalogued defect breaks it; one the app gets
// wrong, by EXPOSE_KNOWN_BUGS=true. New tests that stay green while the behaviour is broken are the
// critical error: a false green the suite would keep. Exits non-zero when the gate fails or a run
// never happened.
//
// Usage: npm run eval:write-test [-- --only <case-id-prefix>] [--repeat 1] [--concurrency 2] [--model <id>] [--naive]
//        npm run eval:write-test -- --simulate <reference|vacuous|nothing|weaken>  (tests the grader)
//        npm run eval:write-test -- --check  (cases apply to HEAD)
// Needs: `claude` signed in, the test credentials (.env or exported variables), installed browsers.
// --simulate needs no `claude`; --check needs none of them.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import ts from 'typescript';
import { runHeadless } from '../lib/claude-headless.mjs';
import { createCheckout } from './checkout.mjs';
import { pool } from './pool.mjs';
import {
  added,
  ASSERTION,
  assertionsChanged,
  catalogueIds,
  changedFiles,
  markers,
  snapshot,
  walkTests,
} from './spec-facts.mjs';

// Test runs need the credentials; load them as src/config/env.ts would, without copying .env.
if (existsSync('.env')) process.loadEnvFile('.env');

const OUT_DIR = 'eval-output';
const { values: options } = parseArgs({
  options: {
    only: { type: 'string' },
    repeat: { type: 'string', default: '1' },
    concurrency: { type: 'string', default: '2' },
    model: { type: 'string', default: 'claude-sonnet-5-5' },
    // A plain "write a test" prompt instead of /write-test: same model, tools and hook, no procedure.
    naive: { type: 'boolean', default: false },
    simulate: { type: 'string' },
    check: { type: 'boolean', default: false },
  },
});

const config = JSON.parse(readFileSync('evals/write-test/config.json', 'utf8'));
const cases = config.cases.filter((c) => !options.only || c.id.startsWith(options.only));
const stateOf = (c) => ({ stripKnownBugMarkers: false, edits: c.edits ?? [], remove: c.hold });
const message = (failure) => (failure instanceof Error ? failure.message : String(failure));

if (options.check) {
  for (const c of cases) {
    const checkout = createCheckout(c.id, stateOf(c));
    try {
      const catalogue = readFileSync(path.join(checkout.dir, 'src/data/known-bugs.ts'), 'utf8');
      const ids = catalogueIds(catalogue);
      if (c.knownBug && c.knownBug !== 'new' && !ids.has(c.knownBug)) {
        throw new Error(`Case "${c.id}": ${c.knownBug} is not in the catalogue`);
      }
      if (c.mutant && ![...ids.values()].includes(c.mutant.defect)) {
        throw new Error(`Case "${c.id}": the mutant's ${c.mutant.defect} is not in the catalogue`);
      }
    } finally {
      checkout.cleanup();
    }
  }
  console.log(`${String(cases.length)} write-test cases apply to HEAD`);
  process.exit(0);
}

// Playwright colours its error messages; the report keeps the text.
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
const firstLine = (text) => text.replace(ANSI, '').trim().split('\n')[0].slice(0, 200);

/** Runs Playwright's chromium project in a checkout and returns its JSON report. */
function playwright(dir, args, env = {}) {
  const reportFile = path.join(dir, 'grade-report.json');
  rmSync(reportFile, { force: true });
  const run = spawnSync(
    'npx',
    ['playwright', 'test', ...args, '--project=chromium', '--workers=1', '--reporter=json'],
    {
      cwd: dir,
      env: {
        ...process.env,
        EXPOSE_KNOWN_BUGS: 'false',
        ...env,
        PLAYWRIGHT_JSON_OUTPUT_FILE: reportFile,
      },
      encoding: 'utf8',
    },
  );
  if (!existsSync(reportFile))
    throw new Error(`Playwright wrote no report: ${firstLine(run.stderr)}`);
  return JSON.parse(readFileSync(reportFile, 'utf8'));
}

const keyOf = (spec, titles) => [...titles, spec.title].join(' > ');

/** The tests of the chromium project by title path, without the setup project's. */
function listTests(dir) {
  const report = playwright(dir, ['--list']);
  if (report.errors?.length) throw new Error(firstLine(report.errors[0].message ?? ''));
  return new Map(
    walkTests(report.suites)
      .filter(({ spec }) => !spec.file.startsWith('setup/'))
      .map(({ spec, titles }) => [
        keyOf(spec, titles),
        {
          file: `tests/${spec.file}`,
          title: [...titles.slice(1), spec.title].join(' > '),
          tags: spec.tags.map((tag) => `@${tag}`),
        },
      ]),
  );
}

function outcomeOf(test) {
  if (test.status === 'skipped') return 'not-run';
  if (test.status === 'flaky') return 'flaky';
  if (test.status === 'unexpected')
    return test.expectedStatus === 'failed' ? 'unexpected-pass' : 'failed';
  return test.expectedStatus === 'failed' ? 'expected-failure' : 'passed';
}
const GREEN = new Set(['passed', 'expected-failure']);

/** How each test of a run ended, with its first error; repeats that disagree make it flaky. */
function outcomes(report) {
  const byKey = new Map();
  for (const { spec, test, titles } of walkTests(report.suites)) {
    const key = keyOf(spec, titles);
    const outcome = outcomeOf(test);
    const previous = byKey.get(key);
    const error = test.results?.find((result) => result.error)?.error?.message;
    byKey.set(key, {
      outcome: previous && previous.outcome !== outcome ? 'flaky' : outcome,
      error: previous?.error ?? (error && firstLine(error)),
    });
  }
  return byKey;
}

const MUTANT_CONFIG = 'eval-mutant.config.ts';

/** Runs specs with every test project switched to the case's mutant persona. */
function mutantRun(dir, c, files) {
  const { persona, defect } = c.mutant;
  const source = [
    "import base from './playwright.config';",
    '',
    `// Every test project runs as ${persona}, whose ${defect} breaks the behaviour under test.`,
    'export default {',
    '  ...base,',
    '  projects: (base.projects ?? []).map((project) =>',
    `    project.name === 'setup' ? project : { ...project, use: { ...project.use, persona: '${persona}' } },`,
    '  ),',
    '};',
    '',
  ];
  writeFileSync(path.join(dir, MUTANT_CONFIG), source.join('\n'));
  // A spec that names its persona overrides the projects' option.
  for (const file of files) {
    const target = path.join(dir, file);
    const text = readFileSync(target, 'utf8');
    writeFileSync(target, text.replaceAll(`persona: '${c.persona}'`, `persona: '${persona}'`));
  }
  return playwright(dir, ['-c', MUTANT_CONFIG, ...files]);
}

const DATA_FILES = ['products', 'messages', 'users', 'sort-options', 'dynamic-catalog'].map(
  (name) => `src/data/${name}.ts`,
);

/** The strings and prices src/data holds, which specs import instead of repeating. */
function dataValues(files) {
  const strings = new Set();
  const keys = new Set();
  const prices = new Set();
  for (const file of DATA_FILES) {
    const source = ts.createSourceFile(file, files.get(file) ?? '', ts.ScriptTarget.Latest, true);
    const visit = (node) => {
      if (
        (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
        node.text.length >= 4
      )
        strings.add(node.text);
      if (ts.isPropertyAssignment(node)) {
        keys.add(node.name.getText(source));
        if (node.name.getText(source) === 'priceCents' && ts.isNumericLiteral(node.initializer))
          prices.add(Number(node.initializer.text));
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  // A string that is also a key of a data object ('nameAsc', 'problem') is a typed key that the
  // compiler checks, not a value the app shows.
  for (const key of keys) strings.delete(key);
  return { strings, prices };
}

const TITLED_CALL = /^test(\.(describe|step|fail|fixme|skip|slow|serial|parallel))*$/;

/**
 * What a spec file uses as values (strings and numbers, without imports, test titles and persona
 * names), how often it imports test or expect from @playwright/test, and how often it logs in.
 */
function specFacts(text) {
  const source = ts.createSourceFile('spec.ts', text, ts.ScriptTarget.Latest, true);
  const facts = { values: [], playwrightImports: 0, uiLogins: 0 };
  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      const names = node.importClause?.namedBindings;
      if (
        node.moduleSpecifier.getText(source).slice(1, -1) === '@playwright/test' &&
        !node.importClause?.isTypeOnly &&
        names &&
        ts.isNamedImports(names) &&
        names.elements.some(
          (e) => !e.isTypeOnly && ['test', 'expect'].includes((e.propertyName ?? e.name).text),
        )
      )
        facts.playwrightImports++;
      return;
    }
    if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'persona') return;
    if (ts.isCallExpression(node)) {
      if (TITLED_CALL.test(node.expression.getText(source))) {
        ts.forEachChild(node, (child) => {
          if (child !== node.arguments[0]) visit(child);
        });
        return;
      }
      if (
        ts.isPropertyAccessExpression(node.expression) &&
        ['login', 'loginAs'].includes(node.expression.name.text)
      )
        facts.uiLogins++;
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
      facts.values.push(node.text);
    else if (ts.isNumericLiteral(node)) facts.values.push(Number(node.text));
    ts.forEachChild(node, visit);
  };
  visit(source);
  return facts;
}

/** Why a value in a spec should come from typed data, or undefined when it may stay. */
function hardcoded(value, data) {
  if (typeof value === 'number') {
    const cents = Number.isInteger(value) ? value : Math.round(value * 100);
    return data.prices.has(cents) ? `the price ${String(value)}, which src/data holds` : undefined;
  }
  if (data.strings.has(value)) return `"${value}", which src/data holds`;
  const inside = [...data.strings].find((text) => text.length >= 8 && value.includes(text));
  if (inside) return `"${inside}", which src/data holds`;
  if (/\$?\b\d+\.\d{2}\b/.test(value)) return `the amount "${value}"`;
  if (/https?:\/\/|\.html\b/.test(value)) return `the address "${value}"`;
  return undefined;
}

/** Convention problems in the code a run added to specs. */
function conventions(before, after, specFiles) {
  const data = dataValues(before);
  const problems = [];
  for (const file of specFiles) {
    const was = specFacts(before.get(file) ?? '');
    const now = specFacts(after.get(file) ?? '');
    for (const value of added(was.values, now.values)) {
      const why = hardcoded(value, data);
      if (why) problems.push(`${file} hardcodes ${why}`);
    }
    if (now.playwrightImports > was.playwrightImports)
      problems.push(`${file} imports test or expect from @playwright/test, not @fixtures`);
    if (now.uiLogins > was.uiLogins)
      problems.push(`${file} logs in through the UI instead of using the persona fixture`);
  }
  return problems;
}

/** Runs a project command in a checkout; `ok` when it exits 0. */
function command(dir, args) {
  if (args.length === 0) return { ok: true };
  const run = spawnSync('npx', args, { cwd: dir, encoding: 'utf8' });
  return { ok: run.status === 0, output: `${run.stdout}${run.stderr}`.trim().slice(0, 1500) };
}

/** Everything the verdict needs, read from the checkout after the run. */
function grade(c, dir, before, after, changed, listedBefore) {
  let listedAfter = new Map();
  let listError;
  try {
    listedAfter = listTests(dir);
  } catch (failure) {
    listError = message(failure);
  }
  const newTests = [...listedAfter]
    .filter(([key]) => !listedBefore.has(key))
    .map(([key, test]) => ({ key, ...test }));
  const removedTests = listError
    ? []
    : [...listedBefore].filter(([key]) => !listedAfter.has(key)).map(([, test]) => test.title);

  const specFiles = changed.filter((file) => file.startsWith('tests/'));
  const existing = specFiles.filter((file) => before.has(file));
  const present = changed.filter((file) => after.has(file));
  const catalogue = (files) => catalogueIds(files.get('src/data/known-bugs.ts') ?? '');
  const idsBefore = catalogue(before);
  const idsAfter = catalogue(after);
  const markersIn = (files, file) => markers(files.get(file) ?? '');
  const markersAdded = specFiles.flatMap((file) =>
    added(markersIn(before, file), markersIn(after, file)).map((key) => ({
      file,
      key,
      id: idsAfter.get(key),
    })),
  );
  const runFiles = [...new Set(newTests.map((test) => test.file))];

  // Static checks first: the challenge run below rewrites the specs it runs.
  const facts = {
    changed,
    listError,
    removedTests,
    assertionsChanged: existing.some((file) =>
      assertionsChanged(before.get(file) ?? '', after.get(file) ?? ''),
    ),
    markersAdded,
    markersRemoved: existing.flatMap((file) =>
      added(markersIn(after, file), markersIn(before, file)),
    ),
    // A marker in a spec that gained no test went onto a test that was already there.
    markedExisting: [
      ...new Set(markersAdded.map((m) => m.file).filter((file) => !runFiles.includes(file))),
    ],
    entriesAdded: [...idsAfter]
      .filter(([key]) => !idsBefore.has(key))
      .map(([key, id]) => ({ key, id, fresh: ![...idsBefore.values()].includes(id) })),
    entriesChanged: [...idsBefore].filter(([key, id]) => idsAfter.get(key) !== id).map(([k]) => k),
    appModelChanged: changed.includes('docs/app-exploration.md'),
    lint: command(
      dir,
      present.some((f) => f.endsWith('.ts'))
        ? ['eslint', '--max-warnings=0', ...present.filter((f) => f.endsWith('.ts'))]
        : [],
    ),
    typecheck: command(dir, ['tsc', '--noEmit']),
    format: command(dir, present.length > 0 ? ['prettier', '--check', ...present] : []),
    conventions: conventions(before, after, specFiles),
  };

  let normal = new Map();
  let challenge = new Map();
  if (runFiles.length > 0) {
    normal = outcomes(playwright(dir, [...runFiles, '--repeat-each=2']));
    challenge = outcomes(
      c.mutant
        ? mutantRun(dir, c, runFiles)
        : playwright(dir, runFiles, { EXPOSE_KNOWN_BUGS: 'true' }),
    );
  }
  facts.tests = newTests.map((test) => ({
    file: test.file,
    title: test.title,
    tags: test.tags,
    normal: normal.get(test.key)?.outcome ?? 'not-run',
    normalError: normal.get(test.key)?.error,
    challenge: challenge.get(test.key)?.outcome ?? 'not-run',
    challengeError: challenge.get(test.key)?.error,
  }));
  return facts;
}

/** correct, wrong, or critical (a false green, or a weaker suite), with the reasons. */
function judge(c, f) {
  const critical = [];
  const issues = [];
  if (f.removedTests.length > 0)
    critical.push(`removes existing tests: ${f.removedTests.join('; ')}`);
  if (f.assertionsChanged) critical.push('changes assertions of existing specs');
  if (f.markersRemoved.length > 0)
    critical.push(`removes knownBug markers: ${f.markersRemoved.join(', ')}`);
  if (f.markedExisting.length > 0)
    critical.push(`marks existing tests as known bugs in ${f.markedExisting.join(', ')}`);
  const green = f.tests.length > 0 && f.tests.every((test) => GREEN.has(test.normal));
  const caught = f.tests.some((test) => test.challenge === 'failed');
  if (green && !caught) {
    critical.push(
      c.mutant
        ? `every new test passes as ${c.mutant.persona}_user, whose ${c.mutant.defect} breaks the behaviour`
        : 'every new test passes with EXPOSE_KNOWN_BUGS=true: none asserts the correct behaviour',
    );
  }

  if (f.listError) issues.push(`the suite does not load: ${f.listError}`);
  else if (f.tests.length === 0) issues.push('adds no test');
  for (const test of f.tests.filter((t) => !GREEN.has(t.normal)))
    issues.push(
      `"${test.title}" is ${test.normal} on a normal run${test.normalError ? `: ${test.normalError}` : ''}`,
    );
  for (const check of ['lint', 'typecheck', 'format'])
    if (!f[check].ok) issues.push(`${check} fails`);
  issues.push(...f.conventions);
  for (const test of f.tests) {
    if (!test.file.startsWith(`${c.folder}/`))
      issues.push(`"${test.title}" is outside ${c.folder}`);
    // @smoke may sit on top of any suite tag: it marks a critical path for the PR gate.
    if (!test.tags.includes(c.tag) || test.tags.some((tag) => tag !== c.tag && tag !== '@smoke'))
      issues.push(`"${test.title}" is tagged ${test.tags.join(' ') || 'nothing'}, not ${c.tag}`);
  }

  // A marker on a test of a working behaviour needs no rule of its own: the test then passes
  // against its expected failure, and the normal run reports it as unexpected.
  const keys = f.markersAdded.map((m) => m.key);
  if (c.knownBug === 'new') {
    const fresh = f.entriesAdded.filter((e) => e.fresh && /^SD-\d{3}$/.test(e.id));
    if (fresh.length === 0) issues.push('does not catalogue the defect under a new SD id');
    else if (!keys.some((key) => fresh.some((e) => e.key === key)))
      issues.push('no new test is marked with the new catalogue entry');
  } else if (c.knownBug && !keys.includes(c.knownBug)) {
    issues.push(`no new test is marked knownBug(KNOWN_BUGS.${c.knownBug})`);
  }
  if (c.knownBug !== 'new' && f.entriesAdded.length > 0)
    issues.push(`adds catalogue entries: ${f.entriesAdded.map((e) => e.id).join(', ')}`);
  if (f.entriesChanged.length > 0)
    issues.push(`changes or removes catalogue entries: ${f.entriesChanged.join(', ')}`);

  const verdict = critical.length > 0 ? 'critical' : issues.length > 0 ? 'wrong' : 'correct';
  return { verdict, reasons: [...critical, ...issues] };
}

const fromHead = (file) => execFileSync('git', ['show', `HEAD:${file}`], { encoding: 'utf8' });

/**
 * Scripted runs that test the grader without model calls: restore the held-out specs (the
 * reference, written by a person), add a test that cannot fail, change nothing, or restore the
 * reference and weaken an assertion elsewhere.
 */
function simulate(behaviour, c, dir) {
  const write = (file, text) => {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), text);
  };
  const reference = () => {
    for (const file of [...c.hold, ...(c.edits ?? []).map((e) => e.file)])
      write(file, fromHead(file));
  };
  if (behaviour === 'reference') reference();
  else if (behaviour === 'weaken') {
    reference();
    const file = 'tests/e2e/cart.spec.ts';
    const lines = readFileSync(path.join(dir, file), 'utf8').split('\n');
    const index = lines.findIndex((line) => ASSERTION.test(line));
    lines[index] = `${lines[index]} // weakened`;
    write(file, lines.join('\n'));
  } else if (behaviour === 'vacuous') {
    // Proves only that the inventory loaded, so it passes whether or not the behaviour works.
    const persona =
      c.persona === 'standard' ? [] : [`  test.use({ persona: '${c.persona}' });`, ''];
    write(
      `${c.folder}/eval-vacuous.spec.ts`,
      [
        "import { test } from '@fixtures';",
        '',
        `test.describe('Vacuous', { tag: '${c.tag}' }, () => {`,
        ...persona,
        "  test('opens the inventory', async ({ inventoryPage }) => {",
        '    await inventoryPage.goto();',
        '    await inventoryPage.expectLoaded();',
        '  });',
        '});',
        '',
      ].join('\n'),
    );
  } else if (behaviour !== 'nothing') throw new Error(`Unknown --simulate behaviour: ${behaviour}`);
}

function prompt(c) {
  if (!options.naive) return `/write-test ${c.behaviour}`;
  return (
    `Write a Playwright test for this behaviour: ${c.behaviour} Put it in the right place ` +
    'under tests/, make sure it passes, and report what you added.'
  );
}

async function runJob({ c, run }) {
  const checkout = createCheckout(c.id, stateOf(c));
  const { dir } = checkout;
  try {
    const before = snapshot(dir);
    const listedBefore = listTests(dir);
    let report;
    let meta;
    let error;
    try {
      if (options.simulate) {
        simulate(options.simulate, c, dir);
        report = { outcome: 'written', summary: `simulated: ${options.simulate}` };
      } else
        ({ output: report, meta } = await runHeadless({
          prompt: prompt(c),
          schemaFile: 'scripts/schemas/write-test-report.schema.json',
          cwd: dir,
          env: { ...process.env, CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' },
          args: [
            ['--model', options.model],
            [
              '--append-system-prompt',
              'Another agent may be running tests on this machine: pass --workers=1 to every Playwright run.',
            ],
            ['--strict-mcp-config'],
            ['--permission-mode', 'dontAsk'],
            [
              '--allowedTools',
              'Read,Grep,Glob,Edit,Write,Bash(npm run *),Bash(EXPOSE_KNOWN_BUGS=true npm run *)',
            ],
            ['--max-turns', '50'],
            ['--max-budget-usd', '3'],
          ].flat(),
        }));
    } catch (failure) {
      error = message(failure);
    }
    const after = snapshot(dir);
    const changed = changedFiles(before, after);
    if (error && changed.length === 0) {
      console.error(`no-run   ${c.id} #${String(run + 1)}: ${error}`);
      return { id: c.id, run, verdict: 'no-run', error };
    }
    const facts = grade(c, dir, before, after, changed, listedBefore);
    const { verdict, reasons } = judge(c, facts);
    console.error(
      `${verdict.padEnd(8)} ${c.id} #${String(run + 1)}: ${reasons.join('; ') || `${String(facts.tests.length)} new tests`}`,
    );
    const files = Object.fromEntries(changed.map((file) => [file, after.get(file) ?? null]));
    return { id: c.id, run, verdict, reasons, report, meta, error, ...facts, files };
  } finally {
    checkout.cleanup();
  }
}

const repeat = Number(options.repeat);
const jobs = cases.flatMap((c) => Array.from({ length: repeat }, (_, run) => ({ c, run })));
const results = await pool(jobs, Number(options.concurrency), runJob);

const count = (verdict) => results.filter((r) => r.verdict === verdict).length;
const critical = count('critical');
const noRun = count('no-run');
const { gate } = config;
const passed =
  critical <= gate.maxCriticalErrors &&
  count('correct') / Math.max(results.length - noRun, 1) >= gate.minCorrect;
const verdictText = noRun > 0 ? 'INCONCLUSIVE' : passed ? 'PASS' : 'FAIL';
const cost = results.reduce((sum, r) => sum + (r.meta?.costUsd ?? 0), 0);
const tally = (values) =>
  [...new Set(values)]
    .map((v) => `${String(values.filter((x) => x === v).length)} ${v}`)
    .join(', ');
const subject = options.simulate
  ? `none (simulated: ${options.simulate})`
  : `${options.model}, ${options.naive ? 'naive "write a test" prompt instead of /write-test' : '/write-test'}`;

const lines = [
  `## Write-test eval: ${String(cases.length)} cases x ${String(repeat)}`,
  '',
  `**Gate: ${verdictText}** (critical errors <= ${String(gate.maxCriticalErrors)}, correct >= ${String(100 * gate.minCorrect)}%). Model ${subject}.`,
  '',
  `Correct: ${String(count('correct'))}/${String(results.length - noRun)}. Critical (new tests that stay green when the behaviour breaks, or a weaker suite): ${String(critical)}. ` +
    `No run: ${String(noRun)}. Estimated cost: $${cost.toFixed(2)}.`,
  '',
  '| Case | Run | Verdict | New tests | Normal run | Fail when broken | Markers added | Turns | Cost |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ...results.map((r) =>
    r.verdict === 'no-run'
      ? `| ${r.id} | ${String(r.run + 1)} | no run: ${r.error.slice(0, 80)} | | | | | | |`
      : `| ${r.id} | ${String(r.run + 1)} | ${r.verdict} | ${String(r.tests.length)} | ${tally(r.tests.map((t) => t.normal)) || '-'} | ` +
        `${String(r.tests.filter((t) => t.challenge === 'failed').length)}/${String(r.tests.length)} | ` +
        `${r.markersAdded.map((m) => m.id ?? m.key).join(', ') || '-'} | ${String(r.meta?.turns ?? '-')} | ${r.meta ? `$${r.meta.costUsd.toFixed(2)}` : '-'} |`,
  ),
];

const graded = results.filter((r) => r.verdict !== 'no-run');
const flawed = graded.filter((r) => r.verdict !== 'correct');
if (flawed.length > 0) {
  lines.push('', '### Why runs are not correct', '');
  for (const r of flawed)
    lines.push(`- ${r.id} #${String(r.run + 1)}, ${r.verdict}: ${r.reasons.join('; ')}`);
}
// What each new test did when the behaviour broke, for a person to check that it failed for the
// right reason, and not on an unrelated step.
lines.push('', '### New tests when the behaviour breaks', '');
for (const r of graded) {
  for (const t of r.tests) {
    lines.push(
      `- ${r.id} #${String(r.run + 1)}, \`${t.file}\` "${t.title}": ${t.challenge}${t.challengeError ? `: ${t.challengeError}` : ''}`,
    );
  }
}

mkdirSync(OUT_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
writeFileSync(
  `${OUT_DIR}/write-test-${stamp}.json`,
  `${JSON.stringify({ verdict: verdictText, model: options.model, naive: options.naive, results }, null, 2)}\n`,
);
writeFileSync(`${OUT_DIR}/write-test-latest.md`, `${lines.join('\n')}\n`);
console.log(lines.join('\n'));
process.exit(verdictText === 'PASS' ? 0 : 1);
