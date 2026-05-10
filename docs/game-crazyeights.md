---
color: green
isContextNode: false
---
# Crazy Eights

Card game with AI opponent, suit picker for wild 8s, and touch-optimized Canvas rendering.

## Features
- Standard Crazy Eights rules: match by rank or suit, 8s are wild with suit chooser
- AI opponent: prefers suit matches, saves 8s strategically, picks suit it holds most of
- Canvas-rendered cards with rank/suit corners and large center suit symbol
- Tap to select, tap again to play; drag to scroll hand
- Suit picker overlay when playing an 8
- Draw pile with auto-play of drawn cards if playable
- Deck reshuffles from discard (keeping top card) when empty
- Dimmed unplayable cards for better UX
- Bigger card sizing: `min(90, W*0.16)` with tighter hand overlap

## Files
- games/crazyeights/index.html

[[games-index]]
