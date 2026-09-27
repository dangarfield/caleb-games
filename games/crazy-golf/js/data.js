/* data.js — everything the screens need to know that isn't geometry. Ported from the
 * Claude Design prototype (research/Crazy Golf prototype build/Crazy Golf.dc.html). */

import { HOLES, WORLD_IDS } from './holes.js';

export const PL = {
  caleb: { id: 'caleb', name: 'Caleb', letter: 'C', color: '#FF8A3D', soft: '#FFE6D2', dark: '#C45A12' },
  ezra:  { id: 'ezra',  name: 'Ezra',  letter: 'E', color: '#3DB7F0', soft: '#D8F1FD', dark: '#1B7FB0' },
};
export const PIDS = ['caleb', 'ezra'];

/* map positions: two rows of four, the path snakes left→right along the top then back along the bottom */
export const WORLDS = [
  { id: 'jungle', short: 'Jungle',  name: 'Jungle Ruins',   top: '#7CC96A', side: '#3E8E46', rim: '#BCAE90', icon1: 'idol',    icon2: 'vines',   propColor: '#8E8268', flag: '#FFC93C', need: 0,   x: 60,  y: 78 },
  { id: 'pirate', short: 'Pirate',  name: 'Pirate Cove',    top: '#F3D59C', side: '#C99A57', rim: '#C98B4E', icon1: 'cannon',  icon2: 'water',   propColor: '#3B4150', flag: '#E8453C', need: 15,  x: 370, y: 78 },
  { id: 'space', short: 'Space',   name: 'Space Station',  top: '#8E88BE', side: '#565089', rim: '#D5DBF5', icon1: 'portal',  icon2: 'gravity', propColor: '#FF5FD2', flag: '#4FF0E0', need: 35,  x: 680, y: 78 },
  { id: 'haunted', short: 'Haunted', name: 'Haunted House',  top: '#6F5A99', side: '#3F3163', rim: '#9C86C8', icon1: 'ghost',   icon2: 'lava',    propColor: '#F4F0FF', flag: '#FF8A2A', need: 60,  x: 990, y: 78 },
  { id: 'candy', short: 'Candy',   name: 'Candy Kingdom',  top: '#F7B8D2', side: '#D1789E', rim: '#FFFFFF', icon1: 'candy',   icon2: 'boost',   propColor: '#E8453C', flag: '#FF4FA3', need: 85,  x: 990, y: 378 },
  { id: 'ice', short: 'Ice',     name: 'Ice Palace',     top: '#E6F4FF', side: '#9CC8E6', rim: '#BFE3F7', icon1: 'snow',    icon2: 'penguin', propColor: '#3D7FB8', flag: '#3DB7F0', need: 115, x: 680, y: 378 },
  { id: 'factory', short: 'Factory', name: 'Robot Factory',  top: '#9AA3AE', side: '#5E6670', rim: '#FFC93C', icon1: 'gear',    icon2: 'piston',  propColor: '#2C3036', flag: '#FFC93C', need: 145, x: 370, y: 378 },
  { id: 'desert', short: 'Desert',  name: 'Pyramid Desert', top: '#EFD29A', side: '#C9A060', rim: '#D2A868', icon1: 'pyramid', icon2: 'boulder', propColor: '#8A6A3A', flag: '#E8453C', need: 175, x: 60,  y: 378 },
];
export const NW = WORLDS.length;
export const PARS = WORLD_IDS.map(w => HOLES[w].map(h => h.par));
export const CAP_OVER = 4;              // stroke cap = par + 4

