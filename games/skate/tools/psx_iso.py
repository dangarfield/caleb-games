#!/usr/bin/env python3
"""psx_iso.py — pull the files out of a raw PlayStation disc image (.bin).

    python3 psx_iso.py "Tony Hawk's Pro Skater.bin" --list
    python3 psx_iso.py "Tony Hawk's Pro Skater.bin" -o extracted/

A PS1 .bin is not an .iso: it is the raw CD stream, 2352 bytes per sector, with
sync marks, headers and error correction wrapped around each 2048-byte payload.
Strip that wrapper and what is left is an ordinary ISO 9660 filesystem, which is
the other half of this file.

Stdlib only, so it runs anywhere python3 does — no bchunk, no 7-Zip, no mounting.
"""

import argparse
import os
import struct
import sys

RAW = 2352
COOKED = 2048
# Where the 2048 bytes of payload start inside a raw sector:
#   Mode 1        sync 12 + header 4                   = 16
#   Mode 2 Form 1 sync 12 + header 4 + subheader 8     = 24
OFFSETS = (24, 16, 0)
PVD_LBA = 16


class IsoError(Exception):
    pass


class Disc:
    def __init__(self, path):
        self.fh = open(path, "rb")
        self.size = os.path.getsize(path)
        self.offset, self.sector = self._detect()

    def _read_raw(self, lba, sector, offset):
        self.fh.seek(lba * sector + offset)
        return self.fh.read(COOKED)

    def _detect(self):
        """Find the sector size and payload offset by looking for the volume
        descriptor's 'CD001' magic where ISO 9660 says it has to be."""
        for sector in (RAW, COOKED):
            for offset in (OFFSETS if sector == RAW else (0,)):
                if sector == COOKED and offset:
                    continue
                data = self._read_raw(PVD_LBA, sector, offset)
                if len(data) >= 6 and data[1:6] == b"CD001":
                    return offset, sector
        raise IsoError("no ISO 9660 volume descriptor — is this really a disc image?")

    def sector_at(self, lba):
        return self._read_raw(lba, self.sector, self.offset)

    def read(self, lba, length):
        out = bytearray()
        while len(out) < length:
            chunk = self.sector_at(lba)
            if not chunk:
                break
            out += chunk
            lba += 1
        return bytes(out[:length])

    def close(self):
        self.fh.close()


def _records(data):
    """Directory records in one directory extent. They never straddle a sector,
    and a zero length byte means 'nothing more in this sector'."""
    pos = 0
    while pos < len(data):
        length = data[pos]
        if length == 0:
            pos = (pos // COOKED + 1) * COOKED      # jump to the next sector
            continue
        rec = data[pos:pos + length]
        pos += length
        if len(rec) < 33:
            continue
        lba = struct.unpack_from("<I", rec, 2)[0]
        size = struct.unpack_from("<I", rec, 10)[0]
        flags = rec[25]
        name_len = rec[32]
        name = rec[33:33 + name_len]
        if name in (b"\x00", b"\x01"):              # '.' and '..'
            continue
        yield {
            "name": name.decode("latin-1").split(";")[0],
            "lba": lba, "size": size, "dir": bool(flags & 0x02)
        }


def walk(disc, lba, size, prefix=""):
    data = disc.read(lba, size)
    for rec in _records(data):
        path = prefix + rec["name"]
        if rec["dir"]:
            yield {"path": path + "/", "lba": rec["lba"], "size": rec["size"], "dir": True}
            for sub in walk(disc, rec["lba"], rec["size"], path + "/"):
                yield sub
        else:
            yield {"path": path, "lba": rec["lba"], "size": rec["size"], "dir": False}


def listing(path):
    disc = Disc(path)
    pvd = disc.sector_at(PVD_LBA)
    root = pvd[156:156 + 34]
    root_lba = struct.unpack_from("<I", root, 2)[0]
    root_size = struct.unpack_from("<I", root, 10)[0]
    label = pvd[40:72].decode("latin-1").strip()
    return disc, label, list(walk(disc, root_lba, root_size))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("image")
    ap.add_argument("-o", "--out", help="where to write the files")
    ap.add_argument("--list", action="store_true", help="show the contents, extract nothing")
    ap.add_argument("--only", help="only extract names containing this (case-insensitive)")
    a = ap.parse_args(argv)

    disc, label, entries = listing(a.image)
    files = [e for e in entries if not e["dir"]]
    print("%s  —  volume '%s', %d byte sectors, payload at +%d"
          % (os.path.basename(a.image), label, disc.sector, disc.offset))
    print("%d files, %d directories\n" % (len(files), len(entries) - len(files)))

    if a.list or not a.out:
        for e in sorted(entries, key=lambda e: e["path"]):
            print("  %-44s %10s" % (e["path"], "" if e["dir"] else "{:,}".format(e["size"])))
        if not a.out:
            print("\n(nothing written — pass -o DIR to extract)")
        disc.close()
        return 0

    want = a.only.lower() if a.only else None
    written = 0
    for e in files:
        if want and want not in e["path"].lower():
            continue
        dest = os.path.join(a.out, e["path"])
        os.makedirs(os.path.dirname(os.path.abspath(dest)), exist_ok=True)
        with open(dest, "wb") as fh:
            fh.write(disc.read(e["lba"], e["size"]))
        written += 1
    print("extracted %d file%s to %s" % (written, "" if written == 1 else "s", a.out))
    disc.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
