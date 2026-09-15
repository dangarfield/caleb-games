#!/usr/bin/env python3
"""Push overlapping coplanar faces apart inside an already-converted level.

`thps2glb.py` does this while it converts, but the levels in `assets/thps/`
were built before it did and the `.psx` files they came from live on whichever
machine did the extraction. This does the same job to the finished `.glb`:
positions are rewritten in place, nothing is added or removed, so the file's
layout is untouched apart from the numbers and the accessor bounds.

    python3 tools/glb_deconflict.py assets/thps/*.glb

Re-running it is harmless - faces that have already been separated no longer
overlap, so they are left where they are.
"""
import json
import os
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from thps2glb import separate_coplanar, _LAYER_STEP      # noqa: E402

JSON_CHUNK, BIN_CHUNK = 0x4E4F534A, 0x004E4942


def read_glb(path):
    raw = open(path, "rb").read()
    magic, _ver, _len = struct.unpack("<III", raw[:12])
    assert magic == 0x46546C67, "not a glb"
    off, js, bin_ = 12, None, None
    while off < len(raw):
        clen, ctype = struct.unpack("<II", raw[off:off + 8])
        data = raw[off + 8:off + 8 + clen]
        if ctype == JSON_CHUNK:
            js = json.loads(data.decode("utf-8"))
        elif ctype == BIN_CHUNK:
            bin_ = bytearray(data)
        off += 8 + clen + (-clen % 4)
    return js, bin_


def write_glb(path, js, bin_):
    jb = json.dumps(js, separators=(",", ":")).encode("utf-8")
    jb += b" " * (-len(jb) % 4)
    bb = bytes(bin_) + b"\0" * (-len(bin_) % 4)
    body = (struct.pack("<II", len(jb), JSON_CHUNK) + jb
            + struct.pack("<II", len(bb), BIN_CHUNK) + bb)
    open(path, "wb").write(struct.pack("<III", 0x46546C67, 2, 12 + len(body)) + body)


def view_offset(js, accessor_index):
    """Byte offset and count of a tightly packed VEC3 float accessor."""
    acc = js["accessors"][accessor_index]
    assert acc["type"] == "VEC3" and acc["componentType"] == 5126, "unexpected accessor"
    bv = js["bufferViews"][acc["bufferView"]]
    stride = bv.get("byteStride", 12)
    assert stride == 12, "interleaved buffers are not handled"
    return bv.get("byteOffset", 0) + acc.get("byteOffset", 0), acc["count"]


def deconflict(path, verbose=True):
    js, bin_ = read_glb(path)
    names = {}
    for node in js.get("nodes", []):
        if "mesh" in node:
            names.setdefault(node["mesh"], node.get("name", ""))

    groups, where = {}, {}
    for mi, mesh in enumerate(js["meshes"]):
        name = names.get(mi, mesh.get("name", ""))
        if "_Mesh" not in name:                      # colliders and rails stay put
            continue
        for pi, prim in enumerate(mesh["primitives"]):
            at = prim["attributes"]
            if "POSITION" not in at or "NORMAL" not in at:
                continue
            poff, count = view_offset(js, at["POSITION"])
            noff, ncount = view_offset(js, at["NORMAL"])
            assert ncount == count
            pos = list(struct.unpack_from("<%df" % (count * 3), bin_, poff))
            nrm = list(struct.unpack_from("<%df" % (count * 3), bin_, noff))
            key = (mi, pi)
            groups[key] = {
                "pos": [tuple(pos[i:i + 3]) for i in range(0, len(pos), 3)],
                "nrm": [tuple(nrm[i:i + 3]) for i in range(0, len(nrm), 3)],
            }
            where[key] = (at["POSITION"], poff, count)

    moved = separate_coplanar(groups)

    for key, g in groups.items():
        acc_i, poff, count = where[key]
        flat = [c for p in g["pos"] for c in p]
        struct.pack_into("<%df" % (count * 3), bin_, poff, *flat)
        acc = js["accessors"][acc_i]
        xs = [p[0] for p in g["pos"]]
        ys = [p[1] for p in g["pos"]]
        zs = [p[2] for p in g["pos"]]
        acc["min"] = [min(xs), min(ys), min(zs)]
        acc["max"] = [max(xs), max(ys), max(zs)]

    write_glb(path, js, bin_)
    if verbose:
        total = sum(len(g["pos"]) for g in groups.values()) // 3
        print("%-14s %6d drawn triangles, %5d separated by %d mm"
              % (os.path.basename(path), total, moved, round(_LAYER_STEP * 1000)))
    return moved


if __name__ == "__main__":
    for f in sys.argv[1:]:
        deconflict(f)
