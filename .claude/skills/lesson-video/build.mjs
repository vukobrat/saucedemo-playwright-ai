// Builds a lesson video from a folder holding video.json, scenes.js and an optional scenes.css,
// and checks it before anyone watches it: chapter shape, cue references against the real
// timeline, caption length, layout bounds, the page script's syntax and the house style.
// The page is written only when there are no errors.
//
// Usage: node .claude/skills/lesson-video/build.mjs <folder>
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const say = (line) => process.stdout.write(`${line}\n`);
const stop = (line) => {
  process.stderr.write(`${line}\n`);
  process.exit(1);
};

const dir = process.argv[2];
if (!dir) stop('usage: node .claude/skills/lesson-video/build.mjs <folder>');
const read = (name) => readFileSync(join(dir, name), 'utf8');
// the text between the line holding `start` and the line holding `end`
const between = (text, start, end) => {
  const a = text.indexOf(start);
  const b = text.indexOf(end, a);
  if (a < 0 || b < 0) stop(`template is missing ${start} or ${end}`);
  return text.slice(text.indexOf('\n', a) + 1, text.lastIndexOf('\n', b) + 1);
};

const errors = [];
const warnings = [];

// ---------------------------------------------------------------- inputs
const template = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'template.html'),
  'utf8',
);
const meta = JSON.parse(read('video.json'));
const META_KEYS = ['file', 'title', 'eyebrow', 'lede', 'corner', 'source', 'verified'];
for (const key of META_KEYS) {
  if (typeof meta[key] !== 'string' || !meta[key].trim())
    errors.push(`video.json: "${key}" is missing`);
}
if (meta.file && !/^[a-z0-9-]+\.html$/.test(meta.file)) {
  errors.push('video.json: "file" must be a lowercase kebab-case .html name');
}
let scenes = read('scenes.js');
if (!/\bconst SAY_EXTRA\b/.test(scenes)) scenes += '\nconst SAY_EXTRA = [];';
if (!/\bconst CODE_SAY_EXTRA\b/.test(scenes)) scenes += '\nconst CODE_SAY_EXTRA = {};';
const css = existsSync(join(dir, 'scenes.css')) ? read('scenes.css') : '';

// ---------------------------------------------------------------- timeline
// Run the template's own timing code on the scenes, so cue checks use the player's real numbers.
const timing = between(template, '// @timing-start', '// @timing-end');
const sandbox = {};
try {
  vm.runInNewContext(
    `${scenes}\n${timing}\nglobalThis.out = { SCENES, SENTENCE, TOTAL };`,
    sandbox,
    {
      filename: 'scenes.js',
    },
  );
} catch (error) {
  stop(`scenes.js does not run: ${error instanceof Error ? error.message : String(error)}`);
}
const { SCENES, SENTENCE, TOTAL } = sandbox.out;

// ---------------------------------------------------------------- checks
const CUE = /^(\d+)\s*([+-]\s*\d*\.?\d+)?$/;
const CUE_ATTR = /\bdata-(at|out|hl|dim|add|prog|type|count)="([^"]*)"/g;
const SAFE = { right: 1510, bottom: 770 };
const CAPTION_MAX = 170;
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

function checkCue(sc, where, expr, kind) {
  const m = CUE.exec(expr.trim());
  if (!m) {
    errors.push(`${where}: cue "${expr}" is not "<line>" or "<line>+<seconds>"`);
    return 0;
  }
  const j = Number(m[1]);
  const offset = m[2] ? parseFloat(m[2].replace(/\s/g, '')) : 0;
  // a range end or data-out may point past the last line: "until the chapter ends"
  if (kind === 'end') return j >= sc.lines.length ? sc.dur : sc.starts[j] + offset;
  if (j >= sc.lines.length) {
    errors.push(
      `${where}: cue "${expr}" names line ${j}, but the chapter has lines 0 to ${sc.lines.length - 1}`,
    );
    return 0;
  }
  const t = sc.starts[j] + offset;
  if (t >= sc.dur) errors.push(`${where}: cue "${expr}" fires after the chapter ends`);
  else if (t > sc.ends[j] + 0.3) {
    const len = (sc.ends[j] - sc.starts[j]).toFixed(1);
    warnings.push(
      `${where}: cue "${expr}" fires after line ${j} ends (it lasts about ${len} s); tie it to a later line`,
    );
  }
  return t;
}