export const HAZ = {
  windmill: { name: 'Windmill',        icon: 'windmill', color: '#FF9F43', desc: 'Sails spin round. Putt through the gap.' },
  loop:     { name: 'Loop-the-loop',   icon: 'loop',     color: '#9A6BFF', desc: 'Hit it hard to whizz right round.' },
  ramp:     { name: 'Moving ramp',     icon: 'ramp',     color: '#C98B4E', desc: 'Slides back and forth. Wait for it!' },
  portal:   { name: 'Portal',          icon: 'portal',   color: '#FF5FD2', desc: 'In one ring, out the other.' },
  bumper:   { name: 'Bumper',          icon: 'bumper',   color: '#FF6B57', desc: 'Boing! Bounces the ball away fast.' },
  lava:     { name: 'Lava',            icon: 'lava',     color: '#FF5A36', desc: 'Too hot! The ball goes back to try again.' },
  water:    { name: 'Water',           icon: 'water',    color: '#3DB7F0', desc: 'Splash! The ball goes back to try again.' },
  vine:     { name: 'Swinging vines',  icon: 'vines',    color: '#47B45B', desc: 'Swish across the path and nudge the ball.' },
  idol:     { name: 'Stone idol',      icon: 'idol',     color: '#A89B80', desc: 'Its mouth is a secret shortcut.' },
  cannon:   { name: 'Cannon',          icon: 'cannon',   color: '#4A5160', desc: 'Roll in and BOOM, you fly across.' },
  grav:     { name: 'Low-gravity pad', icon: 'gravity',  color: '#20BFB0', desc: 'Ball floats and flies extra far.' },
  ghost:    { name: 'Wobbly ghost',    icon: 'ghost',    color: '#9C86C8', desc: 'Floats about. Bump it and it spooks your ball.' },
  boost:    { name: 'Sugar rush pad',  icon: 'boost',    color: '#FF4FA3', desc: 'Zoom! Shoots the ball the way the arrows point.' },
  toffee:   { name: 'Sticky toffee',   icon: 'toffee',   color: '#C8872E', desc: 'Gloopy! Slows the ball right down.' },
  choc:     { name: 'Chocolate river', icon: 'lava',     color: '#6B3A1E', desc: 'Splat! The ball goes back to try again.' },
  ice:      { name: 'Slippery ice',    icon: 'snow',     color: '#6FB7E8', desc: 'Whee! The ball slides and slides.' },
  penguin:  { name: 'Sliding penguin', icon: 'penguin',  color: '#2C3E50', desc: 'Belly-slides across and bumps the ball.' },
  belt:     { name: 'Conveyor belt',   icon: 'belt',     color: '#5E6670', desc: 'Carries the ball along. Watch which way!' },
  sweep:    { name: 'Spinning arm',    icon: 'sweep',    color: '#E8453C', desc: 'Sweeps round and round. Time your putt!' },
  piston:   { name: 'Crusher gate',    icon: 'piston',   color: '#E0A21A', desc: 'Pops up and blocks the way. Go when it drops.' },
  sand:     { name: 'Sand trap',       icon: 'sand',     color: '#D9B36C', desc: 'Soft sand. The ball slows right down.' },
  quick:    { name: 'Quicksand',       icon: 'quick',    color: '#A8864A', desc: 'Gulp! The ball goes back to try again.' },
  boulder:  { name: 'Rolling boulder', icon: 'boulder',  color: '#8A7A66', desc: 'Rumbles across the path. Wait for it!' },
  sphinx:   { name: 'Sphinx',          icon: 'sphinx',   color: '#C9A060', desc: 'Roll into its mouth for a shortcut.' },
};
/* the key a hazard shows up under in the book (rollers and idols have world-specific looks) */
export function hazKey(h) {
  if (h.t === 'roller') return h.kind || 'boulder';
  if (h.t === 'idol' && h.kind === 'sphinx') return 'sphinx';
  return h.t;
}
/* the hazards a hole actually has, in intro order */
export function holeHazards(hole) {
  const seen = [];
  for (const h of hole.hz || []) { const k = hazKey(h); if (HAZ[k] && !seen.includes(k)) seen.push(k); }
  return seen;
}
/* which worlds each hazard appears in, worked out from the holes themselves */
export function whereOf(key) {
  const names = WORLDS.filter(w => HOLES[w.id].some(h => holeHazards(h).includes(key))).map(w => w.short);
  return names.length === NW ? 'All worlds' : names.join(', ');
}
/* book pages: hazards in order of the world they first turn up in */
export const HAZ_PAGES = (() => {
  const first = {};
  WORLD_IDS.forEach((w, wi) => HOLES[w].forEach(h => holeHazards(h).forEach(k => { if (first[k] == null) first[k] = wi; })));
  const keys = Object.keys(HAZ).filter(k => first[k] != null).sort((a, b) => first[a] - first[b]);
  return [keys.filter(k => first[k] < 4), keys.filter(k => first[k] >= 4)];
})();

