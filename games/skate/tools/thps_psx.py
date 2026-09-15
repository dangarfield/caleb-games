"""thps_psx.py — reader for THPS1 / THPS2 / THPS2X `.psx` level geometry.

Stdlib only. Cross-checked against two independent implementations:

  * JayFoxRox/thps2-tools  `convert-psx.py`   (Wavefront OBJ exporter)
  * denetii/io_thps_scene  `import_thps2.py`  (Blender importer)

Where the two disagree the disagreement is noted in a comment. The one that
matters is scale: convert-psx divides the whole world by 4096, io_thps_scene
divides by 2.25 after folding the object origin down by 4096. Both agree on the
*relative* formula `object_origin / 4096 + vertex`, which is what we use; the
final divisor is a calibration knob (see SCALE in thps2glb.py).
"""

import struct

VERSION_THPS1 = 3          # also the April 1999 prototype
VERSION_THPS2 = 4
VERSION_THPS2X = 6

# --- face `base_flags` (how the PS1 GPU draws it) ---------------------------
BASE_TEXTURED_UV = 0x0001  # face carries texture coordinates
BASE_TEXTURED = 0x0002     # face carries a texture index
BASE_TRIANGLE = 0x0010     # set = triangle, cleared = quad
BASE_INVISIBLE = 0x0080    # not drawn. Still collides — quarter-pipe transition
                           # polygons are invisible proxies and carry 0x0080.
BASE_GOURAUD = 0x0800      # shade bytes are per-vertex palette indices
BASE_SUBDIVIDE = 0x1000
BASE_UNK8 = 0x0008
BASE_UNK20 = 0x0020

# --- face `surface_flags` (how the skater interacts with it) ----------------
SURF_WALLRIDEABLE = 0x0010
SURF_VERT = 0x0040         # a quarter pipe's transition polygon
SURF_UNKNOWN = 0x0080
SURF_NOT_SKATEABLE = 0x0100  # cleared if you can skate on it


class PsxError(Exception):
    pass


class _Reader:
    def __init__(self, data):
        self.d = data
        self.p = 0

    def seek(self, p):
        self.p = p

    def tell(self):
        return self.p

    def take(self, n):
        if self.p + n > len(self.d):
            raise PsxError("read past end of file at %d (+%d)" % (self.p, n))
        out = self.d[self.p:self.p + n]
        self.p += n
        return out

    def u(self, fmt):
        v = struct.unpack_from(fmt, self.d, self.p)
        self.p += struct.calcsize(fmt)
        if self.p > len(self.d):
            raise PsxError("read past end of file")
        return v

    def u16(self):
        return self.u("<H")[0]

    def u32(self):
        return self.u("<I")[0]


class Face:
    __slots__ = ("base_flags", "surface_flags", "verts", "shade", "normal_index",
                 "is_quad", "is_gouraud", "is_visible", "texture_index", "uvs")

    def __init__(self, base_flags, surface_flags, verts, shade, normal_index,
                 texture_index=None, uvs=None):
        self.base_flags = base_flags
        self.surface_flags = surface_flags
        self.verts = verts                   # 4 indices; [3] unused for triangles
        self.shade = shade                   # 4 bytes: flat = (R,G,B,cmd)
        self.normal_index = normal_index
        self.texture_index = texture_index
        self.uvs = uvs                       # four (u, v) pairs, in texels
        self.is_quad = not (base_flags & BASE_TRIANGLE)
        self.is_gouraud = bool(base_flags & BASE_GOURAUD)
        self.is_visible = not (base_flags & BASE_INVISIBLE)


class Model:
    __slots__ = ("flags", "vertices", "normals", "faces")


class Object3D:
    __slots__ = ("flags", "x", "y", "z", "model_index")


class PsxLevel:
    """Parsed level: objects placing models, plus a global RGB palette."""

    def __init__(self):
        self.version = 0
        self.objects = []
        self.models = []
        self.model_names = []
        self.texture_names = []   # hashes; a face's texture_index indexes THIS
        self.palette = []      # list of (r, g, b, a) bytes from the RGBs chunk


def load(path):
    with open(path, "rb") as fh:
        return loads(fh.read())


