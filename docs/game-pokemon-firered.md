# Pokemon FireRed

GBA emulator wrapper using EmulatorJS. Plays Pokemon FireRed Version (2004) directly in the browser with touch controls on mobile and keyboard on desktop.

## Features

- Full GBA emulation via EmulatorJS (mGBA core, WebAssembly)
- Built-in virtual gamepad for touch devices (d-pad, A, B, L, R, Start, Select)
- Quick save button (top-right) triggers EmulatorJS save state to IndexedDB
- Save states persist in browser between sessions
- Keyboard controls on desktop (EmulatorJS defaults: arrow keys, Z=A, X=B, etc.)
- CDN-hosted emulator — no local WASM/core files needed

## Files

- `games/pokemon-firered/index.html` — EmulatorJS wrapper page
- `games/pokemon-firered/pokemon-firered.gba` — ROM file (not committed, user-supplied)

## Key Design Decisions

- Uses EmulatorJS CDN (`cdn.emulatorjs.org/stable/data/`) for all emulator files — no self-hosting
- ROM must be placed manually (gitignored due to size/licensing)
- BIOS is optional (mGBA core works without it)
- EJS_gameID set to 1001 to keep save data separate from other EmulatorJS instances
- Save state location defaults to browser IndexedDB
- Custom quick-save button overlaid on top of EmulatorJS UI for easy access

## Memory
