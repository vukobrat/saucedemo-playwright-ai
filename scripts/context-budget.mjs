// Shows how much instruction text this repo puts in front of an agent, and when it loads:
// always (root CLAUDE.md, CLAUDE.local.md, unscoped rules, auto-memory index), on demand
// (path-scoped rules), or only when explicitly read (referenced docs).
//
// Sizes are characters with a share of the always-loaded total. Character counts are a relative
// measure only; for real token costs compare two `claude -p` runs (see docs/phase-1).
//
// Usage: node scripts/context-budget.mjs   (or: npm run context:budget)
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const chars = (file) => readFileSync(file, 'utf8').length;
const pct = (part, total) => `${total ? Math.round((part / total) * 100) : 0}%`.padStart(4);
const row = (label, size, total) =>
  console.log(
    `  ${label.padEnd(44)} ${size.toLocaleString('en-US').padStart(7)} chars ${pct(size, total)}`,
  );

/** `paths:` globs from a rule's YAML frontmatter, or [] when the rule is unscoped. */
function rulePaths(file) {
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(readFileSync(file, 'utf8'))?.[1] ?? '';
  return [...frontmatter.matchAll(/^\s*-\s*["']?([^"'\n]+)["']?\s*$/gm)].map((m) => m[1]);
}

function listRules(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

// Auto memory lives outside the repo, in a folder named after the project path.
const memoryIndex = path.join(
  homedir(),
  '.claude',
  'projects',
  process.cwd().replace(/[/.]/g, '-'),
  'memory',
  'MEMORY.md',
);

const rules = listRules('.claude/rules').map((file) => ({ file, paths: rulePaths(file) }));
const always = [
  ['CLAUDE.md', 'CLAUDE.md'],
  ['CLAUDE.local.md (personal, gitignored)', 'CLAUDE.local.md'],
  ...rules.filter((r) => r.paths.length === 0).map((r) => [r.file, r.file]),
  ['auto memory index (MEMORY.md)', memoryIndex],
].filter(([, file]) => existsSync(file));

const total = always.reduce((sum, [, file]) => sum + chars(file), 0);

console.log(`Always loaded, on every model call (${total.toLocaleString('en-US')} chars):`);
for (const [label, file] of always) {
  row(label, chars(file), total);
  if (file === 'CLAUDE.md') {
    let section = null;
    let size = 0;
    const flush = () => section && row(`  ${section}`, size, total);
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (line.startsWith('## ')) {
        flush();
        section = line;
        size = 0;
      } else {
        size += line.length + 1;
      }
    }
    flush();
  }
}

const scoped = rules.filter((r) => r.paths.length > 0);
console.log('\nOn demand, when a matching file is read or edited (path-scoped rules):');
if (scoped.length === 0) console.log('  none');
for (const { file, paths } of scoped) row(`${file}  [${paths.join(', ')}]`, chars(file), total);

console.log('\nReferenced, loaded only if an agent reads them:');
for (const file of ['docs/app-exploration.md']) if (existsSync(file)) row(file, chars(file), total);
