---
name: garfield-arcade
description: Rules of the road for working in the Garfield Boys' Arcade repo (originally "Caleb's Arcade"). Use this skill whenever you're touching anything inside the caleb-games repo — adding a new game, fixing a bug in an existing one, porting open-source code, changing deployment, editing docs, or even just answering questions about a game's design. Triggers on phrases like "add a game", "fix the [game name] bug", "port [repo] into the arcade", "update the back button", "deploy to GitHub Pages", or anything that names one of the 49 games (archers, drift, snake, tetris, treehouse, monster jump, etc.). The skill keeps the docs sane: every game has exactly one game-<name>.md, conventions live in shared rule files, no orphan task/fix notes get spawned. ALSO use this skill if the user asks to clean up, audit, or reconcile the docs/ folder, or if they describe a new arcade-related workflow that should land in the rules.
---

# Garfield Boys' Arcade — Working Rules

This is a static browser arcade for the Garfield boys (formerly branded "Caleb's Arcade", you'll still see that name in `docs/plan.md`). 49 games at `games/<name>/index.html`, served as a static site. Source of truth for branding is the home page `index.html` title — currently "Garfield Boys' Arcade".

The doc structure is opinionated and must stay opinionated. The whole point of these rules is that every future "I want to fix Snake" or "let's add a game" lands in a known place, so the agent next time can read one file and know the whole story.

## Read these before doing any game work

The repo carries its rules in `docs/`. Before you touch a game — even a one-line fix — read what's relevant:

- `docs/plan.md` — project purpose, architecture, core principles
- `docs/file-structure.md` — the doc-governance rules (one node per game, edit don't create, no task nodes)
- `docs/new-game-guide.md` — the boilerplate every game must follow (HTML shell, color palette, Web Audio, HUD pill, back button, localStorage)
- `docs/deployment.md` — local dev + GitHub Pages gotchas (the `../../index.html` back button rule lives here)
- `docs/games-index.md` — master list of all games with directory + description

And then the one that matters most for the specific game:

- `docs/game-<name>.md` — single source of truth for that game (features, bug history, file structure, key design decisions)

These are not optional reads. They exist because Claude has worked on this repo many times and the only way it stays coherent is if every session catches up by reading. If a rule file contradicts what you see in code, the code is canonical and the rule file is stale — flag it and update.

## The one absolute rule

**One `game-<name>.md` per game. Always. Edit it, never spawn siblings.**

If you fix a bug in Tetris, you edit `game-tetris.md` — you do not create `tetris-bug-fix.md` or `tetris-improvements-round-3.md`. If you add a level editor for Archers, you append a section to `game-archers.md`. If you do a perf pass on Driven Wild, the perf details land inside `game-driven-wild.md`.

The reason is simple: when someone (or you, next month) asks "what do I need to know about Tetris?", they should be able to read **one file** and have the whole picture. The vault has been cleaned up to enforce this; don't backslide.

The corollary: when you're done with a piece of work, the relevant `game-<name>.md` should reflect the new reality. Updated features, new bug fixes added to the bug list, new files listed under "Files", any significant design decisions captured. If you can't think of anything that changed about the game's design or behavior worth noting, the work probably wasn't significant enough to need a doc update — but stop and double-check.

## What goes in game-<name>.md

There's no rigid template — `game-tetris.md` is short and feature-list-y, `game-archers.md` is long with full architecture sections. Match the depth of the game. But cover what matters:

- **One-paragraph what-is-it** at the top
- **Features** — what the game actually does, the systems it has
- **File structure** — if the game spans more than one file, list them with a one-line description each
- **Key design decisions** — the things you'd regret forgetting (why orthographic camera, why no sprites, why touch zones not analog)
- **Bug fixes** — running list of non-obvious bugs caught and how they were fixed. This is gold for "did we already hit this?" lookups.
- **Anything weird** — porting source, asset provenance, build quirks, naming history

What does NOT belong: task IDs, agent assignments, "TODO" lists, progress tracking, dated work logs. The doc is documentation, not a journal.

## When you're adding a new game

Follow `new-game-guide.md` for the conventions (boilerplate HTML, colors, audio, back button, HUD). Then:

1. Create `games/<name>/index.html` (single self-contained file is the default; multi-file is fine if needed)
2. Add a card to the root `index.html` (themed gradient, link, icon, title, description)
3. Add a row to `docs/games-index.md` and bump the count at the top
4. Create `docs/game-<name>.md` with the one-paragraph intro, features, file structure, and design decisions
5. If you ported from an open-source repo: clone into `games/<name>/research/` (gitignored), keep notes on what was adapted and what was discarded

The `game-<name>.md` filename should match the directory name where possible. Existing mismatches (`game-tower-defense.md` for `games/towerdefense/`, `game-resin-animals.md` for `games/resincritters/`) are tolerated history — don't rename them and break inbound references, but don't create new mismatches.

## When you're working on multiple games at once

If a single piece of work touches several games (e.g. "tighten the back button across all games", "standardize the HUD pill"), the rule is:

- Edit each affected `game-<name>.md` with what changed for that game
- If the change established a new convention, update `new-game-guide.md` too
- Do not create a per-game progress note for the batch

If the change is purely cross-cutting (e.g. a CSS convention update with no per-game divergence), `new-game-guide.md` alone is enough.

## When you're tempted to create a new file

Stop. Ask yourself which of these it is:

| You want to write | Where it actually goes |
|---|---|
| `tetris-fix-X.md` | Append to bug fixes in `game-tetris.md` |
| `archers-level-editor.md` | New section in `game-archers.md` |
| `monster-jump-assets.md` | "Origin" or "Assets" section in `game-monster-jump.md` |
| `update-games-index-add-X.md` | Just update `games-index.md`. No companion note. |
| `task_<id>.md`, `ask_<id>.md`, `fix-<thing>.md` | Nowhere. These are the cruft pattern that this skill is here to prevent. |
| Cross-game CSS convention | Update `new-game-guide.md` |
| Local dev / deployment quirk | Update `deployment.md` |

A new top-level file in `docs/` is justified only when:
- A genuinely new structural concern appears that doesn't fit the existing rule files (rare)
- A new game is being added (then it's a `game-<name>.md`)

## Format conventions for new docs

When you write a new `game-<name>.md` (or any new doc), keep it clean for Claude Code:

- **No YAML frontmatter.** The old `--- color: green / isContextNode: false ---` block was for a Voicetree visualizer that this repo has moved off of. Leave it on existing files (don't churn for the sake of churning) but don't add it to new files.
- **No `[[wikilinks]]`.** Same reason. Use plain markdown links if you actually need a link, or just reference filenames inline (`see game-tetris.md`).
- **Lowercase-with-hyphens** for filenames. No `task_` prefix, no date stamps, no `_v2`.
- **Match the prevailing voice** of the existing game docs — terse, factual, present tense for current state, past tense for bug fixes.

## Build/dev workflow reminders

From `deployment.md`, the things people forget:

- `npm start` → port 5000 via `serve`. Or `python3 -m http.server 5000`.
- Back-button hrefs MUST be `../../index.html`, not `../../` or `/`. GitHub Pages doesn't serve directory indexes; the trailing-slash form 404s in production but works on localhost. Easy to miss.
- The `server/index.js` Express server is only needed for AI features (RPS icon generation via Bedrock). Static `serve` is fine for normal play.
- The `games/driven-wild/` dir is internally still named that, but the user-facing title is "Speed Racer" (rename happened post-port from js13kGames). Folder paths stay; titles in the HTML and home-page card reflect the rename.

## Known structural quirks (don't be confused by these)

- **`games/archers/` vs `games/archers-3d/`** — `archers-3d/` is the current 3D rewrite (Three.js, what people play). `archers/` is the legacy 2D Canvas source that the level editor (`games/archers/edit.html`) still targets for stage data. `game-archers.md` covers the 3D version primarily; the level editor section calls out the 2D path explicitly.
- **`game-resin-animals.md` ↔ `games/resincritters/`** — name mismatch is historical; the doc supersedes the directory name.
- **`game-tower-defense.md` ↔ `games/towerdefense/`** — same.
- **No `game-pacman.md`** — was missing for a long time. Reconcile if you touch pacman.
- **plan.md says "Caleb's Arcade", index.html says "Garfield Boys' Arcade"** — repo got rebranded, plan.md hasn't caught up. Treat the home page as canonical.

## Mental model

Think of `docs/` as the project's longest-running pull-request description. Every change to the arcade should leave it readable to the next agent who walks in cold. If your work doesn't show up in the right `game-<name>.md`, you've left a hole. If you've spawned a sibling file, you've left clutter. Both make the next agent's job harder. The skill exists to keep this from drifting back.
