/**
 * The `qa` MCP server: read-only tools that answer "is this failure a known bug?" and "what did a
 * CI run actually do?" for this repo. Consumers are the maintainer in chat, the triage subagent
 * (Module 4), the nightly CI triage (Module 9) and the whole-run triage eval.
 *
 * It is launched over stdio (see `.mcp.json`), so stdout carries only the protocol: this file
 * never writes to stdout. GitHub access is through the ambient `gh` login; no token is read into
 * a result. Report text and error messages are treated as untrusted data.
 *
 * `--reports-dir <dir>` answers `analyze_ci_run` for a run id from a saved report,
 * `<dir>/<runId>.json`, instead of downloading it: the eval replays real runs that way, through the
 * same prompt and tool calls as CI.
 */
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import {
  classifyReport,
  downloadReport,
  GhError,
  listRuns,
  readReportFile,
  runUrl,
  type KnownBugEntry,
} from './ci-report';
import { catalogueEntries, searchBugs } from './known-bugs-index';

const AREA_VALUES = [
  'general',
  'problem_user',
  'error_user',
  'performance_glitch_user',
  'visual_user',
  'accessibility',
  'api',
] as const;

const EVENT_VALUES = ['push', 'pull_request', 'schedule', 'workflow_dispatch'] as const;
const STATUS_VALUES = ['queued', 'in_progress', 'completed'] as const;

/** JSON text result plus the human-readable summary, the standard successful shape here. */
function result(summary: string, structured: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text: summary }],
    structuredContent: structured,
  };
}

function errorResult(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}

function summariesById(): Map<string, string> {
  return new Map(catalogueEntries().map((entry) => [entry.id, entry.summary]));
}

function withSummary(entries: KnownBugEntry[], summaries: Map<string, string>) {
  return entries.map((entry) => ({ ...entry, summary: summaries.get(entry.id) ?? '' }));
}

export interface ServerOptions {
  /** Directory of saved reports named `<runId>.json`, read instead of downloading a run's. */
  readonly reportsDir?: string | undefined;
}

