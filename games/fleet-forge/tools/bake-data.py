#!/usr/bin/env python3
"""
Bake the Fleet Forge ship/module data into one flat data/data.json.

Input is the legacy Vite source tree (41 ship files + 91 module files +
localisation + key map). Output is a single file the game fetches once at boot.

This is a one-off dev tool, not a build step: once data.json exists it IS the
source of truth and can be edited directly. Kept for provenance and in case the
legacy tree is ever re-baked.

Usage: python3 tools/bake-data.py <legacy-src-dir> [--out data/data.json]
"""
import json, os, re, sys

def slug(display_name):
    """The image-filename transform the legacy code applied in five places."""
    s = display_name.lower()
    s = re.sub(r'\s+', '_', s)
    s = re.sub(r'[^a-z0-9_]', '', s)
    return s

# Category bit flags (DATA_KEYS.md)
BALLISTIC, MISSILE, LASER, ARMOR, SHIELD, POINTDEF, ENGINE, REACTOR, SUPPORT = \
    1, 2, 4, 8, 16, 32, 64, 128, 256

def subtype_of(key, c):
    """Derive an explicit subtype from the stable module KEY and its category
    bits. The legacy ModuleFactory routed on English display-name substrings
    ('mine', 'junk', 'repair', 'warp', 'afterburner'), which breaks the moment a
    name changes. Resolve it once, here."""
    k = key.lower()
    if k.startswith('minelauncher'):   return 'mine'
    if k.startswith('scraplauncher'):  return 'junk'
    if k.startswith('pointdefense'):   return 'pointdefense'
    if k.startswith('repairbay'):      return 'repair'
    if k.startswith('warpengine'):     return 'warp'
    if k.startswith('afterburner'):    return 'afterburner'
    if c & ENGINE:                     return 'engine'
    if c & SHIELD:                     return 'shield'
    if c & ARMOR:                      return 'armor'
    if c & REACTOR:                    return 'reactor'
    if c & POINTDEF:                   return 'pointdefense'
    if c & SUPPORT:                    return 'support'
    if c & (BALLISTIC | MISSILE | LASER): return 'weapon'
    return 'other'

def damage_type_of(c):
    if c & BALLISTIC: return 'ballistic'
    if c & MISSILE:   return 'missile'
    if c & LASER:     return 'laser'
    return None

def main():
    src = sys.argv[1]
    out = 'data/data.json'
    if '--out' in sys.argv:
        out = sys.argv[sys.argv.index('--out') + 1]

    d = lambda *p: os.path.join(src, *p)
    text = json.load(open(d('module-localisation.json')))['en']
    keys = json.load(open(d('data-keys.json')))

    ships, modules = {}, {}

    for fn in sorted(os.listdir(d('ships'))):
        if not fn.endswith('.json'): continue
        key = fn[:-5]
        s = json.load(open(d('ships', fn)))
        s['key'] = key
        raw = s.get('name', '')
        s['displayName'] = text.get(raw, raw or key).replace('_', ' ')
        s['img'] = slug(s['displayName'])
        ships[key] = s

    for fn in sorted(os.listdir(d('modules'))):
        if not fn.endswith('.json'): continue
        key = fn[:-5]
        m = json.load(open(d('modules', fn)))
        nk = m.get('name', '')
        m['key'] = key
        m['displayName'] = text.get(nk, nk or key)
        # '%BALLISTIC1X1%' -> '%BALLISTIC1X1_DESC%'
        m['desc'] = text.get(nk[:-1] + '_DESC%', '') if nk.endswith('%') else ''
        m['subtype'] = subtype_of(key, m.get('c', 0))
        dt = damage_type_of(m.get('c', 0))
        if dt: m['damageType'] = dt
        m['turret'] = 'turret' in key.lower()
        m['img'] = slug(m['displayName'])
        modules[key] = m

    data = {'version': 1, 'keys': keys, 'ships': ships, 'modules': modules}
    os.makedirs(os.path.dirname(out), exist_ok=True)
    json.dump(data, open(out, 'w'), separators=(',', ':'))

    print(f'baked {len(ships)} ships, {len(modules)} modules -> {out} '
          f'({os.path.getsize(out)/1024:.0f} KB)')

    # Report subtype spread so a mis-derivation is visible immediately.
    spread = {}
    for m in modules.values():
        spread[m['subtype']] = spread.get(m['subtype'], 0) + 1
    print('subtypes:', dict(sorted(spread.items(), key=lambda kv: -kv[1])))

    missing_desc = [k for k, m in modules.items() if not m['desc']]
    if missing_desc:
        print(f'WARN {len(missing_desc)} modules with no description:',
              ', '.join(missing_desc[:8]), '...' if len(missing_desc) > 8 else '')

if __name__ == '__main__':
    main()
