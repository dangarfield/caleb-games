#!/usr/bin/env python3
"""
Cut a small, web-sized asset set out of the Stylized Nature MegaKit.

The kit is 86 MB of glTF and 2K textures across 68 models — far too much to hand
a browser. This picks the ones the map actually needs, packs each into a single
.glb, and shrinks the shared textures. Geometry is untouched: these are already
low-poly, and the cost in the preview is the NUMBER of instances, not the model.

Textures stay EXTERNAL and shared. Every tree uses the same bark and leaf sheets,
so embedding them per model would ship the same 2 MB a dozen times over.
"""
import json, os, shutil, struct, sys
from PIL import Image

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..',
                   'research', 'Stylized Nature MegaKit[Standard]', 'glTF')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'models')
TEX = os.path.join(OUT, 'tex')
MAX_TEX = 512          # the models are stylised; 2K sheets buy nothing on screen

# What each one is for on the map.
WANTED = [
    'Pine_2', 'Pine_4', 'Pine_5',                    # pine decoration + woodland
    'CommonTree_3', 'CommonTree_5',                  # bushy decoration + woodland
    'DeadTree_5',                                    # a bare tree for high ground
    'Bush_Common', 'Bush_Common_Flowers',            # undergrowth
    # ground cover: the layer that makes the park a surface rather than a plane
    'Grass_Common_Short', 'Grass_Common_Tall',
    'Grass_Wispy_Short', 'Grass_Wispy_Tall',
    'Clover_1', 'Clover_2', 'Fern_1',
    'Plant_1', 'Plant_1_Big', 'Plant_7', 'Plant_7_Big',
    'Mushroom_Common', 'Mushroom_Laetiporus',
    'Flower_3_Single', 'Flower_3_Group',             # scattered colour
    'Flower_4_Single', 'Flower_4_Group',
    'Pebble_Square_1', 'Pebble_Square_2', 'Pebble_Square_3',
    'Pebble_Round_1', 'Pebble_Round_3',              # scree above the treeline
    'Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3',
]

def strip_normals(d):
    """Drop the normal maps.

    The preview lights the scenery with a Lambert material, which never reads
    them, so they are 300 KB each of texture the browser fetches and ignores.
    """
    used = set()
    for m in d.get('materials', []):
        m.pop('normalTexture', None)
        m.pop('occlusionTexture', None)
        pbr = m.get('pbrMetallicRoughness', {})
        for k in ('baseColorTexture', 'metallicRoughnessTexture'):
            if k in pbr: used.add(pbr[k]['index'])
        if 'emissiveTexture' in m: used.add(m['emissiveTexture']['index'])
    keep = sorted(used)
    remap = {old: new for new, old in enumerate(keep)}
    srcs = [d['textures'][i] for i in keep]
    d['textures'] = srcs
    imgs_used = sorted({t['source'] for t in srcs if 'source' in t})
    iremap = {old: new for new, old in enumerate(imgs_used)}
    d['images'] = [d['images'][i] for i in imgs_used]
    for t in d['textures']:
        if 'source' in t: t['source'] = iremap[t['source']]
    for m in d.get('materials', []):
        pbr = m.get('pbrMetallicRoughness', {})
        for k in ('baseColorTexture', 'metallicRoughnessTexture'):
            if k in pbr: pbr[k]['index'] = remap[pbr[k]['index']]
        if 'emissiveTexture' in m: m['emissiveTexture']['index'] = remap[m['emissiveTexture']['index']]
    return d


def pack_glb(gltf_path, bin_path, out_path, tex_prefix='tex/'):
    """glTF + .bin -> one .glb, images left as external URIs under `tex_prefix`."""
    d = strip_normals(json.load(open(gltf_path)))
    blob = open(bin_path, 'rb').read()
    # the single buffer becomes the GLB's BIN chunk, which carries no uri
    assert len(d['buffers']) == 1, gltf_path
    d['buffers'][0].pop('uri', None)
    d['buffers'][0]['byteLength'] = len(blob)
    for im in d.get('images', []):
        if 'uri' in im:
            im['uri'] = tex_prefix + os.path.basename(im['uri'])
    js = json.dumps(d, separators=(',', ':')).encode('utf-8')
    js += b' ' * ((4 - len(js) % 4) % 4)                 # both chunks are 4-byte aligned
    blob += b'\0' * ((4 - len(blob) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(blob)
    with open(out_path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack('<II', len(blob), 0x004E4942)); f.write(blob)
    return total

def main():
    os.makedirs(TEX, exist_ok=True)
    needed, rows = set(), []
    for name in WANTED:
        g = os.path.join(SRC, name + '.gltf')
        b = os.path.join(SRC, name + '.bin')
        if not os.path.exists(g):
            print('missing', name); continue
        d = strip_normals(json.load(open(g)))
        for im in d.get('images', []):
            if 'uri' in im: needed.add(os.path.basename(im['uri']))
        size = pack_glb(g, b, os.path.join(OUT, name + '.glb'))
        rows.append((name, size // 1024))

    for png in sorted(needed):
        im = Image.open(os.path.join(SRC, png))
        if max(im.size) > MAX_TEX:
            s = MAX_TEX / max(im.size)
            im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
        im.save(os.path.join(TEX, png), optimize=True)
        print(f'  tex {png:32s} {im.size} {os.path.getsize(os.path.join(TEX, png))//1024} KB')

    total = sum(r[1] for r in rows)
    for n, kb in sorted(rows, key=lambda r: -r[1]): print(f'  {n:24s} {kb:5d} KB')
    tex = sum(os.path.getsize(os.path.join(TEX, f)) for f in os.listdir(TEX)) // 1024
    print(f'{len(rows)} models {total} KB + {len(needed)} textures {tex} KB')

main()
