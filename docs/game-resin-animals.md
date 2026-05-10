---
color: green
isContextNode: false
---
# Resin Animals

Toon Blast-style collapse puzzle game with a resin animal collection and two-player cooperative combining mechanic. Players win animals by completing levels across 4 locations, then combine their collections in the Combine Lab to unlock rare and epic animals.

## Current State

- Fully playable collapse puzzle with special tiles (rockets, bombs, disco balls)
- 70 resin animal sprites across 4 locations (40 common, 20 rare, 10 epic)
- Two-player profiles (Caleb & Ezra) with independent progress
- Combine Lab with visual recipes and notification badges
- Collection gallery with full-screen animal reveal overlays
- 30 moves per level, random boards, localStorage persistence
- Committed and pushed (commit 53c292d)

## Core Mechanics

- **9x10 grid** of 5 tile colors (red, blue, green, yellow, purple)
- **Collapse mechanic:** tap a connected group of 2+ same-color tiles to pop them. Adjacency = up/down/left/right.
- Touch-first: single tap to collapse a group. Also works with mouse click.
- After collapse, tiles fall down (gravity with spring physics bounce). New tiles spawn at top.
- **30 moves per level**, random board generation (pure Math.random(), no seeds)
- Score target to complete each level

### Special Tiles (created by large groups)

Bigger groups leave behind a special tile where you tapped:

| Group Size | Creates | Effect |
|------------|---------|--------|
| 5-6 tiles | **Rocket** | Clears entire row and column (cross pattern) with travel animation |
| 7-8 tiles | **Bomb** | Clears a 3x3 area with explosion ring animation |
| 9+ tiles | **Disco Ball** | Removes ALL tiles of one color from the board |

Special tiles combine when adjacent:
- Rocket + Rocket = clears row + column of both
- Rocket + Bomb = clears 3 rows + 3 columns
- Bomb + Bomb = clears 5x5 area
- Disco + anything = converts all of one color to the other special, then activates all

### Animations & Juice

- **Spring physics** for tile bounce on landing (damped oscillation)
- **Particle system:** colored chunks scatter on pop, sparkles on specials
- **Rocket travel animation:** projectile flies across row/column before exploding
- **Explosion rings:** expanding circle animation for bombs
- **Disco ball:** color cycling effect, then chain activation
- **Gift box bounce** on level complete before reveal
- **Card pop animation** on animal reveal (scale spring)
- **Star pop** animations on win screen

## 4 Locations

Each location has a themed background image and pool of 10 common animals:

| Location | Background | Common Animals |
|----------|-----------|----------------|
| **Forest** | bg-forest.png | Frog, Rabbit, Fox, Owl, Hedgehog, Snail, Butterfly, Mouse, Bee, Ladybug |
| **Ocean** | bg-ocean.png | Goldfish, Seahorse, Starfish, Dolphin, Crab, Octopus, Salmon, Duck, Turtle, Penguin |
| **Savanna** | bg-savanna.png | Cat, Dog, Sparrow, Lizard, Gecko, Chicken, Goat, Capybara, Otter, Rhinoceros Beetle |
| **Jungle** | bg-jungle.png | Parrot, Koala, Panda, Bat, Chameleon, Scorpion, Dragonfly, Moth, Newt, Hummingbird |

## Animal Collection & Tiers

| Tier | Count | How to Get | Max Held |
|------|-------|------------|----------|
| Common | 40 (10 per location) | Win any level in that location | 1 each |
| Rare | 20 | Combine in Lab (Caleb's common + Ezra's common) | 1 each |
| Epic | 10 | Combine in Lab (Caleb's rare + Ezra's rare) | 1 each |

No consumption on combine — just requires ownership. Both players receive the result simultaneously.

### Rare Recipes (Caleb's animal + Ezra's animal)

| Rare | Caleb Provides | Ezra Provides |
|------|---------------|---------------|
| Wolf | Fox | Dog |
| Sea Dragon | Seahorse | Lizard |
| Eagle Owl | Owl | Butterfly |
| Polar Bear | Penguin | Hedgehog |
| Peregrine Falcon | Sparrow | Bee |
| Manta Ray | Goldfish | Starfish |
| Moose | Rabbit | Turtle |
| Snow Leopard | Duck | Cat |
| Poison Dart Frog | Ladybug | Frog |
| Panther | Mouse | Bat |
| Giant Tortoise | Snail | Chicken |
| Peacock | Goat | Parrot |
| Hammerhead Shark | Dolphin | Salmon |
| Rhinoceros Beetle | Rhinoceros Beetle | Scorpion |
| Kingfisher | Hummingbird | Chameleon |
| Red Panda | Koala | Panda |
| Giant Squid | Octopus | Crab |
| Atlas Moth | Moth | Dragonfly |
| Komodo Dragon | Newt | Gecko |
| Wolverine | Capybara | Otter |

