#!/usr/bin/env python3
"""thps2glb — turn an original THPS / THPS2 level into a skate-ready .glb.

    python3 thps2glb.py WAREHOUSE.PSX WAREHOUSE.TRG -o ../assets/thps/warehouse.glb

The game reads a level purely from glTF node names (see src/level.js), so the
whole job is: classify every polygon, bucket it, and write the buckets out under
the names the engine already knows.

    a model with a VERT face          -> _Col_Pipe    the whole ramp; see below
    surface flag 0x0040 VERT, invisible-> dropped       it is a trigger curtain
    surface flag 0x0040 VERT, visible  -> kept          it is the vert wall itself
    surface flag 0x0010 WALLRIDEABLE  -> _Col_Ride    a wall, and you can ride it
    surface flag 0x0100 NOT_SKATEABLE -> _Col_Wall    solid, but not rideable
    otherwise                          -> _Col_Floor
    rails from the .trg                -> _Rail_000, _Rail_001, ...
    every drawn polygon                -> _Mesh       with baked vertex colours

Nothing here needs Blender, numpy, or any other dependency — just Python 3.

    --inspect        parse and report, write nothing. Run this first.
    --scale N        THPS units per metre. Calibrate it: run --inspect, read the
                     reported extent, and pick the value that makes the park
                     come out the size a skatepark actually is.
    --auto-wall N    polygons flatter than this |normal.y| go to the wall bucket
                     regardless of their flags, so a mis-flagged building face
                     cannot be skated up (default 0.30)
    --pipe-reach N   how far from a coping line still counts as transition, in
                     metres (default 5 — about the depth of a quarter pipe at the default
                     scale; it is a distance in METRES, so it moves with --scale)
    --rail-max-gap N cut a rail chain where consecutive points are further apart
                     than this, in metres (default 25 — a bad link, not a rail)
    --invisible W    what to do with faces the original never draws: "floors"
                     keeps the flat ones and drops the rest (default), "all"
                     keeps every one, "none" drops them all. About one collision
                     triangle in eight is an undrawn barrier.
    --rails-by-order ignore the .trg link arrays and chain rails by table order
"""

import argparse
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import thps_psx as psx
import thps_trg as trg
from glb import GlbBuilder
import png

# THPS units per metre.
#
# 256 is the faithful figure — at 256 the Warehouse's quarter pipes come out
# 2.16 m tall and 2.30 m deep, which is a real quarter pipe. The parks read
# small at that scale next to a 1.8 m skater, though, the way THPS levels
# always did on a TV, so the default is half of it: everything twice the size,
# ramps around 4.3 m, and the skater properly dwarfed by the park.
#
# io_thps_scene divides by 2.25, but that figure comes from its THUG-era
# importer: vertices here are 16-bit integers, and 2.25 units per metre would
# put a PS1 level on a 44 cm grid, which is not a thing anyone shipped. A few
# hundred units per metre is the only reading that fits both the integer type
# and a park you can skate, so that is where the default sits.
DEFAULT_SCALE = 128.0
DEFAULT_AUTO_WALL = 0.30
# Steepest a face under a coping may be and still be promoted to transition.
# See the note at the promotion itself.
PIPE_MAX_WALL = 0.20
# Biggest an UNDRAWN flat collision triangle may be and still be believable as
# smoothing rather than a sector volume. 200 m2 is a 20 m square. See convert().
DEFAULT_MAX_INVISIBLE = 200.0
# A prop bigger than this across is the sky dome, not a prop: Roswell's is 207 m
# and would swallow the park. And a prop whose centre sits this far outside the
# park's own collision is a parsing accident, not a placement: real props sit
# where the original put them, helipad outside the hangar included.
PROP_MAX_SPAN = 80.0
PROP_STRAY = 150.0

FLOOR, WALL, PIPE, RIDE = "floor", "wall", "pipe", "ride"

# What marks a pane of glass. See is_glass.
# ---------------------------------------------------------------- decks ---
#
# THPS1's fifth tape in each park is "collect 5 <things>": the Warehouse's
# boxes, School's lunch tables, the Mall's directories, Downtown's signs,
# Downhill Jam's valves, Streets' cop cars. Unlike THPS2's five-of-a-kind,
# none of them is in the item table — they are ordinary level geometry, so
# there is nothing in the data that says "this one". They were found instead
# by looking for a family of objects with identical face and vertex counts and
# the same texture that appears EXACTLY five times in a park, and confirming
# the family against a pin Dan dropped on one in game. The object indices are
# straight out of the .psx object list, which never changes.
#
#   objects  which five
#   place    'at'    where it is (used where the object itself is removed)
#            'above' over the top of it
#            'front' standing off its face, side chosen in the engine
#   lift     metres added on top of that
#   drop     take the object out of the level as well
DECK_SPOTS = {
    "skware": dict(objects=[21, 24, 25, 26, 27], place="at", lift=0.95, drop=True),
    "skdown": dict(objects=[379, 381, 382, 385, 387], place="front", lift=0.2),
    "skmall": dict(objects=[354, 395, 396, 397, 398], place="front", lift=0.0),
    # The lunch tables: 85 faces each on textures 24 and 30, and the only
    # family of five in the park. Four of the five are within a metre of Dan's
    # pins and the fifth fell out of the same family.
    "skschl": dict(objects=[590, 591, 592, 750, 782], place="above", lift=1.1),
    # The valves. Not a face-count family — every one is modelled slightly
    # differently — but exactly five objects in the park touch the valve's
    # textures (65 and 66), they are all under two metres, and they are strung
    # down the run from the top to the bottom. One of them is on Dan's pin.
    "skjam": dict(objects=[302, 303, 304, 474, 475], place="front", lift=0.4),
    # The cop cars. A car is THREE objects — body, windows and a light bar on
    # its own texture — so these are grouped: the deck goes over the top of
    # all three together rather than over whichever one came first.
    "sksf": dict(objects=[[1052, 1053, 1054], [1058, 1059, 1060],
                          [1061, 1062, 1063], [1067, 1068, 1069],
                          [1080, 1081, 1082]], place="above", lift=1.0),
}
DECK_STANDOFF = 1.6      # how far 'front' stands off the face


def deck_spot(parts, place, lift):
    """One deck position, and the way the thing it belongs to faces.

    @param parts  [(model, world), ...] — more than one where the object is
                  really several, like a car that is a body and a light bar.
    @returns (x, y, z, nx, nz) — the normal is the biggest face's, flattened,
             and only means anything for 'front'.
    """
    world = [w for _m, ws in parts for w in ws]
    lo = [min(w[i] for w in world) for i in range(3)]
    hi = [max(w[i] for w in world) for i in range(3)]
    cx, cz = (lo[0] + hi[0]) / 2.0, (lo[2] + hi[2]) / 2.0
    if place == "above":
        y = hi[1] + lift
    elif place == "at":
        y = (lo[1] + hi[1]) / 2.0 + lift
    else:
        y = (lo[1] + hi[1]) / 2.0 + lift

    # the widest face decides which way the thing points
    best_area, nx, nz = 0.0, 0.0, 0.0
    for model, ws in parts:
      for f in model.faces:
        n = 3 if (f.base_flags & psx.BASE_TRIANGLE) else 4
        a, b, c = (ws[i] for i in f.verts[:3])
        ux, uy, uz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
        vx, vy, vz = c[0] - a[0], c[1] - a[1], c[2] - a[2]
        fx, fy, fz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
        area = math.sqrt(fx * fx + fy * fy + fz * fz) * (1.0 if n == 3 else 2.0)
        flat = math.hypot(fx, fz)
        if area > best_area and flat > 1e-6:
            best_area, nx, nz = area, fx / flat, fz / flat
    return [cx, y, cz, nx, nz]


GLASS_MODEL = 0x0002      # model flag: this model is a prop in its own right
GLASS_DRAW = 0x0040       # base flag: the face is drawn see-through
GLASS_SURF = 0x0008       # surface flag: a thin standing panel
GLASS_SURF_NOT = 0x0400   # ...but not whatever this is. See is_glass.
GLASS_MAX_NY = 0.30       # and it has to be standing up, not lying down

