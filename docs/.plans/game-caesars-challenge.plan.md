# Run Plan — Caesar's Challenge

> Plan memento for the `new-game` recipe. Durable state OUTSIDE the context window.
> Read + update at every step.

**Game name:** Caesar's Challenge
**Folder:** `games/caesars-challenge/`
**Save key:** `calebArcadeData:caesars-challenge`
**Docs node:** `docs/game-caesars-challenge.md`
**Card class:** `.card-caesars-challenge`, href `games/caesars-challenge/` (trailing slash — multi-file, references `js/`)

---

## Checklist

- [x] 1. Frame — concept given by user (Roman numerals, encode/decode/maths, 100 levels, ≥10 puzzles/level, "cool looking"). Name given: Caesar's Challenge.
- [x] 2. Scout — SKIPPED (concept given).
- [x] 3. Spec — below. Gate set to notify-not-block (user said "do the above").
- [ ] 4. Build — 4 parallel `game-builder` lanes against the module contract.
- [ ] 5. Integrate + smoke test.
- [ ] 6. Review — `game-reviewer`, loop on fail.
- [ ] 7. Deterministic gate — back-button href is exactly `../../index.html`.
- [ ] 8. Docs sync — `game-docs-sync`.
- [ ] 9. STOP — human ships (do NOT commit; repo has unrelated in-flight roadways work).

---

# SPEC

## Concept

A Roman-themed numeral academy. The player is a young scribe rising from a Latium
schoolroom to a Triumph in Rome, proving they can read, carve and calculate with
Roman numerals. 100 levels grouped into 10 provinces of 10; every level is a set of
10+ puzzles (12+ on boss levels, 15 on level 100). Fills the arcade's gap for a
*maths-fluency* game with real long-tail progression — the existing educational games
(Count Master) are single-session; this one is a 100-level campaign you come back to.

Target: Garfield boys (~7+, touch tablet). Levels 1–10 are readable by a 7-year-old
who has never seen a Roman numeral; levels 90+ are genuinely hard for an adult.
The ladder is what makes both true.

## Core Mechanic

Read the tablet, tap the answer. Each puzzle presents a Roman-numeral question and
one of five input widgets (number keypad, chisel-letter tiles, choice cards, ordering
tray, weighing scales). Correct answers chisel sparks and reveal a tile of the
province mosaic; three mistakes and the Senate sends you back to retry the level.
Streaks build a laurel multiplier; every 10th level is a Colosseum duel against a
rival scribe who answers on a timer.

## Controls

- **Touch:** tap (all widgets), drag (scales weights, order tray, map scroll). Tap targets ≥ 64px.
- **Keyboard (desktop dev):** `0-9` and `I V X L C D M` type into the active widget,
  `Backspace` deletes, `Enter` submits, `Esc` back to map, `H` hint, `1-4` picks a choice card.

## Puzzle types (12)

Every type is procedurally generated and deterministic per level (seed = level).

| Type | Question | answerKind |
|---|---|---|
| `decode` | `XLII` = ? | arabic |
| `encode` | Carve 42 | roman |
| `add` | `XL + II` = ? | arabic or roman |
| `subtract` | `L − VIII` = ? | arabic or roman |
| `multiply` | `XII × III` = ? | arabic or roman |
| `divide` | `XL ÷ V` = ? | arabic or roman |
| `compare` | Which is larger, `XC` or `IC`… (valid pairs only) | choice |
| `order` | Drag `IX`, `VI`, `XI` into ascending order | order |
| `forgery` | Three carved coins, one is a forgery — which? (`IIII`, `VV`, `IC`, `XXXX`, `VX`, `IL`) | choice |
| `missing` | `X_V` = 65 — which letter was chiselled away? | choice or roman |
| `sequence` | `V, X, XV, ?` | roman or choice |
| `scales` | Balance `LXX` on the left by choosing weights from the pool | scales |
| `cipher` | **Secret Scroll** (provinces 9–10 only, ≤2 per level): Caesar shifted every letter by `III` — what does `FDHVDU` say? | choice |

