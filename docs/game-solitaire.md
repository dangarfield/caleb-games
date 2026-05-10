---
color: green
isContextNode: false
---
# Solitaire

Klondike solitaire with drag-and-drop, undo, and win detection.

## Features
- Classic Klondike rules: 7 tableau columns, 4 foundation piles, stock/waste
- Canvas-rendered cards matching Crazy Eights style (card backs: inset rect #2c3e7a/#3b5998, shadows, proportional sizing)
- Touch + mouse drag cards/stacks between piles
- Tap stock to draw, double-tap to auto-send to foundation
- Undo support (up to 50 moves)
- Win detection with confetti animation
- Responsive card scaling
- 924 lines, IIFE-wrapped, no globals

## Card Rendering
- Red suits: `#e74c3c`, black suits: `#1a1a2e`
- Face cards show large center suit symbol
- Number cards have pip layouts
- Font stack: `'Segoe UI', system-ui, sans-serif`

## Files
- games/solitaire/index.html

[[games-index]]
