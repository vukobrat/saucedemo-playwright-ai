/**
 * Read-only views over the known-bug catalogue for the `qa` MCP server: deriving the area of an
 * id, searching the catalogue, and scanning the specs for the `knownBug()` markers that reference
 * each entry. The catalogue itself stays the single source in `@data/known-bugs`; nothing here
 * mutates it.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KNOWN_BUGS, type KnownBug } from '@data/known-bugs';

/** The system or persona a defect belongs to, derived from its stable id. */
export type Area =
  | 'general'
  | 'problem_user'
  | 'error_user'
  | 'performance_glitch_user'
  | 'visual_user'
  | 'accessibility'
  | 'api';

export const AREAS: readonly Area[] = [
  'general',
  'problem_user',
  'error_user',
  'performance_glitch_user',
  'visual_user',
  'accessibility',
  'api',
];

/** Map an `SD-xxx`/`DJ-xxx` id to its area. The id prefix is the stable contract. */
export function areaOf(id: string): Area {
  if (id.startsWith('DJ-')) return 'api';
  const code = /^SD-(\d)/.exec(id)?.[1];
  switch (code) {
    case '1':
      return 'problem_user';
    case '2':
      return 'error_user';
    case '3':
      return 'performance_glitch_user';
    case '4':
      return 'visual_user';
    case '5':
      return 'accessibility';
    default:
      return 'general';
  }
}

export interface CatalogueEntry {
  readonly key: string;
  readonly id: string;
  readonly summary: string;
  readonly area: Area;
  readonly specs: readonly string[];
}

/** Catalogue keys that reference each marker, by `knownBug(KNOWN_BUGS.<key>)` text in the specs. */
function scanSpecReferences(root: string): Map<string, string[]> {
  const byKey = new Map<string, string[]>();
  const testsDir = join(root, 'tests');
  let files: string[];
  try {
    files = readdirSync(testsDir, { recursive: true })
      .map((entry) => entry.toString())
      .filter((name) => name.endsWith('.ts'));
  } catch {
    return byKey; // No tests directory reachable from here; references stay empty.
  }
  const reference = /KNOWN_BUGS\.([A-Za-z0-9_]+)/g;
  for (const name of files) {
    const path = join(testsDir, name);
    let text: string;
    try {
      text = readFileSync(path, 'utf8');
    } catch {
      continue;
    }
    for (const match of text.matchAll(reference)) {
      const key = match[1];
      if (!key) continue;
      const list = byKey.get(key) ?? [];
      const relative = join('tests', name);
      if (!list.includes(relative)) list.push(relative);
      byKey.set(key, list);
    }
  }
  return byKey;
}

/** The whole catalogue as entries enriched with area and the specs that reference each one. */
export function catalogueEntries(root: string = process.cwd()): CatalogueEntry[] {
  const references = scanSpecReferences(root);
  return Object.entries(KNOWN_BUGS satisfies Record<string, KnownBug>).map(([key, bug]) => ({
    key,
    id: bug.id,
    summary: bug.summary,
    area: areaOf(bug.id),
    specs: (references.get(key) ?? []).sort((a, b) => a.localeCompare(b)),
  }));
}

export interface SearchOptions {
  readonly id?: string;
  readonly persona?: Area;
  readonly query?: string;
  readonly root?: string;
}

/** Filter the catalogue by id (exact, case-insensitive), area, and free text over id and summary. */
export function searchBugs(options: SearchOptions): CatalogueEntry[] {
  const needle = options.query?.trim().toLowerCase();
  const wantedId = options.id?.trim().toLowerCase();
  return catalogueEntries(options.root).filter((entry) => {
    if (wantedId && entry.id.toLowerCase() !== wantedId) return false;
    if (options.persona && entry.area !== options.persona) return false;
    if (needle) {
      const haystack = `${entry.id} ${entry.summary}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}
