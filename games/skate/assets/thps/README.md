Converted THPS levels go here.

This folder is gitignored apart from this file. The levels are Activision and
Neversoft's, not ours, so nothing that comes out of the converter is committed
or published — convert from your own copy of the game and it stays on your
machine.

    games/skate/tools/thps2glb.py  LEVEL.PSX  LEVEL.TRG  -o ../assets/thps/level.glb

That writes the .glb and a levels.json beside it, which is how the game finds
what is here. No levels.json, no THPS entries in the level select — which is the
normal state of a fresh checkout, and nothing breaks.

See ../../README.md for the whole thing.
