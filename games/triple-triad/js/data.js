/*
 * Triple Triad — Garfield Boys' Arcade edition
 * A derivative work of "Triple Triad (HTML5)" by Jeffrey Han (@itdelatrisu),
 * Copyright (C) 2014 Jeffrey Han — https://github.com/itdelatrisu/triple-triad-html5
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option) any later
 * version.  See ./LICENSE for the full text.
 *
 * All game concepts and designs are based on work by Square Enix.
 * Card art from FFVIII mods by MCINDUS (Tripod v1.1, SeeD Reborn v3.2);
 * sound effects extracted by TekkamanChronos.
 *
 * js/data.js — the 110-card database, elements, opponent roster and the
 * progression / reward tuning.  Card stats are ported verbatim from the
 * original js/deck.js.
 */
'use strict';

var TT = window.TT || (window.TT = {});

/* ------------------------------------------------------------------ elements
 * Element ids match the original Game.Element enum, because the element.png
 * sprite sheet (64 x 2048 = 32 frames of 64x64, 4 animation frames per
 * element) is indexed by the ORIGINAL frame offsets, not by element id.
 */
TT.ELEMENTS = ['NEUTRAL','FIRE','WATER','EARTH','THUNDER','ICE','WIND','POISON','HOLY'];
TT.ELEMENT_ID = {};
TT.ELEMENTS.forEach(function (n, i) { TT.ELEMENT_ID[n] = i; });

// first animation frame (row index into element.png) per element id
TT.ELEMENT_FRAME = [ -1, 4, 24, 0, 20, 12, 28, 16, 8 ];
TT.ELEMENT_LABEL = ['—','Fire','Water','Earth','Thunder','Ice','Wind','Poison','Holy'];
TT.ELEMENT_COLOR = ['#8f8fb0','#e8623c','#3aa6e8','#b3854a','#f5d23a','#7fe3f0','#8ce8a0','#a86fd6','#ffe9a8'];

/* rank slots on a card */
TT.TOP = 0; TT.LEFT = 1; TT.RIGHT = 2; TT.BOTTOM = 3;

/* ---------------------------------------------------------------- card data
 * { id, name, ranks:[top,left,right,bottom], element, level }
 */
