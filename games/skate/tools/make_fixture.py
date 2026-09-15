"""make_fixture.py — synthesise a tiny but format-legal .psx / .trg pair.

There is no THPS game data in this repository and there never will be, so the
converter is verified against a level we build ourselves, byte by byte, to the
layout both reference implementations agree on. Everything the converter has to
get right is represented: a floor, a wallrideable face, a non-skateable face, an
invisible transition proxy, a gouraud-shaded face, an open rail, a closed rail
loop and a named spawn.
"""

import struct

import thps_psx as psx
import thps_trg as trg

# --- the polygons, in THPS units --------------------------------------------
# THPS Y points DOWN, and a quad is a PS1 strip: v0 v1 / v2 v3 with v0 top-left,
# wound clockwise as the viewer sees it.

def quad(cx, cy, cz, half=20):
    """A floor-like quad centred on (cx, cy, cz), facing up (THPS -Y)."""
    return [(cx - half, cy, cz + half),   # v0 top-left
            (cx + half, cy, cz + half),   # v1 top-right
            (cx - half, cy, cz - half),   # v2 bottom-left
            (cx + half, cy, cz - half)]   # v3 bottom-right


def wall_quad(cx, cy, cz, half=20):
    """A vertical quad. The wall bucket is decided by steepness, so a wall in
    the fixture has to actually be one."""
    return [(cx - half, cy - half, cz), (cx + half, cy - half, cz),
            (cx - half, cy + half, cz), (cx + half, cy + half, cz)]


FACES = [
    # (name, surface_flags, base_flags, shade, quad centre, builder)
    ("floor",     0,                      0x0000, (90, 110, 90, 0x28), (0, 0, 0),   quad),
    ("wallride",  psx.SURF_WALLRIDEABLE,  0x0000, (40, 40, 60, 0x28),  (80, 0, 0),  wall_quad),
    ("noskate",   psx.SURF_NOT_SKATEABLE, 0x0000, (200, 30, 30, 0x28), (160, 0, 0), wall_quad),
    ("gouraud",   0,                      0x0800, (1, 2, 3, 0),        (0, 0, 160), quad),
    # An undrawn barrier: steep, flagged invisible. Dropped by default.
    ("barrier",   0,                      0x0080, (0, 0, 0, 0x28),     (240, 0, 0), wall_quad),
]


def _emit_psx(models, origin=(0, 0, 0), names=None):
    """Assemble a v4 .psx from a list of (vertices, faces).

    Real levels are hundreds of small models placed by objects, and that matters
    here for more than realism: the converter decides what is a ramp PER MODEL,
    from whether the model carries a VERT trigger face. One giant model would
    make the whole park a ramp.
    """
    head = bytearray()
    head += struct.pack("<HH", psx.VERSION_THPS2, 2)
    tag_start_at = len(head)
    head += struct.pack("<I", 0)
    head += struct.pack("<I", len(models))
    for i in range(len(models)):
        head += struct.pack("<IiiiIHHhhII", 0, origin[0], origin[1], origin[2],
                            0, 0, i, 0, 0, 0, 0)

    mesh_start = len(head)
    head += struct.pack("<I", len(models))
    ptr_at = len(head)
    head += struct.pack("<I", 0) * len(models)

    offsets = []
    for verts, faces in models:
        if len(verts) > 255:
            raise SystemExit("THPS2 addresses vertices with a single byte: %d is too "
                             "many for one model" % len(verts))
        offsets.append(len(head))
        head += struct.pack("<HHHH", 0x8, len(verts), 1, len(faces))
        head += struct.pack("<I", 0)
        head += struct.pack("<hhhhhh", 32000, -32000, 32000, -32000, 32000, -32000)
        head += struct.pack("<I", 0)
        for (x, y, z) in verts:
            head += struct.pack("<hhhh", x, y, z, 0)
        head += struct.pack("<hhhh", 0, -4096, 0, 0)
        for (base, surf, vi, shade) in faces:
            head += struct.pack("<HH", base, 16)
            head += struct.pack("<BBBB", *vi)
            head += struct.pack("<BBBB", *shade)
            head += struct.pack("<HH", 0, surf)

    struct.pack_into("<I", head, tag_start_at, len(head))
    for i, off in enumerate(offsets):
        struct.pack_into("<I", head, ptr_at + 4 * i, off)
    return head, mesh_start


