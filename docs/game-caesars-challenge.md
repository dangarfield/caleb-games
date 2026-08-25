# Caesar's Challenge

A Roman-numeral academy: the player is a young scribe who starts in a Latium schoolroom
and works up to a Triumph in Rome. 100 levels grouped into 10 provinces of 10, each level
a set of 10–15 procedurally generated puzzles drawn from 12 puzzle types (read a numeral,
carve one, add/subtract/multiply/divide, compare, order, spot the forgery, fill the missing
letter, continue the sequence, balance the scales, decipher a Caesar-shifted secret scroll).
Levels 1–10 are readable by a 7-year-old who has never seen a Roman numeral; the Roma
province at 91–100 is genuinely hard for an adult. Two profiles (Caleb / Ezra) keep separate
progress.

Nothing in the game is a dead end: running out of mistakes retries the *level*, never the
campaign, and every miss shows a teach card with the correct answer before moving on — the
point is that the player learns the numeral, not that they are punished for missing it.

## Features

- **100 levels, deterministic.** `buildLevel(n)` is seeded by the level number, so level 37
  is the same level for both boys and on every device. Finishing level N unlocks N+1.
- **12 puzzle types / 5 input widgets** — number keypad, chisel-letter tiles (I V X L C D M),
  choice cards, drag-to-order tray, weighing scales.
- **Via Appia level map** — a scrollable road of 100 milestone coins in 10 province bands,
  drag/flick with inertia, 3 stars per stone, locked stones nudge instead of failing.
- **Stars:** 3 = zero mistakes AND zero hints, 2 = at most one mistake, 1 = completed. The
  best star count and best score ever achieved on a level are kept, never overwritten downward.
- **Laurel streak multiplier** — ×1 up to ×5, one step per two correct answers in a row, reset
  by a miss.
- **Sundial bonus** — a per-puzzle timer that scales the bonus points only. It can never fail a
  puzzle, end a level, or take a life. Deliberate: it keeps the game kind for a 7-year-old while
  still rewarding a quick, confident answer.
- **Hints** — a few free per level (3 → 0 as the provinces get harder), then paid for in denarii.
  The first tap shows the short hint, a second tap shows the deeper `teach` explanation. Using a
  hint forfeits the 3-star award but nothing else. Broke and out of free hints? The game says so
  kindly instead of doing nothing.
- **Mosaic reveal** — every correct answer lays one tile of the province mosaic, sitting directly
  under the HUD where the player is already looking.
- **Colosseum duels** — every 10th level a rival scribe (Brutus, Vercingetorix, Cleopatra…)
  races you on a timer bar. Beating them pays a bonus; losing to them does nothing at all. The
  rival is theatre, not a fail state.
- **Denarii + 10 province trophies** in a Room of Spoils.
- **Web Audio SFX** synthesised at runtime — chisel tick, rising chime, dull thud, star ding,
  fanfare, sad horn, crowd roar, coin clink. No audio files; the context is created on the first
  user gesture, never before.
- **Themed rendering** — marble columns, flickering torches, carved/bevelled numerals, province
  banner tints, a Colosseum arch on boss levels, and a capped particle system (≤120 live).

## Difficulty ladder

| Province | Levels | Numeral range | New this province |
|---|---|---|---|
| I Latium | 1–10 | 1–20, `I V X` | decode, encode, compare |
| II Etruria | 11–20 | 1–39 | subtractive `IV IX`, missing letter, small addition |
| III Gaul | 21–30 | 1–89, `+L` | subtraction, forgery spotting, sequences |
| IV Hispania | 31–40 | 1–399, `+C` | `XL XC`, weighing scales, roman-typed answers |
| V Britannia | 41–50 | 1–999 | `CD CM`, multiply by II/III/V, ordering |
| VI Germania | 51–60 | 1–1999, `+D M` | years (`MCMXCIV`), division, subtractive-fake forgeries |
| VII Aegyptus | 61–70 | 1–3999 | two-term expressions, any answer may be roman |
| VIII Judaea | 71–80 | 1–3999 | 4-weight scales, stepped sequences, roman-answer × ÷ |
| IX Asia | 81–90 | 1–3999 | Secret Scroll ciphers, 3-term expressions, tighter sundial |
| X Roma | 91–100 | 1–3999 | gauntlet of every type, no free hints, level 100 = Triumph (15 puzzles) |

