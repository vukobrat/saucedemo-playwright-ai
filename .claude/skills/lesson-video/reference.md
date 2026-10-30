# Lesson video reference

## The video folder

`build.mjs <folder>` reads three files and writes `<folder>/<file>`.

**`video.json`**, all fields required, plain text:

```json
{
  "file": "context-engineering.html",
  "title": "Context Engineering",
  "eyebrow": "Phase 1 · Module 2 · animated lesson",
  "lede": "A narrated, animated walk through Module 2: ...",
  "corner": "Module 2 · context engineering",
  "source": "docs/phase-1/02-context-engineering.md",
  "verified": "Claude Code v2.1.306 and v2.1.308"
}
```

`title` is a name of two to four words; the page's lede adds the length in minutes.

**`scenes.js`**, plain JavaScript evaluated inside the player:

```js
const SCENES = [
  {
    chapter: 'Measure first', // chapter list and the label above the canvas
    poster: true, // optional, on one chapter only: its end state is the poster
    lines: ['One beat. Each sentence is a caption.', 'The next beat.'],
    html: `<div class="a cue" data-at="1" style="left:90px;top:150px">...</div>`,
    update(t, root, sc) {}, // optional, runs every frame; t is seconds into the chapter
  },
];
const SAY_EXTRA = [[/\bVS Code\b/g, 'V S Code']]; // optional: plain-text pronunciations
const CODE_SAY_EXTRA = { '/compact': 'slash compact' }; // optional: backticked code, exact match
```

**`scenes.css`**, optional: styles this video needs that the vocabulary below lacks.

## Cues

A cue names a narration line of the chapter by its index, plus an optional offset in seconds:
`2` is when line 2 starts, `2+1.5` is 1.5 s later. Ranges are `a~b`, several ranges are separated
by commas, and a range end past the last line (`3~99`) means "until the chapter ends".

| Attribute                         | Effect                                                                                   |
| --------------------------------- | ---------------------------------------------------------------------------------------- |
| `data-at="2"`                     | adds `on` from the cue: with `.cue`, the element fades and slides in                     |
| `data-out="4"`                    | hides it from the cue (with `data-at`, or alone)                                         |
| `data-hl="2~3,5~99"`              | highlight during the ranges                                                              |
| `data-dim="4~99"`                 | dim during the ranges                                                                    |
| `data-add="3+0.4:void;5:done"`    | adds a class from each cue                                                               |
| `data-prog="1~1+1.2"`             | sets `--p` from 0 to 1 over the range: drawing wires, growing bars                       |
| `data-type="0+0.6" data-cps="40"` | types the element's text out (text only, no child elements)                              |
| `data-count="2" data-to="27872"`  | counts up to the number over `data-dur` seconds (default 1.5); the element holds only it |

Cue entry styles on `.cue`: default slides up; `.l` from the left, `.r` from the right, `.z`
zooms, `.f` only fades.

In `update(t, root, sc)`, `sc.starts[j]` is when line `j` starts, so motion can follow the
narration: `const L = (j) => sc.starts[j];`. Find elements with `data-k` attributes. The
helpers `clamp01`, `easeInOut` and `easeOut` are in scope.

## Layout

Elements with class `a` are positioned in canvas pixels with inline `left`, `top`, `width`.
Content stays inside x 90 to 1510 and y 140 to 760. A wrapper with `display:grid;gap:12px` and
fixed `left`, `top` and `width` keeps rows aligned without positioning each one.

## Vocabulary

Text: `.big` (display numbers and statements, set `font-size`), `.lbl` and `.lbl.sm` (uppercase
labels), `.q` (a question), `.t26`, `.t22`, `.t20` (body sizes; `.t20` is muted), `.m`
(monospace). Colors: `.c-amber` (the model, emphasis), `.c-ok`, `.c-deny`, `.c-dim`, `.c-paper`.

