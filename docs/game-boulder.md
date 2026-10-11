# Boulder (games/boulder)

Indoor bouldering for Caleb and Ezra on the tablet (1333 × 690 landscape). Three.js wall and climber, all UI in HTML/CSS over the canvas. Built in Claude Design; the original bundle (with its run plan and the Boulder UI board) is in `games/boulder/research/Boulder climbing game design/` (gitignored).

## Play
1. **Drag a limb**: press a hand or foot ring and drag it onto a hold of the route's colour. Dotted circles show what it can reach; the body follows (IK).
2. **Grip**: each ring drains while its limb holds on, faster on small holds. Green is fine, yellow is tired, red is about to let go. At 10% or less it drains at 20% speed (a safety buffer).
3. **Shake out**: let go of a hand in the air (more than 40 cm from its old hold) and it refills (hands 0.5/s, feet 0.25/s) while the other hand works twice as hard. A hand on a jug with the other hand and both feet on refills slowly (green +).
4. **Slip / fall**: a limb at 0 slips off and has to be re-placed. Both hands off = fall, then retry.
5. **Top out**: both hands on the gold TOP hold.

`i` opens How to climb (4 auto-playing steps; opens by itself at the start of every V0 and V1 climb). The never-tired button (left of pause) stops all drain and turns the climb into practice: no stars, no unlocks.

## Routes
- 45 routes on 15 walls (`js/boulder-routes.js`), V0–V8, 5 per grade, with stored solutions, par and a grader report. Each grade adds a move: V3 big reach, V4 side pulls, V5 high step (pocket walls + foot chips), V6 jump, V7 side + jump, V8 high step + jump. Cross-through is allowed (hands tire 40% faster) but never required.
- Unlocks: everything up to the furthest sent route + 3.
- Stars (3 per route, each kept once won): moves ≤ best × 1.4 + 4, holds ≤ used × 1.35 + 4, time ≤ moves × 5 s (`parFor` in `js/boulder-core.js`).
- "Mine" tab after V8: routes saved in the editor, playable (solved on the spot for star targets; no stars or unlocks).

## Locker
Stars are money (the wallet starts at 0). Tap a priced item to try it on, then Buy or Not now. Climber: hair style and colour, skin, shoes, chalk bag, headband / beanie colour. T-shirt: colour, pattern (plain, stripes, halves, dots, zigzag, splat), pattern colour, back print (8 icons), name on the back (unlocks for 2 stars). Caleb and Ezra each have their own look (Ezra's default hair is blonde).

## Route editor
Home > Route editor. Tools: Place, Move, Delete, Start, Turn (side pull / undercling), Jump; 9 hold types including foot chips and Top; 8 route colours; drag the empty wall to look around. After every edit the solver and grader run (start reachable, a way to the top, suggested grade and required moves). Test climb plays it in the real game. Route codes are `BLD-` + base64url (3 bytes per hold + name + colour). The draft autosaves; Save keeps up to 10 in My routes.

## Tech
- `index.html`: the UI. The design's `<x-dc>` template is kept verbatim in `<template id="view">` and the design's Component logic is kept line for line, run by a small renderer in the page (compiles the template once, builds HTML per render, morphs it into the DOM). No Claude Design runtime and no React are shipped. `<sc-if>` becomes an always-present keyed `display:contents` wrapper so a screen's DOM and its 3D view are created once; the morph never touches a custom element's children or removes its attributes (the elements own their canvases and overlays). Renders are batched per microtask.
- `js/boulder-wall.js` (`<boulder-wall>`, `<boulder-climber>`, `<boulder-duo>`: home wall, locker and portraits), `js/boulder-climb.js` (`<boulder-climb>`, the playable climb; emits bubbling `boulder` events), `js/boulder-editor.js` (`<boulder-editor>`), `js/boulder-scene.js` (wall, holds, Pip character, IK), `js/boulder-core.js` (holds, body solver, move rules, Dijkstra route search and grading), `js/boulder-routes.js` (the 45 routes), `js/boulder-gen.js` (the route generator used to make them; not loaded by the game). Module paths resolve from `document.baseURI` as `js/…`.
- three.js 0.160 from unpkg. A directory guard redirects `/games/boulder` to `/games/boulder/` so `js/`, `sfx/` and `assets/` resolve.
- Saves: IndexedDB via `js/arcade-store.js` (unchanged copy), key `calebArcadeData:boulder`, stamped with `sid`/`gen` and written with `{guard: true}`. A play-test save left in localStorage by the design prototype under the same key is imported on first run.
- Audio: one AudioContext with a sounds bus and a music bus (gain = level²). SFX are decoded buffers from `sfx/` (tap, fall, low-grip, win; Opus/WebM mono 64k, silence trimmed, peaks limited, fall levelled down 6 dB; originals in `research/sounds/`) plus short generated grab/place blips. Music `music/boulder-theme.webm` (Opus/WebM 48k, full level, NOT dropped 6 dB by Dan's choice, peaks limited to −1 dBTP; original `research/boulder.m4a`, made with Suno, credit in Settings) goes through `createMediaElementSource`. Started by the first tap (armed on pointerdown/pointerup/click/touchend/keydown until it really plays), paused while the tab is hidden.
- Settings (home cog) and Pause both have Sound and Music sliders (0–100, default 80, "Off" at 0; moving Sound plays a blip), Reach circles and Fast mode (DPR 1, no shadows). Holding Fast mode for 0.6 s, or P, toggles the performance monitor: three.js Stats at top 64px under "← Games", with the design's numbers (fps, worst frame, 3D views, draws, tris, geometries, textures, heap, DPR, FAST) under it.
- "← Games" is one global link (top-left, every screen, z 60) with the arcade-back snippet.

## Memory
- Moved from the Claude Design bundle without its runtime: the `.dc.html` became plain HTML/JS (renderer above). Checked headless at 1333×690 across every screen, a real limb drag, top-out + stars, a save surviving a reload, and the music fetched only after the first tap and playing after one.
- The design started the music from `pointerdown` only, which a touch screen refuses (the "music needs two taps" bug); it now arms on the activation events and stays armed until playing.
- The design set volumes with `el.volume` (ignored on iPad) and a new `Audio()` per sound; both now go through Web Audio buses. Music slider default raised from 60 to 80 (arcade rule).
- Home footer: the wallet and next-up line are tilted tags in the style of the "V0 – V8 · 45 climbs" label (gold stars tag, chalk next-up tag with the grade in its colour). Card blurb: "Drag hands and feet up the wall, mind your grip and top out!" (Dan asked for a better one than the design's "Reach the top.").
- The design's card used a wall screenshot; card backgrounds can't use `url()`, so the plywood and holds are drawn in CSS.
