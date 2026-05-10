---
color: green
isContextNode: false
---
# Minesweeper

Classic minesweeper with 3 difficulty modes and purple/blue visual style.

## Features
- **3 difficulties**: Easy (9x9, 10 mines), Medium (12x12, 30 mines), Hard (16x16, 50 mines)
- Tap to reveal, long-press (400ms) or flag button to flag mines
- Flood-fill auto-reveal with staggered cascade animation (setTimeout 20ms per ring)
- Safe first click — mines placed after first tap
- Timer with best-time tracking per difficulty via `calebArcadeData.minesweeper`
- Game over: mines revealed with stagger animation
- Win: auto-flags remaining mines

## Input Methods
- Tap/click to reveal
- Long-press to toggle flag
- Right-click to toggle flag
- Flag mode toggle button (bottom-right FAB) for mobile

## Notes
- DOM-based grid (not canvas) since minesweeper is inherently grid-based
- Responsive cell sizing: min 20px, max 44px
- Purple gradient unrevealed cells with glow border

## Bug Fixes
1. **Long-press flagging unreliable on tablets** — pressing-and-holding to flag would often fail because finger movement of even 1px off the small cell triggered `pointerleave`, canceling the 400ms timer. Fixed by `setPointerCapture(e.pointerId)` on pointerdown (locks all subsequent pointer events to the pressed element), plus a `longPressTriggered` boolean to cleanly separate long-press (flag) from short-tap (reveal). `pointerleave` now checks `hasPointerCapture` before canceling — only cancels for mouse hover-off, not for captured touch.

## Files
- games/minesweeper/index.html
