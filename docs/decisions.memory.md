# Arcade Decisions & Memory (cross-cutting)

Dated, arcade-wide decisions and gotchas that are NOT specific to a single game.
Per-game decisions live in that game's own `game-<name>.md` `## Memory` section.
Review periodically — memory drifts. Newest at the top.

---

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

## (historical) Doc name ↔ directory mismatches (tolerated; do not rename)
- `game-tower-defense.md` ↔ `games/towerdefense/`
- `game-resin-animals.md` ↔ `games/resincritters/`
Renaming breaks inbound references. Don't create NEW mismatches.

## (historical) archers vs archers-3d
`games/archers-3d/` is the current 3D rewrite (Three.js) — what people play.
`games/archers/` is the legacy 2D Canvas source the level editor
(`games/archers/edit.html`) still targets for stage data.