/* skins: `bg` is the CSS look (shop cards); the 3D scene paints its own textures by id */
export const SHOP = {
  balls: [
    { id: 'classic', name: 'Classic', price: 0, bg: 'radial-gradient(circle at 35% 30%,#fff,#EDEDED 60%,#CFCFCF)', blurb: 'The good old white ball.' },
    { id: 'beach', name: 'Beach ball', price: 25, bg: 'conic-gradient(#FF6B57 0 60deg,#fff 0 120deg,#3DB7F0 0 180deg,#fff 0 240deg,#FFC93C 0 300deg,#fff 0)', blurb: 'Stripy and summery.' },
    { id: 'melon', name: 'Watermelon', price: 30, bg: 'repeating-linear-gradient(90deg,#2E8B3E 0 9px,#7ED957 9px 18px)', blurb: 'Juicy stripes. Not for eating.' },
    { id: 'eye', name: 'Eyeball', price: 40, bg: 'radial-gradient(circle at 60% 45%,#0B3640 0 12%,#3DB7F0 13% 28%,#fff 29%)', blurb: 'It watches the cup for you.' },
    { id: 'lava', name: 'Lava rock', price: 45, bg: 'radial-gradient(circle at 40% 35%,#FFE08A,#FF6B2A 45%,#B8261B)', blurb: 'Glows like a hot coal.' },
    { id: 'planet', name: 'Planet', price: 50, bg: 'radial-gradient(circle at 30% 30%,#8BD94A 0 18%,transparent 19%),radial-gradient(circle at 70% 65%,#8BD94A 0 16%,transparent 17%),#3DB7F0', blurb: 'A tiny world of your own.' },
    { id: 'pumpkin', name: 'Pumpkin', price: 55, bg: 'repeating-linear-gradient(90deg,#FF8A2A 0 14px,#F07515 14px 18px)', blurb: 'Spooky season, all year.' },
    { id: 'disco', name: 'Disco', price: 80, bg: 'radial-gradient(#fff 2px,transparent 3px) 0 0/11px 11px,#9A6BFF', blurb: 'Sparkles when it rolls.' },
  ],
  putters: [
    { id: 'classic', name: 'Classic', price: 0, head: '#9AA6B2', shaft: '#5B6770', blurb: 'Trusty and true.' },
    { id: 'candy', name: 'Candy cane', price: 30, head: '#FF6B57', shaft: 'repeating-linear-gradient(45deg,#FF6B57 0 8px,#fff 8px 16px)', s3: ['#FF6B57', '#ffffff'], blurb: 'Sweet stripes all the way down.' },
    { id: 'banana', name: 'Banana', price: 25, head: '#FFD84A', shaft: '#8A6A2E', blurb: 'A-peel-ing, and a bit bendy.' },
    { id: 'bone', name: 'Bone', price: 35, head: '#F4EBD8', shaft: '#E4D8BE', blurb: 'Found in the Haunted House.' },
    { id: 'oar', name: 'Oar', price: 40, head: '#C98B4E', shaft: '#A96D38', blurb: 'Borrowed from a pirate.' },
    { id: 'fish', name: 'Fish', price: 45, head: '#FF9F43', shaft: '#3DB7F0', blurb: 'Slippery but lucky.' },
    { id: 'rocket', name: 'Rocket', price: 60, head: '#9A6BFF', shaft: '#D5DBF5', blurb: 'Straight from the Space Station.' },
    { id: 'laser', name: 'Laser', price: 70, head: '#4FF0E0', shaft: '#FF5FD2', glow: true, blurb: 'Pew pew. Glows in the dark.' },
  ],
  flags: [
    { id: 'classic', name: 'Classic', price: 0, bg: '#E8453C', blurb: 'Bright red, easy to spot.' },
    { id: 'sunny', name: 'Sunny', price: 0, bg: '#FFC93C', blurb: 'The Jungle Ruins flag.' },
    { id: 'leaf', name: 'Leaf', price: 25, bg: '#47B45B', blurb: 'Fresh from the vines.' },
    { id: 'pirate', name: 'Pirate', price: 30, bg: 'radial-gradient(circle at 45% 50%,#fff 0 18%,#2B2B36 19%)', blurb: 'Yo ho ho!' },
    { id: 'star', name: 'Star', price: 35, bg: 'radial-gradient(circle at 45% 50%,#FFF6E4 0 20%,#3DB7F0 21%)', blurb: 'For a star putter.' },
    { id: 'ghost', name: 'Ghost', price: 40, bg: '#F4F0FF', blurb: 'Wobbles even with no wind.' },
    { id: 'rainbow', name: 'Rainbow', price: 50, bg: 'linear-gradient(#FF6B57 0 20%,#FFC93C 20% 40%,#8BD94A 40% 60%,#3DB7F0 60% 80%,#9A6BFF 80%)', blurb: 'Every colour at once.' },
    { id: 'galaxy', name: 'Galaxy', price: 60, bg: 'radial-gradient(#fff 1.5px,transparent 2px) 0 0/9px 9px,linear-gradient(135deg,#3B2C85,#C77DFF)', blurb: 'Twinkles like the night sky.' },
  ],
};

/* stars for a best score: 3 under par (incl. hole-in-one), 2 at par, 1 for anything else */
export const starsFor = (best, par) => best == null ? 0 : (best === 1 || best < par) ? 3 : best === par ? 2 : 1;

export const RESULT = {
  hio:    ['HOLE IN ONE!', '', '#FFC93C'],
  eagle:  ['EAGLE!', '2 under par. Amazing!', '#FFC93C'],
  birdie: ['BIRDIE!', '1 under par', '#3DB7F0'],
  par:    ['PAR!', 'Right on target', '#6CC24A'],
  bogey:  ['BOGEY', 'Just 1 over. So close!', '#FF9F43'],
  double: ['NICE TRY!', 'Over par, but you did it', '#FF6B57'],
  pickup: ['PICKED UP', 'Stroke cap reached. On to the next!', '#9C86C8'],
};
export function resultType(strokes, par, pickup) {
  if (pickup) return 'pickup';
  const d = strokes - par;
  return strokes === 1 ? 'hio' : d <= -2 ? 'eagle' : d === -1 ? 'birdie' : d === 0 ? 'par' : d === 1 ? 'bogey' : 'double';
}
export const DIFFS = [{ v: 'easy', label: 'Easy', pips: 1 }, { v: 'normal', label: 'Normal', pips: 2 }, { v: 'hard', label: 'Hard', pips: 3 }];
