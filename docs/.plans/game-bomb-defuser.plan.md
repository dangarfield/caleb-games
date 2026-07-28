# Game: Bomb Defuser

## Concept
A ThreeJS 3D bomb defusal puzzle game. A procedurally-generated bomb sits centre-screen; the player rotates it with touch/mouse and interacts with components to defuse it before the timer runs out. Each level has 5 rounds (5 bombs). Levels escalate in component count, variety, and rule complexity. Seeded generation ensures deterministic puzzles. Fills the "logic puzzle / dexterity hybrid" genre gap. Target: Garfield boys (7+, touch tablet).

## Core Mechanic
Inspect a 3D bomb by rotating it, find the correct components, and solve them **in the exact sequence shown on-screen**. The bomb's solution is an ordered list of **3-6 interactions** (scaling by level) per bomb (e.g., "cut yellow wire → press green button → toggle switch C"). An **instruction panel** on the left side of the screen shows the target icons in a vertical list. The first is highlighted; once solved (visual feedback on the component — wire snaps, button stays pressed, etc.) it gets ticked off and the next highlights. Tapping any wrong component or the right component out of order = **instant explosion** (round lost, player restarts that level from round 1 of 5). A 10-second countdown timer per bomb adds urgency — run out and it detonates.

## Clue / Instruction Panel (left HUD)
- Vertical strip, left side of viewport.
- Shows **3-6 icons** top-to-bottom representing the solve sequence (scaling with level).
- Current step is clearly highlighted (glow border, larger scale). Completed steps show a tick overlay.
- Icons are labelled with short text ("Yellow Wire", "Green Btn") for younger players.
- The player's job: rotate the bomb, find the matching component among all the others, and tap it.

## Timer
- **50 seconds per bomb** (flat, all levels).
- Timer displayed top-centre as a countdown with colour shift (green → yellow → red in final 3s).
- Timer starts after a brief "inspect" grace period (1s) when the bomb first appears.
- Expiry = explosion = round failed = restart level from round 1.

## Failure & Retry
- Any wrong tap OR timer expiry = explosion animation → round failed.
- Failing any round resets the entire level (back to round 1 of 5 for that level).
- No lives system — instant fail, instant retry. This keeps tension high and rounds short.

## Controls
- Touch: drag to orbit bomb, tap to interact with component (touch-first, large tap targets)
- Mouse: click-drag to orbit, click to interact
- No keyboard required for gameplay (keyboard shortcuts optional for desktop dev)

## Components (interactive elements on the bomb)
1. **Wires** — colored (red, blue, yellow, white, black), types (straight, curly). Cut by tapping.
2. **Buttons** — colored (red, blue, yellow, green), tap or hold (hold-button requires 3s hold).
3. **Keypad** — 4-digit code entry (digits 1-4), correct sequence needed.
4. **Serial Number** — hidden on bomb body, revealed by rotating; used in rules for other components.
5. **Batteries** — under removable cover (tap to remove cover), count affects rules.
6. **Switches** — labeled A-D, toggle on/off in correct combination.
7. **Turn Key** — drag/rotate gesture to turn key 90°.
8. **Hold Button** — press and hold for a duration (progress indicator).
9. **Indicator Light** — labeled (FRK, CAR, SIG, etc.), lit or unlit; used as rule inputs.
10. **Pressure Valve** — tap rapidly (X taps in Y seconds).

## Bomb Shapes & Layout System
- Multiple bomb body shapes (seed-selected): **cylinder**, **cube**, **sphere**, **suitcase**, **briefcase-style flat**.
- Each shape defines **5-6 faces/areas** where components can be placed.
- Each face holds **1-4 components** (seed-determined), meaning a bomb can have 5-24 total component instances.
- Slots are non-overlapping by design; each slot has a bounding box and components are sized to fit within it.
- Different shapes have different slot counts and arrangements (cylinder: panels around the barrel + end-caps; cube: one panel per face; sphere: 6 evenly-spaced panels; suitcase: top lid + bottom tray).
- The generator picks a shape, assigns the 4 solution components to random slots, then fills remaining slots with **decoy components** (always more decoys than real targets — typically 2-3× as many).
- **Later levels (8+)**: bomb shapes with more faces (e.g., octagonal, multi-tiered) increase surface area and decoy count.

