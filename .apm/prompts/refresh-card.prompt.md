---
description: Refresh a game's home-page poster (card.json) from what the game actually uses
argument-hint: <slug> [more slugs…] | --all | --stale
allowed-tools: Read, Grep, Glob, Edit, Write, Bash(git log:*), Bash(node scripts/build-index.mjs:*)
---

Refresh the home-page card(s) for: **$ARGUMENTS**

Follow `.apm/specs/game-card.spec.md` exactly. Schema: `schema/game-card.schema.json`.

## Which games
- One or more slugs: those games.
- `--all`: every `games/*/card.json`.
- `--stale`: only games whose newest commit (`git log -1 --format=%as -- games/<slug>`) is newer than the card's `source.refreshed` (or `updated`).

## For each game

1. **Read the evidence.** Read `games/<slug>/card.json` plus the game's `index.html` and any CSS/JS it loads. Look for:
   - **Name:** `<title>`, the title-screen heading or logo text, and what the game calls itself.
   - **Fonts:** Google Fonts `<link>`s, `@font-face`, `font-family` on title and menu screens, and canvas `ctx.font = "…"` strings.
   - **Colours:** CSS custom properties, title and menu background colours, hero/player colours, and the `fillStyle`/`strokeStyle` values used most.
   - **Pitch:** the how-to-play or instructions text, and what the player actually does in the first 30 seconds.
   - **Art:** any logo or icon file in the folder (for `wordmark` / `icon.image`).
2. **Update the card from that evidence:**
   - `name`: as shown in the game.
   - `blurb`: second person, what you *do*, fun and kid-friendly. It must fit on **2 lines** of the card with no ellipsis, which in practice is about 65 characters. `build-index.mjs` measures it (Bricolage Grotesque 14px, 242px wide at 1333×690) and rejects the card if it would wrap to 3 lines; when that happens, **reword** it shorter, never truncate it.
   - `icon.emoji`: matches the hero or the goal. Use `icon.image` / `wordmark` only if a real file exists.
   - `title.font`: the game's own display font if it's a Google Font. If it's a local font, pick the closest Google Font and say so in `source.notes`.
   - `background.gradient`: 2–3 colours from the game's palette. Add `background.css` for a CSS-only pattern that echoes the game world.
   - Check the legibility rules (title ≥ 3:1, blurb ≥ 4.5:1, title fits a 260px card). On light backgrounds, use a dark `blurbStyle.color` and set shadows to `"none"`.
3. **Leave some fields alone:** never change `slug` or `added`, and never touch anything listed in `locked`.
4. **Record what you did:** set `updated` to today, and set `source` to `{ "files": [what you read], "refreshed": today, "notes": "one line on where the look came from" }`.
5. If the game has **no clear identity**, say so and leave it on the default style unless the user asks you to design one.

## Output
- Before saving, show a short before/after table of the changed fields for each game. For `--all`/`--stale`, show every game in one table and wait for "go".
- Save. The `cards-index` hook rebuilds `index.html` automatically. If it prints card errors, fix them and save again.
- Finish with `node scripts/build-index.mjs --check`.
