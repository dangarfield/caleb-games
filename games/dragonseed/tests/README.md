# The tests

Sixteen Playwright scripts. There is no runner and no framework: each one is a
plain ES module that opens `index.html` off the filesystem, drives the game
through a real browser, and prints what it found as JSON. You read the output.
A failure looks like a thrown exception or an `errs` array that is not empty.

    node tests/playthrough.mjs

or all of them:

    for t in tests/*.mjs; do echo "== $t"; node "$t"; done

They expect Playwright at `/home/claude/.npm-global/lib/node_modules/playwright`
— change the import at the top of each file if yours lives elsewhere. Every
screenshot is written to `/tmp/dsshots/`, deliberately outside the site, so
running the suite never leaves anything in the folder that gets deployed.

| file | what it holds down |
|---|---|
| `playthrough.mjs` | all sixteen days, every visitor served, nothing unsolvable |
| `booktest.mjs` | the book: search, filters, claiming a page, dragging a pot back |
| `picktest.mjs` | picking a specimen up off a named page |
| `drawertest.mjs` | the drawer: notes lie loose, open, shove about, mark read |
| `eveningtest.mjs` | the story panels, the egg, the two-way choices |
| `gatetest.mjs` | a shut place, and the plant that opens it |
| `triptest.mjs` | going out, empty-handed trips, confusion and the spell of calm |
| `speciestest.mjs` | who a plant is for — people, dragons, either |
| `potcardtest.mjs` | the card you get when cuttings and pages arrive |
| `underlinetest.mjs` | the words in a request that the book can search on |
| `tabtest.mjs` | two tabs open at once; neither overwrites the other |
| `lazytest.mjs` | the map and the drawer are load-bearing, not decoration |
| `debugtest.mjs` | the state timeline behind the day title |
| `checks2.mjs` | assorted invariants |
| `hinttest.mjs` | the paid hint in two goes — nudge, then the answer with a picture |
| `phone.mjs` | a landscape phone: nothing overflows, nothing collides |
