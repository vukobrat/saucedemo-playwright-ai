---
name: lesson-video
description: >-
  Turn a lesson in docs/phase-1/ (or another doc) into a narrated, animated video: a single-file
  HTML player with chapters, captions, browser narration and cue-driven blueprint drawings,
  published as a private Artifact. Use when asked for an animated video, an explainer video or a
  narrated walkthrough of a module or document.
argument-hint: <lesson file, e.g. docs/phase-1/02-context-engineering.md>
---

# Make a lesson video

Produce a narrated, animated lesson that plays like a video: a play button, a scrubber with
chapter ticks, sentence-by-sentence seeking, captions, a transcript and a voice. It is an HTML
player, not an MP4. A player can seek to any sentence and show a transcript, which suits study
better than a flat video, and it needs no rendering tools (this repo's macOS 12 machine has no
ffmpeg).

Files in this folder:

- `template.html`: the player (styles, drawing vocabulary, playback engine). Every video uses it
  unchanged. Why: fixes and improvements then reach every later video.
- `build.mjs`: fills the template from a video folder and checks it. It writes the page only
  when there are no errors.
- `reference.md`: the input formats, cue attributes and drawing vocabulary. Read it before
  writing scenes.

## 1. Extract the lesson

Read the whole lesson, then list: one core idea per concept section, every measured number and
result (verbatim, with units), each experiment's prediction and outcome, the tradeoffs, the
interview questions, and the checkpoint questions.

Facts come only from the lesson. Why: the video is studied instead of the doc, so an invented
or rounded number is learned as true. Copy the lesson's "verified against" version into
`video.json`.

## 2. Storyboard the chapters

The shape that worked (Modules 1 and 2: 16 and 17 chapters, about 12 minutes):

1. **Cold open:** a concrete, surprising result from the lesson's own experiments, shown and not
   explained ("success, but no file"; "same text, different rules"). End on "by the end of this
   video you will know why".
2. **Title chapter, the poster** (`poster: true`): module number, title, one-line promise. Keep
   canvas point (1270, 400) clear: the play button sits there.
3. **Concept chapters:** one idea each, in the lesson's order, each with one drawing that builds
   up beat by beat.
4. **Evidence chapters:** the exercises as tables, bars and counters with the real numbers;
   prediction against result.
5. **Close the loop:** come back to the cold open and explain it.
6. **Tradeoffs, interview answers, checkpoint.** The checkpoint shows the questions only and
   points to the lesson's answer section and to one exercise to run.

Aim for 12 to 18 chapters of 2 to 8 lines each.

## 3. Write the narration

- Each entry in `lines` is one beat: the drawing changes when it starts. Each sentence in a line
  is one caption.
- Write for the ear: short sentences, active voice, no parentheses, no em dashes. Numbers as
  digits, since captions show them.
- Put code in backticks: captions render it as code and the voice reads a spoken form. Add
  anything a voice mangles to `CODE_SAY_EXTRA` (backticked code) or `SAY_EXTRA` (plain text),
  for example `/compact` as "slash compact".
- Keep each sentence under about 170 characters, so a caption stays within two lines.

## 4. Draw the scenes

- Canvas 1600 x 900. Content stays inside x 90 to 1510 and y 140 to 760: the chapter label sits
  above, and captions cover the bottom.
- **Show keywords, say sentences.** The canvas carries labels, numbers and structure; the
  sentences are spoken, not printed. Why: reading a sentence while hearing it splits attention.
- An element appears on the line that first mentions it (`data-at`), is highlighted while the
  narration talks about it (`data-hl`), and the rest dims at summary beats (`data-dim`). Never
  show a chapter's whole drawing at once.
- One focal point per beat, and about seven items on screen at most.
- Motion carries meaning: wires draw for flow, counters for numbers, stamps for verdicts.
- Use the vocabulary in `reference.md`. Add `scenes.css` only for what it lacks.

## 5. Build and check

Work in the scratchpad: the video is generated output, and the lesson stays the source of truth.

```bash
node .claude/skills/lesson-video/build.mjs <scratchpad>/<slug>
```

Fix every error. Read every warning: a cue that fires after its line ends usually belongs to
the next line, and a sentence over the limit needs splitting. The build prints each chapter's
estimated length; the voice holds the timeline until each line is spoken, so real playback can
run longer.

## 6. Look at it

The Playwright MCP cannot open `file:` URLs, so serve the folder:

```bash
python3 -m http.server 8765 --bind 127.0.0.1 --directory <scratchpad>/<slug>   # in the background
```

- `http://127.0.0.1:8765/<file>#ch=N` shows chapter N fully drawn, and `#t=S` shows second S
  with its caption. Changing only the hash switches frames without a reload.
- Look at every chapter's final state, most cheaply on a contact sheet: a scratch page with one
  800 x 450 iframe per chapter. Then look at a few dense moments with captions on.
- Check overlaps, text past the margins, single words wrapped onto a new line, and captions
  covering content. Fix, rebuild, look again.
- Save screenshots under `.playwright-mcp/` (gitignored), delete them afterwards, and stop the
  server.

## 7. Publish and report

- Publish the built page with the Artifact tool (icon `video`). It is private to the user.
  Publish the same file path again to update it at the same URL. From a later session, read the
  artifact by its URL, rebuild, and publish with `url`.
- Report the link, the chapters in one line each, how to use it (Space, arrow keys for a sentence,
  Shift and arrow keys for a chapter, V, C, F, the Narrator menu), and the voice limitation below.

## Voice

The narration is the browser's speech synthesis. The player picks the most natural voice
available (Edge "Natural" voices, Apple Premium, Siri or Enhanced voices, then Google voices) and
offers the rest in a Narrator menu. On a machine with only the classic system voices it sounds
synthetic. Pre-rendered neural narration would sound the same everywhere, but it means running
a downloaded speech model, which needs the user's explicit approval first.
