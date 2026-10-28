/**
 * Turn a Playwright JSON report into triage verdicts, and fetch reports and run lists from GitHub
 * Actions through the `gh` CLI. The classifier is pure (no I/O) so it can be reasoned about and
 * tested on a saved report; the `gh` wrappers are the only side effects.
 *
 * The key distinction the raw job log cannot make: a `knownBug()` test is expected to fail, so a
 * failing one is green and a passing one is probably a fixed bug. This reads each test's outcome
 * (`status`), its `expectedStatus`, and its `known-bug` annotation to tell those apart.
 */
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const ARTIFACT_NAME = 'playwright-report-json';

interface JsonResult {
  readonly status?: string;
  readonly error?: { readonly message?: string };
}

interface JsonAnnotation {
  readonly type: string;
  readonly description?: string;
}

interface JsonTest {
  readonly annotations?: readonly JsonAnnotation[];
  readonly expectedStatus?: string;
  readonly status?: string; // Outcome: 'expected' | 'unexpected' | 'flaky' | 'skipped'.
  readonly projectName?: string;
  readonly results?: readonly JsonResult[];
}

interface JsonSpec {
  readonly title: string;
  readonly file?: string;
  readonly line?: number;
  readonly tests?: readonly JsonTest[];
}

interface JsonSuite {
  readonly file?: string;
  readonly specs?: readonly JsonSpec[];
  readonly suites?: readonly JsonSuite[];
}

export interface PlaywrightJsonReport {
  readonly suites?: readonly JsonSuite[];
}

export interface FailureEntry {
  readonly test: string;
  readonly file: string;
  readonly line: number;
  readonly project: string;
  readonly message: string;
}

export interface KnownBugEntry {
  readonly id: string;
  readonly test: string;
  readonly file: string;
  readonly project: string;
}

export interface Classification {
  readonly counts: {
    readonly regressions: number;
    readonly flaky: number;
    readonly knownBugExpected: number;
    readonly knownBugFixedProbably: number;
    readonly knownBugExposed: number;
  };
  readonly regressions: FailureEntry[];
  readonly flaky: Omit<FailureEntry, 'message'>[];
  readonly knownBugFixedProbably: KnownBugEntry[];
  readonly knownBugExposed: KnownBugEntry[];
}

// ESC[...m colour codes; built from the escape char code so the source has no control character.
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

function cleanMessage(test: JsonTest, max = 500): string {
  const failed = test.results?.find((r) => r.status && r.status !== 'passed' && r.error?.message);
  const raw = failed?.error?.message ?? '';
  const text = raw.replace(ANSI, '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function knownBugId(test: JsonTest): string | undefined {
  const annotation = test.annotations?.find((a) => a.type === 'known-bug');
  return /\b(SD-\d+|DJ-\d+)\b/.exec(annotation?.description ?? '')?.[1];
}

function* walk(
  suites: readonly JsonSuite[] | undefined,
): Generator<{ spec: JsonSpec; test: JsonTest }> {
  for (const suite of suites ?? []) {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) yield { spec, test };
    }
    yield* walk(suite.suites);
  }
}

/**
 * Classify every test in a Playwright JSON report. Assumes the normal run mode (EXPOSE_KNOWN_BUGS
 * off), where a known-bug test carries `expectedStatus: "failed"`. The EXPOSE mode, where those
 * tests are surfaced as real failures, is reported separately as `knownBugExposed`.
 *
 * A known-bug test is unexpected when it passes, but also when it times out: its marker expects
 * "failed", not "timedOut". Only a pass suggests the bug is fixed; a timeout is a regression.
 */
