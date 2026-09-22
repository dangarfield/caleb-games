// Waypoints — everything the game says, in one place.
//
// It is written for an eight-year-old walking the park on his own. That means
// short sentences, the second person, and a verb near the front: "Draw a line
// to where you want to walk" rather than "A route may be drawn to an unvisited
// waypoint". It also means no rules vocabulary — there are no "waypoints" here,
// there are places; no "budget", there is how far you can walk today.
//
// No DOM and no game state, so the words can be read, changed and tested
// without opening a browser. Every entry has a `title`, a short `line` that sits
// under the buttons, and a longer `info` for the `i` button — because the small
// prompt has to stay small, and the child who has forgotten what he is doing
// needs somewhere to go and read more.

/**
 * The first four pages: what this is, before anything is asked of you.
 *
 * A child who presses "Show me how" does not yet know what the game IS, and the
 * first thing the game used to do was ask him to choose a mission — a word that
 * means nothing until you know there are four days and a park. So: four short
 * pages, one idea each, read in about twenty seconds, and then he plays.
 *
 * `lines` are separate paragraphs rather than one block, because a wall of text
 * on a phone is a thing an eight-year-old skips.
 */
export const INTRO = [
  {
    title: 'A four day walk',
    lines: [
      'You are hiking across Whistling Water National Park.',
      'You have four days. Nobody is chasing you and you cannot lose — the game '
        + 'is about seeing as much of the park as you can before the four days are up.',
    ],
  },
  {
    title: 'A day at a time',
    lines: [
      'Each day goes the same way: find out the weather, draw the walk you want '
        + 'to do, then go out and walk it.',
      'The weather decides how far you can go. Sunshine is a long way. Snow is not.',
    ],
  },
  {
    title: 'Lines cost you',
    lines: [
      'Every line your walk crosses costs one — the brown wiggly lines are hills, '
        + 'and the straight ones are the edges of the squares.',
      'So a walk round a hill is cheaper than a walk over it. That is the whole puzzle.',
    ],
  },
  {
    title: 'Everything you reach counts',
    lines: [
      'Lakes, woods, bridges, hilltops, hides — reach one and it goes on your card, '
        + 'and your card is your score.',
      'Ready? We will take it one step at a time.',
    ],
  },
];

/** The goals, in words a child can act on rather than score names. */
export const GOALS = {
  a: { name: 'Lakes', aim: 'Visit all the lakes',
       how: 'Walk to the edge. 2 each, 10 more for all.' },
  b: { name: 'Woodland', aim: 'Walk through all the woods',
       how: 'Line through the trees. 2 each, 10 more for all.' },
  c: { name: 'Squares', aim: 'Walk in all the squares',
       how: 'Step into a square. 1 each, 10 more for all.' },
  d: { name: 'Bridges', aim: 'Cross all the bridges',
       how: 'Only bridges cross the river. 3 each, 10 more for all.' },
};

/** The six kinds of weather, as a child would say them. */
export const WEATHER = {
  sun: { name: 'Sunshine', line: 'Clear and bright. Good walking.' },
  cloud: { name: 'Sun and cloud', line: 'A bit of both. Fine for walking.' },
  fog: { name: 'Fog', line: 'Hard to see. Go carefully.' },
  rain: { name: 'Rain', line: 'Wet boots today.' },
  snow: { name: 'Snow', line: 'Cold and slow going.' },
  dusk: { name: 'Getting dark', line: 'The light is going. Not far now.' },
};

/**
 * What the child is being asked to do, right now.
 *
 * `phase` is the turn's phase; `v` is the panel's view of the game, so a line
 * can name the thing in front of him rather than talk in general. Everything
 * returns the same shape, so the phone never has to know which phase it is
 * showing.
 */
