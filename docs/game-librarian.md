# Librarian

A 3D first-person book-sorting game built with Three.js. Inspired by the Steam game "Librarian: Tidy Up the Arcane Library!" but re-themed for an 8-year-old's reading level with kid-appropriate book series and categories.

## Narrative

The Book Fairy has thrown every book off the shelves in Professor Hoots' Enchanted Library. The player must sort all the scattered books back onto the correct shelves before the library opens in the morning. Categories are color-coded and labelled — the player picks up books from the floor, identifies their series/category, and places them on the matching shelf.

## Features

- **First-person 3D movement** — WASD + mouse look (pointer lock)
- **Book pickup/place system** — E to interact, Q to drop, limited carry capacity (3 books)
- **8 categories** with 4 series each (32 total series): Adventure, Mystery, Funny, Fantasy, Science, History, Animals, Comics
- **Shelf code system** — shelves labelled 1A–1D (left wall) and 2A–2D (right wall), not color-coded
- **Map legend** (M key) — popup showing which code maps to which category
- **Always-visible held books panel** — bottom-left shows what you're carrying with shelf code hints
- **Series completion tracking** — completing all volumes of a series triggers celebration
- **3 difficulty levels** — Easy (30 books), Medium (60), Hard (100)
- **3 magic abilities** with cooldowns:
  - Insight (1) — highlights nearby books matching your held book's category
  - Sort (2) — orders books in your hand by category/series/volume
  - Guide (3) — shows directional arrow to the correct shelf for your top book
- **Visual guide arrow** — floating arrow points to target shelf when Guide is active
- **HUD** — shelved count, series completed, carrying capacity
- **Compact library** — small room (12×10 units) so all shelves are visible and accessible
- **Score persistence** — best times per difficulty saved to localStorage
- **Ambient atmosphere** — floating purple particles, warm library lighting, fog

## File Structure

```
games/librarian/
  index.html          — HTML shell, overlay, HUD, CSS
  js/
    main.js           — Entry point, Three.js init, game loop, input binding
    audio.js          — Web Audio SFX (pickup, place, error, series, victory, abilities)
    books.js          — Category/series data, book generation logic
    book-objects.js   — 3D book mesh creation, spine textures, scatter logic
    game-state.js     — Score tracking, series completion, victory, localStorage
    guide-arrow.js    — Floating directional arrow for Guide ability
    interaction.js    — Raycasting, pickup/place logic, ability execution
    library.js        — 3D environment (floor, walls, shelves, lighting, decorations)
    player.js         — First-person camera controller, movement, ability state
    ui.js             — HUD updates, inventory panel, victory screen
```

## Key Design Decisions

- **Three.js via importmap CDN** — no build step, uses three@0.160.0 from jsdelivr
- **Open-front bookshelves** — shelves face the center aisle so books are visible; units are rotated based on wall side
- **Color-coded categories** — each category has a distinct color on spine and shelf back panel, making visual matching possible for younger players
- **Kid-appropriate series** — all book series are real and popular with 7-9 year olds (Beast Quest, Dog Man, Harry Potter, Horrible Histories, etc.)
- **No lose state** — relaxing gameplay like the source material; player wins by shelving all books, timed for challenge
- **Pointer lock FPS controls** — click canvas to lock, Escape to unlock

## Categories

| Section | Category | Color | Series |
|---------|----------|-------|--------|
| A | Adventure Stories | Green | Beast Quest, Wings of Fire, Percy Jackson, How to Train Your Dragon |
| B | Mystery & Detective | Dark Blue | Secret Seven, Spy Dog, Murder Most Unladylike, Enola Holmes |
| C | Funny Books | Orange | Diary of a Wimpy Kid, Dog Man, Captain Underpants, Tom Gates |
| D | Fantasy & Magic | Purple | Harry Potter, The Worst Witch, Nevermoor, Skulduggery Pleasant |
| E | Science & Nature | Blue | Horrible Science, DK Eyewitness, Professor Astro Cat, Magic School Bus |
| F | History & Legends | Brown | Horrible Histories, Roman Mysteries, You Wouldn't Want To Be, Who Was? |
| G | Animal Stories | Orange-brown | Warrior Cats, The One and Only, Puppy Place, Animal Ark |
| H | Comics & Graphic Novels | Red | Amulet, Bone, Hilo, The Phoenix |

## Bug Fixes

(none yet)
