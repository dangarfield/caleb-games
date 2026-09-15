"""png.py — write an RGBA PNG with nothing but the standard library.

A PNG is a signature, an IHDR, one IDAT holding a zlib stream of the rows (each
prefixed by a filter byte) and an IEND. That is the whole format for our
purposes, and it means textures need no Pillow, no numpy, no dependency at all.
"""

import struct
import zlib


def _chunk(tag, data):
    return (struct.pack(">I", len(data)) + tag + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))


def write_rgba(width, height, pixels):
    """pixels: bytes-like, width * height * 4, row-major from the top."""
    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)                       # filter 0: none
        raw += pixels[y * stride:(y + 1) * stride]
    return (b"\x89PNG\r\n\x1a\n"
            + _chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
            + _chunk(b"IDAT", zlib.compress(bytes(raw), 9))
            + _chunk(b"IEND", b""))