def to_three(x, y, z, scale):
    """THPS space to the game's space.

    io_thps_scene maps THPS -> Blender (Z-up) as (x, z, -y), so THPS Y points
    down. Carrying that through Blender -> three.js (x, z, -y) again lands on a
    180 degree rotation about X: (x, -y, -z). Determinant +1, so winding — and
    therefore which way every surface faces — is preserved.
    """
    return (x / scale, -y / scale, -z / scale)


def group_panes(faces, tol=0.12):
    """Split the level's glass into the sheets that break one at a time.

    Faces that touch are the same pane — union-find over shared corners — but
    only within the same object. Two rules, and both earn their place:

      * The object seam. The Warehouse's glazed office is three walls meeting at
        a corner, three separate objects; welding on geometry alone made them
        one 12 m sheet that vanished in a single hit. The game builds and breaks
        these things per object, so that is where the cut goes.
      * A fat tolerance, and neighbouring cells as well as the corner's own. A
        window is not one sheet of glass: the Hangar draws every one of its
        sixteen as an inner and an outer pane 8 cm apart, and matching corners
        exactly left you smashing the outer one and bouncing off the inner. At
        12 cm the two halves of a window are one window, which is what it looks
        like.
    """
    parent = list(range(len(faces)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(i, j):
        ri, rj = find(i), find(j)
        if ri != rj:
            parent[ri] = rj

    corner = {}
    for i, f in enumerate(faces):
        obj, tri = f[0], f[1]
        for v in tri:
            cell = tuple(int(math.floor(c / tol)) for c in v)
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    for dz in (-1, 0, 1):
                        k = (obj, cell[0] + dx, cell[1] + dy, cell[2] + dz)
                        if k in corner:
                            union(i, corner[k])
            corner[(obj,) + cell] = i

    out = {}
    for i, f in enumerate(faces):
        out.setdefault(find(i), []).append(f)
    return list(out.values())


def is_glass(face, normal_y, is_prop, one_texture):
    """Is this face a pane you can smash?

    There is no "breakable" bit to read. The game keeps that in its own object
    tables and the disc indexes those by hashed name with no filenames, so the
    level file is the only witness. Four things in it have to agree, and each
    one throws out a different kind of impostor:

      * The MODEL carries flag 0x2. Eight of the Warehouse's 288 models do, nine
        of the Mall's 900 — this is the level saying "this is a thing, not part
        of the building", which is what the script tables address. It is not
        "breakable" on its own: the Skate Park's painted floor markings have it,
        so does the School's basketball backboard.
      * The FACE is drawn see-through: base flag 0x40, the PS1's semi-transparent
        bit. This is the one that does most of the work. It keeps every window
        in the six parks that have them and throws out the Bullring's cables,
        Downhill Jam's wooden doors, Marseille's boards and the Mall's CLOSED
        sign in one go.
      * The SURFACE says thin panel (0x8) and not 0x400, which is carried by the
        Bullring's banner rig and by nothing that looks like a window.
      * And the object is one sheet with one texture on it. The School bolts a
        chain-link fence and a backboard into a single prop; a pane is a pane.

    Then it has to be standing up. What survives, across the twenty parks: the
    Warehouse 7, Downtown 20, the Hangar 16, Streets 15, the Mall 7, School II
    1, and nothing at all in the other fourteen. Every texture involved is a
    picture of a window — blue glass in a frame, a six-pane sash, the Warehouse's
    panes already half smashed — bar the Mall's five hanging banners, which
    carry the identical marks and go in with them.
    """
    return (face.is_visible
            and is_prop
            and one_texture
            and (face.base_flags & GLASS_DRAW)
            and (face.surface_flags & GLASS_SURF)
            and not (face.surface_flags & GLASS_SURF_NOT)
            and abs(normal_y) < GLASS_MAX_NY)


def rideable(surface_flags, normal_y):
    """Is this wall one you can wallride?

    THPS says so per polygon: 0x0010 WALLRIDEABLE. It is not a rare flag — half
    the steep faces in School II carry it, 35,000 square metres of them — so
    honouring it gives a park full of real wallride lines rather than a handful.
    It still has to be an actual wall: the flag turns up on the odd sloped face
    too, and riding up a 60-degree bank is what the pipe states are for.
    """
    return bool(surface_flags & psx.SURF_WALLRIDEABLE) and abs(normal_y) < 0.30


def face_group(surface_flags, normal_y, auto_wall):
    """Everything that is not a transition: wall, or floor.

    Geometry decides, not the flags. The temptation is to send every face
    flagged NOT_SKATEABLE (0x0100) to the wall bucket — it is right there in the
    file, and it means what it says. But `wall` in this engine means "bounce off
    it", and a lot of what THPS marks unskateable is flat ground: carpet in the
    Mall, grass, road markings. Bounce the skater off horizontal surfaces and
    whole levels become a pinball table you cannot get out of — measured, the
    Mall and Downtown pinned the skater at 5 m/s in a corner for 45 seconds.

    So steepness decides, and the flags only confirm what steepness already
    says. Riding across a patch of grass the original would not let you skate on
    is a much smaller sin than being unable to move.
    """
    if abs(normal_y) < auto_wall:
        return WALL
    if (surface_flags & psx.SURF_WALLRIDEABLE) and abs(normal_y) < 0.5:
        return WALL
    return FLOOR


def coping_faces(verts_list, tol=0.15):
    """Of a stack of VERT quads, only the bottom one stands on a coping.

    The curtain over a tall bowl wall is not one 20 m quad, it is several
    stacked — School II's is eight, with bottom edges at 1.9, 4.0, 12.6 and
    20.6 m. Every one of them was handing PipeZones a "lip", so there were
    phantom copings four and twelve metres up a flat wall and anything near
    them got called transition.

    A face is a continuation, not a coping, when its bottom edge is another
    VERT face's top edge. That is the whole test.
    """
    def key(p, q):
        a = tuple(round(v / tol) for v in p)
        b = tuple(round(v / tol) for v in q)
        return (a, b) if a <= b else (b, a)

    tops = set()
    for verts in verts_list:
        hi = sorted(verts, key=lambda v: -v[1])[:2]
        if len(hi) == 2:
            tops.add(key(hi[0], hi[1]))

    out = []
    for verts in verts_list:
        lo = sorted(verts, key=lambda v: v[1])[:2]
        if len(lo) == 2 and key(lo[0], lo[1]) in tops:
            continue                     # sits on another curtain face: not a lip
        out.append(verts)
    return out


def has_alpha(tex):
    """Any texel not fully opaque. Those textures are cutouts — fences, leaves —
    and the level code reshapes the foliage ones mesh by mesh, so they are left
    out of the atlas and keep an image each."""
    px = tex.rgba
    return any(px[i] < 250 for i in range(3, len(px), 4))


def pack_atlas(textures, pad=1, limit=2048):
    """Lay small textures out on one sheet.

    Shelf packing, tallest first — with tiles this small (8x8 to 210x100, most
    of them 64x64) it wastes a few per cent and takes no time at all.

    Every tile gets a `pad`-texel border holding the WRAPPED edge of its own
    image: the shader tiles by taking fract() of the original UV, and bilinear
    filtering at the seam has to be able to read one texel past each edge or
    every tiling face gets a bright line down it. The border is what makes an
    atlas able to do what a REPEAT sampler does.

    Returns (width, height, rgba bytes, {name: (x, y, w, h)}) with the rect
    giving the position of the REAL image, inside its border.
    """
    items = sorted(textures.items(), key=lambda kv: (-kv[1].height, -kv[1].width))
    side = 64
    while True:
        placed, x, y, shelf = {}, pad, pad, 0
        ok = True
        for name, t in items:
            w, h = t.width + pad * 2, t.height + pad * 2
            if x + w > side:
                x, y, shelf = pad, y + shelf, 0
            if y + h > side:
                ok = False
                break
            placed[name] = (x + pad, y + pad, t.width, t.height)
            x += w
            shelf = max(shelf, h)
        if ok:
            break
        side *= 2
        if side > limit:
            return None
    buf = bytearray(side * side * 4)

    def put(px, py, r, g, b, a):
        i = (py * side + px) * 4
        buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a

    for name, (ox, oy, w, h) in placed.items():
        src = textures[name].rgba
        for row in range(-pad, h + pad):
            sy = row % h                       # wrap, so the border IS the far edge
            for col in range(-pad, w + pad):
                sx = col % w
                j = (sy * w + sx) * 4
                put(ox + col, oy + row, src[j], src[j + 1], src[j + 2], src[j + 3])
    return side, side, bytes(buf), placed


class PipeZones:
    """Where the transitions are, worked out from the VERT trigger curtain.

    A VERT face is always the same thing: a vertical quad standing on a lip and
    running 15-25 m straight up. In the Warehouse they sit in the ramp's own
    model; in Burnside and Roswell they are whole models of their own, a fence
    of them ringing the top of each bowl. Either way the bottom edge of the quad
    IS the coping, which is the one piece of information we need — the geometry
    just under and inside that line is the transition.

    So: collect every lip segment, and mark a collision triangle as pipe if it
    sits within `reach` of one horizontally and no more than `drop` below it.
    Bounded on both axes, because a bowl's coping is also within a few metres of
    plain floor, and the flat outside a ramp is not something to pump.
    """

    def __init__(self, reach, drop):
        self.reach = reach
        self.drop = drop
        self.cell = max(reach, 0.5)
        self.grid = {}
        self.count = 0

    def add(self, verts):
        """verts: the world-space corners of one VERT face."""
        ys = sorted(range(len(verts)), key=lambda i: verts[i][1])
        a, b = verts[ys[0]], verts[ys[1]]
        if abs(a[0] - b[0]) < 1e-6 and abs(a[2] - b[2]) < 1e-6:
            return                                  # degenerate lip
        lip = (a[1] + b[1]) * 0.5
        seg = (a[0], a[2], b[0], b[2], lip)
        self.count += 1
        x0, x1 = sorted((a[0], b[0]))
        z0, z1 = sorted((a[2], b[2]))
        for cx in range(int((x0 - self.reach) // self.cell), int((x1 + self.reach) // self.cell) + 1):
            for cz in range(int((z0 - self.reach) // self.cell), int((z1 + self.reach) // self.cell) + 1):
                self.grid.setdefault((cx, cz), []).append(seg)

    def contains(self, px, py, pz):
        key = (int(px // self.cell), int(pz // self.cell))
        for (ax, az, bx, bz, lip) in self.grid.get(key, ()):
            if py > lip + 0.05 or py < lip - self.drop:
                continue
            if _seg_dist2(px, pz, ax, az, bx, bz) <= self.reach * self.reach:
                return True
        return False


def _seg_dist2(px, pz, ax, az, bx, bz):
    dx, dz = bx - ax, bz - az
    d2 = dx * dx + dz * dz
    t = 0.0 if d2 < 1e-12 else max(0.0, min(1.0, ((px - ax) * dx + (pz - az) * dz) / d2))
    qx, qz = ax + dx * t, az + dz * t
    return (px - qx) ** 2 + (pz - qz) ** 2


def support_grid(buckets, cell=1.5, step=1.0):
    """Every collision edge in the park, dropped into a coarse plan grid.

    Just the heights, keyed by where you are standing. It is enough to answer
    the only question rails need: is there anything solid just under this point,
    or is it hanging in the air? Edges rather than corners, sampled along their
    length, so one long quad of wall still registers all the way across it.
    """
    grid = {}
    for group in buckets.values():
        for i in range(0, len(group) - 2, 3):
            tri = (group[i], group[i + 1], group[i + 2])
            for k in range(3):
                a, b = tri[k], tri[(k + 1) % 3]
                d = math.dist(a, b)
                n = max(1, int(d / step))
                for t in range(n + 1):
                    f = t / n
                    x = a[0] + (b[0] - a[0]) * f
                    y = a[1] + (b[1] - a[1]) * f
                    z = a[2] + (b[2] - a[2]) * f
                    grid.setdefault((int(math.floor(x / cell)), int(math.floor(z / cell))), []).append(y)
    return grid


RAIL_SUPPORT_BELOW = 1.4      # a rail sits on something within this far below it
RAIL_SUPPORT_ABOVE = 0.5      # ...and may be a little under the lip of it


def rail_supported(grid, p, cell=1.5):
    cx, cz = int(math.floor(p[0] / cell)), int(math.floor(p[2] / cell))
    lo, hi = p[1] - RAIL_SUPPORT_BELOW, p[1] + RAIL_SUPPORT_ABOVE
    for dx in (-1, 0, 1):
        for dz in (-1, 0, 1):
            for y in grid.get((cx + dx, cz + dz), ()):
                if lo <= y <= hi:
                    return True
    return False


def split_long_rails(rails, max_gap, grid=None, samples=9):
    """Break a chain wherever the run between two points crosses thin air.

    The link-array reading is right almost everywhere — the median gap between
    rail points is about 2 m — but a handful per level jump 30 to 40 m, and some
    of those are a rail drawn straight across the middle of the park, something
    you can accidentally grind onto from nowhere.

    Length alone was the first test for that and it was wrong. School II has
    sixteen runs over 25 m and THIRTEEN of them are real: three parallel sets of
    bleachers, a pair of 32 m ledges, a 38 m handrail down a bank, one wall 94 m
    long. Cutting on length took all of them out, and a two-point chain cut in
    half is two single points, which is no rail at all — which is why Dan kept
    finding ledges with nothing on them.

    So a long run now has to EARN the cut: sample along it and ask the park
    whether there is anything under each sample. A ledge answers yes the whole
    way; a rail flying across a courtyard answers no, and only that one is cut.
    """
    out, splits = [], 0
    for chain in rails:
        run = [chain[0]]
        for p in chain[1:]:
            q = run[-1]
            far = math.dist(p, q) > max_gap
            if far and grid is not None:
                held = 0
                for i in range(samples):
                    f = (i + 0.5) / samples
                    mid = tuple(q[k] + (p[k] - q[k]) * f for k in range(3))
                    if rail_supported(grid, mid):
                        held += 1
                far = held * 2 < samples        # mostly over nothing: cut it
            if far:
                if len(run) >= 2:
                    out.append(run)
                run = [p]
                splits += 1
            else:
                run.append(p)
        if len(run) >= 2:
            out.append(run)
    return out, splits


def pick_spawn(spawns):
    """Which Restart node the run should begin at.

    A level has several and they are not interchangeable. The Warehouse has nine:
    `Re_Start_Skate` is the one you actually start a session on, `Re_Start_2P`
    drops you into a quarter pipe for a two-player game, and the `Ho_` ones are
    hotspots parked on individual gaps and rails for the trick challenges. Taking
    whichever came first in the file starts you halfway up a transition.

    THPS2 renamed things: its Hangar calls the real one just `Start`, and also
    carries `Re_Start_2P_NY` and a `Dummy`, so matching on "re_" alone picked a
    two-player spot belonging to another level. Exact names first, then the
    THPS1 spelling, and never a two-player, dummy or secret-area start.
    """
    if not spawns:
        return None
    named = [(p, n, (n or "").lower()) for p, n in spawns]
    skip = ("2p", "dummy", "secret", "roof")

    def pick(test):
        for pos, name, low in named:
            if any(s in low for s in skip):
                continue
            if test(low):
                return (pos, name)
        return None

    for test in (
        lambda l: l in ("start", "re_start"),        # THPS2 says it plainly
        lambda l: "start_skate" in l,                # THPS1's name for it
        lambda l: "re_start" in l,
        lambda l: "start" in l,
        lambda l: l.startswith("re_"),
    ):
        got = pick(test)
        if got:
            return got
    return spawns[0]


def rail_height(rails, floor_tris):
    """Median height of a rail above the floor under it, in metres.

    This is the calibration probe worth trusting. The overall size of a park is
    a guess — you do not know how big the Warehouse "really" is — but a handrail
    or a ledge is about 0.9 m off the ground in every skatepark that has ever
    existed, and the original's rails sit on its own geometry. Get that number
    right and the scale is right.
    """
    heights = []
    for chain in rails:
        for (px, py, pz) in chain:
            best = None
            for i in range(0, len(floor_tris), 3):
                a, b, c = floor_tris[i], floor_tris[i + 1], floor_tris[i + 2]
                y = _bary_y(px, pz, a, b, c)
                if y is None or y > py + 0.05:
                    continue
                if best is None or y > best:
                    best = y
            if best is not None:
                heights.append(py - best)
    if not heights:
        return None
    heights.sort()
    return heights[len(heights) // 2]


def _bary_y(px, pz, a, b, c):
    """Height of triangle abc directly under (px, pz), or None if not over it."""
    d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2])
    if abs(d) < 1e-9:
        return None
    w0 = ((b[2] - c[2]) * (px - c[0]) + (c[0] - b[0]) * (pz - c[2])) / d
    w1 = ((c[2] - a[2]) * (px - c[0]) + (a[0] - c[0]) * (pz - c[2])) / d
    w2 = 1.0 - w0 - w1
    if w0 < -1e-6 or w1 < -1e-6 or w2 < -1e-6:
        return None
    return w0 * a[1] + w1 * b[1] + w2 * c[1]


def _round(p):
    return (round(p[0], 4), round(p[1], 4), round(p[2], 4))


def tri_area(a, b, c):
    ux, uy, uz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
    vx, vy, vz = c[0] - a[0], c[1] - a[1], c[2] - a[2]
    return 0.5 * math.sqrt((uy * vz - uz * vy) ** 2
                           + (uz * vx - ux * vz) ** 2
                           + (ux * vy - uy * vx) ** 2)


def tri_normal(a, b, c):
    ux, uy, uz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
    vx, vy, vz = c[0] - a[0], c[1] - a[1], c[2] - a[2]
    nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
    l = (nx * nx + ny * ny + nz * nz) ** 0.5
    if l < 1e-12:
        return None
    return (nx / l, ny / l, nz / l)


def face_colour(face, palette):
    """PS1 vertex lighting, as three RGB floats per triangle corner.

    Flat faces put (R, G, B, command) in the shade bytes. Gouraud faces put four
    palette indices there instead. Either way 128 is full brightness on the PS1,
    not 255 — the hardware doubles it — so that is the divisor.
    """
    if face.is_gouraud and palette:
        cols = []
        for i in face.shade:
            if i < len(palette):
                r, g, b, _a = palette[i]
            else:
                r = g = b = 128
            cols.append((min(r / 128.0, 1.0), min(g / 128.0, 1.0), min(b / 128.0, 1.0)))
        return cols
    r, g, b, _cmd = face.shade
    flat = (min(r / 128.0, 1.0), min(g / 128.0, 1.0), min(b / 128.0, 1.0))
    return [flat, flat, flat, flat]


"""Coplanar overlap, and why a Z-buffer cannot referee it.

The PlayStation drew this geometry back-to-front with no depth buffer, so an
artist could put one polygon exactly on top of another - a road marking on the
road, a poster on a wall, a patch of dirt on concrete, the same wall drawn once
by each of the two rooms it divides - and simply rely on drawing it second.
Depth-buffered hardware has no such rule: two surfaces at the same depth make
the comparison a coin toss decided by floating point, the winner changes with
the camera, and the surface flickers between the two as you ride past it.
Measured by casting 500 rays through each level, 3-4% of them hit two drawn
surfaces less than a centimetre apart.

Exactly duplicated triangles are dropped earlier; these are the rest, where the
two faces are genuinely different shapes sharing a plane. There is no way to
know which of them the artist meant to be on top, and it does not matter -
only that they stop sharing a depth. So each is given a layer number, one more
than anything it already overlaps, and pushed that many notches out along its
own normal. A notch is 12 mm, which at this scale is under a centimetre of
real-world offset: far enough to settle the depth test out to the far plane,
close enough that nothing looks detached.
"""
_LAYER_STEP = 0.012


def _plane_key(n, a):
    """Both sides of the same surface have to land in one bucket, so the normal
    is folded to a canonical direction first. The distance along it is returned
    separately and clustered afterwards rather than rounded: two faces 0.2 mm
    apart are still fighting, and rounding puts them either side of a boundary
    often enough to matter."""
    nx, ny, nz = n
    if (nx, ny, nz) < (-nx, -ny, -nz):
        nx, ny, nz = -nx, -ny, -nz
    d = nx * a[0] + ny * a[1] + nz * a[2]
    return (round(nx, 3), round(ny, 3), round(nz, 3)), d


_PLANE_TOL = 0.02       # faces closer than this along their normal share a plane


def _clip_area(poly, tri):
    """Area of the overlap of a convex polygon with a triangle, in 2D."""
    for i in range(3):
        p0, p1 = tri[i], tri[(i + 1) % 3]
        ex, ey = p1[0] - p0[0], p1[1] - p0[1]
        out = []
        for j in range(len(poly)):
            cur, nxt = poly[j], poly[(j + 1) % len(poly)]
            sc = ex * (cur[1] - p0[1]) - ey * (cur[0] - p0[0])
            sn = ex * (nxt[1] - p0[1]) - ey * (nxt[0] - p0[0])
            if sc >= 0:
                out.append(cur)
            if (sc >= 0) != (sn >= 0):
                t = sc / (sc - sn)
                out.append((cur[0] + (nxt[0] - cur[0]) * t,
                            cur[1] + (nxt[1] - cur[1]) * t))
        poly = out
        if len(poly) < 3:
            return 0.0
    a2 = 0.0
    for j in range(len(poly)):
        q, w = poly[j], poly[(j + 1) % len(poly)]
        a2 += q[0] * w[1] - w[0] * q[1]
    return abs(a2) * 0.5


def _ccw(t):
    a2 = sum(t[i][0] * t[(i + 1) % 3][1] - t[(i + 1) % 3][0] * t[i][1] for i in range(3))
    return t if a2 >= 0 else [t[0], t[2], t[1]]


def separate_coplanar(groups):
    """Push overlapping coplanar faces apart. Returns how many were moved."""
    sheets = {}
    for g in groups.values():
        pos, nrm = g["pos"], g["nrm"]
        for i in range(0, len(pos), 3):
            key, d = _plane_key(nrm[i], pos[i])
            sheets.setdefault(key, []).append((d, g, i))

    planes = []
    for key, rows in sheets.items():
        rows.sort(key=lambda r: r[0])
        run, last = [], None
        for d, g, i in rows:
            if last is not None and d - last > _PLANE_TOL:
                if len(run) > 1:
                    planes.append((key, run))
                run = []
            run.append((g, i))
            last = d
        if len(run) > 1:
            planes.append((key, run))

    moved = 0
    for key, members in planes:
        nx, ny, nz = key
        # a 2D frame on the plane
        ax = (1.0, 0.0, 0.0) if abs(nx) < 0.9 else (0.0, 1.0, 0.0)
        ux = (ny * ax[2] - nz * ax[1], nz * ax[0] - nx * ax[2], nx * ax[1] - ny * ax[0])
        ul = (ux[0] ** 2 + ux[1] ** 2 + ux[2] ** 2) ** 0.5 or 1.0
        ux = (ux[0] / ul, ux[1] / ul, ux[2] / ul)
        uy = (ny * ux[2] - nz * ux[1], nz * ux[0] - nx * ux[2], nx * ux[1] - ny * ux[0])

        flat, boxes = [], []
        for (g, i) in members:
            t = []
            for k in range(3):
                p = g["pos"][i + k]
                t.append((p[0] * ux[0] + p[1] * ux[1] + p[2] * ux[2],
                          p[0] * uy[0] + p[1] * uy[1] + p[2] * uy[2]))
            flat.append(_ccw(t))
            xs = [q[0] for q in t]; ys = [q[1] for q in t]
            boxes.append((min(xs), min(ys), max(xs), max(ys)))

        # a grid over the plane, so a big surface is not compared with everything
        cell = 4.0
        grid, big = {}, []
        layer = [0] * len(flat)
        area = [_clip_area(f, f) for f in flat]
        for idx in sorted(range(len(flat)), key=lambda i: -area[i]):
            x0, y0, x1, y1 = boxes[idx]
            cells = [(cx, cy)
                     for cx in range(int(x0 // cell), int(x1 // cell) + 1)
                     for cy in range(int(y0 // cell), int(y1 // cell) + 1)]
            wide = len(cells) > 400
            cand = set(big)
            if not wide:
                for ck in cells:
                    cand.update(grid.get(ck, ()))
            else:
                for l in grid.values():
                    cand.update(l)
            best = -1
            for j in cand:
                bx0, by0, bx1, by1 = boxes[j]
                if bx1 < x0 or bx0 > x1 or by1 < y0 or by0 > y1:
                    continue
                if _clip_area(flat[idx], flat[j]) > 0.2 * min(area[idx], area[j]):
                    best = max(best, layer[j])
            if best >= 0:
                layer[idx] = best + 1
                moved += 1
            if wide:
                big.append(idx)
            else:
                for ck in cells:
                    grid.setdefault(ck, []).append(idx)

        for idx, (g, i) in enumerate(members):
            L = layer[idx]
            if not L:
                continue
            n = g["nrm"][i]
            d = L * _LAYER_STEP
            for k in range(3):
                p = g["pos"][i + k]
                g["pos"][i + k] = (p[0] + n[0] * d, p[1] + n[1] * d, p[2] + n[2] * d)
    return moved


def convert(psx_path, trg_path, out_path, scale, auto_wall, rails_by_order, inspect,
            name=None, pipe_reach=5.0, invisible="floors", rail_max_gap=25.0,
            game=None, with_textures=True, max_invisible=DEFAULT_MAX_INVISIBLE,
            with_props=True):
    lvl = psx.load(psx_path)
    """The props file, if the extraction has one. Same format, its own object
    list; see the props block below for what comes out of it."""
    props = None
    props_path = os.path.splitext(psx_path)[0] + "_o.psx"
    if with_props and os.path.exists(props_path):
        try:
            props = psx.load(props_path)
        except Exception as exc:
            print("  props:     %s could not be read (%s)" % (os.path.basename(props_path), exc))
    print("%s: version %d, %d objects, %d models, %d palette colours"
          % (os.path.basename(psx_path), lvl.version, len(lvl.objects),
             len(lvl.models), len(lvl.palette)))

    # The sibling texture library, if it is sitting next to the level.
    textures = {}
    tex_path = os.path.splitext(psx_path)[0] + "_l.psx"
    if with_textures and os.path.exists(tex_path):
        try:
            textures = psx.load_textures(tex_path)
            print("  textures:  %d in %s" % (len(textures), os.path.basename(tex_path)))
        except psx.PsxError as err:
            print("  ! could not read %s (%s)" % (os.path.basename(tex_path), err))

    buckets = {FLOOR: [], WALL: [], PIPE: [], RIDE: []}
    # One bucket per texture: THPS tiles its textures — a quarter of the faces
    # run past the edge of their own image — and an atlas cannot tile, so each
    # texture keeps its own material and a REPEAT sampler instead.
    groups = {}
    seen_tris = set()
    duplicate_tris = 0
    counts = {FLOOR: 0, WALL: 0, PIPE: 0, RIDE: 0}
    drawn = skipped_degenerate = dropped_barriers = dropped_slabs = prop_tris = 0
    glass_faces = []
    # Glass dedupes against glass and nothing else. Sharing the drawn set cost
    # two panes half their quad each: the window frame sitting in the same plane
    # got there first, and the triangle behind it was thrown away as a copy of
    # it, leaving a window you could ride through one half of.
    seen_glass = set()

    ramp_heights = []

    # Pass one: place every object, and read the transitions off the VERT curtain.
    placed = []
    zones = PipeZones(pipe_reach, pipe_reach * 1.6)
    curtain = []
    for src_index, obj in enumerate(lvl.objects):
        if obj.model_index >= len(lvl.models):
            continue
        model = lvl.models[obj.model_index]
        ox, oy, oz = obj.x / 4096.0, obj.y / 4096.0, obj.z / 4096.0
        world = [to_three(ox + vx, oy + vy, oz + vz, scale) for (vx, vy, vz) in model.vertices]
        placed.append((model, world, src_index))
        for f in model.faces:
            if f.surface_flags & psx.SURF_VERT:
                n = 3 if (f.base_flags & psx.BASE_TRIANGLE) else 4
                curtain.append([world[i] for i in f.verts[:n]])
    for verts in coping_faces(curtain):
        zones.add(verts)

    # Pass two: classify and emit.
    stem = os.path.basename(psx_path).rsplit(".", 1)[0].lower()
    spec = DECK_SPOTS.get(stem)
    # an entry may be one object or a group of them that make up one thing
    deck_groups = [g if isinstance(g, list) else [g] for g in (spec["objects"] if spec else [])]
    deck_wanted = {i for g in deck_groups for i in g}
    deck_geo = {}
    dropped_decks = 0

    for obj_index, (model, world, src_index) in enumerate(placed):
        if src_index in deck_wanted:
            deck_geo[src_index] = (model, world)
            if spec.get("drop"):
                # the box IS the pickup now, so it does not want to be there too
                dropped_decks += 1
                continue

        """Two facts about the whole model that is_glass needs: whether the
        level calls it a prop, and whether it is a single sheet wearing a
        single texture. Neither belongs to a face, so they are worked out
        once here rather than per triangle."""
        is_prop = bool(getattr(model, "flags", 0) & GLASS_MODEL)
        one_texture = len({f.texture_index for f in model.faces if f.is_visible}) == 1

        for face in model.faces:
            """The VERT flag marks two different things, and only one of them
            is a trigger.

            An INVISIBLE vert face is the curtain: a pane hung in the air over
            a quarter pipe's coping so the game knows you are in the vert zone.
            It is not geometry and must not become a collider.

            A VISIBLE vert face is the vert WALL itself — the painted bowl wall
            above the transition, the part you air along. Dropping those took
            out 763 real drawn walls across the twenty levels (43 of them the
            whole back wall of the School II bowl, which is how this was
            found): a wall you can see the sky through and cannot ride into.
            Every one of them carries a second surface bit as well; the bare
            0x0040 curtain faces are invisible in nineteen levels out of twenty.
            """
            if (face.surface_flags & psx.SURF_VERT) and not face.is_visible:
                continue
            vi = face.verts
            """Faces the original never draws.

            Roughly one collision triangle in eight is flagged invisible, and
            in every level measured they are overwhelmingly steep: barriers
            penning you into the skateable part, and boxes thrown round scenery
            that is too fiddly to collide against properly. Kept, they are
            exactly what they sound like — invisible walls you ride into with
            nothing on the screen to explain it.

            The flat ones are a different animal: smoothed collision laid over
            stepped or decorative geometry, which you want. So the default
            keeps those and drops the rest. The visible geometry is all still
            there, so dropping a barrier means riding up to the thing it was
            standing in front of, not through it.
            """
            # The PS1 stores a quad as a strip (v0 v1 / v2 v3) wound clockwise;
            # both reference importers reverse it and split it the same way.
            # These are corner numbers within the face, not vertex indices.
            tris = [(2, 1, 0)]
            if face.is_quad:
                tris.append((1, 2, 3))

            cols = face_colour(face, lvl.palette) if face.is_visible else None

            for k0, k1, k2 in tris:
                a, b, c = world[vi[k0]], world[vi[k1]], world[vi[k2]]
                n = tri_normal(a, b, c)
                if n is None:
                    skipped_degenerate += 1
                    continue
                if not face.is_visible:
                    if invisible == "none":
                        continue
                    if invisible == "floors" and abs(n[1]) < 0.55:
                        dropped_barriers += 1
                        continue
                    """AND NOT THE ENORMOUS ONES.

                    Undrawn flat collision is kept because it is usually
                    smoothing: a sheet laid over a staircase or a row of ledges
                    so you ride the line instead of bumping down every step.
                    That kind of sheet is the size of the thing it smooths.

                    These are not. The Hangar carries one invisible plate 60 m
                    by 94 m at head height across the middle of the level, and
                    another 40 cm under it facing down — a slab, not a floor.
                    Across the twenty parks, 164 triangles of a thousand square
                    metres or more hold 893,000 of the 1,013,000 square metres
                    of undrawn flat collision between them: whatever they are
                    for in the original — sector bounds, sound, a trigger volume
                    — it is not ground, and here they read as a floor hanging in
                    mid-air. THPS1 has almost none of them, which is why Dan
                    found those parks clean and the THPS2 ones full of it."""
                    if tri_area(a, b, c) > max_invisible:
                        dropped_slabs += 1
                        continue
                cx = (a[0] + b[0] + c[0]) / 3.0
                cy = (a[1] + b[1] + c[1]) / 3.0
                cz = (a[2] + b[2] + c[2]) / 3.0
                """A pipe zone says "there is a coping above here", not "this is
                a ramp". It used to promote ANY face under a lip, vertical ones
                included — so the vert wall standing on the coping came out as
                transition, the skater touched it on the way up and went into
                the bowl state ON THE WALL, free to drive around a flat vertical
                face in both directions. The same steepness rule that
                face_group already applies decides first: too steep to ride is
                too steep to be a transition, lip or no lip."""
                """Glass leaves the pipeline here.

                A pane is not part of the world mesh and not part of the world
                collision: it is its own node, so the engine can take one window
                out without touching the wall it sits in. Collected before the
                buckets, or the continue below would drop it entirely — which is
                exactly what the first cut of this did.

                It keeps its own texture and UVs rather than joining the atlas.
                That costs a draw call per pane and is worth it twice over: a
                pane has to be able to disappear on its own, and the texture is
                the window — frame, glazing bars, and in the Warehouse the panes
                the level ships already broken. Tinted flat instead, a window
                reads as a grey rectangle.

                Windows are drawn from both sides, same as the walls are, so the
                same dedupe applies — but against other glass only, or the frame
                sitting in the same plane eats half the pane.
                """
                if is_glass(face, n[1], is_prop, one_texture):
                    key = tuple(sorted((_round(a), _round(b), _round(c))))
                    if key not in seen_glass:
                        seen_glass.add(key)
                        gtex = gname = None
                        if textures and face.texture_index is not None:
                            gname = (lvl.texture_names[face.texture_index]
                                     if face.texture_index < len(lvl.texture_names) else None)
                            gtex = textures.get(gname)
                        guv = [(0.0, 0.0)] * 3
                        if gtex and face.uvs:
                            guv = [(face.uvs[k][0] / gtex.width, face.uvs[k][1] / gtex.height)
                                   for k in (k0, k1, k2)]
                        glass_faces.append((
                            obj_index, (a, b, c),
                            (cols[k0], cols[k1], cols[k2]) if cols
                            else ((1.0, 1.0, 1.0),) * 3,
                            gname, gtex, tuple(guv), n))
                    continue
                g = face_group(face.surface_flags, n[1], auto_wall)
                """How steep a face under a coping may be and still be the
                transition rather than a wall.

                A quarter pipe does not stop being a quarter pipe where it gets
                steep — it gets steepest right under the coping, which is the
                part you ride last and hardest. Cutting the promotion off at the
                wall angle (0.30) meant the top of every transition in the game
                came out as wall: Dan pinned four points up one in the Hangar and
                the top two, at 0.26, were wall and would not carry him.

                It cannot simply be dropped, though. Under a coping there is also
                a great deal of genuinely vertical surface — 10,000 m2 of it in
                the School — and promoting that is what let the skater drive
                around a flat wall in bowl mode. The two sets separate cleanly by
                angle: across eight parks the 0.20-0.30 band holds 89 to 843 m2
                a park and is transition, while everything under 0.10 is
                hundreds to thousands of square metres of wall."""
                if abs(n[1]) >= PIPE_MAX_WALL and zones.contains(cx, cy, cz):
                    g = PIPE
                elif g == WALL and face.is_visible and rideable(face.surface_flags, n[1]):
                    g = RIDE            # still a wall; one you can ride along
                buckets[g].extend((a, b, c))
                counts[g] += 1
                if face.is_visible:
                    """Drop exactly coincident triangles.

                    14% of the Warehouse's visible triangles sit precisely on
                    top of another one — a wall drawn once from each side, or
                    from each of the two rooms that share it. Two coplanar
                    triangles at the same depth is the definition of z-fighting,
                    and it shows up as the surface flickering as you ride. Since
                    everything here renders double-sided, keeping one of each is
                    no loss.
                    """
                    key = tuple(sorted((_round(a), _round(b), _round(c))))
                    if key in seen_tris:
                        duplicate_tris += 1
                        continue
                    seen_tris.add(key)

                    tex = None
                    tex_name = None
                    if textures and face.texture_index is not None:
                        tex_name = (lvl.texture_names[face.texture_index]
                                    if face.texture_index < len(lvl.texture_names) else None)
                        tex = textures.get(tex_name)
                    g = groups.setdefault(id(tex) if tex else 0,
                                          {"tex": tex, "name": tex_name if tex else None,
                                           "pos": [], "nrm": [], "col": [], "uv": []})
                    g["pos"].extend((a, b, c))
                    g["nrm"].extend((n, n, n))
                    g["col"].extend((cols[k0], cols[k1], cols[k2]))
                    if tex and face.uvs:
                        for k in (k0, k1, k2):
                            u, v = face.uvs[k]
                            g["uv"].append((u / tex.width, v / tex.height))
                    else:
                        g["uv"].extend(((0.0, 0.0),) * 3)
                    drawn += 1

    """The props: the helicopter, the flying saucer, the bins.

    Every park ships a second file beside it — `<stem>_o.psx`, same format,
    its own little object list — and the pipeline had never opened one. That is
    where the set pieces live: Roswell's saucer is 78 faces in skros_o.psx and
    the Hangar's helicopter is 205 in skhan_o.psx, and neither had ever appeared
    in this port because neither is in the level file at all.

    They are drawn AND solid. Scenery-only was the first cut of this, on the
    grounds that 200 faces of helicopter is a lot of collision to invent — but
    riding through a helicopter is worse than riding round one, and unlike the
    invisible plates elsewhere in this file a prop is drawn, so every filter
    downstream can see it is really there. Steepness sorts them the same way it
    sorts the park: a flat prop top is floor, its sides are wall. No lip zone
    promotion; a crate is not a transition. Two are left out — anything
    bigger than PROP_MAX_SPAN, which is the sky dome rather than a prop, and
    anything parked well outside the park, which the original keeps for a script
    to fly in and this port has no script for.
    """
    if props:
        lo = [min(p[i] for p in buckets[FLOOR] + buckets[WALL] + buckets[PIPE]) for i in range(3)] \
            if (buckets[FLOOR] or buckets[WALL] or buckets[PIPE]) else [0, 0, 0]
        hi = [max(p[i] for p in buckets[FLOOR] + buckets[WALL] + buckets[PIPE]) for i in range(3)] \
            if (buckets[FLOOR] or buckets[WALL] or buckets[PIPE]) else [0, 0, 0]
        kept = skipped_sky = skipped_away = 0
        for obj in props.objects:
            if obj.model_index >= len(props.models):
                continue
            model = props.models[obj.model_index]
            if not model.vertices:
                continue
            ox, oy, oz = obj.x / 4096.0, obj.y / 4096.0, obj.z / 4096.0
            world = [to_three(ox + vx, oy + vy, oz + vz, scale)
                     for (vx, vy, vz) in model.vertices]
            span = max(max(p[i] for p in world) - min(p[i] for p in world) for i in range(3))
            if span > PROP_MAX_SPAN:
                skipped_sky += 1
                continue
            cen = [sum(p[i] for p in world) / len(world) for i in range(3)]
            if any(cen[i] < lo[i] - PROP_STRAY or cen[i] > hi[i] + PROP_STRAY for i in range(3)):
                skipped_away += 1
                continue
            kept += 1
            for face in model.faces:
                if not face.is_visible:
                    continue
                vi = face.verts[:3] if (face.base_flags & psx.BASE_TRIANGLE) else face.verts[:4]
                if max(vi) >= len(world):
                    continue
                tris = [(2, 1, 0)] + ([(1, 2, 3)] if face.is_quad else [])
                cols = face_colour(face, props.palette or lvl.palette)
                for k0, k1, k2 in tris:
                    a, b, c = world[vi[k0]], world[vi[k1]], world[vi[k2]]
                    n = tri_normal(a, b, c)
                    if n is None:
                        continue
                    tex = tex_name = None
                    if textures and face.texture_index is not None:
                        tex_name = (props.texture_names[face.texture_index]
                                    if face.texture_index < len(props.texture_names) else None)
                        tex = textures.get(tex_name)
                    g = groups.setdefault(id(tex) if tex else 0,
                                          {"tex": tex, "name": tex_name if tex else None,
                                           "pos": [], "nrm": [], "col": [], "uv": []})
                    g["pos"].extend((a, b, c))
                    g["nrm"].extend((n, n, n))
                    g["col"].extend((cols[k0], cols[k1], cols[k2]))
                    if tex and face.uvs:
                        for k in (k0, k1, k2):
                            u, v = face.uvs[k]
                            g["uv"].append((u / tex.width, v / tex.height))
                    else:
                        g["uv"].extend(((0.0, 0.0),) * 3)
                    drawn += 1
                    prop_tris += 1
                    pg = face_group(face.surface_flags, n[1], auto_wall)
                    buckets[pg].extend((a, b, c))
                    counts[pg] += 1
        print("  props:     %d of %d from %s (%d triangles)%s%s"
              % (kept, len(props.objects), os.path.basename(props_path), prop_tris,
                 ", %d sky domes left out" % skipped_sky if skipped_sky else "",
                 ", %d parked outside the park" % skipped_away if skipped_away else ""))

    print("  collision: %d floor, %d wall, %d pipe triangles (%d lip segments)"
          % (counts[FLOOR], counts[WALL], counts[PIPE], zones.count)
          + "\n  wallride: %d of those walls carry the WALLRIDEABLE flag" % counts[RIDE])
    print("  visual:    %d triangles drawn in %d texture groups, %d degenerate skipped"
          % (drawn, len(groups), skipped_degenerate))
    if duplicate_tris:
        print("  deduped:   %d exactly coincident triangles (they were z-fighting)"
              % duplicate_tris)
    layered = separate_coplanar(groups)
    if layered:
        print("  separated: %d coplanar faces pushed off each other by %d mm"
              % (layered, round(_LAYER_STEP * 1000)))
    if dropped_barriers:
        print("  dropped:   %d undrawn barrier triangles (--invisible %s)"
              % (dropped_barriers, invisible))
    if dropped_slabs:
        print("  slabs:     %d undrawn plates over %d m2 dropped (floors in mid-air)"
              % (dropped_slabs, round(max_invisible)))

    # the five-of-a-kind, one spot per group, in the order the table lists them
    deck_spots = []
    for group in deck_groups:
        parts = [deck_geo[i] for i in group if i in deck_geo]
        if parts:
            deck_spots.append(deck_spot(parts, spec["place"], spec["lift"]))
    if deck_spots:
        print("  decks:     %d of the park's five-of-a-kind found%s"
              % (len(deck_spots),
                 ", and taken out of the level" if dropped_decks else ""))

    rails, spawn, pickups, loot = [], None, [], []
    if trg_path:
        nodes = trg.load(trg_path)
        ratio = trg.links_look_like_node_indices(nodes)
        rail_nodes = sum(1 for n in nodes if n.is_rail)
        print("  %s: %d nodes, %d rail nodes, link array points at a rail %.0f%% of the time"
              % (os.path.basename(trg_path), len(nodes), rail_nodes, ratio * 100))
        if ratio < 0.5 and not rails_by_order:
            print("  ! the link arrays do not look like node indices on this file;"
                  " consider --rails-by-order")
        raw = trg.chain_rails(nodes, by_order=rails_by_order)
        rails = [[to_three(x, y, z, scale) for (x, y, z) in chain] for chain in raw]
        rails, splits = split_long_rails(rails, rail_max_gap, support_grid(buckets))
        lengths = sorted((len(r) for r in rails), reverse=True)
        print("  rails:     %d chains, longest %s%s"
              % (len(rails), lengths[:6] or "-",
                 (", %d cut at a bad link" % splits) if splits else ""))

        loot = [list(to_three(*pos, scale=scale)) + [iid]
                for pos, iid in trg.items(nodes)]
        if loot:
            from collections import Counter as _C
            ids = _C(p[3] for p in loot)
            letters = sum(1 for i in trg.ITEM_SKATE if ids.get(i) == 1)
            print("  items:     %d pickups, %d/5 letters%s (%s)"
                  % (len(loot), letters,
                     ", tape" if ids.get(trg.ITEM_TAPE) == 1 else "",
                     ", ".join("#%d x%d" % (k, n) for k, n in sorted(ids.items()))))

        pickups = [list(to_three(*pos, scale=scale)) + list(kind)
                   for pos, kind in trg.markers(nodes)]
        if pickups:
            from collections import Counter as _C
            kinds = _C(tuple(p[3:]) for p in pickups)
            print("  markers:   %d item spots (%s)"
                  % (len(pickups), ", ".join("%d,%d x%d" % (k[0], k[1], n)
                                             for k, n in sorted(kinds.items()))))
        sp = trg.spawns(nodes)
        print("  spawns:    %d (%s)" % (len(sp), ", ".join(n or "?" for _p, n in sp[:4])))
        chosen = pick_spawn(sp)
        if chosen:
            print("  start:     %s" % (chosen[1] or "unnamed"))
            spawn = to_three(*chosen[0], scale=scale)

    if inspect:
        if buckets[FLOOR]:
            ys = [p[1] for p in buckets[FLOOR]]
            xs = [p[0] for p in buckets[FLOOR]]
            zs = [p[2] for p in buckets[FLOOR]]
            print("  extent:    x %.1f..%.1f  y %.1f..%.1f  z %.1f..%.1f (metres at scale %.2f)"
                  % (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs), scale))
            span = max(max(xs) - min(xs), max(zs) - min(zs))
            print("  size:      the widest side is %.1f m, and it is %.1f m tall"
                  % (span, max(ys) - min(ys)))
        ramp_heights = [p[1] for p in buckets[PIPE]]
        if ramp_heights:
            tall = max(ramp_heights) - min(ramp_heights)
            print("  calibrate: transitions span %.2f m from the lowest to the highest lip."
                  % tall)
            print("             Ride it: a quarter pipe should be about 2.4 m tall.")
        else:
            rh = rail_height(rails, buckets[FLOOR])
            if rh:
                print("  calibrate: rails sit a median %.2f m above the floor; a handrail"
                      " is about 0.9 m, so try --scale %.0f" % (rh, scale * rh / 0.9))
            else:
                print("  calibrate: nothing measurable. Judge by the size above:"
                      " a THPS park is roughly 50-120 m across.")
        print("  (inspect only, nothing written)")
        return

    stem = os.path.splitext(os.path.basename(psx_path))[0].upper()
    name = name or stem.replace("_", " ").title()
    b = GlbBuilder()
    collider_mat = b.material("collider")
    visual_mat = b.material("thps_vertexcolour", vertex_colours=True)

    for group, suffix in ((FLOOR, "Col_Floor"), (WALL, "Col_Wall"),
                          (PIPE, "Col_Pipe"), (RIDE, "Col_Ride")):
        b.add_triangles("%s_%s" % (stem, suffix), buckets[group], material=collider_mat)
    """One sheet instead of two hundred images.

    A converted park arrived as one mesh per texture — 202 of them in School II
    — which is 202 draw calls a frame before anything else is on the screen, and
    that is the number a weak tablet runs out of first. Nothing else about it was
    expensive: 75,000 triangles and 6 MB of texture are nothing.

    They could not be merged before because THPS TILES: three faces in five run
    their texture past its own edge, and a shared atlas has no way to repeat. It
    does now — every vertex carries the rect of the sheet its texture occupies,
    and the shader wraps inside that rect with fract() instead of leaning on the
    sampler. See _atlasMaterial in src/level.js.

    Cutouts stay out of it. A texture with any transparency is a fence or a tree,
    and the level code reshapes foliage a mesh at a time; merged into the sheet
    there would be no mesh to reshape.
    """
    ordered = sorted(groups.values(), key=lambda g: -len(g["pos"]))
    flat = [g for g in ordered if g["tex"] and not has_alpha(g["tex"])]
    packed = pack_atlas({g["name"]: g["tex"] for g in flat}) if flat else None
    atlas_tris = 0

    if packed:
        aw, ah, rgba, rects = packed
        atlas_mat = b.material("thps_atlas", vertex_colours=True,
                               texture=b.image(png.write_rgba(aw, ah, rgba), "atlas", atlas=True))
        pos, nrm, col, uv, org, siz = [], [], [], [], [], []
        for g in flat:
            x, y, w, h = rects[g["name"]]
            o = (x / aw, y / ah)
            z = (w / aw, h / ah)
            pos.extend(g["pos"]); nrm.extend(g["nrm"]); col.extend(g["col"]); uv.extend(g["uv"])
            org.extend([o] * len(g["pos"]))
            siz.extend([z] * len(g["pos"]))
        atlas_tris = len(pos) // 3
        b.add_triangles("%s_Atlas" % stem, pos, normals=nrm, colours=col, uvs=uv,
                        material=atlas_mat,
                        extra={"_TILEORIGIN": org, "_TILESIZE": siz})
        rest = [g for g in ordered if g not in flat]
    else:
        rest = ordered

    for i, g in enumerate(rest):
        tex = g["tex"]
        if tex:
            mat = b.material("thps_tex_%d" % i, vertex_colours=True,
                             texture=b.image(png.write_rgba(tex.width, tex.height, tex.rgba),
                                             "tex_%d" % i))
        else:
            mat = visual_mat
        b.add_triangles("%s_Mesh_%02d" % (stem, i), g["pos"], normals=g["nrm"],
                        colours=g["col"], uvs=g["uv"] if tex else None, material=mat)
    if packed:
        print("  atlas:     %d textures on one %dx%d sheet, %d triangles in ONE mesh;"
              " %d cutout meshes kept separate"
              % (len(flat), packed[0], packed[1], atlas_tris, len(rest)))
    """Panes, one node each.

    A window is not one face, and a window WALL is not one window: the game
    breaks the pane you hit, not the building. So the faces are grouped into
    panes by shared vertices — anything that touches is the same sheet of glass
    — and each pane becomes its own node, which the engine draws, collides
    against, and later removes in one piece. See Level._glass in src/level.js.
    """
    panes = group_panes(glass_faces)
    glass_mats = {}
    for i, tris_ in enumerate(panes):
        pos, col, uv, nrm = [], [], [], []
        tex = tex_name = None
        for _obj, tri, colours, gname, gtex, guv, fn in tris_:
            pos.extend(tri)
            col.extend(colours)
            uv.extend(guv)
            """A pane needs normals like anything else. Without them the lit
            material has no surface to light and every window in the game came
            out solid black — the texture, the baked colour and the lights were
            all fine and none of it reached the screen."""
            nrm.extend((fn, fn, fn))
            if gtex is not None and tex is None:
                tex, tex_name = gtex, gname
        if tex is not None:
            mat = glass_mats.get(id(tex))
            if mat is None:
                mat = b.material("thps_glass_%d" % len(glass_mats), vertex_colours=True,
                                 texture=b.image(png.write_rgba(tex.width, tex.height, tex.rgba),
                                                 "glass_%d" % len(glass_mats)))
                glass_mats[id(tex)] = mat
        else:
            mat = glass_mats.setdefault("flat", b.material(
                "thps_glass", vertex_colours=True, base=(0.72, 0.84, 0.90, 1.0)))
        b.add_triangles("%s_Glass_%03d" % (stem, i), pos, normals=nrm, colours=col,
                        uvs=uv if tex is not None else None, material=mat)
    if panes:
        print("  glass:     %d panes (%d faces) you can put a board through"
              % (len(panes), sum(len(t) for t in panes)))

    for i, chain in enumerate(rails):
        b.add_polyline("%s_Rail_%03d" % (stem, i), chain)

    b.extras = {
        "thps": {
            "source": os.path.basename(psx_path),
            "version": lvl.version,
            "scale": scale,
            "spawn": list(spawn) if spawn else None,
            "spawns": [[n, list(to_three(*p, scale=scale))] for p, n in (sp if trg_path else [])],
            # Every type-13 item spot in the park: x, y, z and the two numbers
            # the node carries. See thps_trg.markers for what is and is not
            # known about them. src/thps.js puts the letters on five and a
            # barrel on each of the rest.
            # The real item table: x, y, z and the pickup's id. Ids 4, 5, 6,
            # 10 and 15 are S, K, A, T and E; 16 is the secret tape; the rest
            # are the level's own collectibles. See thps_trg.items.
            # THPS1's five-of-a-kind: where the golden decks go in a park
            # whose collectables are level geometry rather than item nodes.
            # x, y, z then the facing normal's x and z. See DECK_SPOTS.
            "deckspots": deck_spots,
            "deckplace": (spec or {}).get("place", ""),
            "items": [list(p) for p in loot],
            "markers": [list(p) for p in pickups],
            "rails": len(rails),
            "triangles": {"floor": counts[FLOOR], "wall": counts[WALL],
                          "pipe": counts[PIPE], "ride": counts[RIDE], "visual": drawn},
        }
    }

    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    b.save(out_path)
    print("  wrote %s (%.1f MB)" % (out_path, os.path.getsize(out_path) / 1048576.0))
    register(out_path, name, len(rails), counts, drawn, game=game)


def register(out_path, name, rails, counts, drawn, game=None):
    """Add (or replace) this level's entry in levels.json beside the .glb.

    The game has no way to list a directory, so this manifest is how a converted
    park shows up in the level select. No manifest, no THPS levels, and the
    three built-in parks carry on as if none of this existed.
    """
    folder = os.path.dirname(os.path.abspath(out_path))
    manifest_path = os.path.join(folder, "levels.json")
    manifest = {"levels": []}
    if os.path.exists(manifest_path):
        try:
            with open(manifest_path) as fh:
                manifest = json.load(fh)
            manifest.setdefault("levels", [])
        except (ValueError, OSError):
            print("  ! levels.json was unreadable, starting a new one")
            manifest = {"levels": []}

    file_name = os.path.basename(out_path)
    entry = {
        "file": file_name,
        "name": name,
        "game": game,
        "blurb": "%d rail%s, %s collision triangles." % (
            rails, "" if rails == 1 else "s",
            "{:,}".format(counts[FLOOR] + counts[WALL] + counts[PIPE] + counts[RIDE])),
        "rails": rails,
    }
    manifest["levels"] = [l for l in manifest["levels"] if l.get("file") != file_name]
    manifest["levels"].append(entry)
    manifest["levels"].sort(key=lambda l: str(l.get("name", "")))
    with open(manifest_path, "w") as fh:
        json.dump(manifest, fh, indent=2)
    print("  registered '%s' in %s (%d level%s)"
          % (name, manifest_path, len(manifest["levels"]),
             "" if len(manifest["levels"]) == 1 else "s"))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("psx")
    ap.add_argument("trg", nargs="?")
    ap.add_argument("-o", "--out")
    ap.add_argument("--scale", type=float, default=DEFAULT_SCALE)
    ap.add_argument("--auto-wall", type=float, default=DEFAULT_AUTO_WALL)
    ap.add_argument("--rails-by-order", action="store_true")
    ap.add_argument("--inspect", action="store_true")
    ap.add_argument("--name", help="what to call it in the level select")
    ap.add_argument("--game", help="which game it came from, e.g. THPS2 — shown as a "
                                   "corner tag rather than crammed into the name")
    ap.add_argument("--pipe-reach", type=float, default=5.0,
                    help="how far from a coping line counts as transition, in metres")
    ap.add_argument("--invisible", choices=("floors", "all", "none"), default="floors",
                    help="what to collide with among faces the original never draws")
    ap.add_argument("--max-invisible", type=float, default=DEFAULT_MAX_INVISIBLE,
                    help="biggest undrawn flat collision triangle to keep, in m2;"
                         " anything larger is a sector volume, not a floor")
    ap.add_argument("--no-textures", action="store_true",
                    help="skip the sibling _l.psx and leave the level vertex-lit only")
    ap.add_argument("--rail-max-gap", type=float, default=25.0,
                    help="cut a rail chain where consecutive points are further apart than this")
    a = ap.parse_args(argv)

    trg_path = a.trg
    if trg_path is None:
        guess = os.path.splitext(a.psx)[0] + ".TRG"
        for cand in (guess, guess.lower(), os.path.splitext(a.psx)[0] + ".trg"):
            if os.path.exists(cand):
                trg_path = cand
                break

    out = a.out or (os.path.splitext(os.path.basename(a.psx))[0].lower() + ".glb")
    convert(a.psx, trg_path, out, a.scale, a.auto_wall, a.rails_by_order, a.inspect,
            name=a.name, pipe_reach=a.pipe_reach, invisible=a.invisible,
            rail_max_gap=a.rail_max_gap, game=a.game, with_textures=not a.no_textures,
            max_invisible=a.max_invisible)
    return 0


if __name__ == "__main__":
    sys.exit(main())
