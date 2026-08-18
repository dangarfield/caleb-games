# Sea Glass — custom lightweight 3D physics (drop Rapier), awake-set driven

Goal: much bigger perf gains than the current Rapier setup WITHOUT going 2D — the
user wants the real 3D look kept. The gains come from *what we don't do*, not from
flattening dimensions:

## The three levers (none of them are "2D")
1. **Awake-set only.** The pile is FROZEN by default. A swipe wakes only pebbles
   within a radius of the stroke; they simulate a few frames then re-freeze.
   Per-frame cost ∝ disturbed pebbles (~10–40), not 240. At rest: nothing runs.
2. **No idle matrix uploads.** InstancedMesh matrices written once at bake, then
   only for awake instances; `instanceMatrix.needsUpdate` set only when ≥1 moved.
   At rest: 0 GPU transform work. (A naive port still uploads 240/frame.)
3. **Fewer real pebbles.** Only the disturbable TOP layer is real (~80–120); pile
   depth is the existing painted shingle-bed texture + a small stack. Burial =
   glass drawn just under the loose layer.

## Engine: hand-written 3D position-based relaxation (PBD-style) — NOT a solver
Fully 3D. Pebbles keep real (x,y,z) and stack visually as now. Per awake pebble
per step:
1. Integrate: `v.y -= g*dt`; `p += v*dt`; damp `v *= ~0.86`.
2. **Sphere separation via a 3D spatial hash** (cell + 26 neighbours): for each
   overlapping pair push apart by half the penetration along their centre line,
   1–2 relaxation passes. This is the "settled pile" look. (Position-based: adjust
   positions, derive a little velocity back — no contact/constraint solver, no
   friction/restitution/angular-momentum/island machinery, no wasm.)
3. Floor clamp (y ≥ r) + rectangular rim clamp (AABB — the existing fixed rim rect,
   now just a clamp, no collider).
4. **Fake roll** (your spec): roll the pebble quaternion about the axis ⟂ to its
   velocity by `|v|*dt*k` — looks like rolling, no real torque.
5. Re-freeze when `|v|` < eps and no overlap resolved for a few frames.
Zero-allocation: one module-scope `THREE.Object3D` dummy + reused `Vector3`/
`Quaternion` scratch; SoA typed arrays (`px,py,pz,vx,vy,vz,r,awake`, quats).

## Swipe
Ray touch→floor plane; grid-lookup pebbles within `wakeRadius`; each gets
`v += normalize(pebble - contact)*push*falloff` and `awake = WAKE_FRAMES`. Cap the
wake count (existing swipe-wake cap) so a fast stroke can't wake everything.

## Burial / reveal (unchanged game feel)
Glass/ceramic sit just under the loose layer; "hidden" if a loose pebble covers
its position (grid lookup). Rake pebbles off → revealed. Tap = existing three.js
mesh raycast. Re-tune burial so most start covered with the loose-layer count.

## Collection jar — SAME 3D relaxation, tiny world (NOT 2D)
The jar keeps a genuine 3D feel: glass pieces are real 3D spheres in the bottle
using the SAME PBD relaxation + spatial hash, just a small N that sleeps fast.
Tilt/shake = rotate the gravity vector / nudge velocities; pour = move pieces
between two jars' arrays. Renders InstancedMesh per colour (as now). Small N +
sleep = effectively free. No Rapier.

## Rendering
Low-poly instanced geometry (Dodecahedron or the existing lumpy variants), visual
scale wider than collision (overlap fine). Low profile keeps Lambert/no-shadow/
low-pixelRatio; High keeps PBR. No idle matrix uploads.

## Removes
Rapier from the importmap + all imports (js/rapier.js, js/rphys.js retired or
gutted). three.js becomes the only CDN dep.

## Keep intact
Low/High quality profile (now driving: wake radius/cap, loose-pebble count,
relaxation passes, pixelRatio, shading, shadows), the frame-sliced section build,
the rectangular rim (as an AABB clamp + its visual), the matched shingle texture,
all screens/unlocks/ceramics/moves/saves, fixed bottom nav, comb cooldown +
all-found, Caleb/Ezra.

## Expected gains (ESTIMATE — harness can't measure real FPS)
- Physics CPU: ~90%+ lower at rest (nothing runs); active cost tiny (awake set,
  no solver, no wasm, no GC). The entry-build + swipe hitches should largely go.
- GPU: fewer real pebbles + no idle uploads → lower, but steady-state fill still
  depends on the panel/dpr (custom physics doesn't change that ceiling).

## Trade-offs (honest)
- Loses TRUE multi-layer deep stacking accuracy (still 3D and stacks, but it's a
  relaxation approximation, not a rigorous solver) — imperceptible for swipe-to-
  uncover.
- Another full physics rewrite after Rapier: real effort/risk; the build agents
  have timed out on big passes, so BUILD INCREMENTALLY and keep it runnable.