TT.CARDS = [
  { id:  1, name:'Geezard',         ranks:[1,5,4,1],      element:'NEUTRAL',  level:1 },
  { id:  2, name:'Funguar',         ranks:[5,3,1,1],      element:'NEUTRAL',  level:1 },
  { id:  3, name:'Bite Bug',        ranks:[1,5,3,3],      element:'NEUTRAL',  level:1 },
  { id:  4, name:'Red Bat',         ranks:[6,2,1,1],      element:'NEUTRAL',  level:1 },
  { id:  5, name:'Blobra',          ranks:[2,5,3,1],      element:'NEUTRAL',  level:1 },
  { id:  6, name:'Gayla',           ranks:[2,4,1,4],      element:'THUNDER',  level:1 },
  { id:  7, name:'Gesper',          ranks:[1,1,5,4],      element:'NEUTRAL',  level:1 },
  { id:  8, name:'Fastitocalon-F',  ranks:[3,1,5,2],      element:'EARTH',    level:1 },
  { id:  9, name:'Blood Soul',      ranks:[2,1,1,6],      element:'NEUTRAL',  level:1 },
  { id: 10, name:'Caterchipillar',  ranks:[4,3,2,4],      element:'NEUTRAL',  level:1 },
  { id: 11, name:'Cockatrice',      ranks:[2,6,1,2],      element:'THUNDER',  level:1 },
  { id: 12, name:'Grat',            ranks:[7,1,1,3],      element:'NEUTRAL',  level:2 },
  { id: 13, name:'Buel',            ranks:[6,3,2,2],      element:'NEUTRAL',  level:2 },
  { id: 14, name:'Mesmerize',       ranks:[5,4,3,3],      element:'NEUTRAL',  level:2 },
  { id: 15, name:'Glacial Eye',     ranks:[6,3,1,4],      element:'ICE',      level:2 },
  { id: 16, name:'Belhelmel',       ranks:[3,3,4,5],      element:'NEUTRAL',  level:2 },
  { id: 17, name:'Thrustaevis',     ranks:[5,5,3,2],      element:'WIND',     level:2 },
  { id: 18, name:'Anacondaur',      ranks:[5,5,1,3],      element:'POISON',   level:2 },
  { id: 19, name:'Creeps',          ranks:[5,2,2,5],      element:'THUNDER',  level:2 },
  { id: 20, name:'Grendel',         ranks:[4,2,4,5],      element:'THUNDER',  level:2 },
  { id: 21, name:'Jelleye',         ranks:[3,7,2,1],      element:'NEUTRAL',  level:2 },
  { id: 22, name:'Grand Mantis',    ranks:[5,3,2,5],      element:'NEUTRAL',  level:2 },
  { id: 23, name:'Forbidden',       ranks:[6,2,6,3],      element:'NEUTRAL',  level:3 },
  { id: 24, name:'Armadodo',        ranks:[6,6,3,1],      element:'EARTH',    level:3 },
  { id: 25, name:'Tri-Face',        ranks:[3,5,5,5],      element:'POISON',   level:3 },
  { id: 26, name:'Fastitocalon',    ranks:[7,3,5,1],      element:'EARTH',    level:3 },
  { id: 27, name:'Snow Lion',       ranks:[7,3,1,5],      element:'ICE',      level:3 },
  { id: 28, name:'Ochu',            ranks:[5,3,6,3],      element:'NEUTRAL',  level:3 },
  { id: 29, name:'SAM08G',          ranks:[5,4,6,2],      element:'FIRE',     level:3 },
  { id: 30, name:'Death Claw',      ranks:[4,2,4,7],      element:'FIRE',     level:3 },
  { id: 31, name:'Cactuar',         ranks:[6,3,2,6],      element:'NEUTRAL',  level:3 },
  { id: 32, name:'Tonberry',        ranks:[3,4,6,4],      element:'NEUTRAL',  level:3 },
  { id: 33, name:'Abyss Worm',      ranks:[7,5,2,3],      element:'EARTH',    level:3 },
  { id: 34, name:'Turtapod',        ranks:[2,7,3,6],      element:'NEUTRAL',  level:4 },
  { id: 35, name:'Vysage',          ranks:[6,5,5,4],      element:'NEUTRAL',  level:4 },
  { id: 36, name:'T-Rexaur',        ranks:[4,7,6,2],      element:'NEUTRAL',  level:4 },
  { id: 37, name:'Bomb',            ranks:[2,3,7,6],      element:'FIRE',     level:4 },
  { id: 38, name:'Blitz',           ranks:[1,7,6,4],      element:'THUNDER',  level:4 },
  { id: 39, name:'Wendigo',         ranks:[7,6,3,1],      element:'NEUTRAL',  level:4 },
  { id: 40, name:'Torama',          ranks:[7,4,4,4],      element:'NEUTRAL',  level:4 },
  { id: 41, name:'Imp',             ranks:[3,6,7,3],      element:'NEUTRAL',  level:4 },
  { id: 42, name:'Blue Dragon',     ranks:[6,3,2,7],      element:'POISON',   level:4 },
  { id: 43, name:'Adamantoise',     ranks:[4,6,5,5],      element:'EARTH',    level:4 },
  { id: 44, name:'Hexadragon',      ranks:[7,3,5,4],      element:'FIRE',     level:4 },
  { id: 45, name:'Iron Giant',      ranks:[6,5,5,6],      element:'NEUTRAL',  level:5 },
  { id: 46, name:'Behemoth',        ranks:[3,7,6,5],      element:'NEUTRAL',  level:5 },
  { id: 47, name:'Chimera',         ranks:[7,3,6,5],      element:'WATER',    level:5 },
  { id: 48, name:'PuPu',            ranks:[3,1,10,2],     element:'NEUTRAL',  level:5 },
  { id: 49, name:'Elastoid',        ranks:[6,7,2,6],      element:'NEUTRAL',  level:5 },
  { id: 50, name:'GIM47N',          ranks:[5,4,5,7],      element:'NEUTRAL',  level:5 },
  { id: 51, name:'Malboro',         ranks:[7,2,7,4],      element:'POISON',   level:5 },
  { id: 52, name:'Ruby Dragon',     ranks:[7,4,2,7],      element:'FIRE',     level:5 },
  { id: 53, name:'Elnoyle',         ranks:[5,6,3,7],      element:'NEUTRAL',  level:5 },
  { id: 54, name:'Tonberry King',   ranks:[4,4,6,7],      element:'NEUTRAL',  level:5 },
  { id: 55, name:'Wedge, Biggs',    ranks:[6,7,6,2],      element:'NEUTRAL',  level:5 },
  { id: 56, name:'Fujin Raijin',    ranks:[2,4,8,8],      element:'NEUTRAL',  level:6 },
  { id: 57, name:'Elvoret',         ranks:[7,4,8,3],      element:'WIND',     level:6 },
  { id: 58, name:'X-ATM092',        ranks:[4,3,8,7],      element:'NEUTRAL',  level:6 },
  { id: 59, name:'Granaldo',        ranks:[7,5,2,8],      element:'NEUTRAL',  level:6 },
  { id: 60, name:'Gerogero',        ranks:[1,3,8,8],      element:'POISON',   level:6 },
  { id: 61, name:'Iguion',          ranks:[8,2,2,8],      element:'NEUTRAL',  level:6 },
  { id: 62, name:'Abadon',          ranks:[6,5,8,4],      element:'NEUTRAL',  level:6 },
  { id: 63, name:'Trauma',          ranks:[4,6,8,5],      element:'NEUTRAL',  level:6 },
  { id: 64, name:'Oilboyle',        ranks:[1,8,8,4],      element:'NEUTRAL',  level:6 },
  { id: 65, name:'Shumi',           ranks:[6,4,5,8],      element:'NEUTRAL',  level:6 },
  { id: 66, name:'Krysta',          ranks:[7,1,5,8],      element:'NEUTRAL',  level:6 },
  { id: 67, name:'Propagator',      ranks:[8,8,4,4],      element:'NEUTRAL',  level:7 },
  { id: 68, name:'Jumbo Cactuar',   ranks:[8,4,8,4],      element:'NEUTRAL',  level:7 },
  { id: 69, name:'Tri-Point',       ranks:[8,8,5,2],      element:'THUNDER',  level:7 },
  { id: 70, name:'Gargantua',       ranks:[5,8,6,6],      element:'NEUTRAL',  level:7 },
  { id: 71, name:'Mobile Type 8',   ranks:[8,3,6,7],      element:'NEUTRAL',  level:7 },
  { id: 72, name:'Sphinxara',       ranks:[8,8,3,5],      element:'NEUTRAL',  level:7 },
  { id: 73, name:'Tiamat',          ranks:[8,4,8,5],      element:'NEUTRAL',  level:7 },
  { id: 74, name:'BGH251F2',        ranks:[5,5,7,8],      element:'NEUTRAL',  level:7 },
  { id: 75, name:'Red Giant',       ranks:[6,7,8,4],      element:'NEUTRAL',  level:7 },
  { id: 76, name:'Catoblepas',      ranks:[1,7,8,7],      element:'NEUTRAL',  level:7 },
  { id: 77, name:'Ultima Weapon',   ranks:[7,8,7,2],      element:'NEUTRAL',  level:7 },
  { id: 78, name:'Chubby Chocobo',  ranks:[4,9,4,8],      element:'NEUTRAL',  level:8 },
  { id: 79, name:'Angelo',          ranks:[9,3,6,7],      element:'NEUTRAL',  level:8 },
  { id: 80, name:'Gilgamesh',       ranks:[3,6,7,9],      element:'NEUTRAL',  level:8 },
  { id: 81, name:'MiniMog',         ranks:[9,2,3,9],      element:'NEUTRAL',  level:8 },
  { id: 82, name:'Chicobo',         ranks:[9,4,4,8],      element:'NEUTRAL',  level:8 },
  { id: 83, name:'Quezacotl',       ranks:[2,4,9,9],      element:'THUNDER',  level:8 },
  { id: 84, name:'Shiva',           ranks:[6,9,7,4],      element:'ICE',      level:8 },
  { id: 85, name:'Ifrit',           ranks:[9,8,6,2],      element:'FIRE',     level:8 },
  { id: 86, name:'Siren',           ranks:[8,2,9,6],      element:'NEUTRAL',  level:8 },
  { id: 87, name:'Sacred',          ranks:[5,9,1,9],      element:'EARTH',    level:8 },
  { id: 88, name:'Minotaur',        ranks:[9,9,5,2],      element:'EARTH',    level:8 },
  { id: 89, name:'Carbuncle',       ranks:[8,4,4,10],     element:'NEUTRAL',  level:9 },
  { id: 90, name:'Diablos',         ranks:[5,3,10,8],     element:'NEUTRAL',  level:9 },
  { id: 91, name:'Leviathan',       ranks:[7,7,10,1],     element:'WATER',    level:9 },
  { id: 92, name:'Odin',            ranks:[8,5,10,3],     element:'NEUTRAL',  level:9 },
  { id: 93, name:'Pandemona',       ranks:[10,7,1,7],     element:'WIND',     level:9 },
  { id: 94, name:'Cerberus',        ranks:[7,10,4,6],     element:'NEUTRAL',  level:9 },
  { id: 95, name:'Alexander',       ranks:[9,2,10,4],     element:'HOLY',     level:9 },
  { id: 96, name:'Phoenix',         ranks:[7,10,2,7],     element:'FIRE',     level:9 },
  { id: 97, name:'Bahamut',         ranks:[10,6,8,2],     element:'NEUTRAL',  level:9 },
  { id: 98, name:'Doomtrain',       ranks:[3,10,1,10],    element:'POISON',   level:9 },
  { id: 99, name:'Eden',            ranks:[4,10,4,9],     element:'NEUTRAL',  level:9 },
  { id:100, name:'Ward',            ranks:[10,8,7,2],     element:'NEUTRAL',  level:10 },
  { id:101, name:'Kiros',           ranks:[6,10,7,6],     element:'NEUTRAL',  level:10 },
  { id:102, name:'Laguna',          ranks:[5,9,10,3],     element:'NEUTRAL',  level:10 },
  { id:103, name:'Selphie',         ranks:[10,4,8,6],     element:'NEUTRAL',  level:10 },
  { id:104, name:'Quistis',         ranks:[9,2,6,10],     element:'NEUTRAL',  level:10 },
  { id:105, name:'Irvine',          ranks:[2,10,6,9],     element:'NEUTRAL',  level:10 },
  { id:106, name:'Zell',            ranks:[8,6,5,10],     element:'NEUTRAL',  level:10 },
  { id:107, name:'Rinoa',           ranks:[4,10,10,2],    element:'NEUTRAL',  level:10 },
  { id:108, name:'Edea',            ranks:[10,3,10,3],    element:'NEUTRAL',  level:10 },
  { id:109, name:'Seifer',          ranks:[6,4,9,10],     element:'NEUTRAL',  level:10 },
  { id:110, name:'Squall',          ranks:[10,9,4,6],     element:'NEUTRAL',  level:10 }
];