export function prompt(phase, v = {}) {
  switch (phase) {
    case 'title': return {
      title: 'Waypoints',
      line: 'A walk in Whistling Water National Park.',
      info: 'You have four days to walk as much of this park as you can. '
        + 'Every lake, wood, hill and bridge you reach is worth points. '
        + 'Pick who is walking and we will set off.',
    };

    case 'goal': return {
      title: 'Pick your mission',
      line: '',
      info: 'This is the big thing you are trying to do over all four days. '
        + 'You still get points for everywhere else you go — the mission is just '
        + 'worth extra, and worth a lot more if you finish it.',
    };

    case 'start': return {
      title: v.startPick == null ? 'Where do you wake up?' : `Campsite ${v.startPick}`,
      line: v.startPick == null
        ? 'Six campsites. One of them is yours.'
        : 'Tap the gold pin to set off.',
      info: v.startPick == null
        ? 'There are six campsites in the park and you do not get to choose — '
          + 'press Surprise Me! and one of them lights up. That is where your walk begins. '
          + 'Spin the park round with your finger to have a look at them first.'
        : 'That gold pin is your camp. Tap it on the park to start walking from there.',
    };

    case 'roll': return {
      title: "What's the weather?",
      line: 'Stop the spinner to find out.',
      info: 'The weather decides how far you can walk today. Sunshine goes a long way, '
        + 'snow does not. Tap the button to stop the spinner and see what you get.',
    };

    case 'move': {
      if (v.draft && v.draft.ok) return {
        title: 'Good line',
        line: `To the ${v.draft.to} — that costs ${v.draft.cost}.`,
        info: 'Happy with it? Press Walk it and you will go out there and walk it yourself. '
          + 'Press Undo to take back the last bit, or Start again to rub it all out.',
      };
      if (v.draft) return {
        title: 'That will not work',
        line: v.draft.why || 'Try another way round.',
        info: 'Something is in the way. You cannot walk on a lake, you can only cross the '
          + 'river on a bridge, and you cannot go straight through another place on the way. '
          + 'Press Undo and try a different line.',
      };
      if (v.stuck) return {
        title: 'Nowhere to go',
        line: 'Have a rest instead.',
        info: 'Nothing is close enough today. Resting is not a wasted turn — you fill up '
          + 'a bottle of water, and water lets you walk further another day.',
      };
      return {
        title: v.drawing ? 'Keep going' : 'Draw your walk',
        line: v.drawing
          ? 'Drag on from the ring, or finish on a place.'
          : 'Drag from the ring you are standing on.',
        info: 'Put your finger on the flashing ring and drag. Let go anywhere to turn a '
          + 'corner, then drag again — your walk can bend as many times as you like. '
          + 'Finish on a place you have not been to yet. Every line and every square you '
          + 'cross costs you one, and the weather says how much you have to spend.',
      };
    }

    case 'walk': return {
      title: 'Off you go',
      line: v.autopilot ? 'Walking it for you.' : 'Follow the gold path.',
      info: 'Now walk it. The left stick moves you, the right stick looks around. '
        + 'Follow the gold path on the ground and the arrow points the way. '
        + 'Or press Auto pilot and it will walk it for you — press Fast to hurry it along.',
    };

    case 'journal': return {
      title: 'Write up your day',
      line: 'Pick one to score.',
      info: 'At the end of every day you write one line in your journal. Each one can only '
        + 'be used once in the whole game, so think about saving a good one for a better day. '
        + 'You have to pick one even if it scores nothing.',
    };

    case 'over': return {
      title: v.score && v.score.lost ? 'Home late' : 'Back at the car',
      line: 'That is the walk done.',
      info: 'Four days walked. Your score is everywhere you went, plus your journal, '
        + 'plus your mission. Press Walk it again for a new one.',
    };

    default: return { title: 'Waypoints', line: '', info: '' };
  }
}

/**
 * The little note that pops up when you cross something or reach something.
 *
 * These are the PASSING ones — they tell you what just happened and go away.
 * The ones that ask you something (which animal did you see, do you want to
 * take a photograph) are stops, not notes, and are listed in
 * `docs/game-waypoints-build.md` under "What you meet on the way"; they are
 * stubbed as notes for now so the walk is honest about what it noticed.
 */
export function note(kind, what) {
  switch (kind) {
    case 'line': return { icon: '▲', text: 'Over the ridge', cost: '−1' };
    case 'grid': return { icon: '▦', text: 'Into a new square', cost: '−1' };
    case 'bridge': return { icon: '‖', text: 'Over the bridge', cost: 'free' };
    case 'lake': return { icon: '●', text: 'Filled a water bottle', cost: '+1' };
    case 'wood': return { icon: '♣', text: 'Into the trees', cost: 'look!' };
    case 'arrive': return { icon: '⚑', text: `Made it to the ${what || 'end'}`, cost: '' };
    case 'drink': return { icon: '●', text: 'Drank a bottle', cost: '+1' };
    case 'nowater': return { icon: '●', text: 'Too deep to walk', cost: 'go round' };
    case 'noford': return { icon: '‖', text: 'The river is too fast', cost: 'find a bridge' };
    default: return { icon: '•', text: what || '', cost: '' };
  }
}
