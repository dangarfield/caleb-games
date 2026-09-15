#!/usr/bin/env python3
"""Round-trip test for the THPS converter, against a synthesised level.

Run:  python3 test_thps2glb.py

We have no THPS game data, so correctness is established the only way it can be
without it: build a file to the layout both reference implementations agree on,
push it through the converter, and check what comes out the far side.
"""

import json
import os
import struct
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import make_fixture
import thps_psx as psx
import thps_trg as trg
import thps2glb

FAILURES = []


def check(label, ok, detail=""):
    print("  %s %s%s" % ("PASS" if ok else "FAIL", label, ("  -- " + detail) if detail else ""))
    if not ok:
        FAILURES.append(label)


def read_glb(path):
    with open(path, "rb") as fh:
        data = fh.read()
    magic, version, total = struct.unpack_from("<III", data, 0)
    assert magic == 0x46546C67 and version == 2 and total == len(data)
    p = 12
    chunks = {}
    while p < len(data):
        clen, ctype = struct.unpack_from("<II", data, p)
        chunks[ctype] = data[p + 8:p + 8 + clen]
        p += 8 + clen
    gltf = json.loads(chunks[0x4E4F534A].decode("utf-8"))
    return gltf, chunks[0x004E4942]


def accessor_vec3(gltf, binc, index):
    acc = gltf["accessors"][index]
    view = gltf["bufferViews"][acc["bufferView"]]
    off = view["byteOffset"]
    out = []
    for i in range(acc["count"]):
        out.append(struct.unpack_from("<fff", binc, off + i * 12))
    return out


def node_positions(gltf, binc, name):
    """All the vertices of the node(s) whose name ends this way.

    The visual mesh is split one node per texture — THPS tiles, so an atlas is
    out and each texture needs its own material — so `_Mesh` now matches
    `X_Mesh_00`, `X_Mesh_01` and so on, and they all count.
    """
    out = None
    for node in gltf["nodes"]:
        n = node["name"]
        if n.endswith(name) or (name == "_Mesh" and "_Mesh_" in n):
            prim = gltf["meshes"][node["mesh"]]["primitives"][0]
            got = accessor_vec3(gltf, binc, prim["attributes"]["POSITION"])
            out = got if out is None else out + got
    return out


def tri_normals(points):
    out = []
    for i in range(0, len(points), 3):
        n = thps2glb.tri_normal(points[i], points[i + 1], points[i + 2])
        out.append(n)
    return out


