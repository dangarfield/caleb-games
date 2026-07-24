# Games Index

All 55 games in Garfield Boys' Arcade (56 directories — Archers has legacy 2D + current 3D).

| Game | Directory | Description |
|------|-----------|-------------|
| 2048 | games/2048/ | Sliding tile puzzle with easy mode |
| Arcanoid | games/arcanoid/ | Breakout clone with 12 power-ups |
| Battleship | games/battleship/ | Salvo-based firing with cinematic view |
| Bomberman | games/bomberman/ | Grid-based bomb game with AI |
| Bottle Sort | games/bottlesort/ | Liquid sort puzzle with tilt pour |
| Bubble Shooter | games/bubbleshooter/ | Aim-and-shoot bubble matching |
| Captain Callisto | games/callisto/ | Space platformer (WebGL) |
| Clash of Space | games/clashofspace/ | Twin-stick space shooter |
| Conquer | games/conquer/ | Territory conquest |
| Count Master | games/countmaster/ | Number runner |
| Crazy Eights | games/crazyeights/ | Card game with AI |
| CyberStream | games/cyberstream/ | Swipe-only runner |
| Drift Racer | games/drift/ | Top-down drift racing with track editor |
| Speed Racer | games/driven-wild/ | 3D racing with player select, jump ramps + flip/boost (formerly DR1V3N WILD) |
| Fling | games/fling/ | Physics flinging game |
| Free Kick | games/freekick/ | 3D perspective penalty kicks |
| Frogger | games/frogger/ | Classic road-crossing |
| Fruit Ninja | games/fruitninja/ | Swipe-to-slice fruit |
| Tower of Hanoi | games/hanoi/ | Disc-stacking puzzle with undo |
| InfiniJump | games/infinijump/ | Vertical platformer |
| Minesweeper | games/minesweeper/ | Classic mine sweeper |
| Pac-Man | games/pacman/ | Maze chase with ghosts |
| Paperboy | games/paperboy/ | Newspaper delivery |
| Petri | games/petri/ | Cell growth game |
| Racer 13 | games/racer13/ | Psychedelic lane racer |
| Rock Paper Scissors | games/rps/ | RPS with custom sets |
| Endless Runner | games/runner/ | Side-scrolling runner |
| Shed | games/shed/ | Custom rules card game |
| Snail | games/snail/ | Snail trail puzzle |
| Snake | games/snake/ | Classic snake game |
| Sensible Soccer | games/soccer/ | Top-down 11v11 football |
| Solitaire | games/solitaire/ | Klondike solitaire |
| Tate Draw | games/tatedraw/ | Drawing canvas |
| Tenacity | games/tenacity/ | Precision platformer |
| Tetris | games/tetris/ | Classic Tetris with SRS rotation |
| Tower Defense | games/towerdefense/ | Path-based tower defense |
| Tron | games/tron/ | Light cycle game |
| Whack-a-Mole | games/whackamole/ | Tap the moles |
| Worms | games/worms/ | Artillery combat (Hedgewars-style) |
| Treehouse Quiz | games/treehouse/ | Treehouse book series trivia quiz |
| Connection | games/connection/ | Shape-tracing puzzle with progressive difficulty |
| Tilt Maze | games/maze/ | 100-level physics-based 3D tilt maze |
| Archers | games/archers-3d/ | Archero-style wave shooter, Three.js 3D (legacy 2D source at games/archers/ powers the level editor) |
| Happy Glass | games/happyglass/ | Liquid-pouring puzzle with SVG metaball effect |
| Resin Animals | games/resincritters/ | Match-2 collapse puzzle (directory name is `resincritters`, doc is game-resin-animals.md) |
| Monster Jump | games/monster-jump/ | Drive Mad / Fancade WASM physics platformer |
| Monster Smash | games/monster-smash/ | Tap-to-smash monsters |
| Race Maker | games/race-maker/ | Build a Scalextric-style track piece-by-piece, then race it with corner braking and AI drivers (Three.js + Kenney Racing Kit) |
| Adsumudi | games/adsumudi/ | Hexagonal mental-math card game — combine 5 numbers with + − × ÷ to reach the target |
| Forest Friends | games/forest-friends/ | 3D survival game — survive 99 nights, rescue kids, tame wolves, fish/farm/cook, explore 4 biomes (Three.js) |
| Grid Quest | games/grid-quest/ | Ordnance Survey map puzzle game — 100 map quizzes + 100 route challenges with real OpenTopoMap tiles via Leaflet |
| Shapez | games/shapez/ | Factory automation — extract, belt, cut, rotate, paint, stack & deliver shapes to the hub |
| Librarian | games/librarian/ | 3D first-person book-sorting game — sort scattered books back onto enchanted library shelves (Three.js) |
| Spin Smash | games/spin-smash/ | Beyblade-style arena battler — knock tops off the edge, roguelike perk progression, 3 arenas with hazards |
| Pokemon FireRed | games/pokemon-firered/ | GBA emulator (EmulatorJS) — classic Pokemon adventure with save states |

## Naming quirks worth knowing

- **Speed Racer / DR1V3N WILD** — folder is still `driven-wild/`, but the user-facing title was renamed to "Speed Racer". Don't rename the folder; do reflect the new name in any user-facing text.
- **Archers** — `games/archers-3d/` is the current playable 3D rewrite (Three.js). `games/archers/` is the legacy 2D Canvas source kept around because the level editor (`games/archers/edit.html`) targets it.
- **Resin Animals ↔ resincritters** — historical name mismatch: doc is `game-resin-animals.md`, folder is `games/resincritters/`. Both names appear in the codebase; the home page card title is "Resin Animals".
- **Tower Defense ↔ towerdefense** — doc is `game-tower-defense.md`, folder is `games/towerdefense/`. Same kind of mismatch, kept for historical reasons.