## Difficulty ladder (the heart of the brief)

| Province | Levels | Numeral range | New this province |
|---|---|---|---|
| I Latium | 1–10 | 1–20, `I V X` | decode, encode, compare |
| II Etruria | 11–20 | 1–39 | subtractive `IV IX`, `missing`, small `add` |
| III Gaul | 21–30 | 1–89, `+L` | `subtract`, `forgery` (repeat-count fakes), `sequence` |
| IV Hispania | 31–40 | 1–399, `+C` | `XL XC`, `scales`, roman-typed answers |
| V Britannia | 41–50 | 1–999 | `CD CM`, `multiply` by II/III/V, `order` |
| VI Germania | 51–60 | 1–1999, `+D M` | years (`MCMXCIV`), `divide`, subtractive-fake forgeries (`IC IL VX`) |
| VII Aegyptus | 61–70 | 1–3999 | two-term expressions (`X + L − V`), all answers may be roman |
| VIII Judaea | 71–80 | 1–3999 | 4-weight scales, stepped sequences, roman-answer × ÷ |
| IX Asia | 81–90 | 1–3999 | **Secret Scroll** ciphers, 3-term expressions, tighter sundial |
| X Roma | 91–100 | 1–3999 | gauntlet: every type, no free hints, level 100 = Triumph (15 puzzles) |

Per-level knobs scale monotonically with level: `puzzleCount` 10 → 12 (15 on L100),
value range, type mix, `maxMistakes` 3 → 2 from level 61, sundial bonus window shrinks,
free hints 3 (L1–30) → 2 (L31–60) → 1 (L61–90) → 0 (L91–100).

**Never a dead end:** running out of mistakes retries the *level*, never the campaign.
Every level is replayable for more stars. Unlock rule: finishing level N unlocks N+1.

## Systems Required

- [ ] Pure numeral engine: `toRoman` / `fromRoman` / strict `isValidRoman` / forgery generator
- [ ] Deterministic seeded level generator, 100 levels × 10+ puzzles
- [ ] 5 input widgets (keypad, chisel tiles, choice cards, order tray, scales)
- [ ] Screen state machine: profile → map → play → level-complete / level-failed → trophy room
- [ ] Scrollable 100-milestone "Via Appia" level map, 10 province bands, 3 stars per level, locks
- [ ] Score: base + sundial time bonus + laurel streak multiplier; per-level best; denarii
- [ ] Two profiles (Caleb / Ezra), separate progress, remembered
- [ ] Stars: 3 = no mistakes and no hints, 2 = ≤1 mistake, 1 = completed
- [ ] Web Audio SFX: chisel tap, correct chime, wrong thud, star ding, level fanfare, crowd roar (boss)
- [ ] Particles: gold sparks, laurel confetti, dust motes; capped
- [ ] Mosaic reveal per level; trophy artifact unlocked per province
- [ ] Teach cards / hints ("IX = 10 − 1, a smaller letter before a bigger one subtracts")

## Look and feel ("make it cool")

Dark arcade base (`#0a0a2e → #141452 → #1a1a6e`) with an imperial overlay: fluted
marble columns flanking the play area, a warm torch glow that flickers on both sides,
gold laurel and `#ffd32a` numerals carved with an inset-bevel text effect (dark
offset shadow above, light below) so letters read as *chiselled stone*. Slow dust
motes. Province banner colours tint the torches. Boss levels swap in a Colosseum
arch silhouette and a roaring-crowd particle haze.

**Perf — the kids play on a low-powered tablet:**
- Cache the static marble/column/arch backdrop into an offscreen canvas, redrawn only on resize or province change.
- ≤ 120 live particles, hard cap; no `shadowBlur` inside per-particle loops.
- Create gradients once per resize, never per frame.
- Clamp `dt`; target 60fps on desktop but degrade gracefully — measure and label where perf was checked.

## Conventions