## Decoy Components
- Decoys are the same component types as the real targets but with different properties (wrong colour wire, wrong label button, etc.).
- They look equally real — the player must match the HUD instruction exactly.
- Ratio: 4 correct targets, 8-16 decoys (scaling with level). Always significantly more decoys than targets.

## Screw Panels (obfuscation layer)
- Some slots are covered by **screw panels** — decorative metal plates held by 2-4 screws.
- The player must unscrew them (tap each screw to rotate out) to reveal the component underneath.
- Screw panels are NOT part of the solve sequence — they are purely access gates.
- Unscrewing a panel never triggers failure; it just costs time.
- The generator decides which slots get panels (more panels at higher levels = more hidden state).

## Component Visual Fidelity
- Components are **detailed 3D meshes**, not icons or placeholders:
  - Wires: insulated cables with visible copper at cut-points, colour-banded sheaths, strain-relief grommets.
  - Buttons: recessed housings with coloured caps, spring feel (depress animation), embossed labels.
  - Keypad: raised tactile keys with printed digits, backlit LCD readout.
  - Switches: metal toggle levers with labeled positions (ON/OFF or A-D), visible screws.
  - Turn Key: brass key in a lock cylinder, rotates with drag gesture.
  - Batteries: D-cell style in a spring-loaded holder under a latch cover.
  - Indicator Lights: jewel-lens LEDs in metal bezels, glow shader when lit.
  - Pressure Valve: industrial hand-wheel with a pressure gauge needle.
- Every component type is a self-contained module (mesh + interaction handler + rule interface) so they are plug-and-play across any bomb shape/slot.

## Rule Engine (solvability)
- The solution is a **strict ordered sequence of 3-6 component interactions** (level-scaled) chosen from the placed components after the bomb is fully assembled.
- Example sequence: "Cut yellow wire → press green button → toggle switch B."
- The HUD tells the player exactly what to do — the challenge is finding the right component among all the others under time pressure.
- Any component NOT in the current solution step is effectively a decoy — interacting with it = instant explosion.
- Generator validates: each solution target is uniquely identifiable (no ambiguous duplicates), no more than 1 solution target behind a screw panel, and the solution sequence is achievable in 10s.
- **Failure mode**: tapping any wrong component or correct component out of order = explosion. Timer expiry = explosion. Either resets the full level.

## Seeded Generation
- Level seed = `level * 1000 + round` (or player can enter custom seed).
- Mulberry32 PRNG from seed drives all random choices.
- Same seed = same bomb layout, same components, same solution.

## Architecture: Bombs → Faces → Slots → Components (how it all fits together)

This section describes the concrete data model and assembly pipeline so the relationship between shapes, faces, slots, and components is unambiguous.

### Data Model

```
Bomb
├── shape: ShapeDefinition        (cylinder, cube, sphere, suitcase, briefcase)
├── faces: Face[]                  (5-6 per bomb, more at L8+)
│   └── Face
│       ├── id: string             ("front", "back", "left", "barrel-3", "lid", etc.)
│       ├── normal: Vector3        (which direction this face points — used for camera/orbit)
│       ├── bounds: { width, height }  (available area in world units)
│       ├── slots: Slot[]          (1-4 per face)
│       │   └── Slot
│       │       ├── id: string
│       │       ├── localPosition: { x, y }   (offset within face)
│       │       ├── size: { w, h }             (bounding box)
│       │       ├── component: Component | null
│       │       └── screwPanel: ScrewPanel | null  (cover, if any)
│       └── meshGroup: THREE.Group  (the 3D parent for this face's geometry)
└── solution: SolutionStep[4]      (ordered sequence the player must solve)
```

### ShapeDefinition (one per bomb shape file)