export function classifyReport(report: PlaywrightJsonReport): Classification {
  const regressions: FailureEntry[] = [];
  const flaky: Omit<FailureEntry, 'message'>[] = [];
  const knownBugFixedProbably: KnownBugEntry[] = [];
  const knownBugExposed: KnownBugEntry[] = [];
  let knownBugExpected = 0;

  for (const { spec, test } of walk(report.suites)) {
    const id = knownBugId(test);
    const file = spec.file ?? '';
    const line = spec.line ?? 0;
    const project = test.projectName ?? '';
    const name = spec.title;

    if (test.status === 'flaky') {
      flaky.push({ test: name, file, line, project });
      continue;
    }
    if (id) {
      // A known-bug test: its expected outcome encodes whether the bug should still be failing.
      if (test.expectedStatus === 'failed') {
        const passed = test.results?.at(-1)?.status === 'passed';
        if (test.status === 'unexpected' && passed) {
          knownBugFixedProbably.push({ id, test: name, file, project }); // Passed; maybe fixed.
        } else if (test.status === 'unexpected') {
          regressions.push({ test: name, file, line, project, message: cleanMessage(test) });
        } else if (test.status === 'expected') {
          knownBugExpected += 1; // Still failing as designed; the suite is green.
        }
      } else if (test.status === 'unexpected') {
        knownBugExposed.push({ id, test: name, file, project }); // EXPOSE mode: failing for real.
      }
      continue;
    }
    if (test.status === 'unexpected') {
      regressions.push({ test: name, file, line, project, message: cleanMessage(test) });
    }
  }

  return {
    counts: {
      regressions: regressions.length,
      flaky: flaky.length,
      knownBugExpected,
      knownBugFixedProbably: knownBugFixedProbably.length,
      knownBugExposed: knownBugExposed.length,
    },
    regressions,
    flaky,
    knownBugFixedProbably,
    knownBugExposed,
  };
}

export interface CiRun {
  readonly id: number;
  readonly workflow: string;
  readonly title: string;
  readonly event: string;
  readonly branch: string;
  readonly status: string;
  readonly conclusion: string;
  readonly createdAt: string;
  readonly url: string;
}

export interface ListRunsOptions {
  readonly branch?: string;
  readonly event?: string;
  readonly status?: string;
  readonly limit?: number;
}

interface GhRun {
  readonly databaseId: number;
  readonly workflowName: string;
  readonly displayTitle: string;
  readonly event: string;
  readonly headBranch: string;
  readonly status: string;
  readonly conclusion: string;
  readonly createdAt: string;
  readonly url: string;
}

/** Thrown when `gh` is missing, unauthenticated, or the run/artifact does not exist. */
export class GhError extends Error {}

async function gh(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('gh', args, { maxBuffer: 64 * 1024 * 1024 });
    return stdout;
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr ?? '';
    const message = stderr.trim() || (error as Error).message;
    throw new GhError(message);
  }
}

export async function listRuns(options: ListRunsOptions): Promise<CiRun[]> {
  const args = [
    'run',
    'list',
    '--json',
    'databaseId,workflowName,displayTitle,event,headBranch,status,conclusion,createdAt,url',
    '--limit',
    String(options.limit ?? 10),
  ];
  if (options.branch) args.push('--branch', options.branch);
  if (options.event) args.push('--event', options.event);
  if (options.status) args.push('--status', options.status);
  const runs = JSON.parse(await gh(args)) as GhRun[];
  return runs.map((r) => ({
    id: r.databaseId,
    workflow: r.workflowName,
    title: r.displayTitle,
    event: r.event,
    branch: r.headBranch,
    status: r.status,
    conclusion: r.conclusion,
    createdAt: r.createdAt,
    url: r.url,
  }));
}

/** The URL of a run, for citing in a report summary. */
export async function runUrl(runId: number): Promise<string> {
  const json = JSON.parse(await gh(['run', 'view', String(runId), '--json', 'url'])) as {
    url: string;
  };
  return json.url;
}

/** Download the JSON report artifact for a run and parse it. Throws GhError if it is not there. */
export async function downloadReport(runId: number): Promise<PlaywrightJsonReport> {
  const dir = mkdtempSync(join(tmpdir(), 'qa-ci-'));
  await gh(['run', 'download', String(runId), '--name', ARTIFACT_NAME, '--dir', dir]);
  return JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8')) as PlaywrightJsonReport;
}

export function readReportFile(path: string): PlaywrightJsonReport {
  return JSON.parse(readFileSync(path, 'utf8')) as PlaywrightJsonReport;
}