- [ ] `games/caesars-challenge/` — **multi-file is justified here** (12 puzzle types + generator + map + themed renderer). `index.html` + `js/*.js` ES modules, all inside the game folder. No build step, no frameworks, no CDN.
- [ ] Canvas 2D only, dark-theme palette, `touch-action:none`, viewport `user-scalable=no`
- [ ] Back button `href="../../index.html"` — EXACT
- [ ] Canvas-drawn HUD pill top-centre; canvas-drawn level-complete / level-failed screens (no HTML)
- [ ] Own localStorage item `calebArcadeData:caesars-challenge`, game's fields at top level, `saveData` returns false on failed write and the UI says so
- [ ] No network calls

## Acceptance Criteria

- [ ] Plays with zero JS console errors
- [ ] All 100 levels generate: `buildLevel(n)` for n = 1..100 returns ≥10 solvable puzzles whose stated answer passes the checker, and every displayed numeral is canonical-valid unless the puzzle is deliberately a forgery
- [ ] Determinism: `buildLevel(n)` twice gives identical output
- [ ] Level 1 is trivially readable by a 7-year-old; clear start overlay + teach cards
- [ ] Card added to root `index.html`; row + count bumped in `docs/games-index.md`
- [ ] `docs/game-caesars-challenge.md` created (intro, features, files, design decisions, empty `## Memory`)

---

# MODULE CONTRACT (binding — lanes must not deviate)

All files under `games/caesars-challenge/`. ES modules, `<script type="module" src="js/game.js">`.
No module may import a lane it does not own except through the exports listed here.
If you need something not in this contract, implement it privately inside your own
module — do NOT add cross-module exports.

## `js/rng.js` — LANE A
```js
export function makeRng(seed)   // -> function(): float in [0,1)  (mulberry32, deterministic)
export function pick(rng, arr)  // random element
export function shuffle(rng, arr) // returns a NEW shuffled array
export function randInt(rng, lo, hi) // inclusive
```

## `js/numerals.js` — LANE A (pure, no DOM)
```js
export const SYMBOLS   // [['M',1000],['CM',900],...,['I',1]] descending, for greedy encode
export const LETTERS   // ['I','V','X','L','C','D','M']
export function toRoman(n)        // 1..3999 -> canonical string; throws RangeError outside
export function fromRoman(s)      // canonical or loose -> integer, or null if unparseable
export function isValidRoman(s)   // strict canonical only ('IIII','VX','IC','XXXX' -> false)
export function invalidReason(s)  // short kid-readable string, or null if valid
export function makeForgery(n, rng) // -> {text, reason} a plausible INVALID variant of toRoman(n)
```

## `js/levels.js` — LANE A
```js
export const PROVINCES // 10 items: {index, numeral, name, levels:[from,to], icon, accent, blurb}
export function levelSpec(level)  // 1..100 -> {level, province, provinceIndex, title, isBoss, puzzleCount, maxMistakes, freeHints, sundialMs, maxValue, types:[...]}
export function buildLevel(level) // deterministic -> {level, spec, puzzles:[Puzzle...]}, puzzles.length === spec.puzzleCount
```

