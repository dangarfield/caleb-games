#!/usr/bin/env python3
"""thps_wad.py — unpack a THPS1 or THPS2 CD.HED / CD.WAD pair.

    python3 thps_wad.py CD.HED CD.WAD --list
    python3 thps_wad.py CD.HED CD.WAD -o out --only sk

Neither game leaves its levels loose on the disc; both pack everything into
CD.WAD with CD.HED as the index. The two games index it differently, and that
difference is the whole reason this file exists:

  THPS1  a run of  <name string> <pad to 4> <u32 offset> <u32 size>  records,
         terminated by 0xFF. The names are right there.

  THPS2  a flat array of  <u32 hash> <u32 offset> <u32 size>  — 1531 of them on
         the USA disc — and no names at all. The hash is the game's own CRC
         (the one in thps2-tools/common.py) over the lowercase filename, which
         is why the community had to brute-force the THPS2 filename list.

We do not need the whole list. We need the levels, and a level's name follows an
obvious pattern, so the names are recovered by hashing candidates and seeing
which ones the index already knows about. Anything unrecognised still comes out,
under its hash.

Stdlib only.
"""

import argparse
import os
import string
import struct
import sys

# --- the game's CRC, from thps2-tools/common.py (MIT) -----------------------


def crc32(data, start=0xFFFFFFFF):
    result = start
    for byte in data:
        mask = result ^ byte
        for _ in range(8):
            result = ((result << 1) | (result >> 31)) & 0xFFFFFFFF
            if mask & 1:
                result ^= 0xEDB88320
            mask >>= 1
    return result


# --- candidate names --------------------------------------------------------

LEVEL_CODES = [
    # THPS2
    "han", "sl2", "mar", "ny", "ven", "ss", "ph", "bul", "hvn",
    "b1", "b2", "ed", "ed1", "ed2", "ed3", "ed4",
    # THPS1 (also present on the THPS2 disc)
    "ware", "schl", "mall", "jam", "down", "burn", "ros", "sf", "vans",
]
LEVEL_SUFFIXES = ["", "_l", "_l2", "_2", "_o", "_fe", "_t"]
EXTENSIONS = [".psx", ".trg", ".prk"]


def candidate_names(extra=()):
    names = set()
    for code in LEVEL_CODES:
        for suffix in LEVEL_SUFFIXES:
            for ext in EXTENSIONS:
                names.add("sk" + code + suffix + ext)
    names.update(extra)
    return names


def brute_force_codes(width=4):
    """Every sk<code>_t.trg for codes up to `width` characters.

    Only used by --hunt: it is how skph (Philadelphia), skbul (Bullring) and
    skhvn (Skate Heaven) were found in the first place, none of which were
    guessable from the level's English name.
    """
    import itertools
    alpha = string.ascii_lowercase + string.digits
    for n in range(2, width + 1):
        for t in itertools.product(alpha, repeat=n):
            yield "sk" + "".join(t)


# --- the index --------------------------------------------------------------


class Entry:
    __slots__ = ("name", "offset", "size", "hash")

    def __init__(self, name, offset, size, hash_=None):
        self.name = name
        self.offset = offset
        self.size = size
        self.hash = hash_


def read_index(hed_path, wad_size):
    """Work out which of the two index formats this is.

    Not by sniffing the first byte: THPS2's index happens to open with 0x31,
    which is the ASCII '1', so the obvious test says "names" and then produces
    1531 files called things like '1\x18}u'. Parse it both ways instead and keep
    whichever one describes a file that actually fits inside the WAD.
    """
    data = open(hed_path, "rb").read()
    named = _read_named_index(data)
    hashed = _read_hashed_index(data, wad_size)
    if _plausible(named, wad_size) >= _plausible(hashed, wad_size):
        return "names", named
    return "hashes", hashed


def _plausible(entries, wad_size):
    """What fraction of these records could really be files in the WAD."""
    if not entries:
        return 0.0
    ok = 0
    for e in entries:
        if not (0 <= e.offset <= wad_size and 0 < e.size <= wad_size):
            continue
        if e.offset + e.size > wad_size + 2048:
            continue
        if e.name is not None and not all(32 <= c < 127 for c in e.name.encode("latin-1")):
            continue
        ok += 1
    return ok / len(entries)


def _read_named_index(data):
    out, p = [], 0
    while p < len(data) - 7:
        end = data.find(b"\0", p)
        if end < 0:
            break
        name = data[p:end].decode("latin-1")
        p = end + 1
        p += (4 - (p % 4)) % 4
        if p + 8 > len(data):
            break
        offset, size = struct.unpack_from("<II", data, p)
        p += 8
        out.append(Entry(name, offset, size))
    return out


def _read_hashed_index(data, wad_size):
    out = []
    for i in range((len(data) - 4) // 12):
        h, offset, size = struct.unpack_from("<III", data, i * 12)
        if offset > wad_size or size > wad_size:
            continue
        out.append(Entry(None, offset, size, h))
    return out


def name_the_entries(entries, extra=(), hunt=0):
    """Put names to hashed entries, as far as we can."""
    by_hash = {}
    for e in entries:
        if e.hash is not None:
            by_hash.setdefault(e.hash, []).append(e)
    if not by_hash:
        return 0

    named = 0

    def apply(name):
        nonlocal named
        for e in by_hash.get(crc32(name.encode("ascii")), ()):
            if e.name is None:
                e.name = name
                named += 1

    for name in sorted(candidate_names(extra)):
        apply(name)

    if hunt:
        print("hunting for level codes up to %d characters..." % hunt, file=sys.stderr)
        for stem in brute_force_codes(hunt):
            h = crc32((stem + "_t.trg").encode("ascii"))
            if h not in by_hash:
                continue
            # a real level has geometry as well as a node table
            if crc32((stem + ".psx").encode("ascii")) not in by_hash:
                continue
            for suffix in LEVEL_SUFFIXES:
                for ext in EXTENSIONS:
                    apply(stem + suffix + ext)

    for e in entries:
        if e.name is None and e.hash is not None:
            e.name = "hash_%08X.bin" % e.hash
    return named


# --- main -------------------------------------------------------------------


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("hed")
    ap.add_argument("wad")
    ap.add_argument("-o", "--out")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--only", help="only files whose name contains this")
    ap.add_argument("--hunt", type=int, default=0, metavar="N",
                    help="brute-force level codes up to N characters (try 4)")
    a = ap.parse_args(argv)

    wad_size = os.path.getsize(a.wad)
    kind, entries = read_index(a.hed, wad_size)
    named = name_the_entries(entries, hunt=a.hunt)
    print("%s: %d entries, indexed by %s%s"
          % (os.path.basename(a.hed), len(entries), kind,
             (", %d named from their hash" % named) if named else ""))

    want = a.only.lower() if a.only else None
    chosen = [e for e in entries if not want or want in (e.name or "").lower()]

    if a.list or not a.out:
        for e in sorted(chosen, key=lambda e: e.name or ""):
            print("  %-24s %10s  at %9d" % (e.name, "{:,}".format(e.size), e.offset))
        if not a.out:
            print("\n(nothing written — pass -o DIR to extract)")
        return 0

    os.makedirs(a.out, exist_ok=True)
    with open(a.wad, "rb") as fh:
        for e in chosen:
            fh.seek(e.offset)
            dest = os.path.join(a.out, e.name.replace("/", "_").replace("\\", "_"))
            with open(dest, "wb") as out:
                out.write(fh.read(e.size))
    print("extracted %d file%s to %s"
          % (len(chosen), "" if len(chosen) == 1 else "s", a.out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