TT.CARD_BY_ID = {};
TT.CARDS_BY_LEVEL = {};
TT.CARDS.forEach(function (c) {
  TT.CARD_BY_ID[c.id] = c;
  (TT.CARDS_BY_LEVEL[c.level] || (TT.CARDS_BY_LEVEL[c.level] = [])).push(c);
});
TT.MAX_LEVEL = 10;
TT.cardArt = function (id) { return 'img/cards/' + ('00' + id).slice(-3) + '.png'; };

/* ------------------------------------------------------------------- rules
 * Every rule is opt-in per opponent.  Semantics are ported from the original
 * result.js:
 *   OPEN         the opponent's hand is face-up
 *   SAME         >=2 adjacent cards with an equal facing rank are all captured
 *   SAME_WALL    a board edge counts as a rank-10 neighbour for SAME
 *   PLUS         >=2 adjacent cards whose (facing + faced) sums are equal
 *   COMBO        cards flipped by SAME/PLUS then capture their own neighbours
 *   ELEMENTAL    element tiles give a card +1 (match) or -1 (mismatch)
 *   SUDDEN_DEATH a draw is replayed with the hands you finished holding
 */
TT.RULE_KEYS = ['OPEN','SAME','SAME_WALL','PLUS','COMBO','ELEMENTAL','SUDDEN_DEATH'];
TT.RULE_LABEL = {
  OPEN:'Open', SAME:'Same', SAME_WALL:'Same Wall', PLUS:'Plus',
  COMBO:'Combo', ELEMENTAL:'Elemental', SUDDEN_DEATH:'Sudden Death'
};
TT.RULE_HELP = {
  OPEN:'You can see every card in your rival’s hand.',
  SAME:'Touch two cards with matching facing numbers and you take both.',
  SAME_WALL:'The board edge counts as a 10 for the Same rule.',
  PLUS:'Two neighbours whose number pairs add up the same? Take both.',
  COMBO:'Cards taken by Same or Plus go on to flip their own neighbours.',
  ELEMENTAL:'Element tiles give a matching card +1, a mismatched card −1.',
  SUDDEN_DEATH:'A draw is replayed with the cards you each ended up holding.'
};
TT.noRules = function () {
  var r = {};
  TT.RULE_KEYS.forEach(function (k) { r[k] = false; });
  return r;
};
TT.makeRules = function (list) {
  var r = TT.noRules();
  (list || []).forEach(function (k) { r[k] = true; });
  return r;
};