export function buildServer({ reportsDir }: ServerOptions = {}): McpServer {
  const server = new McpServer({ name: 'qa', version: '0.1.0' });

  server.registerTool(
    'find_known_bug',
    {
      description:
        'Look up known SauceDemo (SD-xxx) and DummyJSON (DJ-xxx) defects by id, persona, or free ' +
        'text, to decide whether a failing test is an expected known bug. Returns each entry with ' +
        'the specs whose knownBug() marker references it. No argument returns the whole catalogue.',
      inputSchema: z.object({
        id: z.string().optional().describe('Exact id, e.g. "SD-102" (case-insensitive).'),
        persona: z.enum(AREA_VALUES).optional().describe('Restrict to one persona or area.'),
        query: z.string().optional().describe('Substring matched against id and summary.'),
        limit: z.number().int().positive().max(100).default(20),
      }),
      annotations: { readOnlyHint: true },
    },
    ({ id, persona, query, limit }) => {
      const matches = searchBugs({
        ...(id !== undefined ? { id } : {}),
        ...(persona !== undefined ? { persona } : {}),
        ...(query !== undefined ? { query } : {}),
      });
      const bugs = matches.slice(0, limit);
      const summary =
        bugs.length === 0
          ? 'No matching known bug.'
          : bugs.map((b) => `${b.id} (${b.area}): ${b.summary}`).join('\n');
      return result(summary, { bugs, total: matches.length, returned: bugs.length });
    },
  );

  server.registerTool(
    'list_ci_runs',
    {
      description:
        'List recent GitHub Actions CI runs for this repo with status and conclusion, to pick a ' +
        'run to analyze. Defaults to the latest runs on main.',
      inputSchema: z.object({
        branch: z.string().default('main'),
        event: z.enum(EVENT_VALUES).optional(),
        status: z.enum(STATUS_VALUES).optional(),
        limit: z.number().int().positive().max(50).default(10),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ branch, event, status, limit }) => {
      try {
        const runs = await listRuns({
          branch,
          limit,
          ...(event !== undefined ? { event } : {}),
          ...(status !== undefined ? { status } : {}),
        });
        const summary =
          runs.length === 0
            ? 'No runs found for that filter.'
            : runs
                .map((r) => `${r.id} ${r.workflow} [${r.event}] ${r.conclusion || r.status}`)
                .join('\n');
        return result(summary, { runs });
      } catch (error) {
        if (error instanceof GhError) return errorResult(`gh failed: ${error.message}`);
        throw error;
      }
    },
  );

  server.registerTool(
    'analyze_ci_run',
    {
      description:
        'Summarize one CI run as real regressions, flaky tests, and known bugs that unexpectedly ' +
        'passed (maybe fixed), each joined to its SD-/DJ- id, so a known failure is not ' +
        'mistaken for a regression. Reads the JSON report artifact for a run id, or a local ' +
        'report file. Default is the latest scheduled run on main.',
      inputSchema: z.object({
        runId: z.number().int().positive().optional().describe('CI run id from list_ci_runs.'),
        reportPath: z
          .string()
          .optional()
          .describe('Local Playwright JSON report, instead of a run.'),
        limit: z.number().int().positive().max(200).default(50).describe('Max entries per list.'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ runId, reportPath, limit }) => {
      let url: string | null = null;
      let resolvedRunId: number | null = null;
      try {
        let report;
        if (reportPath !== undefined) {
          report = readReportFile(reportPath);
        } else {
          const id =
            runId ?? (await listRuns({ branch: 'main', event: 'schedule', limit: 1 }))[0]?.id;
          if (id === undefined) return errorResult('No scheduled run on main found to analyze.');
          resolvedRunId = id;
          if (reportsDir !== undefined) {
            report = readReportFile(join(reportsDir, `${String(id)}.json`));
          } else {
            report = await downloadReport(id);
            url = await runUrl(id);
          }
        }

        const full = classifyReport(report);
        const summaries = summariesById();
        const cut = <T>(list: T[]) => ({ items: list.slice(0, limit), over: list.length > limit });
        const regressions = cut(full.regressions);
        const flaky = cut(full.flaky);
        const fixed = cut(withSummary(full.knownBugFixedProbably, summaries));
        const exposed = cut(withSummary(full.knownBugExposed, summaries));
        const truncated = regressions.over || flaky.over || fixed.over || exposed.over;

        const lines = [
          `${full.counts.regressions} regression(s), ${full.counts.flaky} flaky, ` +
            `${full.counts.knownBugExpected} known bug(s) still failing as expected, ` +
            `${full.counts.knownBugFixedProbably} known bug(s) now passing (maybe fixed).`,
          // A cut list must say so, or the failures after the cut are silently missing.
          ...(truncated
            ? [
                `Each list is cut at ${String(limit)} entries: call again with a larger limit ` +
                  '(up to 200) to see the rest.',
              ]
            : []),
          ...regressions.items.map(
            (r) => `REGRESSION ${r.file}:${r.line} ${r.test} - ${r.message}`,
          ),
          // Whether the bug is fixed is a judgment: a check that cannot fail passes too.
          ...fixed.items.map(
            (b) =>
              `FIXED? ${b.id} ${b.test} (passed despite its knownBug marker: fixed, or its check ` +
              'can no longer fail)',
          ),
          ...exposed.items.map((b) => `EXPOSED ${b.id} ${b.test}`),
        ];

        return result(lines.join('\n'), {
          runId: resolvedRunId,
          url,
          counts: full.counts,
          regressions: regressions.items,
          flaky: flaky.items,
          knownBugFixedProbably: fixed.items,
          knownBugExposed: exposed.items,
          truncated,
        });
      } catch (error) {
        if (error instanceof GhError) {
          return errorResult(
            `gh failed: ${error.message}. The run may have no "playwright-report-json" ` +
              'artifact (runs before that artifact was added), or gh is not authenticated.',
          );
        }
        if (error instanceof Error)
          return errorResult(`Could not analyze the run: ${error.message}`);
        throw error;
      }
    },
  );

  server.registerResource(
    'known-bugs',
    'qa://known-bugs',
    { title: 'Known bug catalogue', mimeType: 'application/json' },
    (uri) => ({
      contents: [{ uri: uri.href, text: JSON.stringify(catalogueEntries(), null, 2) }],
    }),
  );

  server.registerPrompt(
    'triage',
    {
      title: 'Triage a CI run',
      description: 'Classify a CI run into real regressions and known bugs.',
      argsSchema: z.object({ runId: z.string().describe('CI run id, or empty for the latest.') }),
    },
    ({ runId }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text:
              `Call analyze_ci_run${runId ? ` with runId ${runId}` : ''}. For each regression, ` +
              'call find_known_bug on its message to check it is not a known bug, then report the ' +
              'real regressions separately from the known bugs and the probably-fixed ones.',
          },
        },
      ],
    }),
  );

  return server;
}

const { values: cli } = parseArgs({ options: { 'reports-dir': { type: 'string' } } });
serveStdio(() => buildServer({ reportsDir: cli['reports-dir'] }));
