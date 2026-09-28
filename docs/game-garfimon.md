# Garfimon

*Placeholder summary — nobody has read the game closely enough yet to write the full doc. Flesh it out the next time the game is touched.*

A Pokemon-style card battler. Collect cards from a pool of 151 across 9 energy types, then battle with them using HP and attacks. Caleb and Ezra each keep their own collection.

## Features
- 151 collectible cards across 9 energy types (`cards.json`, `types/`)
- Card battles with HP and attacks
- Separate Caleb and Ezra collections

## Files
- `games/garfimon/index.html` — the game
- `games/garfimon/cards.json` — card data
- `games/garfimon/types/` — energy type assets
- `games/garfimon/card.json` — home-page card

## Design decisions
- Saves under its own `garfimonState_<player>` localStorage keys rather than `calebArcadeData`. It predates the storage convention; leave it alone unless its saves are failing.

## Memory
