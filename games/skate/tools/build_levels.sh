#!/usr/bin/env bash
#
# build_levels.sh — rebuild every park from your own extracted game files.
#
# The converted levels are Activision and Neversoft's geometry and are never
# committed (see assets/thps/README.md), so this is how they travel: not as
# files, as one command you run on any machine that has your own discs
# extracted. Takes a few seconds a park.
#
#   tools/build_levels.sh                      # ../research/thps2-tools/out2
#   tools/build_levels.sh path/to/extracted    # somewhere else
#
# It expects LEVEL.psx, LEVEL_t.trg and LEVEL_l.psx (the texture library) side
# by side, which is what tools/psx_iso.py + the thps2-tools extractor produce.
# See README.md, "Getting the files off the disc".
set -euo pipefail

cd "$(dirname "$0")/.."
SRC="${1:-research/thps2-tools/out2}"
ALT="${2:-research/thps2-tools/out}"      # THPS1 School is only correct here
OUT="assets/thps"

[ -d "$SRC" ] || { echo "no such directory: $SRC" >&2; exit 1; }
mkdir -p "$OUT"

# stem | output | name | game.  THPS1 first, then THPS2, as the menu groups them.
LEVELS="
skburn|skburn.glb|Burnside|THPS1
skjam|skjam.glb|Downhill Jam|THPS1
skdown|skdown.glb|Downtown|THPS1
skmall|skmall.glb|Mall|THPS1
skros|skros.glb|Roswell|THPS1
sksf|sksf.glb|Streets|THPS1
skvans|skvans.glb|Skate Park|THPS1
skware|skware.glb|Warehouse|THPS1
skbul|t2_bul.glb|Bullring|THPS2
skhan|t2_han.glb|Hangar|THPS2
skmar|t2_mar.glb|Marseille|THPS2
skny|t2_ny.glb|New York|THPS2
skph|t2_ph.glb|Philadelphia|THPS2
sksl2|t2_sl2.glb|School II|THPS2
skhvn|t2_hvn.glb|Skate Heaven|THPS2
skss|t2_ss.glb|Skatestreet|THPS2
skven|t2_ven.glb|Venice Beach|THPS2
skb1|t2_b1.glb|Bonus Park 1|THPS2
skb2|t2_b2.glb|Bonus Park 2|THPS2
"

built=0
missed=""
while IFS='|' read -r stem out name game; do
  [ -n "$stem" ] || continue
  dir="$SRC"
  [ -f "$dir/$stem.psx" ] || dir="$ALT"
  if [ ! -f "$dir/$stem.psx" ]; then missed="$missed $stem"; continue; fi
  printf '%-14s ' "$name"
  python3 tools/thps2glb.py "$dir/$stem.psx" "$dir/${stem}_t.trg" \
      -o "$OUT/$out" --name "$name" --game "$game" 2>&1 \
    | grep -E 'rails:' | sed 's/^ *//'
  built=$((built + 1))
done <<< "$LEVELS"

# THPS1 School: out/ and out2/ hold different data for this one, and out/ is the
# one whose rails and floor match the game. Everything else is identical.
if [ -f "$ALT/skschl.psx" ]; then
  printf '%-14s ' "School"
  python3 tools/thps2glb.py "$ALT/skschl.psx" "$ALT/skschl_t.trg" \
      -o "$OUT/skschl.glb" --name "School" --game THPS1 2>&1 \
    | grep -E 'rails:' | sed 's/^ *//'
  built=$((built + 1))
fi

# Two coplanar faces in one place are settled by draw order on a PS1 and by
# floating point here, which changes its mind as the camera moves. This pushes
# each one 12 mm out along its own normal. Safe to run twice.
echo
python3 tools/glb_deconflict.py "$OUT"/*.glb > /dev/null
echo "built $built parks into $OUT/ (coplanar faces separated)"
[ -z "$missed" ] || echo "not found in $SRC or $ALT:$missed"