/* --------------------------------------------------------------- opponents
 * Eleven FF8 characters.  Tier 0 is the tutorial and is always unlocked;
 * beating tier N unlocks tier N+1.  `portrait` is the id of that character's
 * level-10 card, whose art doubles as their face on the select screen.
 * `ai` picks a personality from js/rules.js.
 */
TT.OPPONENTS = [
  { tier:0,  key:'tutorial', name:'Selphie', title:'Card Club Rookie', portrait:103,
    ai:'random',    rules:['OPEN'],
    blurb:'Selphie shows you the ropes. Nothing fancy — just place cards and flip hers.' },
  { tier:1,  key:'zell',     name:'Zell',    title:'Balamb Brawler', portrait:106,
    ai:'random',    rules:[],
    blurb:'All fists, no strategy. A gentle first real match.' },
  { tier:2,  key:'irvine',   name:'Irvine',  title:'Galbadian Sharpshooter', portrait:105,
    ai:'offensive', rules:['OPEN'],
    blurb:'He shows you his hand and still takes your cards. Watch the corners.' },
  { tier:3,  key:'quistis',  name:'Quistis', title:'SeeD Instructor', portrait:104,
    ai:'offensive', rules:['SAME'],
    blurb:'The instructor teaches you the Same rule the hard way.' },
  { tier:4,  key:'ward',     name:'Ward',    title:'Silent Harpoon', portrait:100,
    ai:'defensive', rules:['SAME','SAME_WALL'],
    blurb:'Says nothing, defends everything. The walls are on his side now.' },
  { tier:5,  key:'kiros',    name:'Kiros',   title:'Twin Blades', portrait:101,
    ai:'balanced',  rules:['SAME','SAME_WALL','PLUS'],
    blurb:'Fast and precise. Plus lets him take two cards at once.' },
  { tier:6,  key:'laguna',   name:'Laguna',  title:'Wandering Journalist', portrait:102,
    ai:'balanced',  rules:['SAME','PLUS','COMBO'],
    blurb:'Clumsy hero, dangerous chains. One flip can cascade across the board.' },
  { tier:7,  key:'rinoa',    name:'Rinoa',   title:'Forest Owl', portrait:107,
    ai:'balanced',  rules:['SAME','SAME_WALL','PLUS','COMBO'],
    blurb:'Angelo fetches the combos. Every rule so far, all at once.' },
  { tier:8,  key:'edea',     name:'Edea',    title:'Sorceress', portrait:108,
    ai:'balanced',  rules:['SAME','PLUS','COMBO','ELEMENTAL'],
    blurb:'Magic tiles appear on the board. Match the element or lose a point.' },
  { tier:9,  key:'seifer',   name:'Seifer',  title:'Knight of the Sorceress', portrait:109,
    ai:'balanced',  rules:['SAME','SAME_WALL','PLUS','COMBO','ELEMENTAL','SUDDEN_DEATH'],
    blurb:'No draws allowed. Seifer replays until somebody loses.' },
  { tier:10, key:'squall',   name:'Squall',  title:'SeeD Commander', portrait:110,
    ai:'balanced',  rules:['OPEN','SAME','SAME_WALL','PLUS','COMBO','ELEMENTAL','SUDDEN_DEATH'],
    blurb:'Every rule, his best cards, and he does not care that you can see them.' }
];
TT.OPPONENT_BY_TIER = {};
TT.OPPONENTS.forEach(function (o) {
  o.ruleSet = TT.makeRules(o.rules);
  TT.OPPONENT_BY_TIER[o.tier] = o;
});

