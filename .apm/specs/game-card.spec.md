# Game card spec (home-page poster)

Every game ships a `games/<slug>/card.json`. `scripts/build-index.mjs` turns all the cards into `index.html`: newest first, with a NEW badge for 14 days. **Nobody edits `index.html` by hand.** The template is `index.template.html` and the schema is `schema/game-card.schema.json`.

## The poster

```
┌───────────────────────────┐
│ [NEW]               ╲🦖╱  │  ← icon: emoji (or image), 104px, tilted −10°, bleeds off the corner
│                           │
│  background.css / gradient│
│                           │
│ Dino Park                 │  ← title: the game's own Google Font
│ Build a park for baby…    │  ← blurb: Bricolage Grotesque 14px, must fit 2 lines (no ellipsis)
└───────────────────────────┘   glow: brightest gradient stop at 40%
```

## Fields

| field | req | rule |
|---|---|---|
| `slug` | ✓ | Same as the folder name. |
| `name` | ✓ | What the game calls itself on its title screen. ≤ 28 chars. |
| `blurb` | ✓ | Says what *you do*: second person, present tense, fun. It must fit on **2 lines** of the card with no ellipsis, which in practice is about 65 characters. `build-index.mjs` measures it (Bricolage Grotesque 14px, 242px wide at 1333×690) and rejects the card if it would wrap to 3 lines; when that happens, **reword** it shorter, never truncate it. No "A game where…". |
| `added` | ✓ | `YYYY-MM-DD`, the day it first ships. Sets the sort order and the NEW badge. **Set it once and never change it.** |
| `updated` | | `YYYY-MM-DD`, bumped whenever the card changes. |
| `icon` | ✓ | `{ "emoji": "🦖" }` or `{ "image": "card-icon.png" }` (square, transparent, ≥ 256px, inside the game folder). |
| `wordmark` | | A logo image that replaces the text title. Only use it if the game already has a logo. |
| `title` | | Omit for the default arcade style. Otherwise `{ font, weight, size, color, letterSpacing, transform, style, shadow }` (`style: "italic"` when the game's logo is italic; the font link then asks for the italic cut). |
| `blurbStyle` | | `{ color, shadow }`. Needed on light backgrounds (dark text, `"shadow": "none"`). |
| `background.gradient` | ✓ | 2–3 hex colours taken from the game's palette. Rendered at 145°. Always used for the glow. |
| `background.css` | | CSS-only pattern that echoes the game world (grid, stripes, dots, felt, planks, rings). Layers are allowed; `url()` is not. |
| `glow` | | Override the glow colour. |
| `entry` | | Link target if it isn't `games/<slug>/`. |
| `hidden` | | `true` while it's a WIP. The card stays in git but isn't shown. |
| `locked` | | Fields `/refresh-card` must leave alone, e.g. `["blurb","title.font"]`. |
| `source` | | `{ files, refreshed, notes }`: where the look came from. |

## Where the look comes from (in order)

1. **The game's own identity:** its title-screen font (Google Fonts link, `@font-face`, `ctx.font`), its CSS variables, its background and hero colours, any logo file.
2. **If the game has none:** pick a Google Font and palette that fit its world (racing → condensed italic sans, cards → felt and serif, retro → pixel font). Say so in `source.notes`.
3. **If you're unsure:** leave `title` out and use the default arcade style. A plain card is better than a wrong one.

## Legibility rules (the reviewer checks these)

- Title ≥ 3:1 contrast and blurb ≥ 4.5:1 against the dominant background colour where the text sits (bottom-left).
- Title fits on a 260px-wide card: the longest word must not overflow at the chosen `size`. Guide: 24–30px for long names, 36–44px for short ones.
- Patterns stay subtle behind the text. Loud motifs go top-right, near the icon.
- One display font per card. The blurb is always Bricolage Grotesque.

## NEW badge and order

- Sorted by `added`, newest first, then by name.
- The NEW badge is worked out on the device: it shows when `today − added < 14 days` (`--new-days=N` changes this), so it expires without a rebuild.

## Add this section to `game.spec.md`

```md
## Home-page card
- Name on title screen:
- Blurb (fits 2 card lines, ~65 chars, what you do):
- Icon (emoji or image path):
- Title font (Google Font) + why:
- Palette (2–3 hex) + pattern idea:
- added: <ship date, YYYY-MM-DD>
```

## Example

```json
{
  "$schema": "../../schema/game-card.schema.json",
  "slug": "dino-park",
  "name": "Dino Park",
  "blurb": "Build a park and catch runaway dinos.",
  "added": "2026-09-26",
  "icon": { "emoji": "🦖" },
  "title": { "font": "Bangers", "size": 42, "color": "#fff", "letterSpacing": ".03em", "shadow": "3px 3px 0 #2F7D3B" },
  "blurbStyle": { "color": "#1f3a20", "shadow": "none" },
  "background": {
    "gradient": ["#2F7D3B", "#58B84F", "#FFC93C"],
    "css": "radial-gradient(circle at 82% 20%, #FFC93C 0 14%, transparent 15%), linear-gradient(#58B84F,#58B84F) bottom/100% 32% no-repeat, linear-gradient(#8fd6f0, #cdeefa)"
  }
}
```

## Reviewer checklist

- [ ] `card.json` exists, `slug` matches the folder, and `node scripts/build-index.mjs` passes
- [ ] `added` is today's date (new game) or unchanged (existing game)
- [ ] Name matches the title screen, and the blurb says what you do in 2 card lines, no ellipsis (the build checks this)
- [ ] Font and colours can be traced to the game (or `source.notes` explains why not)
- [ ] Contrast and fit rules above are met
- [ ] `index.html` was regenerated, not hand-edited