Per-level knobs move monotonically with level: `puzzleCount` 10 → 12 (15 on level 100),
value range, type mix, `maxMistakes` 3 → 2 from level 61, shrinking sundial window, and free
hints 3 (L1–30) → 2 (L31–60) → 1 (L61–90) → 0 (L91–100).

## File structure

```
games/caesars-challenge/
  index.html      shell: inline CSS, back button, mute button, start overlay, <canvas id="c">
  js/game.js      screen state machine, single rAF loop, input dispatch, scoring, save/load
  js/audio.js     Web Audio SFX synthesis (8 named sounds), lazy context, voice budget
  js/rng.js       mulberry32 seeded RNG + pick/shuffle/randInt
  js/numerals.js  pure numeral engine: toRoman / fromRoman / strict isValidRoman / forgery maker
  js/levels.js    PROVINCES data, levelSpec(level), deterministic buildLevel(level)
  js/puzzles.js   checkAnswer / formatAnswer / drawPrompt / createInput (the 5 input widgets)
  js/theme.js     palette, fonts, roundRect, fitText, carvedText, button
  js/render.js    all screen renderers (background, HUD pill, mosaic, map, complete/failed,
                  profile select, trophy room, boss rival) + the capped particle pool
```

- `index.html` loads only `js/game.js`; every other module is reached through imports.
- `game.js` imports the other modules dynamically so a missing or renamed export produces a
  named, readable console error and an on-canvas message instead of a blank screen.
- `research/` (gitignored) holds the throwaway puppeteer smoke harness and its screenshots.

## Key design decisions

**Why this game is multi-file when the arcade default is a single `index.html`.** The
convention's default exists so a small game stays greppable in one file. This one is not
small: a pure numeral engine with strict canonical validation, a deterministic generator for
100 levels × 10–15 puzzles across 12 types, five distinct input widgets, a themed renderer
with a cached backdrop and six full-screen scenes, and the shell/state machine on top. Split
by *contract* rather than by convenience: each module has an explicitly documented export
surface, no module reaches into another's internals, and the seams are exactly where the four
build lanes met. Everything stays inside `games/caesars-challenge/`, ES modules only, no build
step, no framework, no CDN.

**Canvas runs at 1 device pixel per CSS pixel (no DPR scaling).** `render.js` resets the
transform every frame (`ctx.setTransform(1,0,0,1,0,0)`), so a DPR scale matrix could not
survive anyway — but the deciding reason is touch. All the renderer's tap-target clamps
(hint zone, buttons, keys ≥ 64px) are expressed in canvas units. On a 2× buffer those become
32 CSS px, which is too small for a 7-year-old's thumb. Sharpness loses; thumbs and the
low-powered tablet win.

**Own localStorage item, verified write.** Key `calebArcadeData:caesars-challenge`, this
game's object stored at the top level of that item (not nested under a game name inside it),
and the legacy shared `calebArcadeData` blob is never touched. `saveData` reads the value back
and compares it; on failure the game draws a tappable red warning band on the canvas telling
the player their progress could not be saved rather than silently losing it. `loadData`
normalises anything it finds — missing, corrupt or older JSON boots to a fresh profile set and
never throws.

**One loop, one pointer handler, one key handler.** `dt` is clamped to `1/30` so a background
tab or a stalled frame cannot teleport the sundial. Each screen renderer returns its hit rects
and the next frame's input is dispatched against those, so there is never a second copy of the
layout to keep in sync. On `visibilitychange` the sundial and rival timers stop advancing —
looking away is not a penalty.

**The mute button moves per screen.** It is the only DOM chrome floating over the canvas, and
the level map draws its "Trophies" chip in the top-right corner, so on the map the mute button
drops to the bottom-right (outside the level nodes in both orientations) and returns to the
top-right everywhere else.

**Teach text shrinks, never truncates.** Hint and teach cards scale their type down to fit the
space between the heading and the button. A card that silently drops its last line is worse
than one in slightly smaller letters — the card *is* the teaching.

**Perf.** Measured on desktop macOS Chrome only (backdrop baked to an offscreen canvas,
gradients built once per resize, particle cap 120, and a keyboard-driven full-level playthrough
in headless Chrome with zero console output). No number has been measured on the boys' tablet
yet, so no tablet claim is made here.

## Memory