/* Which rival first hands out a level-L card.  A tier-T rival's reward ceiling
 * is T+1 (see TT.rewardLevels in rules.js), so a level-L card first becomes
 * winnable at tier = max(1, L-1): levels 1 and 2 come from the very first
 * rival, level 7 from whoever sits at tier 6, and so on.  The card viewer uses
 * this to tell the player exactly who to go and beat. */
TT.unlockTierFor = function (level) {
  return Math.max(1, Math.min(TT.MAX_LEVEL, level) - 1);
};
TT.unlockRivalFor = function (level) {
  return TT.OPPONENT_BY_TIER[TT.unlockTierFor(level)] || TT.OPPONENT_BY_TIER[1];
};

/* -------------------------------------------------- opponent hand grading
 * A tier-N opponent fields ~3 cards at level N and eases down by one and two
 * levels, clamped at 1.  Tier 1 therefore plays five level-1 cards; tier 10
 * plays 3xL10 + 1xL9 + 1xL8.  Tier 0 (tutorial) is deliberately the weakest
 * five level-1 cards in the game.
 */
TT.handLevels = function (tier) {
  if (tier <= 0) return [1, 1, 1, 1, 1];
  var n = Math.min(TT.MAX_LEVEL, tier);
  var c = function (l) { return Math.max(1, l); };
  return [n, n, n, c(n - 1), c(n - 2)];
};