def _close_psx(head, palette=None, model_count=1):
    if palette:
        pal = b"".join(struct.pack("<BBBB", *c) for c in palette)
        head += b"RGBs" + struct.pack("<I", len(pal)) + pal
    head += b"\xFF\xFF\xFF\xFF"
    for i in range(model_count):
        head += struct.pack("<I", 0xDEADBEEF + i)
    head += struct.pack("<I", 0)
    return bytes(head)


def build_psx():
    """Two models: the plain surfaces, and a ramp with its VERT trigger."""
    flat_verts, flat_faces = [], []
    for _name, surf, base, shade, (cx, cy, cz), build in FACES:
        i0 = len(flat_verts)
        flat_verts.extend(build(cx, cy, cz))
        flat_faces.append((base, surf, (i0, i0 + 1, i0 + 2, i0 + 3), shade))

    # The ramp: one real transition face, plus the invisible VERT quad standing
    # on its lip and running upwards, exactly as a real quarter pipe is built.
    # A transition with its trigger curtain standing on the near edge, which is
    # the arrangement every real ramp uses.
    rv = quad(0, 0, 80, half=2) + [(-2, 0, 78), (2, 0, 78), (-2, -8, 78), (2, -8, 78)]
    ramp_faces = [
        (0x0000, 0x0400, (0, 1, 2, 3), (70, 74, 80, 0x28)),      # the transition
        (0x0080, psx.SURF_VERT, (4, 5, 6, 7), (0, 0, 0, 0x28)),  # the trigger
    ]

    head, _ = _emit_psx([(flat_verts, flat_faces), (rv, ramp_faces)],
                        origin=(4096 * 2, 0, 0))
    palette = [(0, 0, 0, 0), (128, 0, 0, 0), (0, 128, 0, 0), (0, 0, 128, 0)]
    return _close_psx(head, palette, model_count=2)


def build_trg():
    """Six rail nodes (one open chain of 3, one closed loop of 3) and a spawn."""
    # (type, links, position in THPS units, name)
    spec = [
        (trg.NODE_RAILDEF,   [1], (0, -10, 0), None),
        (trg.NODE_RAILPOINT, [2], (40, -10, 0), None),
        (trg.NODE_RAILPOINT, [],  (80, -10, 0), None),
        (trg.NODE_RAILDEF,   [4], (0, -10, 120), None),
        (trg.NODE_RAILPOINT, [5], (40, -10, 120), None),
        (trg.NODE_RAILPOINT, [3], (40, -10, 160), None),
        (trg.NODE_RESTART,   [],  (20, -6, 20), "Restart_1"),
    ]

    header = bytearray(b"_TRG" + struct.pack("<II", 2, len(spec) + 1))
    header += b"\0" * (4 * (len(spec) + 1))     # offset table, patched below

    body = bytearray(header)
    offsets = []
    for (type_, links, (x, y, z), name) in spec:
        offsets.append(len(body))
        body += struct.pack("<H", type_)
        body += struct.pack("<H", len(links))
        for l in links:
            body += struct.pack("<H", l)
        while len(body) % 4:
            body += b"\0"
        body += struct.pack("<iii", x, y, z)
        if type_ == trg.NODE_RESTART:
            body += struct.pack("<HHH", 0, 0, 0)
            body += name.encode("ascii") + b"\0"
    offsets.append(len(body))
    body += struct.pack("<H", trg.NODE_TERMINATOR)

    for i, off in enumerate(offsets):
        struct.pack_into("<I", body, 12 + 4 * i, off)
    return bytes(body)


def _cli():
    import sys
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    park = "--park" in sys.argv[1:]
    out = args[0] if args else ("PARK" if park else "FIXTURE")
    open(out + ".PSX", "wb").write(build_park_psx() if park else build_psx())
    open(out + ".TRG", "wb").write(build_park_trg() if park else build_trg())
    print("wrote %s.PSX / %s.TRG" % (out, out))


# ===========================================================================
# A second fixture: a small but genuinely skateable park, for driving the whole
# game rather than just the parser. Authored in the game's own coordinates
# (metres, Y up) and converted back into THPS space on the way out, so the
# shapes below say what they mean.
# ===========================================================================

import math

# Units per metre for the authored park. Deliberately fine: THPS vertices are
# 16-bit integers, so a real level has to use a few hundred units per metre to
# get usable precision over a 100 m park, and at anything coarser the quarter
# pipe here collapses into a staircase when it is rounded to integers.
SCALE = 256.0


