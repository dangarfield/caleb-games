/* data.js — the game's tables: 25 days, 16 dinos, 5 parks, prices, rating weights, the shop and the how-to cards.
 * Taken as-is from the Claude Design prototype (research/design/Dino Park.dc.html) and gameplay.md. */
export const DAYS = [
  { park: 'jungle', title: 'Opening Day', goals: [{ k: 'hatch', t: 1 }, { k: 'happy', t: 10 }, { k: 'build', p: 'icecream', t: 1 }], unlock: { kind: 'dino', id: 'stompy' } },
  { park: 'jungle', title: 'Snack Attack', goals: [{ k: 'build', p: 'burger', t: 1 }, { k: 'happy', t: 15 }, { k: 'coins', t: 150 }], unlock: { kind: 'piece', id: 'burger', name: 'Burger stall', line: 'Hungry visitors pay more!' } },
  { park: 'jungle', title: 'Zippy Arrives', goals: [{ k: 'hatch', t: 1 }, { k: 'catch' }, { k: 'happy', t: 15 }], unlock: { kind: 'dino', id: 'zippy' } },
  { park: 'jungle', title: 'Splash Party', goals: [{ k: 'build', p: 'fountain', t: 1 }, { k: 'happy', t: 20 }, { k: 'catch' }], unlock: { kind: 'piece', id: 'fountain', name: 'Fountain & toilets', line: 'Splashy fun and no queues!' } },
  { park: 'jungle', title: 'Tiny Trouble', goals: [{ k: 'hatch', t: 1 }, { k: 'catch' }, { k: 'feed', t: 5 }], unlock: { kind: 'dino', id: 'tiny' } },
  { park: 'volcano', title: 'Big Friend', goals: [{ k: 'hatch', t: 1 }, { k: 'happy', t: 20 }, { k: 'coins', t: 250 }], unlock: { kind: 'dino', id: 'longneck' } },
  { park: 'volcano', title: 'Grumpy Spike', goals: [{ k: 'hatch', t: 1 }, { k: 'feed', t: 6 }, { k: 'catch' }], unlock: { kind: 'dino', id: 'spike' } },
  { park: 'volcano', title: 'Bonk Heads', goals: [{ k: 'hatch', t: 1 }, { k: 'happy', t: 25 }, { k: 'catch' }], unlock: { kind: 'dino', id: 'bonk' } },
  { park: 'volcano', title: 'Hot Horns', goals: [{ k: 'hatch', t: 1 }, { k: 'coins', t: 300 }, { k: 'happy', t: 25 }], unlock: { kind: 'dino', id: 'horns' } },
  { park: 'volcano', title: 'Star of the Show', goals: [{ k: 'hatch', t: 1 }, { k: 'happy', t: 30 }, { k: 'catch' }], unlock: { kind: 'dino', id: 'rexy' } },
  { park: 'desert', title: 'Tank Rolls In', goals: [{ k: 'hatch', t: 1 }, { k: 'happy', t: 25 }, { k: 'coins', t: 300 }], unlock: { kind: 'dino', id: 'tank' } },
  { park: 'desert', title: 'Frilly Fright', goals: [{ k: 'hatch', t: 1 }, { k: 'catch' }, { k: 'feed', t: 8 }], unlock: { kind: 'dino', id: 'frilly' } },
  { park: 'desert', title: 'Thumbs Up', goals: [{ k: 'hatch', t: 1 }, { k: 'happy', t: 30 }, { k: 'catch' }], unlock: { kind: 'dino', id: 'thumbs' } },
  { park: 'desert', title: 'Sail Away', goals: [{ k: 'hatch', t: 1 }, { k: 'coins', t: 350 }, { k: 'catch' }], unlock: { kind: 'dino', id: 'sail' } },
  { park: 'desert', title: 'Canyon Carnival', goals: [{ k: 'hatch', t: 2 }, { k: 'happy', t: 35 }, { k: 'coins', t: 400 }], unlock: { kind: 'item', icon: 'item/balloons', name: 'Carnival balloons', line: 'Visitors float in happy!' } },
  { park: 'beach', title: 'Honk Honk', goals: [{ k: 'hatch', t: 1 }, { k: 'happy', t: 30 }, { k: 'feed', t: 8 }], unlock: { kind: 'dino', id: 'honk' } },
  { park: 'beach', title: 'Dash to the Sea', goals: [{ k: 'hatch', t: 1 }, { k: 'catch' }, { k: 'coins', t: 350 }], unlock: { kind: 'dino', id: 'dash' } },
  { park: 'beach', title: "Chompy's Picnic", goals: [{ k: 'hatch', t: 1 }, { k: 'happy', t: 35 }, { k: 'catch' }], unlock: { kind: 'dino', id: 'chompy' } },
  { park: 'beach', title: 'Sandcastle Day', goals: [{ k: 'feed', t: 10 }, { k: 'happy', t: 40 }, { k: 'coins', t: 450 }], unlock: { kind: 'item', icon: 'item/arch', name: 'Flower arch', line: 'A pretty welcome at the gate.' } },
  { park: 'beach', title: 'Big Wave', goals: [{ k: 'hatch', t: 2 }, { k: 'catch' }, { k: 'happy', t: 40 }], unlock: { kind: 'item', icon: 'item/fireworks', name: 'Fireworks night', line: 'A big bang at the end of the day!' } },
  { park: 'snowy', title: 'Up, Up and Away', goals: [{ k: 'hatch', t: 1 }, { k: 'catch' }, { k: 'happy', t: 35 }], unlock: { kind: 'dino', id: 'flappy' } },
  { park: 'snowy', title: 'Woolly Winter', goals: [{ k: 'feed', t: 10 }, { k: 'happy', t: 40 }, { k: 'coins', t: 450 }], unlock: { kind: 'item', icon: 'dino/stompy?pose=happy&woolly=1', name: 'Woolly coats', line: 'Every dino gets a cosy jumper.' } },
  { park: 'snowy', title: 'Snow Stomp', goals: [{ k: 'hatch', t: 2 }, { k: 'catch' }, { k: 'happy', t: 45 }], unlock: { kind: 'item', icon: 'item/jar', name: 'Bonus jar', line: 'Double coins in your jar today!' } },
  { park: 'snowy', title: 'Frosty Friends', goals: [{ k: 'feed', t: 12 }, { k: 'happy', t: 45 }, { k: 'catch' }], unlock: { kind: 'item', icon: 'piece/pen_s?style=ice', name: 'Crystal pens', line: 'Now in the Dino Shop!' } },
  { park: 'snowy', title: 'Grand Dino Show', goals: [{ k: 'hatch', t: 2 }, { k: 'happy', t: 50 }, { k: 'catch' }], unlock: { kind: 'item', icon: 'item/goldegg', name: 'Golden Egg', line: 'The top park keeper trophy!' } },
];
export const NDAYS = DAYS.length;
export const DINO_ORDER = ['stompy', 'zippy', 'tiny', 'longneck', 'spike', 'bonk', 'horns', 'rexy', 'tank', 'frilly', 'thumbs', 'sail', 'honk', 'dash', 'chompy', 'flappy'];
export const SP = 'Small pen', BP = 'Big pen', SPI = 'piece/pen_s', BPI = 'piece/pen_b';
export const DINO = {
  stompy: { name: 'Stompy', species: 'Triceratops', day: 1, eats: 'leaf', eatsL: 'Leaves', pen: SP, penIcon: SPI, sneak: 1, taps: 2, tint: '#dcecf6', line: 'Slow, strong and very huggable. Stompy loves a good back scratch.', likes: 'Likes a small pen with a big rock to rub on.' },
  zippy: { name: 'Zippy', species: 'Velociraptor', day: 3, eats: 'meat', eatsL: 'Meat', pen: SP, penIcon: SPI, sneak: 5, taps: 1, tint: '#fde2cb', line: 'Super fast and super sneaky. Zippy always has a plan… usually for ice cream.', likes: 'Gets bored fast. Keep the ball handy!' },
  tiny: { name: 'Tiny', species: 'Compsognathus', day: 5, eats: 'meat', eatsL: 'Meat', pen: SP, penIcon: SPI, sneak: 5, taps: 1, tint: '#e2f7e9', line: 'Pocket-sized and super sneaky. Tiny can slip through the smallest gap.', likes: 'Keep Tiny busy with a ball, or it goes exploring!' },
  longneck: { name: 'Longneck', species: 'Brachiosaurus', day: 6, eats: 'leaf', eatsL: 'Leaves', pen: BP, penIcon: BPI, sneak: 1, taps: 3, tint: '#e6f3cf', line: 'So tall it can see the whole park. Gentle, sleepy and very kind.', likes: 'Needs a big pen with lots of room to stretch that neck.' },
  spike: { name: 'Spike', species: 'Stegosaurus', day: 7, eats: 'leaf', eatsL: 'Leaves', pen: SP, penIcon: SPI, sneak: 3, taps: 2, tint: '#e6defa', line: 'Grumpy when hungry, cuddly when full. Watch his eyebrows!', likes: 'Gets hungry fastest of all. Feed him first!' },
  bonk: { name: 'Bonk', species: 'Pachycephalosaurus', day: 8, eats: 'leaf', eatsL: 'Leaves', pen: SP, penIcon: SPI, sneak: 3, taps: 2, tint: '#e6ebfb', line: 'Loves a head-bonk! That big dome is as tough as a coconut.', likes: 'Gets bored fast. Throw a ball before it bonks the fence.' },
  horns: { name: 'Horns', species: 'Styracosaurus', day: 9, eats: 'leaf', eatsL: 'Leaves', pen: SP, penIcon: SPI, sneak: 2, taps: 2, tint: '#fce3dd', line: 'A crown of horns and a big show-off grin.', likes: 'Likes lots of visitors watching.' },
  rexy: { name: 'Rexy', species: 'T-Rex', day: 10, eats: 'meat', eatsL: 'Meat', pen: BP, penIcon: BPI, sneak: 2, taps: 3, tint: '#d7efdd', line: 'The star of the park! More big goofy dog than monster. Loves a crowd.', likes: 'Loves a big pen right next to the path, so everyone can wave.' },
  tank: { name: 'Tank', species: 'Ankylosaurus', day: 11, eats: 'leaf', eatsL: 'Leaves', pen: SP, penIcon: SPI, sneak: 1, taps: 3, tint: '#f8eed8', line: 'Slow, sleepy and covered in armour. Its club tail wags like a puppy.', likes: 'Hardly ever gets out, but it takes 3 taps to catch!' },
  frilly: { name: 'Frilly', species: 'Dilophosaurus', day: 12, eats: 'meat', eatsL: 'Meat', pen: SP, penIcon: SPI, sneak: 4, taps: 1, tint: '#fcf4d6', line: 'Pops open a bright frill when it gets excited.', likes: 'If the frill pops open, a breakout is coming!' },
  thumbs: { name: 'Thumbs', species: 'Iguanodon', day: 13, eats: 'leaf', eatsL: 'Leaves', pen: BP, penIcon: BPI, sneak: 2, taps: 2, tint: '#f3ebe1', line: 'A gentle giant who gives everyone a thumbs-up.', likes: 'Needs a big pen and lots of leaves.' },
  sail: { name: 'Sail', species: 'Spinosaurus', day: 14, eats: 'fish', eatsL: 'Fish', pen: BP, penIcon: BPI, sneak: 2, taps: 3, tint: '#dcecf4', line: 'Long snout, sunset sail and a big love of fish.', likes: 'Heads straight for the fountain if it gets out.' },
  honk: { name: 'Honk', species: 'Parasaurolophus', day: 16, eats: 'leaf', eatsL: 'Leaves', pen: SP, penIcon: SPI, sneak: 3, taps: 2, tint: '#dff4f1', line: 'Honks through its long crest to say hello.', likes: 'Loves to play. Keep the ball handy.' },
  dash: { name: 'Dash', species: 'Gallimimus', day: 17, eats: 'leaf', eatsL: 'Leaves', pen: SP, penIcon: SPI, sneak: 4, taps: 1, tint: '#f5e9fa', line: 'The fastest dino in the park. Blink and it\'s gone!', likes: 'Gets bored quickly and zooms off on loops.' },
  chompy: { name: 'Chompy', species: 'Allosaurus', day: 18, eats: 'meat', eatsL: 'Meat', pen: BP, penIcon: BPI, sneak: 3, taps: 3, tint: '#fbe2ea', line: 'Big grin, loud chomps, soft heart. Loves burgers.', likes: 'Build a burger stall nearby to keep Chompy smiling.' },
  flappy: { name: 'Flappy', species: 'Pteranodon', day: 21, eats: 'fish', eatsL: 'Fish', pen: SP, penIcon: SPI, sneak: 4, taps: 1, tint: '#fbe0ec', line: 'Flies right over fences to say hello. Swoops low, so tap quick!', likes: 'Happy in a small pen, as long as there are fish for tea.' },
};
export const PARK_ORDER = ['jungle', 'volcano', 'desert', 'beach', 'snowy'];
export const PARKS = {
  jungle: { name: 'Jungle Valley', need: 0, cost: 0, tint: '#d9efc7', ink: '#2F7D3B', days: 'Days 1–5' },
  volcano: { name: 'Volcano Island', need: 10, cost: 500, tint: '#fbdcc1', ink: '#A94A18', days: 'Days 6–10' },
  desert: { name: 'Sunny Canyon', need: 22, cost: 800, tint: '#fbe6c4', ink: '#9A4E1E', days: 'Days 11–15' },
  beach: { name: 'Coral Bay', need: 34, cost: 1200, tint: '#d3eef8', ink: '#1F6F8B', days: 'Days 16–20' },
  snowy: { name: 'Snowy Peaks', need: 46, cost: 1600, tint: '#dcebf7', ink: '#2B6E9C', days: 'Days 21–25' },
};
export const PRICES = { pen_s: 600, pen_b: 1100, egg: 900, icecream: 350, burger: 450, toilet: 250, fountain: 400, tree: 80, bin: 50 };
export const FEAT = { pen_s: 25, pen_b: 40, icecream: 15, burger: 18, toilet: 10, fountain: 20, tree: 4, bin: 3 };
export const RW = { dino: 110, kind: 125, feat: 3, happy: 1.2, care: 1.4, catch: 24 };
export const TIER_FRAC = [.2, .5, 1];
export const PIECE_NAMES = { icecream: 'an ice cream stall', burger: 'a burger stall', fountain: 'a fountain' };
export const TRAY = [['pen_s', 1], ['pen_b', 6], ['egg', 1], ['icecream', 1], ['burger', 2], ['toilet', 4], ['fountain', 4], ['tree', 1], ['bin', 1]];
export const STOPS = [[130, 560], [320, 420], [510, 560], [700, 410], [890, 540]];
export const PCOL = { caleb: '#bfe3f5', ezra: '#ffe7a3' };
export const LEVEL_XP = 150;
export const PEN_RANK = ['pen-ice', 'pen-lava', 'pen-stone'];
// ARCADE: a colour for every dino (Dan), in hatching order; bought items can be switched on and off in the shop
export const SKIN_LIST = [
  ['stompy', 'sunny', 'Sunny', 900], ['zippy', 'sunset', 'Sunset', 900], ['tiny', 'candy', 'Candy', 900], ['longneck', 'starry', 'Starry', 1200],
  ['spike', 'ocean', 'Ocean', 900], ['bonk', 'cherry', 'Cherry', 900], ['horns', 'minty', 'Minty', 900], ['rexy', 'gold', 'Golden', 3000],
  ['tank', 'magma', 'Magma', 1200], ['frilly', 'neon', 'Neon', 1200], ['thumbs', 'frost', 'Frosty', 1200], ['sail', 'dusk', 'Sunset', 1200],
  ['honk', 'berry', 'Berry', 1200], ['dash', 'rocket', 'Rocket', 1200], ['chompy', 'jungle', 'Jungle', 1200], ['flappy', 'sky', 'Sky', 1200],
];
export const SHOP = [
  { id: 'pens', label: 'Pens', tint: '#fbe7c9', ink: '#9A5A1E', h: 118, isz: 100, items: [
    { id: 'pen-log', name: 'Log Pen', perk: 'The classic', price: 0, icon: 'piece/pen_s?style=log' },
    { id: 'pen-stone', name: 'Stone Pen', perk: 'Meters fill 15% slower', price: 1200, icon: 'piece/pen_s?style=stone' },
    { id: 'pen-lava', name: 'Lava Rock Pen', perk: 'Meters fill 25% slower', price: 2000, icon: 'piece/pen_s?style=lava' },
    { id: 'pen-ice', name: 'Crystal Pen', perk: 'Meters fill 30% slower', price: 2800, icon: 'piece/pen_s?style=ice' } ] },
  { id: 'treats', label: 'Park treats', tint: '#e6defa', ink: '#5B45A8', h: 118, isz: 100, items: [
    { id: 'treat-balloons', name: 'Balloon Cart', perk: 'Visitors smile more', price: 900, icon: 'item/balloons' },
    { id: 'treat-arch', name: 'Flower Arch', perk: 'A pretty way in', price: 1200, icon: 'item/arch' },
    { id: 'treat-statue', name: 'Rexy Statue', perk: 'Everyone takes photos', price: 1800, icon: 'dino/rexy?pose=roar&skin=gold&stand=%23cfc7b8' },
    { id: 'treat-fireworks', name: 'Fireworks', perk: 'End-of-day show', price: 2400, icon: 'item/fireworks' } ] },
  { id: 'skins', label: 'Dino colours', tint: '#fde2cb', ink: '#A94A18', h: 290, compact: true, items: SKIN_LIST.map(([d, k, adj, price]) => ({ id: 'skin-' + k, dino: d, skin: k, adj, name: '', perk: '', price, icon: 'dino/' + d + '?pose=happy&skin=' + k })) },
];
export const HOW = [
  { title: 'Build', text: 'Tap a piece at the bottom, then tap a glowing spot.', bg: '#dff1d2', num: '#58B84F', pics: [{ k: 'piece/icecream', x: 16, y: 60, s: 120 }, { k: 'piece/tree', x: 170, y: 120, s: 90 }], taps: [{ x: 214, y: 90 }], chips: [{ t: 'Paths join up by themselves', x: 30, y: 250 }] },
  { title: 'Dino Watch', text: 'Every dino has a meter. Tap its food or ball bubble before the meter fills up… or it breaks out!', bg: '#fde2cb', num: '#FF9D3C', pics: [{ k: 'dino/stompy?pose=hungry', x: 30, y: 96, s: 150 }, { k: 'food/leaf', x: 150, y: 24, s: 70 }, { k: 'item/ball', x: 206, y: 90, s: 60 }], taps: [{ x: 186, y: 58 }], chips: [{ t: 'Green → yellow → red!', x: 44, y: 250 }] },
  { title: 'Catch!', text: 'A dino got out? Tap it to throw a net. Big dinos need a few taps.', bg: '#ffd9d4', num: '#FF6B5B', pics: [{ k: 'dino/zippy?pose=escaped', x: 16, y: 70, s: 160 }, { k: 'item/net', x: 170, y: 30, s: 100 }], taps: [{ x: 110, y: 140 }], chips: [{ t: 'Big dinos: 3 taps', x: 118, y: 250 }] },
  { title: 'Hatch eggs', text: 'Put an egg in an empty pen and watch it hatch. Surprise!', bg: '#e6defa', num: '#8B72D8', pics: [{ k: 'item/egg?dino=spike', x: 20, y: 90, s: 110 }, { k: 'dino/spike?pose=happy', x: 120, y: 60, s: 160 }], taps: [{ x: 76, y: 150 }], chips: [] },
  { title: 'Happy visitors', text: 'Snacks, fountains, trees and happy dinos make visitors smile.', bg: '#fff0bf', num: '#E0A21C', pics: [{ k: 'item/visitor?mood=happy&i=2', x: 10, y: 60, s: 110 }, { k: 'item/visitor?mood=okay&i=6', x: 96, y: 80, s: 100 }, { k: 'item/visitor?mood=sad&i=1', x: 176, y: 100, s: 96 }], taps: [], chips: [{ t: 'Keep the happy meter up!', x: 40, y: 250 }] },
  { title: 'Park rating', text: 'Dinos, new kinds, features and happy visitors grow your rating. It never goes down! Reach 3 targets for 3 stars.', bg: '#dcebf7', num: '#4BB4E6', pics: [{ k: 'item/star', x: 20, y: 70, s: 80 }, { k: 'item/star', x: 104, y: 44, s: 90 }, { k: 'item/star', x: 196, y: 70, s: 80 }, { k: 'item/egg?dino=zippy', x: 30, y: 160, s: 60 }, { k: 'item/visitor?mood=happy&i=3', x: 115, y: 150, s: 70 }, { k: 'item/net', x: 204, y: 160, s: 60 }], taps: [], chips: [] },
  { title: 'Coin Jar', text: 'Coins you earn go in your jar. Spend them in the Dino Shop!', bg: '#fbe7c9', num: '#D9982A', pics: [{ k: 'item/jar', x: 20, y: 60, s: 130 }, { k: 'piece/pen_s?style=lava', x: 150, y: 40, s: 110 }, { k: 'item/balloons', x: 150, y: 140, s: 96 }], taps: [], chips: [] },
  { title: '5 parks', text: 'Collect stars to open new parks, from Volcano Island to Snowy Peaks.', bg: '#e8f4e0', num: '#2F7D3B', pics: [{ k: 'land/jungle', x: 0, y: 120, s: 90 }, { k: 'land/volcano', x: 60, y: 40, s: 90 }, { k: 'land/desert', x: 130, y: 120, s: 90 }, { k: 'land/beach', x: 190, y: 40, s: 80 }, { k: 'land/snowy', x: 110, y: 190, s: 70 }], taps: [], chips: [] },
];

// ARCADE: shop treats that turn up as a free tile at the end of the build tray (one of each per day)
// ARCADE: shop prices set so the whole shop costs 31,500 — 21 days at about 1,500 a day (Dan).
// Parks are opened by stars alone, so they're no longer in the shop.
export const TREAT_TILES = { 'treat-balloons': 'balloons', 'treat-statue': 'statue' };
PRICES.balloons = 0; PRICES.statue = 0; FEAT.balloons = 6; FEAT.statue = 15;
export const fmt = n => Math.round(n).toLocaleString('en-GB');
export const STAR = '<svg width="100%" height="100%" viewBox="0 0 24 24"><path d="M12 2.5l2.9 6.2 6.8.8-5 4.7 1.3 6.8L12 17.6 6 21l1.3-6.8-5-4.7 6.8-.8z" fill="#FFC93C" stroke="#D9982A" stroke-width="1.2"/></svg>';