/* Cards the tutorial opponent uses: the five lowest rank-sum level-1 cards,
 * so a beginner's starter hand always has an answer. */
TT.TUTORIAL_HAND = [4, 9, 7, 2, 1];

/* ...and the hand the tutorial deals the player: the five strongest level-1
 * cards, so a first-timer's flips actually land. */
TT.TUTORIAL_PLAYER_HAND = [10, 3, 5, 11, 8];

/* The player's starting collection: EXACTLY five cards — the same five level-1
 * cards the tutorial deals — so a new profile can field one legal hand and no
 * more.  Choice has to be earned: every extra card comes from a win, which is
 * what makes the deck builder mean something at tier 1. */
TT.STARTER_CARDS = TT.TUTORIAL_PLAYER_HAND.slice();

/* Reward band: beating tier N offers up to three unowned cards from a NARROW
 * band — level N, plus a taste of level N+1 — and never anything lower; see
 * TT.rewardLevels in rules.js.  The one-level stretch dries up once the player
 * owns this many cards of that level, so higher-level cards have to be earned
 * from higher-tier rivals. */
TT.REWARD_COUNT = 3;
TT.STRETCH_OWNED_CAP = 4;
/* Shown instead of a prize when the band is exhausted: the rival has nothing
 * left they are allowed to give away. */
TT.NO_REWARD_MSG = 'No new cards here — beat a tougher rival to win higher-level cards!';

/* Sudden Death is capped so a stubborn draw can never trap a seven-year-old. */
TT.MAX_SUDDEN_DEATH = 3;

/* Progression: a rival opens up only once the previous one has been beaten this
 * many times.  Every win still pays out a card, so the grind is never empty. */
TT.WINS_TO_UNLOCK = 5;

TT.rankSum = function (card) {
  return card.ranks[0] + card.ranks[1] + card.ranks[2] + card.ranks[3];
};