**`Puzzle` shape — every field below, every type:**
```js
{
  id,            // string, unique within the level
  type,          // 'decode'|'encode'|'add'|'subtract'|'multiply'|'divide'|'compare'
                 // |'order'|'forgery'|'missing'|'sequence'|'scales'|'cipher'
  answerKind,    // 'arabic'|'roman'|'choice'|'order'|'scales'
  prompt,        // plain-text question line, e.g. 'What number is this?'
  display,       // the big centre content: {mode:'roman', text:'XLII'}
                 //   | {mode:'arabic', text:'42'}
                 //   | {mode:'expr', parts:['XL','+','II','=','?']}
                 //   | {mode:'scroll', text:'FDHVDU', shiftRoman:'III'}
                 //   | {mode:'blank', text:'X_V'}
                 //   | {mode:'seq', parts:['V','X','XV','?']}
  answer,        // arabic:number | roman:string(canonical) | choice:index(int)
                 //   | order:array of choice indices in correct order | scales:number (target)
  choices,       // REQUIRED for 'choice' and 'order': [{label, sub}] — label is the big text
  scales,        // REQUIRED for 'scales': {target:number, targetRoman:string, pool:[{label,value}]}
                 //   a valid subset of pool sums to target
  hint,          // one kid-readable sentence
  teach,         // optional deeper explanation shown on 2nd hint / after a miss
  points         // base points, 100..400 scaling with difficulty
}
```
Invariants Lane A owns: for every generated puzzle, `checkAnswer(p, p.answer) === true`
(Lane A must not import puzzles.js — instead guarantee the shapes above exactly).
Every roman string shown is canonical EXCEPT the forgery entry in a `forgery` puzzle.

## `js/theme.js` + `js/render.js` — LANE B
```js
// theme.js
export const THEME // {bgStops:[...], accent:'#6c5ce7', glow:'#a29bfe', sub:'#a0c4ff',
                   //  gold:'#ffd32a', danger:'#e74c3c', marble:'#e8e2d0', stone:'#3a3a6e'}
export function roundRect(ctx,x,y,w,h,r)       // path only, no fill/stroke
export function fitText(ctx,text,maxW,maxSize,weight,family) // -> px size, sets ctx.font
export function carvedText(ctx,text,x,y,size,color) // chiselled/bevelled centre-aligned text
export function button(ctx, rect, label, opts)  // rect={x,y,w,h}; draws pill button

// render.js
export function initRender(canvas, ctx)
export function onResize(W, H)                  // rebuild cached backdrop + gradients
export function setProvince(provinceIndex, isBoss) // invalidate + rebuild backdrop cache
export function drawBackground(ctx, W, H, t)    // cached marble/columns/torches/motes + arch on boss
export function drawHudPill(ctx, W, hud)        // hud={levelLabel, provinceName, index, total, score, streak, mistakes, maxMistakes, sundialPct, hintsLeft} -> returns {hintRect}
export function drawMosaic(ctx, rect, revealed, total, seed)
export function drawLevelMap(ctx, W, H, t, view) // view={provinces, progress:{stars:{}, unlocked}, scrollY, profileName}
                                                 // -> {nodes:[{level,x,y,r}], maxScroll, profileRect, trophyRect}
export function drawLevelComplete(ctx, W, H, t, res) // res={level,stars,score,best,isBoss,newBest,artifact}
                                                     // -> {nextRect, retryRect, mapRect}
export function drawLevelFailed(ctx, W, H, t, res)   // -> {retryRect, mapRect}
export function drawProfileSelect(ctx, W, H, t, profiles) // -> {rects:[{key,rect}]}
export function drawTrophyRoom(ctx, W, H, t, owned)  // -> {backRect}
export function drawBossRival(ctx, rect, t, rival)   // rival={pct, name, lead}
export const fx = { spark(x,y,n), laurel(W,H), dust(W,H), update(dt), draw(ctx), clear() } // ≤120 live
```

## `js/puzzles.js` — LANE C
```js
export function checkAnswer(puzzle, value) // -> boolean. value types match answerKind:
                                           // arabic:number|string, roman:string, choice:int,
                                           // order:int[], scales:int[] (indices into pool)
export function formatAnswer(puzzle)       // -> display string of the correct answer
export function drawPrompt(ctx, puzzle, rect, t) // renders puzzle.prompt + puzzle.display in rect
export function createInput(puzzle, hooks) // hooks={onSubmit(value), onChange(value), sfx(name)}
// returned widget:
// { kind, layout(rect), draw(ctx, t), pointerDown(x,y), pointerMove(x,y), pointerUp(x,y),
//   key(e) /* -> true if consumed */, getValue(), isComplete(), setEnabled(b),
//   flash('ok'|'bad'), reveal(puzzle), reset() }
```
Lane C imports from `numerals.js` (`isValidRoman`, `fromRoman`, `toRoman`) and
`theme.js` (`roundRect`, `fitText`, `carvedText`, `button`) ONLY. `layout(rect)` is
always called before the first `draw`. Widgets must never assume canvas size directly.

