// The seven challenges. Small, forgiving, and with NO FAIL STATE: the goal is either
// met or it is not, you can retry as often as you like, nothing is scored, nothing is
// taken away, and there is no move limit. They exist to teach one item each.
//
// Each one is a preset layout of LOCKED items (locked items cannot be erased, moved or
// cleared) plus a grant list: the challenge lends you the item it is teaching whether
// or not you have unlocked it yet, so challenge 1 can teach the Ball Run to a brand new
// player. Clearing a challenge awards the matching achievement, which unlocks a themed
// table surface.

import { freshLayout } from './layout.js';

function it(type, x, z, r) {
  return { type, x, z, r: r || 0, locked: true };
}

export const CHALLENGES = [
  {
    id: 'ch1',
    n: 1,
    name: 'Ring the Bell',
    icon: 'gi-ringing-bell',
    teaches: 'the Ball Run',
    brief: 'The sand is too soft for dominoes. Roll a ball across it and ring the bell.',
    goalText: 'Ring the bell',
    table: 'small',
    surface: 'felt',
    budget: 70,
    grant: ['ramp'],
    hint: 'Put the Ball Run just before the sand, pointing at the bell. Line dominoes up behind it.',
    build() {
      const L = freshLayout('small', 'felt', 'normal', 'plain');
      L.items.push(it('sand', -0.40, 0.06, 0));
      L.items.push(it('sand', 0.00, 0.06, 0));
      L.items.push(it('sand', 0.40, 0.06, 0));
      // The bell sits 0.24 m out, not 0.36 m. A marble leaving the Ball Run has about
      // 0.33 m/s and rolling costs it nearly all of that over 0.40 m: measured, it reached
      // the bell at 0.36 in 9 runs out of 10 but arrived under the 0.05 m/s the bell needs
      // to ring, so the challenge came down to a coin toss the child could not read. At
      // 0.24 m it still has to cross every millimetre of the sand, and it arrives hard
      // enough to ring every time.
      L.items.push(it('bell', 0.00, 0.24, 0));
      return L;
    },
    goal: (run) => run.bells >= 1,
  },

  {
    id: 'ch2',
    n: 2,
    name: 'Both Sides',
    icon: 'gi-split-arrows',
    teaches: 'the Splitter',
    brief: 'Two bells, one starting domino. Split the run in two and ring them both.',
    goalText: 'Ring both bells from one start',
    table: 'medium',
    surface: 'felt',
    budget: 110,
    grant: ['splitter'],
    hint: 'Run one line into the Splitter, then two lines away from it - one to each bell.',
    build() {
      const L = freshLayout('medium', 'felt', 'normal', 'plain');
      L.items.push(it('splitter', 0.00, 0.00, 0));
      L.items.push(it('bell', -0.52, 0.42, 0));
      L.items.push(it('bell', 0.52, 0.42, 0));
      return L;
    },
    goal: (run) => run.bells >= 2,
  },

  {
    id: 'ch3',
    n: 3,
    name: 'Over the Wall',
    icon: 'gi-arch-bridge',
    teaches: 'the Bridge',
    brief: 'A wall blocks the way. Go over the top and ring the bell behind it.',
    goalText: 'Ring the bell from over the wall',
    table: 'medium',
    surface: 'felt',
    budget: 120,
    grant: ['bridge'],
    hint: 'Drop the Bridge so it crosses the wall, then draw one straight line right over it.',
    build() {
      const L = freshLayout('medium', 'felt', 'normal', 'plain');
      L.items.push(it('wall', -0.11, 0.00, 0));
      L.items.push(it('wall', 0.00, 0.00, 0));
      L.items.push(it('wall', 0.11, 0.00, 0));
      L.items.push(it('bell', 0.00, 0.44, 0));
      return L;
    },
    // Something has to fall while standing off the table, and the bell has to ring:
    // between them that is exactly "a run went over the top and carried on".
    goal: (run) => run.elevated === 1 && run.bells >= 1,
  },

  {
    id: 'ch4',
    n: 4,
    name: 'The Big One',
    icon: 'gi-trophy',
    teaches: 'spacing',
    brief: 'A big table and 200 dominoes. Topple 150 of them in a single run.',
    goalText: 'Topple 150 in one run',
    table: 'large',
    surface: 'felt',
    budget: 200,
    grant: [],
    hint: 'Tight spacing packs more in. Long sweeping lines beat lots of short ones.',
    build() {
      return freshLayout('large', 'felt', 'tight', 'plain');
    },
    goal: (run) => run.fell >= 150,
  },

  // --- the launchers -------------------------------------------------------
  // 5, 6 and 7 each teach one of the three launcher tricks, and each goal is written so
  // that the trick has to have actually GONE OFF — run.launched is incremented only inside
  // sim.js's fireLaunchers, so it cannot be faked by a lucky chain.

  {
    id: 'ch5',
    n: 5,
    name: 'Through the Hoop',
    icon: 'gi-spiral-arrow',
    teaches: 'the Fire Jump',
    brief: 'The Fire Jump throws its ball up through the ring of fire. Land it on the bell at the far end.',
    goalText: 'Throw the ball through the ring of fire and ring the bell',
    table: 'medium',
    surface: 'felt',
    budget: 90,
    grant: ['firejump'],
    hint: 'Run a line into the PINK domino at the back of the Fire Jump. Then leave the far half of the table empty — the ball needs a clear road to the bell.',
    build() {
      const L = freshLayout('medium', 'felt', 'normal', 'plain');
      // Trigger at z = -0.385, so there is 0.30 m of table behind it: eight dominoes at
      // normal spacing, which is a run-up a child can see the point of.
      L.items.push(it('firejump', 0.00, -0.22, 0));
      // The throw comes down to domino height at +0.238 of the Fire Jump's own origin, i.e.
      // z = +0.018 here, still carrying its 1.31 m/s of forward speed. The bell is 0.12 m
      // further on, which is far enough that the ball has to have flown to get there and
      // near enough that it arrives hard. Same lesson as challenge 1's 0.24 m.
      L.items.push(it('bell', 0.00, 0.14, 0));
      return L;
    },
    goal: (run) => run.launched >= 1 && run.bells >= 1,
  },

  {
    id: 'ch6',
    n: 6,
    name: 'Blast Off',
    icon: 'gi-firework-rocket',
    teaches: 'the Rocket',
    brief: 'One long run, all the way across the table, and the Rocket goes up at the end of it.',
    goalText: 'Topple 30 and launch the Rocket',
    table: 'medium',
    surface: 'felt',
    budget: 110,
    grant: ['rocket'],
    hint: 'Start at the near edge and draw one long line into the PINK domino by the launch pad. Curves are fine - it only has to arrive.',
    build() {
      const L = freshLayout('medium', 'felt', 'normal', 'plain');
      // Trigger at z = +0.395. From the near edge that is 1.0 m, about 29 dominoes at
      // normal spacing, so 30 fallen means the run genuinely crossed the table.
      L.items.push(it('rocket', 0.00, 0.45, 0));
      return L;
    },
    goal: (run) => run.launched >= 1 && run.fell >= 30,
  },

  {
    id: 'ch7',
    n: 7,
    name: 'Down the Tower',
    icon: 'gi-tower-fall',
    teaches: 'the Slalom Tower',
    brief: 'The ball zig-zags down the tower and rolls out of the bottom. Give it something to hit.',
    goalText: 'Knock 2 dominoes over with the tower ball, in a run of 25',
    table: 'medium',
    surface: 'felt',
    budget: 130,
    grant: ['slalom'],
    hint: 'Two lines, not one: the first goes into the PINK domino behind the tower, the second STARTS just in front of the chute where the ball rolls out.',
    build() {
      const L = freshLayout('medium', 'felt', 'normal', 'plain');
      // Trigger at z = -0.27, chute lip at z = -0.128, so the second line has 0.80 m of
      // clear table in front of it.
      L.items.push(it('slalom', 0.00, -0.20, 0));
      return L;
    },
    // Two clauses on purpose: bestBallKnock proves the BALL did the work (it is credited
    // only to dominoes that fall within 60 mm of a ball that has been seen moving), and
    // fell >= 25 proves both halves of the layout ran. Neither alone would.
    //
    // TWO, not the three this asked for first, and measurement is why. The tower ball is
    // 22 mm across and a domino is 48 mm tall: it shoves the first two off their bases and
    // is then riding over the wreckage, deflected off the line. Measured, repeatedly: the
    // whole 17-domino line goes down and exactly 2 of them are credited to the ball. Three
    // would have meant a bowling ball ploughing a lane, and the Bowling Ball came out of
    // this game precisely because that never worked. The chain does the rest of the work,
    // which is what `fell` is here to check.
    goal: (run) => run.bestBallKnock >= 2 && run.fell >= 25,
  },
];

export const CH_BY_ID = {};
for (const c of CHALLENGES) CH_BY_ID[c.id] = c;

/** A challenge layout, ready to hand to sim.build(). */
export function startChallenge(id) {
  const c = CH_BY_ID[id];
  if (!c) return null;
  const L = c.build();
  L.challenge = id;
  return L;
}

/** Did the run that just finished clear the challenge this layout belongs to? */
export function checkGoal(L, run) {
  if (!L || !L.challenge) return false;
  const c = CH_BY_ID[L.challenge];
  if (!c) return false;
  try { return !!c.goal(run); } catch (e) { return false; }
}