function checkCues(sc, where) {
  for (const [, name, value] of sc.html.matchAll(CUE_ATTR)) {
    const at = `${where}, data-${name}`;
    if (name === 'add') {
      for (const part of value.split(';')) {
        const k = part.lastIndexOf(':');
        if (k < 0) errors.push(`${at}: "${part}" is not "<cue>:<class>"`);
        else checkCue(sc, at, part.slice(0, k), 'start');
      }
    } else if (name === 'hl' || name === 'dim' || name === 'prog') {
      for (const range of value.split(',')) {
        const [a, b] = range.split('~');
        if (b === undefined) {
          errors.push(`${at}: "${range}" is not a range "<cue>~<cue>"`);
          continue;
        }
        if (checkCue(sc, at, b, 'end') <= checkCue(sc, at, a, 'start')) {
          errors.push(`${at}: range "${range}" ends before it starts`);
        }
      }
    } else {
      checkCue(sc, at, value, name === 'out' ? 'end' : 'start');
    }
  }
}

// Positions are canvas pixels; inside a positioned parent they are relative, so this only warns.
function checkBounds(sc, where) {
  for (const [, style] of sc.html.matchAll(/style="([^"]*)"/g)) {
    const px = (prop) => {
      const m = new RegExp(`(?:^|;)\\s*${prop}:\\s*(\\d+)px`).exec(style);
      return m ? Number(m[1]) : undefined;
    };
    const left = px('left');
    const top = px('top');
    const width = px('width');
    const height = px('height');
    if (left !== undefined && width !== undefined && left + width > SAFE.right) {
      warnings.push(
        `${where}: an element spans x ${left} to ${left + width}, past the right margin (${SAFE.right})`,
      );
    }
    if (top !== undefined && top + (height ?? 0) > SAFE.bottom) {
      warnings.push(
        `${where}: an element reaches y ${top + (height ?? 0)}, into the caption area (from ${SAFE.bottom})`,
      );
    }
  }
}

SCENES.forEach((sc, i) => {
  const where = `chapter ${i + 1} "${sc.chapter}"`;
  if (
    typeof sc.chapter !== 'string' ||
    !Array.isArray(sc.lines) ||
    !sc.lines.length ||
    typeof sc.html !== 'string'
  ) {
    errors.push(`${where}: a chapter needs chapter, lines and html`);
    return;
  }
  sc.lines.forEach((line, j) => {
    if ((line.match(/`/g) ?? []).length % 2)
      errors.push(`${where}, line ${j}: unbalanced backtick`);
    for (const sentence of line.split(SENTENCE)) {
      if (sentence.length > CAPTION_MAX) {
        warnings.push(
          `${where}, line ${j}: a ${sentence.length}-character sentence is a caption of three lines; split it`,
        );
      }
    }
  });
  checkCues(sc, where);
  checkBounds(sc, where);
});
if (SCENES.filter((sc) => sc.poster).length > 1)
  errors.push('more than one chapter has poster: true');

// ---------------------------------------------------------------- page
const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
const fill = {
  TITLE: meta.title,
  EYEBROW: meta.eyebrow,
  LEDE: meta.lede,
  CORNER: meta.corner,
  SOURCE: meta.source,
  VERIFIED: meta.verified,
};
let page = template.replace(/\{\{([A-Z]+)\}\}/g, (all, key) =>
  key in fill ? esc(fill[key]) : all,
);
page = page.replace('// @@SCENES@@', () => scenes).replace('/* @@SCENE_CSS@@ */', () => css);
const unfilled = /\{\{[A-Z]+\}\}|@@[A-Z_]+@@/.exec(page);
if (unfilled) errors.push(`template placeholder ${unfilled[0]} was not filled`);
const EM_DASH = String.fromCharCode(0x2014);
if (page.includes(EM_DASH)) {
  errors.push('the page contains an em dash; use a hyphen, a colon or a new sentence');
}
try {
  new vm.Script(page.slice(page.lastIndexOf('<script>') + 8, page.lastIndexOf('</script>')), {
    filename: meta.file,
  });
} catch (error) {
  errors.push(`page script: ${error instanceof Error ? error.message : String(error)}`);
}

// ---------------------------------------------------------------- report
SCENES.forEach((sc, i) => {
  say(
    `${String(i + 1).padStart(2)}  ${fmt(sc.t0).padStart(5)}  ${fmt(sc.dur).padStart(5)}  ${sc.lines.length} lines  ${sc.chapter}`,
  );
});
say(
  `total ${fmt(TOTAL)} (estimated from word count; the voice holds the timeline until each line is spoken)`,
);
for (const w of warnings) say(`warning: ${w}`);
for (const e of errors) say(`error: ${e}`);
if (errors.length) stop(`${errors.length} error(s): page not written`);
writeFileSync(join(dir, meta.file), page);
say(`wrote ${join(dir, meta.file)} (${Math.round(page.length / 1024)} KB)`);
