// Waypoints — the lessons, for a boy who has never played it.
//
// Not a wizard, and not a cage. There is no "press this now, nothing else
// works" — every button on the phone still does what it always did. What the
// tutorial changes is the WORDS: at each moment it says the one thing you need
// to do next, in the shortest sentence that will do it, and it works out which
// moment you are in by looking at the game rather than by counting steps you
// have taken. That way a child who wanders off and draws three lines the wrong
// way round is still told the right thing when he comes back.
//
// Written for eight years old: one idea per line, verbs at the front, no rules
// vocabulary. "Drag from the ring you are standing on" rather than "plot a
// route from your current waypoint".
//
// Pure — no DOM, no game state, no Three.js — so node can test the lot.

/**
 * The lessons, in the order a first game meets them.
 *
 * `at` decides whether this lesson is the one for right now; the FIRST match
 * wins, so the specific cases (a line that will not work) come before the
 * general ones (draw a line).
 */
export const LESSONS = [
  {
    id: 'goal',
    at: (v) => v.phase === 'goal',
    title: 'Lesson 1 — your mission',
    line: 'Tap one of the three cards to pick your big job for the week.',
    info: 'You have four days of walking. The mission is the one big thing you are trying '
      + 'to do in all four — like reaching every lake. You still score for everywhere else '
      + 'you go, so pick whichever one sounds most fun.',
  },
  {
    id: 'camp',
    at: (v) => v.phase === 'start' && v.startPick == null,
    title: 'Lesson 2 — where you wake up',
    line: 'Press the big button. The park will pick a camp for you.',
    info: 'Six campsites, and you do not get to choose — that is part of the game. '
      + 'You can spin the park round with your finger while you look at them.',
  },
  {
    id: 'camp-tap',
    at: (v) => v.phase === 'start' && v.startPick != null,
    title: 'Lesson 2 — that one is yours',
    line: 'Tap the gold pin on the park. That is your tent.',
    info: 'Gold always means "tap me". Everything else on the park is coloured by what it '
      + 'is: blue for water, green for trees, red for a campsite.',
  },
  {
    id: 'roll',
    at: (v) => v.phase === 'roll',
    title: 'Lesson 3 — what is the weather?',
    line: 'Stop the spinner. The weather says how far you can walk today.',
    info: 'Sunshine lets you go a long way. Snow does not. Whatever number you stop on is '
      + 'how much walking you can do today, and it is different every day.',
  },
  {
    id: 'walk',
    at: (v) => v.screen === 'walk',
    title: 'Lesson 6 — go and walk it',
    line: 'Press Auto pilot and watch, or use the left stick to walk it yourself.',
    info: 'The gold dotted path on the ground is the line you drew. The arrow at the top of '
      + 'the screen points at where you are going. Stop and look at anything you like — '
      + 'nothing is in a hurry.',
  },
  {
    id: 'trees',
    at: (v) => v.pending > 0,
    title: 'Something in the trees',
    line: 'Pick the animal you want a photo of.',
    info: 'Walking through a wood you can photograph a bear, a bird or a rabbit. It goes on '
      + 'that animal’s line on your card. Going back to the same animal again and again is '
      + 'worth more than one of each.',
  },
  {
    id: 'stuck',
    at: (v) => v.phase === 'move' && v.stuck,
    title: 'Nowhere to go today',
    line: 'Press Rest here. You fill a water bottle instead.',
    info: 'Some days the weather will not get you anywhere new. Resting is not wasted: a '
      + 'bottle of water is one extra square of walking, saved up for a better day.',
  },
  {
    id: 'draw',
    at: (v) => v.phase === 'move' && !v.drawing,
    title: 'Lesson 4 — draw your walk',
    line: 'Put your finger on the flashing ring and drag it somewhere new.',
    info: 'Draw the walk you want to do today. Finish on a place you have not been to — a '
      + 'hill, a hide, a trig point. Then you go out and walk it yourself.',
  },
  {
    id: 'bad',
    at: (v) => v.phase === 'move' && v.draft && !v.draft.ok,
    title: 'Not that way',
    line: 'Press Undo and try a different line.',
    info: 'You cannot walk on a lake and you can only cross the river on a bridge. Go round '
      + 'the water, or find a bridge and cross there.',
  },
  {
    id: 'cost',
    at: (v) => v.phase === 'move' && v.draft && v.draft.ok,
    title: 'Lesson 5 — what it costs',
    line: 'Look at "this walk" at the top. Press Walk it when you are happy.',
    info: 'Every line you cross on the map costs you one — the brown squiggly lines are '
      + 'hills, and the straight ones are the edges of the squares. The number at the top '
      + 'is what your line costs; the weather is what you have to spend. Drink a water if '
      + 'you need one more.',
  },
  {
    id: 'draw-on',
    at: (v) => v.phase === 'move' && v.drawing,
    title: 'Keep going',
    line: 'Let go to turn a corner, then drag again. Finish on a new place.',
    info: 'Your walk can bend as many times as you like. Each drag adds another bit to it. '
      + 'Undo takes back the last bit; Start again rubs the whole thing out.',
  },
  {
    id: 'journal',
    at: (v) => v.phase === 'journal',
    title: 'Lesson 7 — the day is over',
    line: 'Pick the best score from the list. You only get each one once.',
    info: 'At the end of a day you write one thing in your journal. Each of the four can '
      + 'only be used once in the whole game, so it is worth saving the big ones for a day '
      + 'you have done a lot.',
  },
  {
    id: 'over',
    at: (v) => v.phase === 'over',
    title: 'That is the whole game',
    line: 'Four days, and everywhere you went is on your card. Well walked.',
    info: 'Now you know all of it: pick a mission, roll the weather, draw a line you can '
      + 'afford, walk it, and write your day up. Play it again and try to beat that score.',
  },
];

/** The lesson for right now, or null if the tutorial has nothing to add. */
export function lessonFor(v) {
  if (!v) return null;
  return LESSONS.find((l) => {
    try { return !!l.at(v); } catch { return false; }
  }) || null;
}