Each shape file exports:
- A **body mesh** (the bomb's outer shell geometry — textured, lit).
- A **face registry** — an array of Face definitions with pre-computed slot positions that guarantee no overlaps for that shape's geometry.
- Slot sizes are fixed per shape (e.g., cube faces are 1.6×1.6 units, each can hold 4 slots of 0.7×0.7).

Example — Cube:
```
faces: [
  { id: "front",  normal: (0,0,1),   slots: 4 positions in 2×2 grid },
  { id: "back",   normal: (0,0,-1),  slots: 4 positions in 2×2 grid },
  { id: "left",   normal: (-1,0,0),  slots: 4 positions in 2×2 grid },
  { id: "right",  normal: (1,0,0),   slots: 4 positions in 2×2 grid },
  { id: "top",    normal: (0,1,0),   slots: 2 positions (smaller face) },
  { id: "bottom", normal: (0,-1,0),  slots: 2 positions (reserved for serial/batteries) },
]
Total slots: 20. Max components: 20.
```

Example — Cylinder:
```
faces: [
  { id: "barrel-1" through "barrel-4", each a curved strip around the body, 3 slots each },
  { id: "end-cap-top", 2 slots },
  { id: "end-cap-bottom", 2 slots },
]
Total slots: 16. 
```

### Component Module Interface

Every component type (wire.js, button.js, etc.) exports a class conforming to:
```js
class ComponentType {
  // Returns a THREE.Group sized to fit within the given slot bounds
  createMesh(slotSize, variant)  → THREE.Group

  // Registers pointer event handlers on the mesh
  // Returns true if the interaction matches the expected solution step
  bindInteraction(mesh, expectedVariant, onCorrect, onWrong)

  // The set of variants this component can spawn as (used for decoy generation)
  static variants = ["red", "blue", "yellow", "white", "black"]  // example for wires
}
```

- `variant` = the distinguishing property (colour for wires/buttons, label for switches, digit sequence for keypad, etc.)
- The mesh is fully self-contained — geometry, materials, animations — scaled to fit the slot's bounding box.
- No component ever exceeds its slot bounds. The shape guarantees slots don't overlap. Therefore components never overlap.

### Assembly Pipeline (bomb-generator.js)

Given a seed, the generator runs these steps in order:

1. **Pick shape** — PRNG selects from available shapes for the current level.
2. **Instantiate face/slot layout** — clone the shape's face registry (all slots empty). Some slots are designated as screw-panel slots (the panel itself is the face — unscrewing reveals the component underneath).
3. **Place all components** — fill slots with components (type + variant chosen by PRNG from the level's unlocked pool). At this stage there is no distinction between "solution" and "decoy" — every slot just gets a component. Screw-panel slots get their component placed behind the panel.
4. **Choose solution targets** — from the full set of placed components, PRNG picks **3-6** (scaling by level: 3 at L1-3, 4 at L4-7, 5 at L8-12, 6 at L13+). These become the ordered solve sequence shown on the HUD.
5. **Validate solution** — assert: each chosen target is uniquely identifiable by its type+variant (no ambiguity — e.g., if solution says "yellow wire" there is exactly 1 yellow wire on the bomb; if there would be a duplicate, the generator re-rolls that target or swaps a decoy's variant). Also assert that no more than 1 solution target is behind a screw panel (so 10s stays feasible).
6. **Build scene** — instantiate meshes via each component's `createMesh()`, parent them to their face's meshGroup, attach interaction handlers. Solution targets and decoys use the same rendering path — visually indistinguishable until interacted with.

### Why This Prevents Overlaps

- Shapes define fixed slot positions with explicit bounding boxes — these are authored once per shape and validated to not intersect.
- Components scale to fit their assigned slot's bounds — never overflow.
- The generator never assigns two components to the same slot.
- Result: geometric non-overlap is guaranteed by construction, not by runtime collision checks.

### How New Shapes / Components Are Added

**New shape**: create `js/shapes/<name>.js`, export the body mesh + face registry with slot positions. The generator picks it up automatically.

**New component**: create `js/components/<name>.js`, implement the ComponentType interface. Add it to the unlockable pool in progression.js. The generator can now seed it into any slot on any shape.

## Progression & Rewards
- **Levels 1-3**: Training — fewer components (2-3), generous timer, simple rules.
- **Levels 4-7**: Standard — 3-5 components, moderate timer, compound rules.
- **Levels 8-12**: Expert — 5-7 components, tight timer, nested rules.
- **Levels 13+**: Infinite escalation with seed.
- **Unlock system**: New component types unlock as levels are completed (wires + buttons from L1, keypad from L3, switches from L5, key from L7, etc.)
- **Ranks**: Recruit → Technician → Specialist → Expert → Master → Legend (based on total bombs defused).
- **Stars**: 1-3 stars per round (time bonus, no mistakes, speed).
- **Stats**: Total defused, streak, fastest time, stored in calebArcadeData.

## Visual Theme
- Dark bomb disposal unit backdrop (ThreeJS environment — concrete bunker, warning stripes, dramatic lighting).
- Bomb model: cylindrical/spherical body with modular component panels.
- Moody lighting with spot highlights on active component.
- Particle effects on defusal success (sparks) and failure (explosion).
- HUD: timer (top centre), level/round indicator, rank badge.

## Systems Required
- [x] Three.js 3D rendering (CDN import, no build step)
- [x] Orbit controls (touch + mouse)
- [x] Seeded PRNG (Mulberry32)
- [x] Component system (modular, each component = mesh + interaction + rule)
- [x] Bomb shape system (slot definitions per shape)
- [x] Bomb generator (shape pick → slot assignment → decoy fill → solution sequence)
- [x] Screw panel system (cover/reveal mechanic)
- [x] Instruction panel HUD (left-side sequence display)
- [x] Timer system (10s countdown, instant-fail)
- [x] Level progression + unlock gating
- [x] Rank/reward/star system
- [x] localStorage persistence (calebArcadeData.bombDefuser)
- [x] Web Audio SFX (wire snip, button click, explosion, success jingle)
- [x] Particle effects (sparks, explosion)
- [x] Start overlay + game over screen (canvas/HTML overlay)

## File Structure (multi-file)
- `games/bomb-defuser/index.html` — entry point, HTML shell, script imports.
- `games/bomb-defuser/js/main.js` — game loop, state machine, init.
- `games/bomb-defuser/js/bomb-generator.js` — seeded bomb generation, shape selection, slot assignment.
- `games/bomb-defuser/js/components/` — one file per component type (wire.js, button.js, keypad.js, switch.js, turn-key.js, hold-button.js, indicator.js, pressure-valve.js, battery.js, serial-number.js).
- `games/bomb-defuser/js/shapes/` — one file per bomb shape (cylinder.js, cube.js, sphere.js, suitcase.js, briefcase.js) defining slot positions.
- `games/bomb-defuser/js/hud.js` — instruction panel, timer, progress.
- `games/bomb-defuser/js/audio.js` — Web Audio SFX.
- `games/bomb-defuser/js/particles.js` — explosion/spark effects.
- `games/bomb-defuser/js/progression.js` — levels, ranks, stars, localStorage.
- `games/bomb-defuser/js/screw-panel.js` — screw panel meshes and interaction.

## Conventions
- [x] Multi-file under games/bomb-defuser/ (justified by complexity)
- [x] Three.js via CDN (no build step, no external runtime deps beyond CDN)
- [x] Dark-theme palette, touch-action:none
- [x] Back button href = ../../index.html
- [x] calebArcadeData localStorage
- [x] Viewport meta with user-scalable=no

## Acceptance Criteria
- [ ] Plays with no JS console errors
- [ ] Touch-first: full gameplay on tablet with touch only
- [ ] 5 rounds per level, escalating difficulty
- [ ] Seeded generation — same seed = same bomb
- [ ] All 10 component types functional
- [ ] Rule engine ensures solvability
- [ ] Progression: ranks, stars, unlocks
- [ ] Card added to root index.html
- [ ] Row + count in docs/games-index.md
- [ ] docs/game-bomb-defuser.md created

## Build Checklist
- [x] Plan written
- [ ] Game implemented (games/bomb-defuser/index.html)
- [ ] Landing page card added
- [ ] Docs node created
- [ ] games-index.md updated
- [ ] back-button-check green
- [ ] Ship approved
