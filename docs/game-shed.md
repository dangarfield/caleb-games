---
color: green
isContextNode: false
---
# Shed

A custom card game built as a single-file Canvas-based implementation with AI opponent, touch-optimized UI, and special card mechanics. Players progress through swap, play, and endgame phases, emptying their hand, face-up, and face-down cards to win.

## Rules

### Setup & Phases
1. **Swap Phase** — Player sees hand and face-up cards, can tap to swap strategically before play begins. AI also performs smart swaps (prioritizes 2, 10, A, K on face-up slots).
2. **Play Phase** — Turn-based play vs AI. Player with the lowest card goes first.
3. **Endgame** — Once the deck is empty, players progress through hand, then face-up, then face-down cards. First to empty all zones wins.

### Special Cards
- **2 (Reset)**: Always playable, resets the pile.
- **7 (Play Under)**: Next player must play a card ranked 7 or lower.
- **10 (Burn)**: Clears the pile entirely; same player goes again.
- **Jack / 11 (Glass)**: Always playable and see-through — the effective top of the pile is whatever card is beneath the Jack(s).
- **4-of-a-kind**: Automatically burns when four cards of the same rank sit on top of the pile.
- **3 and 8**: Normal cards with no special abilities.

### Face-Down Play
Face-down cards are played blind. If the card is unplayable, the card plus the entire pile go into the player's hand.

## Features

- Canvas 2D rendering with Crazy Eights-style card visuals: rounded corners, shadows, corner rank+suit, large center suit symbol, dark blue card backs with inset pattern, and gold highlight for selected cards.
- Cards sized at `Math.min(90, W/6)` with deck and discard centered at canvas midpoint.
- Special card labels displayed on card faces: RESET, <=7, BURN, GLASS.
- Double-tap shortcut to play selected cards quickly.
- "Pick Up Pile" button always visible during the player's turn.
- AI plays the lowest playable rank and plays all copies at once.
- Touch-optimized layout with clear hit regions for all card zones.

## Bug Fixes & Improvements

- **Zone transition fix**: Fixed layout bug where face-up and face-down cards rendered as tiny cards off-screen after the hand emptied. The active zone now promotes to the main hand area (full-size, centered) with clear labels — yellow "Playing Face-Up Cards" and red "Playing Face-Down Cards (blind!)" indicators.
- **AI layout rearrange**: Moved AI face-up cards next to face-down cards (left side) and placed AI hand stack in the top center, mirroring the player's layout pattern.
- **Jack always playable**: Fixed Jack (rank 11) being incorrectly subject to rank checks when played. Added Jack to the always-playable list in `canPlayCard()` alongside 2 and 10.
- **Visual upgrade**: Replaced original card rendering with Crazy Eights-style visuals — bigger cards, centered layout, rounded corners with shadows, proper suit colors (red for hearts/diamonds, dark for clubs/spades), and small-card support for AI and indicator zones.

## Files
- games/shed/index.html

[[games-index]]
