---
color: green
---
# Monster Jump

Physics-based vehicle platformer (Drive Mad) running on the Fancade game engine compiled to WebAssembly. Not modifiable — game logic, levels, and assets are all baked into binary/compressed formats.

## Architecture
- **Engine:** Fancade (Martin Magni) — voxel-based physics game creator exported for web
- **Runtime:** Emscripten (C/C++ → WASM)
- **All assets bundled** in a single zlib-compressed virtual filesystem (`index.data`)
- **Source:** Originally a Fancade game called "Drive Mad". Assets fetched verbatim from `gamecollections.me/game/3kh0-assets-main/drive-mad/webapp/` and rebranded as Monster Jump. `source_min.js` sets `locateFile` to prefix `webapp/` to all paths. Sounds and `atlas.png` are packed inside `index.data` (Emscripten virtual filesystem) — they are NOT served as separate HTTP assets.

## File Structure
| File | Size | Purpose |
|------|------|---------|
| `index.html` | 1.7KB | Page shell — loads CSS/JS, shows cover + progress |
| `webapp/fancade.css` | 4.6KB | Loading screen / UI styling |
| `webapp/source_min.js` | 12KB | Bootstrap — sets `locateFile` to prefix `webapp/` |
| `webapp/index.js` | 227KB | Emscripten runtime + VFS manifest |
| `webapp/index.wasm` | 1.9MB | Compiled game engine |
| `webapp/index.data` | 717KB | Compressed virtual filesystem (all assets) |
| `webapp/cover.jpg` | 10.6KB | Thumbnail (256×256) |
| `webapp/baloo2.woff` | 24KB | UI font |

## Virtual Filesystem Contents (packed in index.data)
- `/assets/atlas.png` — texture atlas for 3D blocks
- `/assets/blocks/` — ~170 voxel block definitions (WHEEL, MOTOR, SPHERE, DINO, etc.)
- `/assets/sounds/` — 15 WAV sound effects
- `/assets/games/5F084A0BCE06B710` — the Drive Mad level data
- `/assets/games/menu` — menu level
- `/assets/views/` — HTML/CSS/JS for in-game UI overlays
- `/assets/db` — game database/config

## Limitations
- **Not modifiable** — no readable source, no editable level files
- Game logic + physics locked in WASM binary
- Level data is proprietary Fancade format
- Only cosmetic changes possible (HTML title, CSS loading screen, cover image)