### Epic Recipes (Caleb's rare + Ezra's rare)

| Epic | Caleb Provides | Ezra Provides |
|------|---------------|---------------|
| Blue Whale | Manta Ray | Giant Squid |
| Harpy Eagle | Peacock | Peregrine Falcon |
| Tyrannosaurus Rex | Komodo Dragon | Wolverine |
| Great White Shark | Polar Bear | Giant Tortoise |
| Golden Eagle | Kingfisher | Atlas Moth |
| Colossal Squid | Sea Dragon | Hammerhead Shark |
| Siberian Tiger | Snow Leopard | Panther |
| African Elephant | Rhinoceros Beetle | Moose |
| Snowy Owl | Eagle Owl | Red Panda |
| King Cobra | Wolf | Poison Dart Frog |

## Combine Lab

- Shows all recipes as cards (2 columns), inline format: X + Y = COMBINE button
- First ingredient always from Caleb, second always from Ezra
- Shows "Caleb's Fox" if found, or "Caleb to find" if not
- COMBINE button appears (with gift icon) when both ingredients owned
- No consumption — animals stay in collection after combining
- Both players receive the combined animal simultaneously
- Notification badge on Combine Lab button shows count of ready-to-combine recipes
- Button pulses with CSS animation when recipes are available

## Collection UI

- Grid layout (5 per row, full width, no padding)
- Location icon (landscape) in top-left of each animal card
- Undiscovered animals show as dark silhouettes with location hint text ("Found in Forest")
- For rare/epic undiscovered: shows "Combine with Ezra's" or "Combine with Caleb's"
- Tap any animal for full-screen reveal overlay (same as win reveal)
- 300px large image display with card pop animation

## Screens

1. **Landing** — "Resin Animals" title, purple theme, bg-main.png background
2. **Player Select** — "Who's playing?" with Caleb / Ezra buttons
3. **Main Menu** — 4 location buttons (Forest/Ocean/Savanna/Jungle) with remaining count badges
4. **Game Board** — Canvas gameplay with HUD (moves, score, player name)
5. **Level Complete** — Stars + "AWESOME!" + gift box bounce → animal reveal overlay
6. **Collection** — Grid of all 70 animals by tier, back button top-right
7. **Combine Lab** — Recipe cards with combine buttons, notification badge, back button

## Visual Style

- Purple/white card UI theme throughout
- Orange → purple button colors on landing page
- Background images per location during gameplay
- bg-main.png for menus
- Remaining-to-find count shown as red pill badges on location buttons
- CSS animations: cardPop, starPop, popupSlam, btnPulse, recipePulse, giftBounce

## Architecture

- `games/resincritters/index.html` — single-file HTML game (~1500 lines, all CSS/HTML/JS inline)
- `games/resincritters/assets/sparkle.png` — 4-point star particle (transparent background)
- `games/resincritters/assets/bg/` — 5 background images (bg-main, bg-forest, bg-jungle, bg-ocean, bg-savanna)
- `games/resincritters/assets/resin-animals/` — 70 PNG sprites (kebab-case filenames)
- Canvas 2D for game board, DOM/CSS for all menus and UI
- All state in shared `calebArcadeData` localStorage key under `resinAnimals` namespace

### Animal Image Mapping

camelCase IDs → kebab-case filenames with 3 overrides:
```javascript
const ANIMAL_IMG_OVERRIDES = {
  rhinoBeetle:'rhinoceros-beetle', greatWhite:'great-white-shark', elephant:'african-elephant'
};
function animalImgPath(id) {
  if (ANIMAL_IMG_OVERRIDES[id]) return 'assets/resin-animals/' + ANIMAL_IMG_OVERRIDES[id] + '.png';
  const kebab = id.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  return 'assets/resin-animals/' + kebab + '.png';
}
```

### localStorage Structure

```json
{
  "resinAnimals": {
    "profiles": {
      "caleb": {
        "animals": { "frog": 1, "fox": 1, ... },
        "rares": { "wolf": 1, ... },
        "epics": { "blueWhale": 1, ... }
      },
      "ezra": { ... }
    }
  }
}
```

## Key Design Decisions

- No seeded PRNG — pure Math.random() for board generation (simpler, every play is different)
- Match-2 minimum (not 3) — more forgiving for young players
- No ingredient consumption on combine — just requires ownership at any point
- Both players receive combined animal simultaneously (no inbox/trading needed)
- Max 1 of each animal (no duplicates/quantities)
- Single-file architecture for simplicity (no build tools, no modules)
- Reused reward reveal modal for both winning and collection detail view

[[games-index]]
