// node games/buttons/tests/clues.mjs [roundsPerRoom]
// Generates many rounds for every room and checks the clue generator's promises:
//  - exactly one button (the target) matches every true clue
//  - the Muddler's fib (rooms 8-10) is false for the target and a Bip clue exposes it
//  - 3-5 clue things, every clue that isn't up front sits in a thing, giant never the answer in rooms 1-5
import { genRoom, ROOMS } from '../js/rooms.js';

const N = +(process.argv[2] || 300);
let fails = 0, total = 0;
const stats = {};
const fail = (n, seed, msg) => { fails++; if (fails < 25) console.log(`FAIL room ${n} seed ${seed}: ${msg}`); };
for (let n = 1; n <= 10; n++) {
  const st = stats[n] = { rounds: 0, clues: 0, things: 0, btns: 0, drawerT: 0, initial: 0, giant: 0 };
  for (let k = 0; k < N; k++) {
    for (let round = 1; round <= 3; round++) {
      const seed = n * 100003 + k * 7919 + round * 131;
      const player = k % 2 ? 'Caleb' : 'Ezra';
      let g;
      try { g = genRoom(n, seed, player); } catch (e) { fail(n, seed, 'threw ' + e.stack); continue; }
      total++; st.rounds++;
      const truth = g.clues.filter(c => !c.lie && !c.meta);
      const match = g.buttons.filter(b => truth.every(c => c.test(b)));
      if (match.length !== 1) fail(n, seed, `${match.length} buttons match all clues`);
      else if (match[0] !== g.target) fail(n, seed, 'the only match is not the target');
      const lie = g.clues.find(c => c.lie), meta = g.clues.find(c => c.meta);
      if (n >= 8) {
        if (!lie || !meta) fail(n, seed, 'rooms 8-10 need a fib and the clue that exposes it');
        else {
          const fake = lie.parts.find(p => p.b).t;
          if (fake === g.target.color) fail(n, seed, 'the fib is true');
          const tl = g.things.find(t => t.clue === lie.id), tm = g.things.find(t => t.clue === meta.id);
          if (!tl || !tm) fail(n, seed, 'fib or exposing clue has no clue thing');
        }
      } else if (lie || meta) fail(n, seed, 'fib before room 8');
      if (g.things.length < 3 || g.things.length > 5) fail(n, seed, `${g.things.length} clue things`);
      const shown = new Set([...g.initial, ...g.things.map(t => t.clue)]);
      if (g.clues.some(c => !shown.has(c.id))) fail(n, seed, 'a clue is neither up front nor in a thing');
      if (!g.initial.length) fail(n, seed, 'no clue up front');
      const first = g.clues.find(c => c.id === g.initial[0]);
      if (first && first.chip && first.chip.not) fail(n, seed, 'first clue is a "not" clue');
      if (g.target.size === 'giant') { st.giant++; if (n <= 5) fail(n, seed, 'giant is the answer before room 6'); }
      if (new Set(g.buttons.map(b => b.id)).size !== g.buttons.length) fail(n, seed, 'duplicate button ids');
      st.clues += g.clues.length; st.things += g.things.length; st.btns += g.buttons.length; st.initial += g.initial.length;
      if (g.target.inD) st.drawerT++;
    }
  }
}
for (let n = 1; n <= 10; n++) {
  const s = stats[n], r = s.rounds || 1;
  console.log(`room ${String(n).padStart(2)} ${ROOMS[n - 1].name.padEnd(22)} buttons ${(s.btns / r).toFixed(0).padStart(3)}  clues ${(s.clues / r).toFixed(1)}  up front ${(s.initial / r).toFixed(1)}  things ${(s.things / r).toFixed(1)}  in drawer ${(100 * s.drawerT / r).toFixed(0)}%  giant ${(100 * s.giant / r).toFixed(1)}%`);
}
console.log(fails ? `\n${fails} failures in ${total} rounds` : `\nOK: ${total} rounds, every one has exactly one answer`);
process.exit(fails ? 1 : 0);