def _to_thps(p):
    """Inverse of thps2glb.to_three at the default scale."""
    x, y, z = p
    return (int(round(x * SCALE)), int(round(-y * SCALE)), int(round(-z * SCALE)))


def _grid_quads(rows):
    """rows[j][i] are points, with i along X and j along ascending Z.

    Returns strip-ordered quads that come out of the converter facing up (or,
    for a swept profile, consistently toward the inside of the sweep).
    """
    out = []
    for j in range(len(rows) - 1):
        for i in range(len(rows[j]) - 1):
            out.append((rows[j][i], rows[j][i + 1], rows[j + 1][i], rows[j + 1][i + 1]))
    return out


def park_geometry():
    """Flat ground, a quarter pipe along the far edge, in metres."""
    quads = []

    # --- ground: 26 m square, 6x6 so the broadphase grid has something to chew
    n = 6
    lo, hi = -13.0, 13.0
    rows = []
    for j in range(n + 1):
        z = lo + (hi - lo) * j / n
        rows.append([(lo + (hi - lo) * i / n, 0.0, z) for i in range(n + 1)])
    for q in _grid_quads(rows):
        quads.append(("floor", 0, 0x0000, (110, 112, 105, 0x28), q))

    # --- quarter pipe: 2 m radius, 2 m tall, against the wall at z = -15,
    #     transition rolling out to meet the floor at z = -13.
    seg = 8
    rows = []
    for j in range(seg + 1):
        th = math.radians(90.0 * (seg - j) / seg)        # 90 deg (wall) -> 0 (floor)
        z = -13.0 - 2.0 * math.sin(th)
        y = 2.0 - 2.0 * math.cos(th)
        rows.append([(-10.0, y, z), (10.0, y, z)])
    for q in _grid_quads(rows):
        quads.append(("pipe", 0x0400, 0x0000, (86, 90, 96, 0x28), q))

    # The invisible VERT trigger standing on the lip. This is what tells the
    # converter that the model it sits in is a ramp; it is never collided with.
    quads.append(("pipe", psx.SURF_VERT, 0x0080, (0, 0, 0, 0x28),
                  ((-10.0, 2.0, -15.0), (10.0, 2.0, -15.0),
                   (-10.0, 12.0, -15.0), (10.0, 12.0, -15.0))))
    return quads


def build_park_psx():
    """Ground in one model, the quarter pipe (with its VERT trigger) in another."""
    models = []
    for want in ("floor", "pipe"):
        verts, faces, index = [], [], {}
        for name, surf, base, shade, quad_pts in park_geometry():
            if name != want:
                continue
            vi = []
            for p in quad_pts:
                key = _to_thps(p)
                if key not in index:
                    index[key] = len(verts)
                    verts.append(key)
                vi.append(index[key])
            faces.append((base, surf, tuple(vi), shade))
        models.append((verts, faces))
    head, _ = _emit_psx(models)
    return _close_psx(head, model_count=len(models))


def build_park_trg():
    """One straight rail across the park, and a spawn facing it."""
    rail = [(-8.0, 0.35, 6.0), (-2.0, 0.35, 6.0), (2.0, 0.35, 6.0), (8.0, 0.35, 6.0)]
    spec = []
    for k, p in enumerate(rail):
        links = [k + 1] if k + 1 < len(rail) else []
        spec.append((trg.NODE_RAILDEF if k == 0 else trg.NODE_RAILPOINT,
                     links, _to_thps(p), None))
    spec.append((trg.NODE_RESTART, [], _to_thps((0.0, 0.3, 10.0)), "Restart_1"))

    header = bytearray(b"_TRG" + struct.pack("<II", 2, len(spec) + 1))
    header += b"\0" * (4 * (len(spec) + 1))
    body = bytearray(header)
    offsets = []
    for (type_, links, (x, y, z), name) in spec:
        offsets.append(len(body))
        body += struct.pack("<HH", type_, len(links))
        for l in links:
            body += struct.pack("<H", l)
        while len(body) % 4:
            body += b"\0"
        body += struct.pack("<iii", x, y, z)
        if type_ == trg.NODE_RESTART:
            body += struct.pack("<HHH", 0, 0, 0)
            body += name.encode("ascii") + b"\0"
    offsets.append(len(body))
    body += struct.pack("<H", trg.NODE_TERMINATOR)
    for i, off in enumerate(offsets):
        struct.pack_into("<I", body, 12 + 4 * i, off)
    return bytes(body)


if __name__ == "__main__":
    _cli()
