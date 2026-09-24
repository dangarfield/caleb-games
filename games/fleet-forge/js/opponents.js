/* opponents.js — who you get drawn against.
 *
 * THERE IS NO ROSTER. The opponent is built the moment you press ENTER ARENA
 * (or TEST), out of two things the game already has: `data/ships.json` for the
 * hull and `data/progression.json` for what is allowed at it. Everything else
 * is `Autofit`.
 *
 * WHAT WAS HERE BEFORE. The first build fought whatever sat in hangar slot 2.
 * The second was a nine-rung ladder, which is gone because it forces every
 * challenge to name a name ("beat the Inquisitor") and no operation may name
 * an opponent. The third was `data/opponents.json` — five baked fits a tier,
 * generated offline by a SECOND packer that never saw `autofit.js`. That file
 * is deleted. It drifted from the game's own fitting rules, it knew nothing
 * about a save, and it was the last place a fight could come from that the
 * rules below did not allow.
 *
 * DIFFICULTY IS PURELY THE FIT. The AUTOFIT menu's own options are rolled at
 * random for each contact — including the `placement` mode the menu never
 * shows, because a clumsily placed fit is the only honest way to make an easy
 * opponent when nothing else about the ship may change.
 */
var Opponents = (function () {

  /* A name, so two fits of the same hull are not the same contact. Seeded off
     the recipe, so a given hull-and-recipe always reads the same. */
  var CALLSIGN = ['Vesper', 'Harrow', 'Kestrel', 'Tallow', 'Cinder', 'Rook',
                  'Marrow', 'Quill', 'Ember', 'Sable', 'Wrack', 'Thorn',
                  'Gallows', 'Pale', 'Verge', 'Hollow'];

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function pick(arr, rng) { return arr[(rng() * arr.length) | 0]; }
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  /* ---- WHO YOU FIGHT ------------------------------------------------------
     THE HULL YOU BROUGHT IS THE WHOLE INPUT. Not your level, not the band your
     level sits in — the ship. A pilot at the top of the ladder taking an old
     Frigate out for a run is flying a Frigate, and that is what decides the
     fight.

        1. every hull of that hull's tier
        2. the CEILING is that hull's own unlock level; above tier 1, move it
           up to the next unlock in the same tier — the one rung you are
           working towards, which may not exist if you are already at the top
        3. drop everything in the tier above the ceiling

     Tier 1 is the one exception to step 2: no next rung there, so a Light
     Fighter meets Light Fighters until you have earned something bigger.

     The pool cannot come back empty — the player's own hull is always in it. */
  function poolFor(ship) {
    if (!ship) return [];
    var tier = Progress.tierOf(ship);
    var mine = Progress.levelOfShip(ship.key);

    var inTier = Data.shipList.filter(function (s) {
      return Progress.tierOf(s) === tier;
    });

    var ceiling = mine;
    if (tier > 1) {
      var next = Infinity;
      inTier.forEach(function (s) {
        var l = Progress.levelOfShip(s.key);
        if (l > mine && l < next) next = l;
      });
      if (next < Infinity) ceiling = next;
    }

    return inTier.filter(function (s) {
      return Progress.levelOfShip(s.key) <= ceiling;
    });
  }

  /* ---- HOW GOOD THE CONTACT'S FIT IS --------------------------------------
     THE ONLY THING THAT MAKES A FIGHT HARDER IS A BETTER FIT, so this is the
     one dial, and the player's own record moves it:

        50 to start, +10 for every win, back to 50 on a loss

     Five wins in a row and the contacts are fitting as well as your own
     AUTOFIT button does; lose once and they are back to guessing. It is hidden
     — not on the versus card, not in the blurb, not in the save — because it
     is meant to be felt as "these are getting harder", not read as a number.

     A TEST flight records nothing, so it neither raises the dial nor resets
     it: you practise against whatever the ladder currently has you facing. */
  function skillNow() {
    var v = 50 + 10 * Save.streak();
    return v > 100 ? 100 : v;
  }

  /* Build one. `ship` is the hull the PLAYER is flying. */
  function generate(ship, seed) {
    var ships = poolFor(ship);
    if (!ships.length) return null;
    var tier = Progress.tierOf(ship);
    var skill = skillNow();
    var rng = mulberry32(seed === undefined ? (Math.random() * 1e9) | 0 : seed);

    for (var attempt = 0; attempt < 12; attempt++) {
      var hull = ships[(rng() * ships.length) | 0];
      /* The fit is built with what a pilot flying THIS hull would have
         unlocked, not with everything in the game — otherwise a tier 1 skiff
         turns up carrying a Fusion Turret.

         THE LADDER LEVEL, NOT THE SOURCE LEVEL. These are two different scales
         — the source gates 1..60, the ladder runs 1..100 — and this compared
         one against the other, because `levelOfModule` answers in ladder
         levels. Every hull whose two numbers disagree was fitted at the wrong
         point: the Type K4-8U70 is source 21 but ladder 45, so it turned up
         with twenty-four levels of equipment it should not have had. */
      var lvl = Progress.levelOfShip(hull.key);
      var recipe = {
        weapons:  pick(Autofit.WEAPON_MODES, rng),
        armour:   pick(Autofit.ARMOUR_MODES, rng),
        priority: pick(Autofit.PRIORITY_MODES, rng)
      };
      var modules = Autofit.build(hull, {
        weapons: recipe.weapons, armour: recipe.armour, priority: recipe.priority,
        skill: skill, seed: (rng() * 1e9) | 0,
        allow: function (m) { return Progress.levelOfModule(m.key) <= lvl; }
      }, Data.modules);

      if (!Geom.validate(hull, modules, Data.modules).ok) continue;

      var tag = hull.key + ':' + recipe.weapons + '/' + recipe.armour + '/' +
                recipe.priority + '/' + skill;
      var call = CALLSIGN[hash(tag) % CALLSIGN.length];
      return {
        /* The id is the HULL, not the recipe. It is what `beaten` is keyed on,
           and a save that grew an entry per recipe would grow without bound. */
        id: 'gen:' + hull.key,
        name: hull.displayName + ' ' + call,
        callsign: call,
        blurb: recipe.weapons + ' · ' + recipe.armour + ' · ' + recipe.priority,
        difficulty: tier,
        tier: tier,
        /* `skill` rides along for the tools and for a console poke; nothing
           that draws a screen reads it. */
        generated: recipe, skill: skill,
        ship: { shipId: hull.key, modules: modules }
      };
    }
    return null;
  }

  return {
    poolFor: poolFor,
    skillNow: skillNow,
    generate: generate,
    /* A fight is DRAWN, never chosen. Twelve attempts at a flyable fit is
       generous — `tools/autofit-test.js` fails the build if the packer cannot
       fit every hull — and a null answer means the screen says there are no
       contacts rather than inventing one. */
    draw: function (ship) { return generate(ship); },
    /* The fit the sim wants, straight out of the row. */
    fitFor: function (o) {
      return { shipId: o.ship.shipId, modules: o.ship.modules };
    }
  };
})();