## `index.html` + `js/game.js` + `js/audio.js` + wiring — LANE D
- `index.html`: boilerplate shell, back button `../../index.html` EXACT, start overlay,
  `<canvas id="c">`, `<script type="module" src="js/game.js">`. All CSS inline.
- `js/audio.js`: `export const sfx = { init(), play(name), mute(b) }` — Web Audio,
  lazily created on first gesture. Names: `tap, correct, wrong, star, level, fail, boss, coin`.
- `js/game.js`: single rAF loop, screen state machine
  `'profile'|'map'|'play'|'done'|'failed'|'trophy'`, pointer + key dispatch to whatever
  the current screen's hit rects / active widget are, scoring, sundial, streak multiplier,
  save/load (`calebArcadeData:caesars-challenge`, `saveData` verified read-back, surfaced
  failure), hint spend, star award, unlock, mosaic reveal count.
- Wiring: root `index.html` card (`href="games/caesars-challenge/"`, class
  `.card-caesars-challenge`, gradient `linear-gradient(145deg,#141452,#6c5ce7,#ffd32a)`,
  icon 🏛️, title "Caesar's Challenge"), `docs/games-index.md` row + count bump,
  `docs/game-caesars-challenge.md`.

## Save shape (Lane D owns; documented so lanes agree)
```js
{ v:1, lastProfile:'caleb',
  profiles:{ caleb:{ stars:{'1':3}, best:{'1':1240}, unlocked:1, totalScore:0,
                     denarii:0, trophies:[], bestStreak:0 }, ezra:{...} } }
```

---

## Integration notes (coordinator fills in)

### Round 1 status
- Lane B DONE: `js/theme.js` (381 ln) + `js/render.js` (2218 ln). Screenshots rendered at
  portrait/landscape/small into `research/shots/` — art confirmed good (marble columns,
  flickering torches, province banners, carved Roman HUD level label, Via Appia map with
  100 milestone coins + province bands + serpentine road).
- Lane A: still iterating on the 1..3999 numeral self-test.

### POLISH BACKLOG (final pass, after integration)
- [x] Level-map milestone numbers low-contrast — FIXED by Lane B (dark cut + bright lip, locked variant lightened).
- [x] Map road weaving behind rows — was already threading node centres; Lane B removed a stray lead-in stub.
- [ ] Mosaic panel on the play screen sits low and small; Lane D should place it where it reads as a reward.

### INTEGRATION CHECKS I MUST VERIFY MYSELF (Lane B's real API vs contract)
- [ ] `setProvince(i, isBoss, accentColor)` — 3rd arg is an ADDITION. Lane D must pass
      `PROVINCES[i].accent` or province tinting silently falls back to render.js's internal
      colour table and won't match Lane A's data. **Most likely miss — check game.js.**
- [ ] `drawHudPill` returns `{hintRect, pillRect}` (pillRect extra).
- [ ] `drawLevelMap().nodes` are **SCREEN** coords and **visible stones only** — hit-testing must
      not assume all 100 are present, and must not re-apply scrollY.
- [ ] Optional `res` fields render.js reads: `res.t` (screen-local clock from 0 at entry — drives
      star pops + confetti; without it the level-complete screen is static), `res.nextLocked`,
      `res.solved`/`res.total` on failed. Lane D should pass all of them.
- [ ] `theme.js` exports Lane-B-internal helpers below a banner — Lane C/D must NOT use those.
- [ ] Perf: measured DESKTOP ONLY (macOS Chrome + Node draw-call mock). Backdrop baked, 9 heavy
      calls/frame steady, 0 gradients/frame, particle cap 120 = 5 fills. **No tablet number
      claimed — must be stated honestly in the docs node.**