def loads(data):
    r = _Reader(data)
    lvl = PsxLevel()

    lvl.version = r.u16()
    tag_id = r.u16()
    if lvl.version not in (VERSION_THPS1, VERSION_THPS2, VERSION_THPS2X) or tag_id != 2:
        raise PsxError("not a THPS1/2 .psx file (header %04X %04X)" % (lvl.version, tag_id))

    tag_start = r.u32()

    # --- objects: a placement of a model at an origin -----------------------
    for _ in range(r.u32()):
        o = Object3D()
        (o.flags, o.x, o.y, o.z, _unk1, _unk2, o.model_index,
         _tx, _ty, _unk3, _pal) = r.u("<IiiiIHHhhII")
        lvl.objects.append(o)

    mesh_start = r.tell()

    # --- tagged chunks: we only want the RGBs palette -----------------------
    r.seek(tag_start)
    guard = 0
    while True:
        guard += 1
        if guard > 64:
            raise PsxError("runaway tag chunk list")
        tag = r.take(4)
        if tag == b"\xFF\xFF\xFF\xFF":
            break
        length = r.u32()
        end = r.tell() + length
        if tag == b"RGBs":
            if length % 4:
                raise PsxError("RGBs chunk is not a whole number of colours")
            for _ in range(length // 4):
                lvl.palette.append(r.u("<BBBB"))
        r.seek(end)

    # after the terminator come the model name checksums
    model_count_guess = struct.unpack_from("<I", data, mesh_start)[0]
    lvl.model_names = [r.u32() for _ in range(model_count_guess)]
    # A face's texture_index points into this list, and the name it finds there
    # is what matches a texture in the sibling _l.psx library.
    try:
        lvl.texture_names = [r.u32() for _ in range(r.u32())]
    except PsxError:
        lvl.texture_names = []

    # --- models -------------------------------------------------------------
    r.seek(mesh_start)
    count = r.u32()
    offsets = [r.u32() for _ in range(count)]
    for off in offsets:
        r.seek(off)
        lvl.models.append(_read_model(r, lvl.version))

    return lvl


def _read_model(r, version):
    m = Model()
    if version >= VERSION_THPS2:
        m.flags, n_vert, n_norm, n_face = r.u("<HHHH")
    else:
        m.flags, n_vert, n_norm, n_face = r.u("<IIII")

    r.u32()                 # bounding radius
    r.u("<hhhhhh")          # xmax xmin ymax ymin zmax zmin
    r.u32()                 # unknown

    m.vertices = []
    for _ in range(n_vert):
        x, y, z, _pad = r.u("<hhhh")
        m.vertices.append((x, y, z))

    m.normals = []
    for _ in range(n_norm):
        x, y, z, _pad = r.u("<hhhh")
        m.normals.append((x, y, z))

    m.faces = []
    for _ in range(n_face):
        base_flags = r.u16()
        length = r.u16()
        # `length` covers the whole record including these four bytes, which is
        # what lets us skip every optional trailing field (texture index, UVs,
        # the two undocumented flag payloads) without having to decode them.
        end = r.tell() - 4 + length

        if version >= VERSION_THPS2:
            verts = r.u("<BBBB")
        else:
            verts = r.u("<HHHH")
        for vi in verts:
            if vi >= n_vert:
                raise PsxError("face vertex index %d out of range (%d verts)" % (vi, n_vert))

        shade = r.u("<BBBB")
        normal_index = r.u16()
        surface_flags = r.u16()

        """The optional tail of a face record.

        Everything past the surface flags is conditional, which is why the
        length prefix is such a gift: it can all be skipped when we do not want
        it. We want it now. The order is fixed — texture index, then UVs — and
        `model.flags & 1` is the odd case where the texture index is absent even
        though the face claims to be textured (convert-psx calls it a guess; it
        holds on every level here).
        """
        texture_index = uvs = None
        try:
            if not (m.flags & 1) and (base_flags & BASE_TEXTURED) and r.tell() + 4 <= end:
                texture_index = r.u32()
            if (base_flags & BASE_TEXTURED_UV) and r.tell() + 8 <= end:
                if version >= VERSION_THPS2X:
                    us = [r.u16() for _ in range(4)]
                    vs = [r.u16() for _ in range(4)]
                    uvs = list(zip(us, vs))
                else:
                    uvs = [r.u("<BB") for _ in range(4)]
        except PsxError:
            texture_index = uvs = None

        m.faces.append(Face(base_flags, surface_flags, verts, shade, normal_index,
                            texture_index, uvs))
        if end < r.tell():
            raise PsxError("face record shorter than its fixed fields")
        r.seek(end)

    return m


# --- the texture library (`<level>_l.psx`) -----------------------------------

TRANSPARENT_15 = (31, 0, 31)      # the PS1's magic "this texel is a hole"


def _rgba_from_15(colour, first):
    r5 = colour & 0x1F
    g5 = (colour >> 5) & 0x1F
    b5 = (colour >> 10) & 0x1F
    if (r5, g5, b5) == TRANSPARENT_15 or (first and colour == 0):
        return (0, 0, 0, 0)
    f = 255.0 / 31.0
    return (int(r5 * f), int(g5 * f), int(b5 * f), 255)


class Texture:
    __slots__ = ("name", "width", "height", "rgba")


def load_textures(path):
    """Decode `<level>_l.psx` into {name hash: Texture}.

    The library is the same container as a level with no objects and no models
    in it: header, tag chunks, then the names, the palettes and the pixels. The
    pixels are palette indices, 4 or 8 bits each, in rows padded out to a
    multiple of 4 or 2 texels respectively.
    """
    with open(path, "rb") as fh:
        data = fh.read()
    r = _Reader(data)
    version = r.u16()
    if r.u16() != 2 or version not in (VERSION_THPS1, VERSION_THPS2, VERSION_THPS2X):
        raise PsxError("not a .psx texture library")
    tag_start = r.u32()
    object_count = r.u32()
    mesh_start = r.tell()
    model_count = r.u32()

    r.seek(tag_start)
    guard = 0
    while True:
        guard += 1
        if guard > 64:
            raise PsxError("runaway tag list in the texture library")
        if r.take(4) == b"\xFF\xFF\xFF\xFF":
            break
        r.seek(r.tell() + r.u32())

    for _ in range(model_count):
        r.u32()
    names = [r.u32() for _ in range(r.u32())]

    pal4 = {}
    for _ in range(r.u32()):
        nm = r.u32()
        pal4[nm] = r.u("<" + "H" * 16)
    pal8 = {}
    for _ in range(r.u32()):
        nm = r.u32()
        pal8[nm] = r.u("<" + "H" * 256)

    count = r.u32()
    offsets = [r.u32() for _ in range(count)]

    out = {}
    for off in offsets:
        r.seek(off)
        _unk1 = r.u32()
        colours = r.u32()
        palette_name = r.u32()
        name_index = r.u32()
        width = r.u16()
        height = r.u16()
        if colours == 16:
            align, palette = 3, pal4.get(palette_name)
        elif colours == 256:
            align, palette = 1, pal8.get(palette_name)
        else:
            continue                       # 16-bit direct colour; not used here
        if palette is None or not width or not height:
            continue
        aw = (width + align) & ~align
        ah = (height + align) & ~align

        # A lookup per palette entry, then a row at a time: the obvious
        # per-texel version spends minutes on a levels worth of 64x64s.
        lut = [bytes(_rgba_from_15(palette[i], i == 0)) for i in range(len(palette))]
        rgba = bytearray(width * height * 4)
        stride = width * 4
        try:
            for y in range(ah):
                if colours == 16:
                    packed = r.take(aw // 2)
                    row = bytearray(aw)
                    row[0::2] = bytes(b & 0xF for b in packed)
                    row[1::2] = bytes(b >> 4 for b in packed)
                else:
                    row = r.take(aw)
                if y >= height:
                    continue
                rgba[y * stride:(y + 1) * stride] = b"".join(
                    [lut[row[x]] for x in range(width)])
        except PsxError:
            break

        t = Texture()
        t.name = names[name_index] if name_index < len(names) else name_index
        t.width, t.height, t.rgba = width, height, bytes(rgba)
        out[t.name] = t
    return out