def main():
    tmp = tempfile.mkdtemp(prefix="thps-test-")
    stem = os.path.join(tmp, "FIXTURE")
    open(stem + ".PSX", "wb").write(make_fixture.build_psx())
    open(stem + ".TRG", "wb").write(make_fixture.build_trg())

    print("\n1. .psx parsing")
    lvl = psx.load(stem + ".PSX")
    check("header identifies THPS2 (v4)", lvl.version == psx.VERSION_THPS2)
    check("two objects, two models", len(lvl.objects) == 2 and len(lvl.models) == 2)
    check("model names survive the tag chunks",
          lvl.model_names == [0xDEADBEEF, 0xDEADBEF0],
          str([hex(n) for n in lvl.model_names]))
    check("RGBs palette read", len(lvl.palette) == 4)
    m, ramp = lvl.models[0], lvl.models[1]
    check("five faces, twenty vertices in the flat model",
          len(m.faces) == 5 and len(m.vertices) == 20,
          "%d faces, %d verts" % (len(m.faces), len(m.vertices)))
    check("length-prefixed face records consumed exactly",
          all(f.verts[3] < len(m.vertices) for f in m.faces))
    check("surface flags survive",
          [f.surface_flags for f in m.faces] ==
          [0, psx.SURF_WALLRIDEABLE, psx.SURF_NOT_SKATEABLE, 0, 0])
    check("the gouraud face is flagged gouraud", m.faces[3].is_gouraud)
    check("the barrier is flagged invisible", not m.faces[4].is_visible)
    check("the ramp is a transition plus its VERT curtain",
          len(ramp.faces) == 2 and not (ramp.faces[0].surface_flags & psx.SURF_VERT)
          and bool(ramp.faces[1].surface_flags & psx.SURF_VERT))
    check("the curtain is flagged invisible", not ramp.faces[1].is_visible)

    print("\n2. .trg parsing")
    nodes = trg.load(stem + ".TRG")
    check("every rail link resolves to a rail node",
          trg.links_look_like_node_indices(nodes) == 1.0)
    rails = trg.chain_rails(nodes)
    check("two rails recovered", len(rails) == 2, "got %d" % len(rails))
    lens = sorted(len(r) for r in rails)
    check("one open chain of 3, one loop of 3 closed back to 4", lens == [3, 4], str(lens))
    closed = [r for r in rails if len(r) == 4][0]
    check("the loop wraps to its own first point", closed[0] == closed[-1])
    open_chain = [r for r in rails if len(r) == 3][0]
    check("the open chain is in order", [p[0] for p in open_chain] == [0.0, 40.0, 80.0],
          str([p[0] for p in open_chain]))
    cut, splits = thps2glb.split_long_rails(
        [[(0, 0, 0), (2, 0, 0), (60, 0, 0), (62, 0, 0)]], 25.0)
    check("a 58 m jump between rail points cuts the chain in two",
          splits == 1 and [len(c) for c in cut] == [2, 2], str(cut))
    keep, splits = thps2glb.split_long_rails([[(0, 0, 0), (2, 0, 0), (4, 0, 0)]], 25.0)
    check("a normal chain is left alone", splits == 0 and len(keep[0]) == 3)
    sp = trg.spawns(nodes)
    check("named spawn found", len(sp) == 1 and sp[0][1] == "Restart_1", str(sp))

    print("\n3. conversion")
    out = os.path.join(tmp, "fixture.glb")
    thps2glb.convert(stem + ".PSX", stem + ".TRG", out,
                     scale=2.0, auto_wall=0.30, rails_by_order=False, inspect=False)
    gltf, binc = read_glb(out)
    names = [n["name"] for n in gltf["nodes"]]
    print("     nodes: %s" % names)

    check("emits the names the engine reads",
          all(any(n.endswith(s) or (s == "_Mesh" and "_Mesh_" in n) for n in names)
              for s in ("_Col_Floor", "_Col_Wall", "_Col_Pipe", "_Mesh", "_Rail_000")),
          str(names))

    floor = node_positions(gltf, binc, "_Col_Floor")
    wall = node_positions(gltf, binc, "_Col_Wall")
    pipe = node_positions(gltf, binc, "_Col_Pipe")
    mesh = node_positions(gltf, binc, "_Mesh")

    check("floor bucket holds the two unflagged quads", len(floor) == 12,
          "%d verts" % len(floor))
    check("wallrideable AND not-skateable both land in the wall bucket", len(wall) == 12,
          "%d verts" % len(wall))
    check("geometry under the VERT trigger curtain becomes a ramp", len(pipe) == 6,
          "%d verts" % (len(pipe) if pipe else 0))
    # THE point of the VERT rule: the trigger quad stands 40-400 units above the
    # transition. If it leaked into the collision, the ramp would have an
    # invisible wall running up off its lip.
    # THE point of the rule: the curtain stands 4 m above the transition. If it
    # leaked into the collision, every ramp would get an invisible wall on its lip.
    check("the VERT curtain itself is NOT collided with",
          pipe and max(p[1] for p in pipe) < 0.01,
          "pipe bucket reaches y %.2f" % (max(p[1] for p in pipe) if pipe else -99))
    # six quads = twelve triangles; only the VERT trigger is invisible
    check("the invisible trigger is left out of the visual mesh",
          len(mesh) == 10 * 3, "%d verts" % len(mesh))

    print("\n4. undrawn barriers")
    check("a steep invisible barrier is not collided with by default",
          len(wall) == 12, "wall bucket has %d verts" % len(wall))
    kept = os.path.join(tmp, "kept.glb")
    thps2glb.convert(stem + ".PSX", stem + ".TRG", kept, scale=2.0, auto_wall=0.30,
                     rails_by_order=False, inspect=False, invisible="all")
    g2, b2 = read_glb(kept)
    check("--invisible all keeps it", len(node_positions(g2, b2, "_Col_Wall")) == 18,
          "%d verts" % len(node_positions(g2, b2, "_Col_Wall")))
    nothing = os.path.join(tmp, "none.glb")
    thps2glb.convert(stem + ".PSX", stem + ".TRG", nothing, scale=2.0, auto_wall=0.30,
                     rails_by_order=False, inspect=False, invisible="none")
    g3, b3 = read_glb(nothing)
    check("--invisible none drops it too", len(node_positions(g3, b3, "_Col_Wall")) == 12,
          "%d verts" % len(node_positions(g3, b3, "_Col_Wall")))

    print("\n5. geometry")
    fn = tri_normals(floor)
    check("floor triangles face up", all(n[1] > 0.99 for n in fn), str(fn))
    check("both halves of a quad agree on facing", abs(fn[0][1] - fn[1][1]) < 1e-6)

    # object origin 2 * 4096 on X => +2 THPS units; quad spans +/-20 about 0.
    xs = sorted(set(round(p[0], 4) for p in floor))
    check("object origin folded in at /4096 and scaled", xs == [-9.0, 11.0], str(xs))
    ys = set(round(p[1], 4) for p in floor)
    check("THPS Y-down became Y-up", ys == {0.0}, str(ys))

    pipe_n = tri_normals(pipe)
    check("the transition polygon keeps a sane normal",
          all(n is not None and abs(n[1]) <= 1.0 for n in pipe_n))

    print("\n6. vertex colours")
    for node in gltf["nodes"]:
        if "_Mesh_" in node["name"]:
            prim = gltf["meshes"][node["mesh"]]["primitives"][0]
            check("visual mesh carries COLOR_0 and NORMAL",
                  "COLOR_0" in prim["attributes"] and "NORMAL" in prim["attributes"])
            cols = accessor_vec3(gltf, binc, prim["attributes"]["COLOR_0"])
            check("flat shade bytes became colours, 128 = full",
                  any(abs(c[0] - 90 / 128.0) < 1e-4 for c in cols))
            check("gouraud corners took their palette entries, not the raw bytes",
                  any(abs(c[0] - 1.0) < 1e-4 and c[1] < 1e-4 for c in cols))

    print("\n7. rails in the glb")
    for node in gltf["nodes"]:
        if node["name"].endswith("_Rail_000"):
            prim = gltf["meshes"][node["mesh"]]["primitives"][0]
            check("rails are LINE_STRIP", prim["mode"] == 3)
            check("rails are indexed, so the engine can spot a closed loop",
                  "indices" in prim)

    extras = gltf["scenes"][0].get("extras", {}).get("thps", {})
    check("spawn recorded in scene extras", extras.get("spawn") is not None, str(extras))
    check("scale recorded in scene extras", extras.get("scale") == 2.0)

    print("\n%s  (%d checks failed)" % ("ALL PASS" if not FAILURES else "FAILURES: " + ", ".join(FAILURES), len(FAILURES)))
    return 1 if FAILURES else 0


if __name__ == "__main__":
    sys.exit(main())
