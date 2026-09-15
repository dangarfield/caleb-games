"""glb.py — minimal binary glTF 2.0 writer. Stdlib only.

Enough of the format to emit triangle soups with flat normals and vertex
colours, plus LINE_STRIP polylines. No indices on the triangle meshes: the
levels are small, flat shading wants unshared vertices anyway, and the engine's
collision builder reads non-indexed geometry happily.
"""

import json
import struct

FLOAT = 5126
UNSIGNED_INT = 5125
REPEAT = 10497
CLAMP = 33071
LINEAR = 9729
LINEAR_MIPMAP_LINEAR = 9987
TRIANGLES = 4
LINE_STRIP = 3
ARRAY_BUFFER = 34962
ELEMENT_ARRAY_BUFFER = 34963


class GlbBuilder:
    def __init__(self):
        self.bin = bytearray()
        self.buffer_views = []
        self.accessors = []
        self.meshes = []
        self.nodes = []
        self.materials = []
        self.images = []
        self.textures = []
        self.samplers = []
        self.extras = {}

    # --- buffer plumbing ---------------------------------------------------
    def _view(self, data, target):
        while len(self.bin) % 4:
            self.bin.append(0)
        offset = len(self.bin)
        self.bin.extend(data)
        view = {"buffer": 0, "byteOffset": offset, "byteLength": len(data)}
        if target is not None:
            view["target"] = target          # images must not declare one
        self.buffer_views.append(view)
        return len(self.buffer_views) - 1

    def _vec2(self, values):
        flat = [c for v in values for c in v]
        data = struct.pack("<%df" % len(flat), *flat)
        view = self._view(data, ARRAY_BUFFER)
        us = [v[0] for v in values]
        vs = [v[1] for v in values]
        self.accessors.append({
            "bufferView": view, "componentType": FLOAT, "count": len(values), "type": "VEC2",
            "min": [min(us), min(vs)], "max": [max(us), max(vs)]
        })
        return len(self.accessors) - 1

    def _vec3(self, values):
        flat = [c for v in values for c in v]
        data = struct.pack("<%df" % len(flat), *flat)
        view = self._view(data, ARRAY_BUFFER)
        xs = [v[0] for v in values]
        ys = [v[1] for v in values]
        zs = [v[2] for v in values]
        self.accessors.append({
            "bufferView": view, "componentType": FLOAT, "count": len(values), "type": "VEC3",
            "min": [min(xs), min(ys), min(zs)], "max": [max(xs), max(ys), max(zs)]
        })
        return len(self.accessors) - 1

    def _indices(self, values):
        data = struct.pack("<%dI" % len(values), *values)
        view = self._view(data, ELEMENT_ARRAY_BUFFER)
        self.accessors.append({
            "bufferView": view, "componentType": UNSIGNED_INT,
            "count": len(values), "type": "SCALAR",
            "min": [min(values)], "max": [max(values)]
        })
        return len(self.accessors) - 1

    # --- content -----------------------------------------------------------
    def image(self, png_bytes, name, atlas=False):
        """Embed a PNG.

        Two samplers. A lone texture tiles, so it gets REPEAT and mipmaps. The
        ATLAS cannot use either: REPEAT would wrap the whole sheet instead of
        one tile (the shader does the wrapping itself, see level.js) and a mip
        chain blends neighbouring tiles into each other as it shrinks. So the
        atlas clamps and takes its aliasing, which is what a PS1 did anyway."""
        view = self._view(png_bytes, None)
        self.images.append({"name": name, "bufferView": view, "mimeType": "image/png"})
        if not self.samplers:
            self.samplers.append({"wrapS": REPEAT, "wrapT": REPEAT,
                                  "magFilter": LINEAR, "minFilter": LINEAR_MIPMAP_LINEAR})
            self.samplers.append({"wrapS": CLAMP, "wrapT": CLAMP,
                                  "magFilter": LINEAR, "minFilter": LINEAR})
        self.textures.append({"sampler": 1 if atlas else 0, "source": len(self.images) - 1})
        return len(self.textures) - 1

    def material(self, name, vertex_colours=False, base=(0.8, 0.8, 0.8, 1.0), texture=None):
        pbr = {
            "baseColorFactor": list(base), "metallicFactor": 0.0, "roughnessFactor": 0.95
        }
        if texture is not None:
            pbr["baseColorTexture"] = {"index": texture}
        self.materials.append({
            "name": name,
            "pbrMetallicRoughness": pbr,
            "doubleSided": True,
            "alphaMode": "MASK" if texture is not None else "OPAQUE",
            "alphaCutoff": 0.5,
            "extras": {"vertexColours": bool(vertex_colours)}
        })
        return len(self.materials) - 1

    def add_triangles(self, name, positions, normals=None, colours=None, material=None,
                      uvs=None, extra=None):
        """positions: flat list of (x,y,z), three per triangle.

        `extra` is {glTF attribute name: list of (u, v)} for application data —
        the atlas uses it to tell every vertex which tile of the sheet it is
        reading from. glTF requires such names to start with an underscore.
        """
        if not positions:
            return
        attrs = {"POSITION": self._vec3(positions)}
        if normals:
            attrs["NORMAL"] = self._vec3(normals)
        if colours:
            attrs["COLOR_0"] = self._vec3(colours)
        if uvs:
            attrs["TEXCOORD_0"] = self._vec2(uvs)
        for key, values in (extra or {}).items():
            attrs[key] = self._vec2(values)
        prim = {"attributes": attrs, "mode": TRIANGLES}
        if material is not None:
            prim["material"] = material
        self.meshes.append({"name": name, "primitives": [prim]})
        self.nodes.append({"name": name, "mesh": len(self.meshes) - 1})

    def add_polyline(self, name, points):
        if len(points) < 2:
            return
        acc = self._vec3(points)
        idx = self._indices(list(range(len(points))))
        self.meshes.append({
            "name": name,
            "primitives": [{"attributes": {"POSITION": acc}, "indices": idx, "mode": LINE_STRIP}]
        })
        self.nodes.append({"name": name, "mesh": len(self.meshes) - 1})

    # --- output ------------------------------------------------------------
    def to_bytes(self):
        gltf = {
            "asset": {"version": "2.0", "generator": "thps2glb (caleb-games/skate)"},
            "scene": 0,
            "scenes": [{"nodes": list(range(len(self.nodes))), "extras": self.extras}],
            "nodes": self.nodes,
            "meshes": self.meshes,
            "accessors": self.accessors,
            "bufferViews": self.buffer_views,
            "buffers": [{"byteLength": len(self.bin)}],
        }
        if self.materials:
            gltf["materials"] = self.materials
        if self.images:
            gltf["images"] = self.images
            gltf["textures"] = self.textures
            gltf["samplers"] = self.samplers

        js = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
        js += b" " * ((4 - len(js) % 4) % 4)
        binc = bytes(self.bin)
        binc += b"\0" * ((4 - len(binc) % 4) % 4)

        total = 12 + 8 + len(js) + 8 + len(binc)
        out = bytearray()
        out += struct.pack("<III", 0x46546C67, 2, total)
        out += struct.pack("<II", len(js), 0x4E4F534A) + js
        out += struct.pack("<II", len(binc), 0x004E4942) + binc
        return bytes(out)

    def save(self, path):
        with open(path, "wb") as fh:
            fh.write(self.to_bytes())