| Pattern            | Markup                                                                                               | Use for                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Plate              | `.plate` (`.amber`)                                                                                  | a framed group                              |
| Chip               | `.chip` (`.m`, `.ok`, `.deny`, `.amber`); `.chips` wraps a row                                       | a keyword, a value, a command               |
| Note               | `.note` with a text class                                                                            | a takeaway line with an amber bar           |
| Terminal           | `.term` > `.term-h` + `.term-b`; `.ps` for the prompt                                                | commands and their output; pair with typing |
| Code block         | `.codeblock`                                                                                         | a command or config, read rather than typed |
| Stamp              | `.stamp` (`.red`); `data-add="n:void"` strikes it through                                            | a verdict: success, blocked, fail           |
| Flowchart          | `.node` (`.amber`, `.green`, `.red`), `.dwrap` > `.dia` + `.dia-t` (decision), `.elbl` (edge label)  | loops and decisions                         |
| Wire               | SVG `path.wire` with `pathLength="1"` and `data-prog`; `.ok`, `.deny`, `.hlc`; `data-add="n:done"`   | flow drawn as the narration describes it    |
| Pulse              | SVG `circle.pulse` moved along an `.mp` path in `update` with `getPointAtLength`                     | a message travelling                        |
| Stack              | `.stack` > `.layerb` (`.tall`, `.new`)                                                               | what a context or request contains          |
| Lanes              | `.lane` > `.lane-n` + `.barx` (`.ok`, `.amber`) with `data-prog` and a fixed width                   | timings and measured bars                   |
| Gates              | `.gate` > `.gn` + `.gt` + `.gd`; a `.token` moved between them in `update`                           | an ordered pipeline of checks               |
| Rows               | `.rowx` (`.soft` dashed): content left, value right                                                  | lists with a verdict or destination         |
| Table              | `.tbl` with `--cols` (a grid template) > `.tr` (`.th` header)                                        | experiment results                          |
| Checks             | `.check` > `.ck-n` + text + `.ck-v`                                                                  | numbered criteria with a verdict            |
| Annotated command  | `.cmdrow` > `code.cmd` + note; `--cmdw` sets the code column                                         | one flag per row                            |
| Cards              | `.cards` > `.card` (three columns), `.cn` card title in monospace                                    | modes, options, pitfalls                    |
| Quad               | `.quad` > `.plate` (two by two)                                                                      | four tradeoffs                              |
| Questions          | `.qrow` > `.q` + `.chips`; `.qlist` > `.qi` > `.n` + text                                            | interview answers; the checkpoint           |
| Gauge, bubble, ... | `.gauge > i` (`--g`), `.bubble`, `.json`, `.turnrow`, `.edge-tag`, `.ws`/`.wd` (matched, mismatched) | see `template.html`                         |

## Title chapter

The poster is the end state of the chapter marked `poster: true`. The play button covers canvas
point (1270, 400), so the title chapter draws a ring there:

```html
<svg class="a" viewBox="0 0 440 440" style="left:1050px;top:180px;width:440px;height:440px">
  <path class="wire" pathLength="1" data-prog="0~0+2.2" d="M220 50 A170 170 0 1 1 50 220" />
  <circle data-k="orbit" r="11" cx="220" cy="50" class="pulse" style="opacity:0" />
</svg>
<div class="a cue" data-at="0" style="left:90px;top:196px">
  <div class="lbl sm c-dim">Phase 1 · Module N</div>
</div>
<div class="a cue" data-at="0+0.4" style="left:90px;top:244px;width:940px">
  <div class="big" style="font-size:120px;line-height:.94">
    Two-word<br /><span class="c-amber">title</span>
  </div>
</div>
```

```js
update(t, root) {
  const dot = root.querySelector('[data-k="orbit"]');
  const a = -Math.PI / 2 + Math.max(0, t - 2.2) * 0.8;
  dot.setAttribute('cx', (220 + 170 * Math.cos(a)).toFixed(1));
  dot.setAttribute('cy', (220 + 170 * Math.sin(a)).toFixed(1));
  dot.style.opacity = t > 2.2 ? 1 : 0;
},
```
