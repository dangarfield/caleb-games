# Arcade Decisions & Memory (cross-cutting)

Dated, arcade-wide decisions and gotchas that are NOT specific to a single game.
Per-game decisions live in that game's own `game-<name>.md` `## Memory` section.
Review periodically — memory drifts. Newest at the top.

---

## 2026-10-05 — Music and sound effects may come from Uppbeat
Dan may supply music and sound effects downloaded from uppbeat.io as well as his own masters. They ship as local
files in the game folder (music Opus/WebM 48k, SFX Opus/WebM mono 64k), with the originals and Uppbeat's credit
text (plus the plan it came from) kept in the game's `research/`. Recorded SFX play through Web Audio buffers on the
**Sounds** level. Rules: `knowledge/audio-patterns.md` → *Supplied audio*; pointer added to `arcade-build`
(.apm, .claude, .kiro, AGENTS.md) and `docs/new-game-guide.md`.

## 2026-09-29 — The home page has a theme tune
`home-theme.m4a` is encoded per `knowledge/audio-patterns.md` to `audio/home-theme.webm` (Opus 48k, 6dB down,
~1MB) and wired into `index.template.html`. No controls. It tries to play on load (browsers that allow autoplay,
e.g. after you've already tapped in the arcade, play at once) and otherwise starts on the first tap, armed on the
events that grant activation. Pauses when the tab is hidden, carries on when "← Games" brings the page back from
the back/forward cache, and remembers its position in sessionStorage if the page reloads instead. Unlike a game's
theme it uses `preload="auto"`, because it tries to play straight away.

---

## 2026-09-28 — Three.js games build all their UI in HTML/CSS
The canvas-drawn HUD pill and game-over rule was written for Canvas 2D games and never had a
Three.js exception, so the steering told a 3D game to draw its UI in the canvas. Rule now: a
Three.js/WebGL game builds every HUD, menu, overlay and game-over screen as HTML/CSS layered
over the renderer canvas, and nothing UI-related is drawn in WebGL. Canvas 2D games keep the
canvas HUD pill and canvas game-over. Dino Park, Crazy Golf, Buttons! and Traffic Jam already
work this way.

---

## 2026-09-28 — Home page generated from `card.json`; "← Games" is browser back
`index.html` is no longer hand-edited. Each game owns `games/<name>/card.json` (schema in
`schema/game-card.schema.json`, rules in `.apm/specs/game-card.spec.md`), and
`scripts/build-index.mjs` builds the page from `index.template.html`, newest `added` first,
with a NEW badge for 14 days worked out in the browser. The `cards-index` hook rebuilds on every
card save; `build-index.mjs --check` gates session end and commits (`.githooks/pre-commit`,
enabled with `git config core.hooksPath .githooks`). WIPs use `"hidden": true`, not HTML comments.
Librarian is a WIP with `"hidden": true`: kept in the repo, not shown or counted.

Same day: every game's `← Games` link keeps `href="../../index.html"` but now runs the shared
`data-arcade-back` snippet (`knowledge/arcade-back.md`), so coming from home it does
`history.back()` and home returns as it was left. `back-button-check` requires the snippet.

---

## 2026-08-25 — New games get their own save item, keyed `calebArcadeData:<gameName>`
The one shared `calebArcadeData` object hit a wall in practice, so the convention changes for
**new** games: each owns a single localStorage item whose key *starts with* `calebArcadeData` —
`calebArcadeData:<gameName>`, the folder name after the colon — holding that game's object
directly, not nested under its own name again. Keeping the prefix is the point: the hub's ⚙
panel lists every localStorage key alphabetically with its size and a Clear button, so a split key
still sits with the rest of the arcade's data and becomes its own clearable row.

**The legacy shape persists for most of the arcade and must not be touched.** Games already
storing under `data.<gameName>` inside the single `calebArcadeData` object keep doing exactly
that. Do not migrate one, and do not switch a game's storage while in there fixing something
else — the only reason to move a game is that it is the one whose saves are failing. Two shapes
coexisting is deliberate, not debt to clean up: a bulk migration would risk 60+ games' saved
progress to fix a problem that only bites the growing ones.

What this does and does not solve: `localStorage` is still ONE ~5 MB quota for the whole origin,
so splitting keys does not create room. It stops one object from being rewritten in full on every
save, keeps a corrupt or oversized game from taking the rest down with it, and makes "clear the
big one" actionable per game. The prune-ladder and never-swallow-a-write-failure rules in the two
entries below still apply to every save path, split or shared.
Updated: `.claude/rules/arcade-build.md`, `.apm/instructions/arcade-build.instructions.md`,
`AGENTS.md`, `knowledge/boilerplate.md`, both `game-reviewer` rubrics, `.apm/specs/game.spec.md`,
`.apm/skills/update-game/SKILL.md`.

## 2026-08-23 — One 5 MB quota, 64 games: a save path needs a prune ladder
Follow-on from the entry below, and the actual cause of the child's report. `localStorage` is
ONE quota for the whole origin — about 5 MB of characters, not per key and not per game — and
`calebArcadeData` is a single key holding all 64 games, so every game's save rewrites the whole
blob. When the origin fills up, **no game can save anything**, and each one fails for reasons
that have nothing to do with it. Three rules for any game in here:

1. **Retry by dropping what you can regenerate.** A refused write should give up its own
   autosave/scratch data — other players' first — and try again, before it tells the child no.
   What the child explicitly named and saved is never dropped to make room.
2. **Say which failure it is, with the number.** A quota failure on a nearly-empty origin is
   private browsing, not a full disk, and the two need different sentences. Count sizes in
   CHARACTERS: browsers quote the limit that way ("5 MB" ≈ 5 million characters), so halving to
   UTF-16 bytes prints 10 MB against a 5 MB limit.
3. **Probe at boot.** A browser that will not store anything should say so before an hour of
   work, not after.
The hub's ⚙ panel now shows total usage plus a size per game, because "clear an old game to make
room" is only actionable if you can see which one is big. Domino Rally implements all of this in
`games/dominoes/js/storage.js`; the other games still swallow their write errors.

## 2026-08-23 — A save path must never swallow a write failure
Reported by the child on Domino Rally: "save and load doesn't persist between browser
refreshes." Every arcade game writes to the one shared `calebArcadeData` key, and this class of
bug is arcade-wide, not per-game. Two rules came out of it.

**(1) Verify the write, then say so.** `storage.js` wrapped `localStorage.setItem` in a
`try {} catch {}` that ignored the exception and returned nothing, so private browsing, storage
disabled by policy, a full quota or partitioned storage all produced a success chime and no
save. A write now reads the value back, compares it to what it sent, and returns a boolean the
caller must handle — and because the Saves list renders the in-memory object, a refused write
also has to be ROLLED BACK, or the child sees a row that exists until they refresh. Also worth
knowing: a boot-time snapshot of the whole key, rewritten wholesale on every save, silently
clobbers whatever another tab or another game wrote in between. Merge onto a fresh read of the
key using a dirty-set of your own sub-keys.

**(2) A harness that seeds storage via `evaluateOnNewDocument` cannot test persistence.**
Puppeteer re-runs that init script on EVERY navigation, and a reload is a navigation — so a
suite whose page factory clears and re-seeds `calebArcadeData` will pass a save/refresh test
that could never fail, whatever the code does. Persistence tests must open the page RAW (borrow
the helpers, not the page factory) and call a real `page.reload()`. See
`games/dominoes/research/dsave.cjs`.

## 2026-08-23 — Assert the OUTCOME the player cares about, not the mechanism
A different failure shape from the three below, and it cost two child-reported bugs. Domino
Rally's Loop the Loop was covered by five checks that all measured the *mechanism*: does it fire
once, does the ball reach the top, does it go over inverted, does it stay on the orbit (worst
radial error 0.0 mm), does it come out low and forward. All five passed, every time, for weeks.
The item was still broken, twice over: the ball came out 56 mm to the side of the line the child
had aimed at it, and once that was fixed it arrived on target and slid the first domino forward
without knocking it over. Nothing was wrong with any assertion — they were true, and they were
about the wrong subject. The child's test is "did the next thing happen"; the harness's test was
"did the machine move correctly". Rule: for any mechanism whose purpose is to affect something
else, the suite must include the something else — lay the receiving line, then assert it falls.
Mechanism checks stay, because they are what localises a failure, but they may never be the only
checks. Corollary for the reviewer: a feature with 100% green mechanism coverage and no outcome
check is untested, not tested.

## 2026-08-23 — Third instance: a harness's own HELPERS decide what an index means
The rule from 2026-08-22 ("assert the state you mean, not a consequence a failure also
satisfies") recurred in Domino Rally in a form worth naming separately. A settle check read
`track.path.slice(20, 40)` — frames 20–40, meaning "shortly after GO". But the shared
`readTrack` helper TRIMS `path` to the first frame the body moved, and for the body under test
that frame was the one it got launched. So the slice was reading the flight and reporting it as
the settle: a healthy-looking 24 mm on a run where the object was airborne. Nothing about the
assertion looked wrong; the helper had quietly changed what an index meant. Rules: a harness
helper that trims, filters or normalises must say so at its call sites, and a check about a
PHASE of a run must anchor to something the run itself defines (a clock, an event, a raw
frame counter) rather than to an offset into a derived array. Three fraudulent results in this
game now, all three green.

## 2026-08-22 — A UI harness must prove its AIM before you believe either colour
Two fraudulent results in one session of Domino Rally work, and neither was a game
bug. (1) A world→screen map solved before opening a challenge was 1.47× off, because
the camera refits when the challenge loads — the same medium table, so the existing
"only reaim when the table size changes" rule named the wrong invariant. One suite
went red for a working feature; another went **green** because a long enough stroke
still crossed the target by luck. (2) A check that read "the rocket comes back down"
passed on a body that had been culled off the table to the sunk pose `y = -9`.
Rules for any Puppeteer-driven harness here: solve the aim from the game's own
camera, re-solve after anything that could refit it, assert the state you mean and
not a consequence a failure also satisfies, and treat a suspicious green with the
same suspicion as a red. Also: the game's own numbers (apex, drop, reach) are
geometry and travel between machines because the physics step is fixed; the
wall-clock numbers beside them do not.

## 2026-08-20 — `games-index.md` had drifted badly; reconciled to disk
The index had rows for games with no folder and was missing real ones. **The index is
not self-verifying — check rows against `ls games/` when you touch it.**

## 2026-08-20 — An uncommitted game is not a shipped game
A whole game was once built and reviewed, then lost because it was never committed. The
"human ships" gate at the end of `new-game` is the point where work becomes durable.

## 2026-08-20 — WebGL + a physics WASM engine are allowed, with sign-off and measurements
`arcade-build.instructions.md` says Canvas 2D, no external runtime deps. Precedent now
firmly exists for deviating: `archers-3d`, `sea-glass`, `race-maker`, `librarian` and
now `dominoes` all use Three.js from a CDN importmap, and `dominoes`/`sea-glass` add
Rapier WASM. The rule for future builds: deviation needs (a) explicit human sign-off
and (b) benchmarks, not intuition — Rapier's own docs recommend solver settings that
measurably break a domino chain. Also **always label where a perf number was measured**;
desktop Chrome under software rasterisation is not the tablet these games are played on.

## 2026-07-23 — AI-native SDLC primitives adopted
Introduced the `.apm/` primitive set (instructions, agents, skills, specs, hooks),
a `knowledge/` folder, and this memory/context layer — grounded in Meppiel's
PROSE/APM model. New games are now built via the `new-game` recipe, not ad-hoc.
The old `.dan-ide` swarm coordination via `SHARED.md` is superseded by typed
primitives + per-run `plan.md` (Plan Memento). Design docs: agent's
`garfield_arcade_sdlc/` pack.

## (historical) Back button must be `../../index.html`
`../../` and `/` work on localhost but 404 on GitHub Pages (no directory-index
serving). Every game's back link MUST be `../../index.html`. Enforced by the
`back-button-check` hook. Note: games use both `id="backBtn"` and `id="back-btn"`
— the hook keys off the href, not the id.

## (historical) Rebrand: Caleb's Arcade → Garfield Boys' Arcade
The home page `index.html` title is canonical. `docs/plan.md` still says "Caleb's
Arcade" and hasn't caught up — treat the home page as the source of truth.

## (historical) Speed Racer folder stays `games/driven-wild/`
User-facing title is "Speed Racer" (renamed post-port from js13kGames dr1v3n-wild).
The folder path stays `driven-wild/`; only the HTML title and home-page card
reflect the rename. Don't rename the folder (breaks paths).

## (historical) Moved off Voicetree
The old `--- color / isContextNode ---` YAML frontmatter and `[[wikilinks]]` in
`docs/` were for a Voicetree visualizer no longer used. Leave them on old files
(don't churn); do not add them to new files.

## (historical) Doc name ↔ directory mismatches and extra docs (allowed; do not rename)
- `game-tower-defense.md` ↔ `games/towerdefense/`
- `game-resin-animals.md` ↔ `games/resincritters/`
- `game-archers.md` ↔ `games/archers-3d/`
- Extra per-game sub-docs are fine: `game-fleet-forge-audio.md`, `game-fleet-forge-progression.md`, `game-waypoints-build.md`.
Renaming breaks inbound references. Don't create NEW mismatches.

## (historical) Archers lives in `games/archers-3d/`
The folder is `archers-3d` but the game is "Archers" on the home page; its level editor is
`games/archers-3d/edit.html`. The old 2D `games/archers/` was removed on 2026-09-28. Keep the path.
