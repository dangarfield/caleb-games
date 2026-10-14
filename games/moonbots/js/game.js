'use strict';
/* Moonbots: game logic. Art lives in js/art.js, sounds in js/sfx.js. */
const STAGE=document.getElementById('stage');
let K=1;
function fit(){K=Math.min(innerWidth/1333,innerHeight/690);document.documentElement.style.setProperty('--k',K);STAGE.style.setProperty('--k',K);}
addEventListener('resize',fit);addEventListener('load',fit);fit();
document.addEventListener('contextmenu',e=>e.preventDefault());
const $=id=>document.getElementById(id);
const {UP,ACOL,CHAPTERS:CH,ic,nm,botStatic,alienStatic}=ART;
let hushUntil=0; // after the level-complete fanfare, nothing else plays for a moment
const sfx=(n,a,force)=>{ if(!window.SFX) return; if(!force&&performance.now()<hushUntil) return; SFX.play(n,a); };
const rnd=n=>Math.floor(Math.random()*n);
const pick=a=>a[rnd(a.length)];
const CELLS=[[1,1],[1,4],[3,1],[3,4],[2,1],[2,4],[1,2],[1,3]];

/* ================= level data ================= */
// chapter 1: to the moon
const heap=(exp={scrap:20})=>({id:'heap',name:'Scrap Heap',pre:1,out:'scrap',tag:'wheels',exp});
const bin=(cost,exp)=>({id:'bin',name:'Bolt Bin',cost,out:'bolt',tag:'magnet',exp});
const press=(cost,exp)=>({id:'press',name:'Plate Press',cost,in:{scrap:2},out:'plate',tag:'wheels',exp});
const copper=(cost,exp,x)=>Object.assign({id:'copper',name:'Copper Pit',cost,out:'copper',tag:'drill',exp},x);
const spinner=(cost,exp,x)=>Object.assign({id:'spinner',name:'Wire Spinner',cost,in:{copper:2},out:'wire',exp},x);
const sandpit=(cost,exp,x)=>Object.assign({id:'sand',name:'Sand Pit',cost,out:'sand',tag:'drill',exp},x);
const oven=(cost,exp,x)=>Object.assign({id:'oven',name:'Silicon Oven',cost,in:{sand:2},out:'silicon',tag:'wheels',exp},x);
const lith=(cost,exp)=>({id:'lithium',name:'Lithium Mine',cost,out:'lithium',tag:'drill',exp});
const battm=(cost,inp,exp)=>({id:'battmaker',name:'Battery Maker',cost,in:inp,out:'battery',exp});
const titan=(cost,exp)=>({id:'titan',name:'Titanium Mine',cost,out:'titanium',tag:'drill',exp});
const smelter=(cost,exp)=>({id:'smelter',name:'Smelter',cost,in:{titanium:2,scrap:1},out:'alloy',exp});
const oil=(cost,exp)=>({id:'oil',name:'Oil Well',cost,out:'oil',tag:'drill',exp});
const refinery=(cost,exp)=>({id:'refinery',name:'Refinery',cost,in:{oil:2},out:'fuel',exp});
const factory=(cost,inp,exp)=>({id:'factory',name:'Bot Factory',kind:'factory',cost,in:inp,cycle:15,exp});
const shed=cost=>({id:'shed',name:'Charging Shed',kind:'shed',cost});
const LEVELS1=[
 {nw:'Drag bots into slots to work!',bots:3,
  b:[heap(),press({scrap:20,bolt:10},{plate:20}),bin({scrap:10},{scrap:15,bolt:10}),shed({plate:15,bolt:10})],
  goal:[{scrap:50,bolt:30},{plate:40}]},
 {nw:'Red slot? Feed it more!',bots:4,
  b:[heap(),copper({scrap:30,plate:10},{plate:20}),bin({scrap:10},{scrap:20}),spinner({plate:20},{wire:20}),press({scrap:20,bolt:10},{plate:20}),
     {id:'welder',name:'Welder',cost:{plate:30,wire:20},in:{plate:1,bolt:1},out:'hull',tag:'magnet',exp:{hull:20}},shed({plate:20,wire:20})],
  goal:[{hull:30},{wire:40,hull:20}]},
 {nw:'Upgrade your bots!',bots:5,
  b:[heap(),copper({scrap:20},{plate:20}),bin({scrap:10},{scrap:20}),oil({scrap:30,bolt:20},{plate:20}),press({scrap:20,bolt:10},{plate:20}),
     refinery({copper:20,bolt:20},{fuel:20}),
     {id:'bay',name:'Upgrade Bay',kind:'upgrade',cost:{plate:20,copper:20},cycle:20,recipes:[{up:'drill',in:{copper:5}},{up:'magnet',in:{bolt:5,copper:5}},{up:'wheels',in:{plate:5,bolt:5}}]}],
  goal:[{plate:40},{fuel:40}]},
 {nw:'Make new bots!',bots:[{up:'drill'},{up:'wheels'},{},{}],
  b:[heap(),copper({scrap:20},{plate:20}),press({scrap:20},{plate:20}),spinner({plate:20},{wire:20}),lith({plate:30},{wire:20}),
     battm({wire:20,plate:20},{lithium:1,wire:1},{battery:10}),factory({plate:30,battery:10},{plate:3,wire:2,battery:1},{battery:20})],
  goal:[{_bots:10},{plate:40,wire:20}]},
 {nw:'Two bots in a maker make one shiny bot!',bots:6,noExp:1,
  b:[heap(),titan({scrap:30,bolt:20}),bin({scrap:10}),smelter({titanium:30}),
     {id:'welder',name:'Welder',cost:{alloy:20},in:{alloy:1,bolt:1},out:'nozzle',tag:'magnet'},
     factory({alloy:20,bolt:20},{scrap:4,bolt:2,alloy:1}),
     {id:'silver',name:'Silver Bot Maker',kind:'merger',unlock:1,lvIn:1,cycle:5},{id:'gold',name:'Gold Bot Maker',kind:'merger',unlock:1,lvIn:2,cycle:5}],
  goal:[{nozzle:30},{_lv3:1,alloy:40}]},
 {nw:'Hot steel cools to slag. Be quick!',bots:[{up:'drill'},{up:'drill'},{},{},{},{}],merge:1,molten:1,
  b:[heap(),{id:'iron',name:'Iron Mine',cost:{scrap:20},out:'ore',tag:'drill',exp:{scrap:20}},
     {id:'furnace',name:'Furnace',cost:{scrap:30},in:{ore:2,scrap:1},out:'molten',exp:{beam:10}},
     {id:'caster',name:'Caster',cost:{scrap:20},in:{molten:1},out:'beam',exp:{beam:10}},
     sandpit({scrap:10},{beam:10}),
     {id:'kiln',name:'Glass Kiln',cost:{beam:10},in:{sand:2,molten:1},out:'glass',tag:'wheels',exp:{glass:10}},
     {id:'recycler',name:'Slag Recycler',cost:{beam:10},in:{slag:2},out:'scrap'}],
  goal:[{beam:30},{glass:20},{molten:10}]},
 {nw:'Day and night! Lamps help at night.',bots:[{up:'magnet'},{up:'wheels'},{},{},{},{}],merge:1,day:1,
  b:[Object.assign(sandpit(null,{sand:20}),{pre:1}),oven({sand:20},{silicon:20},{time:'day'}),copper({sand:20},{silicon:20},{time:'night'}),
     spinner({copper:20},{wire:20},{time:'night'}),
     {id:'printer',name:'Cell Printer',cost:{silicon:20},in:{silicon:1,copper:1},out:'cell',tag:'magnet',time:'day',exp:{cell:10}},
     {id:'lamps',name:'Lamp Works',cost:{wire:20},in:{wire:1,silicon:1},out:'lamp',time:'night'}],
  goal:[{cell:30},{wire:30,lamp:10}]},
 {nw:'Drag a belt from a stack to a slot!',bots:5,belts:3,beltOnly:1,merge:1,
  b:[Object.assign(copper(null,{copper:20}),{pre:1}),sandpit({copper:10},{copper:20}),oven({sand:20},{silicon:20}),spinner({copper:20},{wire:20}),
     {id:'chipfab',name:'Chip Fab',cost:{silicon:20,wire:20},in:{silicon:1,wire:1},out:'chip',tag:'magnet',exp:{chip:10}},
     {id:'boards',name:'Board Assembler',cost:{chip:20},in:{chip:2,wire:1},out:'board',exp:{board:10}},
     {id:'depot',name:'Belt Depot',cost:{wire:20},in:{copper:5},out:'belt'}],
  goal:[{board:20},{_handsfree:60,_beltRes:'board'}]},
 {nw:'Flat bots need a charge!',bots:6,merge:1,battery:1,
  b:[{id:'charger',name:'Charger',kind:'charger',pre:1,cycle:15},{id:'clay',name:'Clay Pit',pre:1,out:'clay',tag:'drill',exp:{clay:20}},
     lith({clay:20},{tile:20}),
     {id:'tilekiln',name:'Tile Kiln',cost:{clay:20},in:{clay:2},out:'tile',tag:'wheels',exp:{tile:20}},
     copper({clay:20},{tile:20}),battm({tile:20,copper:10},{lithium:1,copper:1},{battery:10}),
     {id:'super',name:'Supercharger',kind:'super',cost:{battery:10},cycle:5}],
  goal:[{tile:40},{tile:30,battery:10}]},
 {nw:'Meteors! Drop a bot to fix.',bots:[{up:'drill'},{up:'magnet'},{up:'wheels'},{lv:2},{},{},{},{}],belts:3,beltOnly:1,merge:1,meteors:1,
  b:[heap(),titan({scrap:20},{scrap:20}),smelter({titanium:30},{alloy:20}),oil({alloy:20},{alloy:20}),refinery({alloy:20},{fuel:20}),
     {id:'hut',name:'Repair Hut',kind:'upgrade',cost:{alloy:20},cycle:15,recipes:[{up:'jet',in:{alloy:3,fuel:2}}]},
     {id:'dome',name:'Shield Dome',kind:'shield',cost:{alloy:30,fuel:10}}],
  goal:[{alloy:40},{fuel:40},{fuel:20,_allpad:1}]}
];
// chapter 2: moon city
const quarry={id:'quarry',name:'Rock Quarry',pre:1,out:'rock',tag:'drill',exp:{rock:20}};
const iceD=(cost,x)=>Object.assign({id:'ice',name:'Ice Drill',cost,out:'ice',tag:'drill',exp:{rock:20}},x);
const melter=(cost,x)=>Object.assign({id:'melter',name:'Ice Melter',cost,in:{ice:2},out:'water',exp:{water:20}},x);
const kilnB=(cost,x)=>Object.assign({id:'brick',name:'Brick Kiln',cost,in:{rock:2,water:1},out:'brick',tag:'wheels',exp:{brick:20}},x);
const glassW=(cost,x)=>Object.assign({id:'glassw',name:'Glass Works',cost,in:{rock:2,water:1},out:'glass',exp:{glass:10}},x);
const lightsW=cost=>({id:'lights',name:'Light Works',cost,in:{glass:1,water:1},out:'lamp',exp:{lamp:10}});
const LEVELS2=[
 {nw:'Supply crates land! Drop a bot on one to open it.',bots:3,crates:1,
  b:[quarry,iceD({rock:15}),melter({rock:20}),kilnB({rock:20,water:10})],goal:[{brick:30},{water:30,brick:20}],
  crateLoot:[{rock:15},{ice:10},{brick:5},{rock:10,ice:6},{water:8}]},
 {nw:'Stacks get FULL at 20. Build a Silo for more room!',bots:4,cap:20,
  b:[quarry,iceD({rock:15}),melter({rock:20}),{id:'pipes',name:'Pipe Works',cost:{rock:20,water:10},in:{rock:1,water:1},out:'pipe',exp:{pipe:10}},
     {id:'silo',name:'Silo',kind:'silo',cost:{rock:30,ice:20}}],
  goal:[{water:40},{pipe:20,water:20}]},
 {nw:'Plant seeds, wait, then TAP to harvest!',bots:4,
  b:[quarry,iceD({rock:15}),melter({rock:20}),{id:'seeds',name:'Seed Lab',cost:{rock:20},in:{water:1},out:'seed',exp:{seed:20}},
     {id:'planter',name:'Planter',kind:'planter',cost:{rock:30,water:10},in:{seed:1,water:1},out:'veg',grow:12},
     {id:'kitchen',name:'Moon Kitchen',cost:{veg:10},in:{veg:2,water:1},out:'meal',exp:{meal:10}}],
  goal:[{veg:30},{meal:15}]},
 {nw:'Power! Tap a switch to turn buildings on or off.',bots:5,power:1,
  b:[quarry,{id:'panel',name:'Solar Panel',kind:'power',pre:1,gen:2},iceD({rock:15},{pw:1}),melter({rock:20},{pw:1}),kilnB({rock:20,water:10},{pw:1}),
     {id:'panel2',name:'Big Panel',kind:'power',cost:{brick:15},gen:3},glassW({brick:10},{pw:1})],
  goal:[{brick:30,glass:10},{glass:30}]},
 {nw:'Moonies want things! Fill orders to earn coins.',bots:5,
  b:[quarry,iceD({rock:15}),melter({rock:20}),kilnB({rock:20,water:10}),
     {id:'market',name:'Moonie Market',kind:'orders',cost:{brick:10},pool:['rock','ice','water','brick'],outs:['coin']}],
  goal:[{coin:15,brick:20},{coin:30}]},
 {nw:'Hot buildings! Drop ice to cool them down.',bots:5,
  b:[{id:'vent',name:'Lava Vent',pre:1,out:'ore',tag:'drill',exp:{ore:20}},iceD({ore:10},{exp:{beam:10}}),
     {id:'mill',name:'Steel Mill',cost:{ore:20},in:{ore:2},out:'beam',hot:1,exp:{beam:10}},
     {id:'gears',name:'Gear Shop',cost:{beam:10},in:{beam:1,ore:1},out:'gear',hot:1,tag:'magnet',exp:{gear:10}}],
  goal:[{beam:30},{gear:20,beam:20}]},
 {nw:'Parks make the buildings next to them work ×2!',bots:6,
  b:[quarry,iceD({rock:15}),melter({rock:20}),kilnB({rock:20,water:10}),
     {id:'trees',name:'Tree Farm',cost:{water:10},out:'sapling',tag:'drill',exp:{sapling:20}},glassW({brick:10}),
     {id:'park1',name:'Little Park',kind:'park',cost:{sapling:10,water:10}},{id:'park2',name:'Big Park',kind:'park',cost:{sapling:20,brick:10}}],
  goal:[{brick:30,sapling:10},{glass:20,brick:20}]},
 {nw:'Moonquakes spill stacks! Tap the bubbles to grab them.',bots:6,quakes:1,
  b:[quarry,iceD({rock:15}),melter({rock:20}),kilnB({rock:20,water:10}),glassW({brick:10}),
     {id:'toys',name:'Toy Shop',cost:{brick:20,glass:10},in:{glass:1,brick:1},out:'toy',tag:'magnet',exp:{toy:10}}],
  goal:[{toy:15},{brick:30,glass:20}]},
 {nw:'Tour bus! Visitors help out for 30 seconds.',bots:4,tourists:1,
  b:[quarry,iceD({rock:15}),melter({rock:20}),kilnB({rock:20,water:10}),glassW({brick:10}),lightsW({glass:10})],
  goal:[{brick:40,glass:20},{lamp:20}]},
 {nw:'Send signals! Drop items in the order shown.',bots:6,
  b:[quarry,iceD({rock:15}),melter({rock:20}),glassW({rock:20}),lightsW({glass:10}),kilnB({rock:20,water:10}),
     {id:'dish',name:'Signal Dish',kind:'signal',cost:{lamp:10,glass:10},pool:['rock','ice','water','glass','lamp','brick']}],
  goal:[{lamp:30},{_signals:3}]}
];
// chapter 3: home again (doors: a = arch for bots, r = round for aliens, r:col = that colour only)
const crash={id:'crash',name:'Crash Site',pre:1,out:'scrap',doors:['a','a'],exp:{scrap:20}};
const gooP={id:'goo',name:'Goo Pool',pre:1,out:'goo',doors:['r','r'],exp:{goo:20}};
const cave=cost=>({id:'cave',name:'Crystal Cave',cost,out:'crystal',doors:['a','a'],exp:{crystal:20}});
const sparkC={id:'sparks',name:'Spark Coil',cost:{crystal:10,goo:10},in:{crystal:1,goo:1},out:'spark',doors:['a','r'],team:1,exp:{spark:10}};
const fruitT={id:'fruit',name:'Fruit Tree',cost:{goo:10},out:'fruit',doors:['r','r'],exp:{fruit:20}};
const crew=(nb,al)=>Array.from({length:nb},()=>({})).concat(al.map(c=>({alien:c})));
const RGB=['pink','green','blue'];
const LEVELS3=[
 {nw:'Aliens! Round doors for aliens, arch doors for bots.',bots:crew(3,['pink','blue']),
  b:[crash,gooP,cave({goo:15}),{id:'padp',name:'Pad Press',cost:{crystal:10,scrap:10},in:{goo:1,crystal:1},out:'padtile',doors:['a','r'],exp:{padtile:10}}],
  goal:[{crystal:20,scrap:20},{padtile:20}]},
 {nw:'TEAM doors need a bot AND an alien together!',bots:crew(3,['pink','green']),
  b:[crash,gooP,cave({goo:15}),sparkC,{id:'coreforge',name:'Core Forge',cost:{spark:10},in:{spark:2,scrap:1},out:'core',doors:['a','r'],team:1,exp:{core:10}}],
  goal:[{spark:20},{core:15}]},
 {nw:'Coloured doors only fit an alien of that colour!',bots:crew(3,RGB),
  b:[crash,{id:'berry',name:'Berry Bush',pre:1,out:'fruit',doors:['r:pink','r:pink'],exp:{fruit:20}},
     {id:'mossp',name:'Moss Patch',cost:{scrap:15},out:'moss',doors:['r:green','r:green'],exp:{moss:20}},
     {id:'bubbles',name:'Bubble Spring',cost:{fruit:15},out:'bubble',doors:['r:blue','r:blue'],exp:{bubble:20}},
     {id:'ringb',name:'Ring Bender',cost:{fruit:10,moss:10},in:{bubble:1,scrap:1},out:'ring',doors:['a','r:blue'],exp:{ring:10}}],
  goal:[{ring:20},{fruit:20,moss:20}]},
 {nw:'Aliens get hungry! Drop a snack on them.',bots:crew(3,RGB),hunger:1,
  b:[crash,gooP,fruitT,{id:'snackbar',name:'Snack Bar',cost:{fruit:10},in:{fruit:1,goo:1},out:'snack',doors:['a','a'],exp:{snack:10}},cave({goo:15}),
     {id:'lensg',name:'Lens Grinder',cost:{crystal:20},in:{crystal:2},out:'lens',doors:['a','r'],team:1,exp:{lens:10}}],
  goal:[{lens:15},{lens:10,snack:10}]},
 {nw:'Wobbly doors swap shape! Move your workers.',bots:crew(3,RGB),
  b:[crash,gooP,{id:'wmine',name:'Wobble Mine',cost:{goo:10},out:'crystal',doors:['a','r'],wobble:1,exp:{crystal:20}},
     {id:'buttons',name:'Button Maker',cost:{crystal:10},in:{crystal:1,goo:1},out:'button',doors:['a','r'],wobble:1,exp:{button:10}},
     {id:'panelw',name:'Panel Works',cost:{button:10,scrap:20},in:{button:2,scrap:1},out:'panel',doors:['a','r'],team:1,exp:{panel:10}}],
  goal:[{button:20},{panel:15}]},
 {nw:'Keep the nest warm with sparks to hatch aliens!',bots:crew(3,['pink','blue']),
  b:[crash,gooP,cave({goo:15}),sparkC,{id:'nest',name:'Egg Nest',kind:'nest',cost:{goo:20,crystal:10},cycle:15},
     {id:'rig',name:'Antenna Rig',cost:{scrap:20,spark:10},in:{scrap:1,spark:1},out:'rod',doors:['r','r','r']}],
  goal:[{_aliens:6},{rod:20}]},
 {nw:'The Copy Machine makes 2 of whatever you put in!',bots:crew(3,RGB),
  b:[crash,gooP,cave({goo:15}),{id:'copier',name:'Copy Machine',kind:'copier',cost:{crystal:20,goo:20},doors:['a','r'],team:1,cycle:6},
     {id:'coilw',name:'Coil Winder',cost:{scrap:20},in:{crystal:2,scrap:2},out:'coil',doors:['a','r'],exp:{coil:10}}],
  goal:[{coil:20},{crystal:60}]},
 {nw:'Swap with the Alien Trader! Offers change often.',bots:crew(3,RGB),
  b:[crash,gooP,fruitT,cave({goo:15}),
     {id:'trader',name:'Alien Trader',kind:'trade',pre:1,gives:['scrap','goo','crystal','fruit'],gets:['stardust','stardust','stardust','crystal'],outs:['stardust','crystal']},
     {id:'mapm',name:'Map Maker',cost:{stardust:10},in:{stardust:2,crystal:1},out:'starmap',doors:['a','r'],team:1,exp:{starmap:10}}],
  goal:[{stardust:30},{starmap:15}]},
 {nw:'Mix two paints to make a new colour!',bots:crew(3,RGB),
  b:[{id:'redb',name:'Red Berries',pre:1,out:'pred',doors:['r:pink','a'],exp:{pred:20}},{id:'bluep',name:'Blue Pool',pre:1,out:'pblue',doors:['r:blue','a'],exp:{pblue:20}},
     {id:'yellowf',name:'Sun Flowers',cost:{pred:10,pblue:10},out:'pyellow',doors:['r:green','a'],exp:{pyellow:20}},
     {id:'mixer',name:'Paint Mixer',kind:'mixer',cost:{pred:15,pblue:15},doors:['a','r'],team:1,
      recipes:[{in:{pred:1,pblue:1},out:'ppurple'},{in:{pred:1,pyellow:1},out:'porange'},{in:{pblue:1,pyellow:1},out:'pgreen'}]},
     {id:'balloons',name:'Balloon Blower',cost:{ppurple:10},in:{ppurple:1},out:'balloon',doors:['r','r'],exp:{balloon:10}},
     {id:'cakes',name:'Cake Oven',cost:{porange:10},in:{porange:1},out:'cake',doors:['a','a'],exp:{cake:10}}],
  goal:[{balloon:20},{cake:15,pgreen:15}]},
 {nw:'Keep the teleporter charged, then everyone to the pad!',bots:crew(4,['pink','green','blue','pink']),
  b:[crash,gooP,cave({goo:15}),sparkC,{id:'tele',name:'Teleporter',kind:'charge',cost:{spark:20,crystal:20}}],
  goal:[{spark:30},{_charge:30},{_allpad:1}]}
];
const LV=[LEVELS1,LEVELS2,LEVELS3];

/* ================= save ================= */
const Store=ArcadeStore('moonbots');
const SID=Math.random().toString(36).slice(2,8)+Date.now().toString(36).slice(-4);
let gen=0;
let DATA={profiles:{caleb:{done:{}},ezra:{done:{}}},settings:{sfx:80,mus:60},player:'caleb'};
function save(){ if(Store.conflict()) return false; gen++; Store.set(null,Object.assign({},DATA,{gen,sid:SID}),{guard:true}); return true; }
const prof=()=>DATA.profiles[DATA.player];
const dk=(ci,i)=>ci===0?String(i):`${ci+1}-${i}`;
const doneP=(pk,ci,i)=>!!DATA.profiles[pk].done[dk(ci,i)];
const isDone=(ci,i)=>doneP(DATA.player,ci,i);
const doneArr=ci=>CH[ci].levels.map((_,i)=>isDone(ci,i));
const chDone=ci=>doneArr(ci).every(Boolean);
const chOpen=ci=>ci===0||chDone(ci-1);

/* ================= audio ================= */
const level=v=>(v/100)**2; let actx,sounds,music;
function ensureAudio(){ if(!actx){ actx=new (window.AudioContext||window.webkitAudioContext)(); sounds=actx.createGain(); music=actx.createGain();
  sounds.gain.value=level(DATA.settings.sfx); music.gain.value=level(DATA.settings.mus); sounds.connect(actx.destination); music.connect(actx.destination);
  if(window.SFX) SFX.bind(actx,sounds); }
  if(actx.state==='suspended') actx.resume(); return actx; }
addEventListener('pointerup',()=>{ ensureAudio(); musicFor(); },{once:true});

/* ================= music: one looping track per chapter, cross-faded ================= */
const MUSIC_SRC=ci=>{ const n=ci==='end'?'chapter-end':`chapter-${ci+1}`; return [`music/${n}.webm`]; };
const FADE=1.6, MT={}; let musWant=null, musCur=null;
function track(ci){
  if(MT[ci]) return MT[ci];
  const el=new Audio(), t={el,g:null,bad:false,k:0}; el.loop=true; el.preload='auto';
  const srcs=MUSIC_SRC(ci); el.src=srcs[0];
  el.addEventListener('error',()=>{ t.k++; if(t.k<srcs.length){ el.src=srcs[t.k]; if(musCur===ci) el.play().catch(()=>{}); return; }
    t.bad=true; if(musCur===ci){ musCur=null; playMusic(musWant); } });
  t.g=actx.createGain(); t.g.gain.value=0; actx.createMediaElementSource(el).connect(t.g); t.g.connect(music);
  return MT[ci]=t;
}
function playMusic(ci){
  musWant=ci; if(!actx||ci==null) return;
  let use=ci; if(track(use).bad) use=[0,1,2].find(c=>!track(c).bad); if(use==null||use===musCur) return;
  const now=actx.currentTime;
  if(musCur!=null){ const o=MT[musCur]; o.g.gain.cancelScheduledValues(now); o.g.gain.setValueAtTime(o.g.gain.value,now); o.g.gain.linearRampToValueAtTime(0,now+FADE);
    const oc=musCur; setTimeout(()=>{ if(musCur!==oc) o.el.pause(); },FADE*1000+100); }
  const n=track(use); n.g.gain.cancelScheduledValues(now); n.g.gain.setValueAtTime(n.g.gain.value,now); n.g.gain.linearRampToValueAtTime(1,now+FADE);
  musCur=use; n.el.play().catch(()=>{});
}
function musicFor(){ const ci=SCREEN==='home'?0:SCREEN==='map'?MAPCH:SCREEN==='intro'?pending.ci:SCREEN==='finale'?'end':SCREEN==='game'?(S?S.ci:0):0; playMusic(ci); }
document.addEventListener('visibilitychange',()=>{ if(musCur==null) return; const el=MT[musCur].el; if(document.hidden) el.pause(); else el.play().catch(()=>{}); });

/* ================= screens ================= */
let SCREEN='home';
function show(id){ ['home','map','intro','game','finale'].forEach(s=>$(s).classList.toggle('hidden',s!==id)); SCREEN=id; if(actx) musicFor(); }
function pips(pk,col){ return '<div style="display:flex;flex-direction:column;gap:3px">'+[0,1,2].map(ci=>'<div style="display:flex;gap:3px">'+CH[ci].levels.map((_,i)=>`<div style="width:8px;height:8px;background:${doneP(pk,ci,i)?col:'#cdbb98'}"></div>`).join('')+'</div>').join('')+'</div>'; }
function renderHome(){
  const d0=CH[0].parts.map((_,i)=>doneP(DATA.player,0,i)); const idx=[0,4,1,3,2,6,8,5,7,9].filter(i=>i===0||d0[i]);
  $('homeRocket').innerHTML=ART.sceneLayers(0,idx,3.6,'left:250px;bottom:96px');
  const nb=5+[1,2].filter(ci=>chDone(ci-1)).length; let hb=''; for(let k=0;k<nb;k++) hb+=`<div class="m">${k<5?botStatic({lv:k===0&&chDone(0)?3:1}):alienStatic({col:['pink','green'][k-5]})}</div>`; $('homeBots').innerHTML=hb;
  const P=[['caleb','CALEB','#d9541e'],['ezra','EZRA','#1d8b7e']];
  $('profiles').innerHTML=P.map(([k,n,c])=>`<div data-act="player:${k}" style="width:220px;height:160px;background:#f1e7d0;border:5px solid #2b1d14;border-radius:14px;box-shadow:0 7px 0 #2b1d14${DATA.player===k?',0 0 0 6px #ffd23f,0 7px 0 6px #ffd23f':''};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;cursor:pointer">
   <div style="transform:scale(1.5);margin-bottom:8px">${botStatic({c})}</div><div class="pf" style="font-size:18px">${n}</div>${pips(k,c)}</div>`).join('')+
   `<div data-act="play" style="width:220px;height:160px;background:#3f9b4a;border:5px solid #2b1d14;border-radius:14px;box-shadow:0 7px 0 #2b1d14;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;cursor:pointer;color:#fff">
   <span class="tri" style="border-top-width:26px;border-bottom-width:26px;border-left-width:40px"></span><div class="pf" style="font-size:20px;text-shadow:0 3px 0 #2b1d14">PLAY</div></div>`;
}
let MAPCH=0;
const MAPPOS=[[150,560],[330,480],[220,330],[390,210],[590,300],[720,460],[900,540],[1030,390],[900,230],[1110,150]];
const mapPos=(ci,i)=>{ const [x,y]=MAPPOS[i]; return ci===1?[1333-x,y]:ci===2?[x,730-y]:[x,y]; };
function renderMap(){
  const c=CH[MAPCH], m=$('map'); m.className='scr '+c.pattern; m.style.backgroundColor=c.mapBg;
  $('mapDeco').innerHTML=MAPCH===0?'<div class="moon" style="top:24px;right:36px;width:120px;height:120px"></div>'
    :MAPCH===1?'<div class="earthb" style="top:30px;left:200px"></div>'
    :'<div class="earthb" style="top:40px;right:60px;width:60px;height:60px"></div><div class="ringpl" style="top:470px;left:40px"></div>';
  const pts=CH[MAPCH].levels.map((_,i)=>mapPos(MAPCH,i).join(',')).join(' ');
  $('mapPath').innerHTML=`<polyline points="${pts}" fill="none" stroke="#2b1d14" stroke-width="10" stroke-dasharray="4 14" stroke-linecap="round" opacity=".55"/>`;
  const next=c.levels.findIndex((_,i)=>!isDone(MAPCH,i));
  $('nodes').innerHTML=c.levels.map((L,i)=>{const [x,y]=mapPos(MAPCH,i); const d=isDone(MAPCH,i); const open=chOpen(MAPCH)&&(i===0||isDone(MAPCH,i-1)); const cls=d?'done':(i===next&&open?'next':(open?'':'lock'));
    return `<div class="node ${cls}" style="left:${x}px;top:${y}px" ${open?`data-act="lvl:${i}"`:''}>${d?'✓':i+1}</div>
    <div class="nl" style="left:${x}px;top:${y}px">${L.name}<small>${c.parts[i].n}</small></div>`;}).join('');
  $('chTabs').innerHTML=CH.map((ch,ci)=>`<div class="tab${ci===MAPCH?' on':''}${chOpen(ci)?'':' lock'}" ${chOpen(ci)?`data-act="ch:${ci}"`:''}><span class="n">${ci+1}</span>${ch.title.toUpperCase()}${chDone(ci)?' ✓':''}</div>`).join('');
  $('who').innerHTML=`${botStatic({c:DATA.player==='caleb'?'#d9541e':'#1d8b7e'})}<span class="pf" style="font-size:14px">${DATA.player.toUpperCase()}</span>`;
}
let pending={ci:0,i:0};
function renderIntro(ci,i){
  pending={ci,i}; const L=CH[ci].levels[i];
  $('inCh').textContent=`CHAPTER ${ci+1} · ${CH[ci].title.toUpperCase()}`;
  $('inTitle').innerHTML=`<span style="color:#c42f4a">${i+1}</span> · ${L.name.toUpperCase()}`;
  $('inNew').textContent=LV[ci][i].nw;
  $('inPart').innerHTML=`${ART.partTile(ci,i)}${CH[ci].parts[i].n}`;
  show('intro');
}

/* ================= level runtime ================= */
const BASE_SPEED=2; // everyday game speed (×1 felt too slow for the boys)
let S=null, DEBUG=BASE_SPEED;
const holder=()=>({amt:{},heat:{}});
function put(h,r,n,heats){ if(n<=0) return; h.amt[r]=(h.amt[r]||0)+n; if(r==='molten'){ const a=h.heat.molten||(h.heat.molten=[]); if(heats) a.push(...heats); else for(let k=0;k<n;k++) a.push(S.t+20); a.sort((x,y)=>x-y);} }
function take(h,r,n){ n=Math.min(n,h.amt[r]||0); h.amt[r]=(h.amt[r]||0)-n; let heats=null; if(r==='molten'&&h.heat.molten) heats=h.heat.molten.splice(0,n); return {n,heats}; }
const BOT=id=>S.bots.find(b=>b.id===id);
const isAlien=w=>w&&w.kind==='alien';
function addWorker(o={}){ const w={id:S.nextBot++,kind:o.alien?'alien':'bot',col:o.alien||null,lv:o.lv||1,up:o.up||null,prog:0,cap:60,charge:60,big:false,food:40,loc:{t:'pad'},upT:null,tour:!!o.tour,temp:o.temp||0}; S.bots.push(w); return w; }
const NOSLOT=['shed','shield','silo','power','orders','park','signal','nest','trade','charge'];
const FAC=['shed','upgrade','factory','charger','super','shield','merger','silo','power','orders','park','signal','nest','copier','trade','mixer','charge'];
function famOf(d){ return FAC.includes(d.kind)?'fac':(d.in||d.kind==='planter'?'conv':'ext'); }
function doorsOf(b){ const d=b.d; if(!d.doors) return null; return b.lv===2?d.doors.concat(d.doors):d.doors; }
function slotCount(b){ const k=b.d.kind; if(NOSLOT.includes(k)) return 0; const ds=doorsOf(b); if(ds) return ds.length; if(k==='super') return 4; if(k==='charger') return 2; return b.lv===2?4:2; }
function doorAt(b,i){ const ds=doorsOf(b); let x=ds?(ds[i]||'a'):'a'; if(b.d.wobble&&b.wob) x=x[0]==='a'?'r':'a'; return x; }
function fits(w,door){ if(door==='s') return true; if(door[0]==='a') return w.kind==='bot'; return w.kind==='alien'&&(door.length<3||w.col===door.slice(2)); }
function teamOk(b){ let hb=false,ha=false; b.slots.forEach((id,i)=>{ const w=id!=null&&BOT(id); if(!w||!fits(w,doorAt(b,i))||(isAlien(w)&&S.L.hunger&&w.food<=0)) return; if(isAlien(w)) ha=true; else hb=true; }); return hb&&ha; }
const BELT_MAX=3;
const beltsTotal=()=>S.tray+S.belts.length;
const CAP=Infinity;
const capOf=()=>S.L.cap?(S.b.some(b=>b.d.kind==='silo'&&b.built)?60:S.L.cap):Infinity;
const powerCap=()=>S.b.reduce((s,b)=>s+(b.built&&b.d.kind==='power'?b.d.gen:0),0);
const powerUsed=()=>S.b.filter(b=>b.built&&b.d.pw&&b.on).length;
const adj=(a,b)=>a!==b&&Math.abs(a.cell[0]-b.cell[0])<=1&&Math.abs(a.cell[1]-b.cell[1])<=1;
const parkBoost=b=>b.d.kind!=='park'&&S.b.some(p=>p.d.kind==='park'&&p.built&&adj(p,b))?2:1;
const copyRes=b=>Object.keys(b.inb.amt).find(r=>b.inb.amt[r]>0);

function startLevel(ci,i){
  const L=Object.assign({},CH[ci].levels[i],LV[ci][i]);
  S={ci,i,L,t:0,bots:[],nextBot:1,b:[],pile:holder(),goalStage:0,goalPaid:{},belts:[],tray:L.belts||0,phase:'day',phaseT:40,metT:20,hf:0,lastBeltT:-99,
     drag:null,paused:false,done:false,cache:{},crates:[],crateT:6,spills:[],quakeT:25,busT:12,signals:0,chargeT:0,wobT:20,nextObj:1,toldWob:false};
  const bl=typeof L.bots==='number'?Array.from({length:L.bots},()=>({})):L.bots;
  bl.forEach(o=>addWorker(o));
  L.b.forEach((d,k)=>{ if(d.kind==='mixer'&&!d.outs) d.outs=d.recipes.map(x=>x.out);
    const b={d,id:k,cell:CELLS[k],built:!!d.pre,lv:1,paid:{},ep:{},out:holder(),inb:holder(),slots:[],recipe:0,lampUntil:0,cracked:false,repair:null,shadowUntil:0,done:false,heat:0,over:false,on:true,wob:false};
    b.slots=Array(slotCount(b)).fill(null); S.b.push(b); });
  S.b.forEach(b=>{ if(b.built) onBuilt(b,false); });
  const g=$('grid'); g.innerHTML='';
  S.cellEls=S.b.map(b=>{const c=document.createElement('div'); c.className='cell'; c.style.gridRow=b.cell[0]; c.style.gridColumn=b.cell[1]; g.appendChild(c); return c;});
  S.plotEl=document.createElement('div'); S.plotEl.className='cell'; S.plotEl.style.gridRow='2'; S.plotEl.style.gridColumn='2 / span 2'; g.appendChild(S.plotEl);
  if(L.day){ S.dnEl=document.createElement('div'); S.dnEl.className='cell'; S.dnEl.style.gridRow='1'; S.dnEl.style.gridColumn='2 / span 2'; g.appendChild(S.dnEl); } else S.dnEl=null;
  S.goalEl=document.createElement('div'); S.goalEl.className='cell'; S.goalEl.style.gridRow='3'; S.goalEl.style.gridColumn='2 / span 2'; g.appendChild(S.goalEl);
  updateReveal(false);
  $('game').className='scr '+CH[ci].pattern; $('game').style.backgroundColor=L.bg;
  $('night').style.opacity=0;
  $('pause').classList.add('hidden'); $('done').classList.add('hidden');
  show('game'); render();
  if(ci===0&&i===0) setTimeout(()=>{ if(S&&S.ci===0&&S.i===0&&!S.done) tutStart(); },500); else $('tut').classList.add('hidden');
}
function onBuilt(b,live){
  const d=b.d; b.slots=Array(slotCount(b)).fill(null);
  if(d.kind==='shed'){ addWorker(); addWorker(); b.done=true; }
  if(d.pw){ b.on=false; b.on=powerUsed()<powerCap(); }
  if(d.kind==='planter') b.pots=[-1,-1,-1,-1];
  if(d.kind==='orders') b.orders=[newOrder(b),newOrder(b)];
  if(d.kind==='signal') newSeq(b);
  if(d.kind==='trade') newOffer(b);
  if(d.kind==='nest'){ b.temp=0.6; b.egg=0; }
  if(d.kind==='charge') b.ch=0.4;
  if(d.kind==='power'&&live) S.b.forEach(x=>{ if(x.built&&x.d.pw&&!x.on&&powerUsed()<powerCap()) x.on=true; });
}
function newOrder(b){ const can=canMakeSet(); const pool=b.d.pool.filter(r=>can.has(r)); const r=pick(pool.length?pool:b.d.pool); const n=4+rnd(5); return {r,n,p:0,coins:Math.ceil(n/3)+1}; }
function newSeq(b){ const can=canMakeSet(); const pool=b.d.pool.filter(r=>can.has(r)); const P=pool.length?pool:b.d.pool; b.seq=[pick(P),pick(P),pick(P)]; b.pos=0; }
function newOffer(b){ const can=canMakeSet(); const g=b.d.gives.filter(r=>can.has(r)); const give=pick(g.length?g:b.d.gives); let get=pick(b.d.gets); if(get===give) get='stardust';
  const gn=6+rnd(5); b.offer={give,gn,paid:0,get,qn:get==='stardust'?4:Math.ceil(gn/2),t:25}; }

/* reveal: a blueprint only shows once you can make everything it costs and uses */
function canMakeSet(){
  const s=new Set();
  for(const b of S.b){ if(!b.built) continue; const d=b.d; if(d.out&&d.out!=='belt') s.add(d.out); (d.outs||[]).forEach(r=>s.add(r)); if(d.id==='furnace') s.add('slag'); }
  for(const r in S.pile.amt) if(S.pile.amt[r]>0) s.add(r);
  return s;
}
function updateReveal(anim){
  let s=null;
  for(const b of S.b){
    if(b.built||b.revealed||b.d.unlock!=null||!b.d.cost) continue;
    s=s||canMakeSet();
    const need=[...Object.keys(b.d.cost),...Object.keys(b.d.in||{})];
    if(need.every(r=>s.has(r))){ b.revealed=true; if(anim) b.newUntil=S.t+1.2; }
  }
}

/* ================= simulation ================= */
const stageMult=()=>1+0.1*S.goalStage;
function active(b){ const d=b.d; if(d.pw&&!b.on) return false; if(b.over) return false; const t=d.time; if(!t||!S.L.day) return true; return t===S.phase||(t==='day'&&b.lampUntil>S.t); }
function speed(w,b){ const base=isAlien(w)?1:[1,2.5,6][w.lv-1]*(w.up&&w.up===b.d.tag?2:1); return base*parkBoost(b); }
const hasIn=(b,inp)=>Object.entries(inp).every(([r,n])=>(b.inb.amt[r]||0)>=n);
function useIn(b,inp){ for(const r in inp) take(b.inb,r,inp[r]); }
function toPad(w){ removeLoc(w); w.loc={t:'pad'}; w.prog=0; w.spaid=0; }
function removeLoc(w){ if(w.loc.t==='slot'){ const b=S.b[w.loc.bid]; if(b.slots[w.loc.i]===w.id) b.slots[w.loc.i]=null; } }
function produce(b){ const d=b.d; if(d.kind==='factory') addWorker(); else if(d.out==='belt'){ if(beltsTotal()<BELT_MAX) S.tray++; } else put(b.out,d.out,1); }
function heatUp(b){ b.heat=Math.min(1,b.heat+0.06); if(b.heat>=1&&!b.over){ b.over=true; sfx('hot'); } }
const CRATE_SPOTS=[[-250,-50],[250,-50],[-200,55],[200,55],[0,72]];
function spawnCrate(){ const free=CRATE_SPOTS.filter(p=>!S.crates.some(c=>c.x===p[0]&&c.y===p[1])); if(!free.length) return;
  const p=pick(free); S.crates.push({id:S.nextObj++,x:p[0],y:p[1],c:pick(S.L.crateLoot),open:null}); sfx('crateLand'); }
function quake(){
  sfx('quake'); const g=$('grid'); g.classList.remove('shake'); void g.offsetWidth; g.classList.add('shake');
  const c=[]; S.b.forEach(b=>{ if(!b.built) return; for(const r in b.out.amt) if(b.out.amt[r]>=4) c.push([b,r]); });
  if(!c.length) return; const [b,r]=pick(c); let n=Math.min(12,Math.floor(b.out.amt[r]/2)); take(b.out,r,n);
  while(n>0){ const k=Math.min(3,n); n-=k; S.spills.push({id:S.nextObj++,r,n:k,x:-250+rnd(500),y:-60+rnd(120)}); }
  toast('Moonquake! Tap the bubbles to grab your stuff back.');
}
function nestTick(b,dt){
  b.temp=Math.max(0,b.temp-dt/25);
  if(b.temp<0.8&&(b.inb.amt.spark||0)>=1){ take(b.inb,'spark',1); b.temp=Math.min(1,b.temp+0.3); }
  if(b.temp>=0.4){ b.egg+=dt*DEBUG*stageMult()/(b.d.cycle||15); if(b.egg>=1){ b.egg=0; addWorker({alien:pick(RGB)}); sfx('hatch'); setTimeout(()=>sfx('chirp'),350); fx(S.cellEls[b.id],'HATCHED!','g'); toast('An egg hatched! A new alien joins the crew.'); } }
}
function chargeTick(b,dt){ b.ch=Math.max(0,b.ch-dt/30); if(b.ch<=0.9&&(b.inb.amt.spark||0)>=1){ take(b.inb,'spark',1); b.ch=Math.min(1,b.ch+0.12); } if(b.ch>=0.7) S.chargeT+=dt*DEBUG; }
function tick(dt){
  S.t+=dt; const L=S.L;
  if(L.day){ S.phaseT-=dt; if(S.phaseT<=0){ S.phase=S.phase==='day'?'night':'day'; S.phaseT=40; } $('night').style.opacity=S.phase==='night'?1:0; }
  if(L.meteors){ S.metT-=dt; if(S.metT<=0){ S.metT=20+Math.random()*10; meteor(); }
    S.b.forEach(b=>{ if(b.shadowUntil&&S.t>=b.shadowUntil){ b.shadowUntil=0; if(!shielded(b)){ b.cracked=true; sfx('crack'); } } }); }
  if(L.crates){ S.crateT-=dt; if(S.crateT<=0){ S.crateT=22; if(S.crates.length<3) spawnCrate(); }
    S.crates.forEach(c=>{ if(!c.open) return; c.open.t-=dt*DEBUG; if(c.open.t<=0){ for(const r in c.c) put(S.pile,r,c.c[r]); const w=BOT(c.open.bot); if(w) w.loc={t:'pad'}; c.gone=true; sfx('crateOpen'); fx(S.plotEl,'CRATE OPEN!','g'); updateReveal(true); } });
    S.crates=S.crates.filter(c=>!c.gone); }
  if(L.quakes){ S.quakeT-=dt; if(S.quakeT<=0){ S.quakeT=26+rnd(8); quake(); } }
  if(L.tourists){ S.busT-=dt; if(S.busT<=0){ S.busT=40; for(let k=0;k<3;k++) addWorker({tour:true,temp:S.t+30}); sfx('bus'); toast('Tour bus! 3 visitors will help for 30 seconds.'); }
    S.bots.filter(w=>w.tour&&S.t>=w.temp&&!(S.drag&&S.drag.kind==='bot'&&S.drag.id===w.id)).forEach(w=>{ removeLoc(w); S.bots.splice(S.bots.indexOf(w),1); }); }
  if(S.b.some(b=>b.d.wobble&&b.built)){ S.wobT-=dt; if(S.wobT<=0){ S.wobT=20; S.b.forEach(b=>{ if(b.d.wobble) b.wob=!b.wob; }); sfx('wobble');
    if(!S.toldWob){ S.toldWob=true; toast('The wobbly doors swapped! Move workers to matching doors.'); } } }
  const sm=stageMult();
  for(const b of S.b){
    if(!b.built) continue;
    const d=b.d,k=d.kind||'prod',cyc=d.cycle||3;
    if(d.hot){ if(b.over){ b.heat-=dt/10; if(b.heat<=0.25) b.over=false; } else b.heat=Math.max(0,b.heat-dt/60); }
    if(k==='planter') b.pots=b.pots.map(g=>g>=0&&g<1?Math.min(1,g+dt*sm*DEBUG/(d.grow||12)):g);
    if(k==='nest'){ nestTick(b,dt); continue; }
    if(k==='charge'){ chargeTick(b,dt); continue; }
    if(k==='trade'){ if(b.offer.paid===0){ b.offer.t-=dt; if(b.offer.t<=0) newOffer(b); } continue; }
    if(b.repair){ b.repair.t-=dt*DEBUG; if(b.repair.t<=0){ const w=BOT(b.repair.bot); if(w) w.loc={t:'pad'}; b.repair=null; b.cracked=false; sfx('fix'); fx(S.cellEls[b.id],'FIXED!','g'); } continue; }
    if(b.cracked||!active(b)) continue;
    if(k==='merger'){
      const full=b.slots.every(id=>id!=null&&!(S.drag&&S.drag.kind==='bot'&&S.drag.id===id));
      if(!full){ b.mt=0; continue; }
      b.mt=(b.mt||0)+dt*DEBUG;
      if(b.mt>=cyc){ b.mt=0; const [A,B]=b.slots.map(BOT); b.slots=[null,null];
        S.bots.splice(S.bots.indexOf(B),1); A.lv++; A.up=A.up||B.up; A.big=A.big||B.big; A.cap=A.big?120:60; A.charge=A.cap; A.loc={t:'pad'}; A.prog=0; sfx('merge'); fx(S.cellEls[b.id],'SHINY!'); }
      continue;
    }
    if(d.team&&!teamOk(b)) continue;
    b.slots.forEach((id,i)=>{
      if(id==null) return; const w=BOT(id); if(!w||(S.drag&&S.drag.kind==='bot'&&S.drag.id===id)) return;
      if(!fits(w,doorAt(b,i))) return;
      if(isAlien(w)&&L.hunger&&w.food<=0) return;
      if(k==='charger'||k==='super'){
        if(k==='super'&&!w.spaid){ if((b.inb.amt.battery||0)>=1){ take(b.inb,'battery',1); w.spaid=1; } else return; }
        w.charge+=dt*DEBUG*w.cap/cyc; if(w.charge>=w.cap){ w.charge=w.cap; toPad(w); } return;
      }
      if(k==='upgrade'){
        if(w.upT==null){ const rc=d.recipes[b.recipe]; if(!hasIn(b,rc.in)) return; useIn(b,rc.in); w.upT=cyc; w.upTo=rc.up; }
        w.upT-=dt*sm*DEBUG; if(w.upT<=0){ w.up=w.upTo; w.upT=null; toPad(w); sfx('upgrade'); fx(S.cellEls[b.id],'UPGRADED!','b'); } return;
      }
      if(L.battery&&!isAlien(w)&&w.charge<=0) return;
      w.prog+=dt*speed(w,b)*sm*DEBUG;
      let guard=0;
      while(w.prog>=cyc&&guard++<40){
        let inp=d.in, out=d.out, n=1;
        if(k==='mixer'){ const rc=d.recipes[b.recipe]; inp=rc.in; out=rc.out; }
        if(k==='copier'){ const r=copyRes(b); if(!r){ w.prog=cyc; break; } inp={[r]:1}; out=r; n=2; }
        if(k==='planter'){ const j=b.pots.indexOf(-1); if(j<0||!hasIn(b,inp)){ w.prog=cyc; break; } useIn(b,inp); b.pots[j]=0; w.prog-=cyc; continue; }
        if(d.out==='belt'&&beltsTotal()>=BELT_MAX){ w.prog=cyc; break; }
        if(out&&out!=='belt'&&(b.out.amt[out]||0)>=capOf()){ w.prog=cyc; break; }
        if(b.over){ w.prog=cyc; break; }
        if(inp&&!hasIn(b,inp)){ w.prog=cyc; break; }
        if(inp) useIn(b,inp);
        if(k==='mixer'||k==='copier') put(b.out,out,n); else produce(b);
        if(d.hot) heatUp(b);
        w.prog-=cyc;
      }
      if(L.battery&&!isAlien(w)) w.charge=Math.max(0,w.charge-dt);
      if(isAlien(w)&&L.hunger){ const was=w.food>0; w.food=Math.max(0,w.food-dt); if(was&&w.food<=0) sfx('hungry'); }
    });
  }
  if(L.molten) cool();
  if(S.belts.length) beltTick(dt);
  const st=L.goal[S.goalStage];
  if(st&&st._handsfree&&S.t-S.lastBeltT<3&&!S.drag) S.hf=Math.min(st._handsfree,S.hf+dt*DEBUG);
}
function cool(){
  const f=S.b.find(b=>b.d.id==='furnace'); const hs=[S.pile,...S.b.flatMap(b=>[b.out,b.inb])];
  for(const h of hs){ const a=h.heat.molten; if(!a||!a.length) continue; let k=0; while(k<a.length&&a[k]<=S.t) k++;
    if(k){ a.splice(0,k); h.amt.molten-=k; if(f) put(f.out,'slag',k); } }
}
function meteor(){ const c=S.b.filter(b=>b.built&&!b.cracked&&!b.shadowUntil&&!shielded(b)); if(!c.length) return; pick(c).shadowUntil=S.t+3; sfx('warn'); }
function shielded(b){ const d=S.b.find(x=>x.d.kind==='shield'&&x.built); if(!d) return false; return Math.abs(d.cell[0]-b.cell[0])<=1&&Math.abs(d.cell[1]-b.cell[1])<=1; }
function goalNeed(r){ const st=S.L.goal[S.goalStage]||{}; return (st[r]||0)-(S.goalPaid[r]||0); }
function goalAccepts(r){ return S.L.goal.some(st=>st[r]||st._beltRes===r); }
function beltTick(dt){
  for(const bl of S.belts){
    bl.acc+=dt*2*DEBUG; let steps=Math.min(60,Math.floor(bl.acc)); bl.acc-=steps;
    const src=S.b[bl.from].out;
    while(steps-->0&&(src.amt[bl.res]||0)>=1){
      if(bl.to.t==='goal'){ const st=S.L.goal[S.goalStage]||{};
        if(goalNeed(bl.res)>0){ take(src,bl.res,1); S.goalPaid[bl.res]=(S.goalPaid[bl.res]||0)+1; S.lastBeltT=S.t; }
        else if(st._beltRes===bl.res){ take(src,bl.res,1); S.lastBeltT=S.t; } else break;
      } else { const tb=S.b[bl.to.bid], r=bl.res;
        if(bl.to.t==='in'){ if(!tb.built) break; const m=take(src,r,1); put(tb.inb,r,m.n,m.heats); }
        else if(bl.to.t==='cost'){ if(tb.built||(tb.d.cost[r]||0)-(tb.paid[r]||0)<1) break; take(src,r,1); tb.paid[r]=(tb.paid[r]||0)+1; }
        else if(bl.to.t==='exp'){ if(tb.lv!==1||(tb.d.exp[r]||0)-(tb.ep[r]||0)<1) break; take(src,r,1); tb.ep[r]=(tb.ep[r]||0)+1; } }
    }
  }
}
const crewN=()=>S.bots.filter(w=>!w.tour);
function goalReady(){
  const st=S.L.goal[S.goalStage]; if(!st) return false;
  return Object.entries(st).every(([k,v])=>{
    if(k==='_bots') return crewN().filter(w=>!isAlien(w)).length>=v;
    if(k==='_lv3') return S.bots.some(b=>b.lv>=3);
    if(k==='_handsfree') return S.hf>=v;
    if(k==='_allpad') return crewN().every(w=>w.loc.t==='pad');
    if(k==='_signals') return S.signals>=v;
    if(k==='_aliens') return crewN().filter(isAlien).length>=v;
    if(k==='_charge') return S.chargeT>=v;
    if(k==='_beltRes') return true;
    return (S.goalPaid[k]||0)>=v; });
}

/* ================= drop rules (one function for glow + execute) ================= */
function canMerge(A,B){ return S.L.merge&&A&&B&&A!==B&&A.kind==='bot'&&B.kind==='bot'&&A.lv===B.lv&&A.lv<3&&B.upT==null&&B.loc.t!=='repair'; }
function accepts(b,r){ const d=b.d;
  if(d.kind==='copier'){ const cur=copyRes(b); return !cur||cur===r; }
  if(d.kind==='nest'||d.kind==='charge') return r==='spark';
  return !!((d.in&&d.in[r])||(d.recipes&&d.recipes.some(x=>x.in&&x.in[r]))||(d.kind==='super'&&r==='battery')); }
function act(key,go){
  const dr=S.drag; if(!dr||!key) return false;
  const [t,a,c]=key.split(':');
  if(dr.kind==='bot') return botDrop(BOT(dr.id),t,a,c,go);
  if(dr.kind==='stack') return stackDrop(dr,t,a,c,go);
  if(dr.kind==='belt') return beltDrop(dr,t,a,c,go);
  return false;
}
function placeIn(B,b,i){ removeLoc(B); B.loc={t:'slot',bid:b.id,i}; b.slots[i]=B.id; B.prog=0; B.spaid=0; }
function botDrop(B,t,a,c,go){
  if(!B) return false;
  if(t==='crate'){ const cr=S.crates.find(x=>x.id===+a); if(!cr||cr.open) return false; if(go){ removeLoc(B); B.loc={t:'crate',cid:cr.id}; cr.open={bot:B.id,t:3}; } return true; }
  if(t==='bot'){ const O=BOT(+a); if(canMerge(B,O)){ if(go){ removeLoc(B); S.bots.splice(S.bots.indexOf(B),1); O.lv++; O.up=O.up||B.up; O.big=O.big||B.big; O.cap=O.big?120:60; O.charge=O.cap; sfx('merge'); } return true; }
    if(!O) return false; if(O.loc.t==='slot'){ t='card'; a=O.loc.bid; } else if(O.loc.t==='pad') t='pad'; else return false; }
  if(t==='slot'||t==='card'){ const mb=S.b[+a]; if(mb&&mb.d.kind==='merger'&&B.lv!==mb.d.lvIn) return false; }
  if(t==='slot'){ const b=S.b[+a]; if(b.cracked){ t='card'; } else { const i=+c; if(!b.built||i>=b.slots.length) return false;
      if(!fits(B,doorAt(b,i))) return false;
      if(b.slots[i]!=null&&b.slots[i]!==B.id) return false; if(go&&b.slots[i]!==B.id) placeIn(B,b,i); return true; } }
  if(t==='card'){ const b=S.b[+a]; if(!b.built) return false;
    if(b.cracked){ if(b.repair) return false; if(go){ removeLoc(B); B.loc={t:'repair',bid:b.id}; b.repair={bot:B.id,t:B.up==='jet'?3:10}; } return true; }
    if(B.loc.t==='slot'&&B.loc.bid===b.id) return true;
    const i=b.slots.findIndex((x,j)=>x==null&&fits(B,doorAt(b,j))); if(i<0) return false; if(go) placeIn(B,b,i); return true; }
  if(t==='pad'){ if(go) toPad(B); return true; }
  return false;
}
function srcH(dr){ return dr.src.t==='out'?S.b[dr.src.bid].out:S.pile; }
let lastOrderJ=0;
function needFor(k,b,r,j){
  switch(k){
   case 'cost': return (!b.built&&b.d.cost)?(b.d.cost[r]||0)-(b.paid[r]||0):0;
   case 'exp': return (b.built&&b.lv===1&&b.d.exp&&!S.L.noExp)?(b.d.exp[r]||0)-(b.ep[r]||0):0;
   case 'in': return (b.built&&accepts(b,r))?CAP-(b.inb.amt[r]||0):0;
   case 'lamp': return (r==='lamp'&&b.built&&b.d.time==='day')?1:0;
   case 'ice': return (r==='ice'&&b.built&&b.d.hot&&b.heat>0.05)?1:0;
   case 'order': { if(!b.built||b.d.kind!=='orders') return 0; for(const q of (j!=null?[j]:[0,1])){ const o=b.orders[q]; if(o&&o.r===r&&o.p<o.n){ lastOrderJ=q; return o.n-o.p; } } return 0; }
   case 'sig': return (b.built&&b.d.kind==='signal'&&b.seq[b.pos]===r)?1:0;
   case 'trade': return (b.built&&b.d.kind==='trade'&&b.offer.give===r)?b.offer.gn-b.offer.paid:0;
   default: return goalNeed(r);
  }
}
function stackDrop(dr,t,a,c,go){
  const r=dr.res, h=dr.hand, avail=h.amt[r]||0; if(avail<1) return false;
  const opts=[];
  const cardOpts=b=>opts.push(['cost',b],['in',b],['exp',b],['lamp',b],['ice',b],['order',b],['sig',b],['trade',b]);
  if(t==='cost'&&c===r) opts.push(['cost',S.b[+a]]);
  else if(t==='exp'&&c===r) opts.push(['exp',S.b[+a]]);
  else if(t==='in'&&(c===r||c==='*')) opts.push(['in',S.b[+a]]);
  else if(t==='order') opts.push(['order',S.b[+a],+c]);
  else if(t==='sig') opts.push(['sig',S.b[+a]]);
  else if(t==='trade') opts.push(['trade',S.b[+a]]);
  else if(t==='card'||t==='slot') cardOpts(S.b[+a]);
  else if((t==='gcost'&&a===r)||t==='goal') opts.push(['goal']);
  else if(t==='bot'){ const O=BOT(+a);
    if(O&&!isAlien(O)&&r==='battery'&&S.L.battery&&!O.big){ if(go){ take(h,r,1); O.big=true; O.cap=120; O.charge=Math.min(120,O.charge+60); sfx('upgrade'); } return true; }
    if(O&&isAlien(O)&&r==='snack'&&S.L.hunger&&O.food<39){ if(go){ take(h,r,1); O.food=40; sfx('munch'); } return true; }
    if(O&&O.loc.t==='slot') cardOpts(S.b[O.loc.bid]); }
  for(const [k,b,j] of opts){
    const need=needFor(k,b,r,j);
    if(need<=0) continue;
    if(S.L.beltOnly&&!S.handOk) continue;
    if(go){ const m=take(h,r,Math.min(avail,need)), J=lastOrderJ;
      if(k==='cost') b.paid[r]=(b.paid[r]||0)+m.n;
      else if(k==='exp') b.ep[r]=(b.ep[r]||0)+m.n;
      else if(k==='in') put(b.inb,r,m.n,m.heats);
      else if(k==='lamp'){ put(h,r,m.n-1); b.lampUntil=Math.max(S.t,b.lampUntil)+30; }
      else if(k==='ice'){ put(h,r,m.n-1); b.heat=Math.max(0,b.heat-0.5); if(b.heat<0.25) b.over=false; sfx('cool'); }
      else if(k==='order'){ const o=b.orders[J]; o.p+=m.n; if(o.p>=o.n){ put(b.out,'coin',o.coins); b.orders[J]=newOrder(b); sfx('order'); setTimeout(()=>fx(S.cellEls[b.id],'+'+o.coins+' COINS'),30); } }
      else if(k==='sig'){ b.pos++; sfx('beep',b.pos); if(b.pos>=3){ S.signals++; sfx('signal'); newSeq(b); setTimeout(()=>fx(S.cellEls[b.id],'SIGNAL SENT!','b'),30); } }
      else if(k==='trade'){ b.offer.paid+=m.n; if(b.offer.paid>=b.offer.gn){ put(b.out,b.offer.get,b.offer.qn); sfx('trade'); newOffer(b); } }
      else S.goalPaid[r]=(S.goalPaid[r]||0)+m.n;
    }
    return true;
  }
  return false;
}
function beltTarget(dr,t,a,c){
  const r=dr.res, cands=[];
  if(t==='cost'||t==='exp'||t==='in'){ if(c!==r&&c!=='*') return null; cands.push([t,+a]); }
  else if(t==='card'||t==='slot') cands.push(['cost',+a],['in',+a],['exp',+a]);
  else if(t==='bot'){ const O=BOT(+a); if(O&&O.loc.t==='slot') cands.push(['cost',O.loc.bid],['in',O.loc.bid],['exp',O.loc.bid]); }
  else if((t==='gcost'&&a===r)||t==='goal') return goalAccepts(r)?{t:'goal'}:null;
  for(const [k,bid] of cands){ const b=S.b[bid]; if(!b||(bid===dr.bid&&k!=='exp')) continue;
    if(k==='cost'&&!b.built&&b.d.cost&&(b.d.cost[r]||0)>(b.paid[r]||0)) return {t:'cost',bid};
    if(k==='in'&&b.built&&accepts(b,r)) return {t:'in',bid};
    if(k==='exp'&&b.built&&b.lv===1&&b.d.exp&&!S.L.noExp&&(b.d.exp[r]||0)>(b.ep[r]||0)) return {t:'exp',bid}; }
  return null;
}
function beltDrop(dr,t,a,c,go){
  if(S.tray<1||S.belts.some(x=>x.from===dr.bid&&x.res===dr.res)) return false; const to=beltTarget(dr,t,a,c); if(!to) return false;
  if(go){ S.belts.push({from:dr.bid,res:dr.res,to,acc:0}); S.tray--; sfx('belt'); }
  return true;
}
const beltKey=bl=>bl.to.t==='goal'?'goal:'+bl.res:bl.to.t+':'+bl.to.bid+':'+bl.res;
function beltEnd(bl){ return bl.to.t==='goal'?(anchorPt('goal:'+bl.res)||anchorPt('goalcard')):anchorPt(beltKey(bl)); }
function pruneBelts(){
  S.belts=S.belts.filter(bl=>{ const tb=bl.to.bid!=null?S.b[bl.to.bid]:null; let keep=true;
    if(bl.to.t==='cost') keep=!tb.built; else if(bl.to.t==='exp') keep=tb.lv===1;
    else if(bl.to.t==='goal') keep=S.L.goal.slice(S.goalStage).some(st=>st[bl.res]||st._beltRes===bl.res);
    if(!keep){ retractAnim(bl); S.tray++; } return keep; });
}
function retractAnim(bl){
  const a=anchorPt('out:'+bl.from+':'+bl.res), b=beltEnd(bl); if(!a||!b) return; sfx('retract');
  const svg=$('retr'), d=curve(a,b), g=document.createElementNS('http://www.w3.org/2000/svg','g');
  g.innerHTML=`<path class="o" pathLength="100" d="${d}"/><path class="i" pathLength="100" d="${d}"/>`;
  svg.appendChild(g); setTimeout(()=>g.remove(),700);
}

/* ================= rendering ================= */
const dragKind=()=>S.drag&&S.drag.kind;
const gS=key=>(dragKind()==='stack'||dragKind()==='belt')&&act(key,false)?' glow':'';
function barOf(w){
  if(isAlien(w)&&S.L.hunger) return [w.food/40*100,w.food<10?'#ff5a4a':'#ffb03a'];
  if(w.tour) return [Math.max(0,(w.temp-S.t)/30*100),'#3a8fd8'];
  if(S.L.battery&&!isAlien(w)) return [w.charge/w.cap*100,w.charge<15?'#ff5a4a':'#4cd964'];
  return null;
}
function workerHTML(w,extra){
  const dr=S.drag; let mg=extra||'';
  if(dragKind()==='bot'&&canMerge(BOT(dr.id),w)) mg+=' mg';
  if(dragKind()==='stack'&&((dr.res==='battery'&&S.L.battery&&!isAlien(w)&&!w.big)||(dr.res==='snack'&&S.L.hunger&&isAlien(w)&&w.food<39))) mg+=' mg';
  const bs=barOf(w), bar=bs?0:null, barCol=null;
  return ART.worker({kind:w.kind,lv:w.lv,up:w.up,col:w.col,flat:S.L.battery&&!isAlien(w)&&w.charge<=0,tour:w.tour,hungry:isAlien(w)&&S.L.hunger&&w.food<=0,
    bar,barCol,cls:mg.trim(),attrs:`data-drag="bot:${w.id}" data-drop="bot:${w.id}"`});
}
function slotHTML(b,i){
  const id=b.slots[i]; let inner=''; const door=doorAt(b,i);
  const dragging=dragKind()==='bot'&&S.drag.id===id; let nap=false;
  if(id!=null&&!dragging){ const w=BOT(id);
    if(w.upT!=null) inner=`<span class="away">${Math.ceil(w.upT)}s</span>`;
    else { nap=!fits(w,door); const k=b.d.kind, ch=k==='charger'||k==='super';
      const working=!nap&&b.built&&active(b)&&!b.cracked&&(!b.d.team||teamOk(b))&&!(isAlien(w)&&S.L.hunger&&w.food<=0)&&!(S.L.battery&&!isAlien(w)&&w.charge<=0&&!ch)&&(ch||k==='merger'||w.prog<(b.d.cycle||3));
      inner=workerHTML(w,working?'wk':''); } }
  const shape=door[0]==='r'?' rd'+(door.length>2?' cl':''):door==='s'?' sq':'';
  const st=door.length>2?` style="--dc:${ACOL[door.slice(2)]}"`:'';
  const chg=b.d.kind==='charger'||b.d.kind==='super';
  return `<div class="slot${shape}${nap?' nap':''}${chg?' chg':''}"${st} data-drop="slot:${b.id}:${i}" data-pg="${b.id}:${i}">${inner}</div>`;
}
function heatBar(h){ const a=h.heat.molten; if(!a||!a.length) return ''; const f=Math.max(0,(a[0]-S.t)/20); return `<span class="heat"><i style="width:${(f*100)|0}%"></i></span>`; }
function stackInner(b,r,small){
  const amt=b.out.amt[r]||0, show=amt>0, cap=capOf();
  const knob=S.L.belts&&S.tray>0&&!S.drag&&r!=='slag'&&!S.belts.some(x=>x.from===b.id&&x.res===r)?`<span class="knob" data-drag="belt:${b.id}:${r}"></span>`:'';
  return `<span class="dia"></span>${ic(r,small?18:24,!show)}${show?`<b class="cn">${amt}</b>`:''}${r==='molten'&&show?heatBar(b.out):''}${isFinite(cap)&&amt>=cap?'<b class="full">FULL</b>':''}${knob}`;
}
function stackHTML(b,r,small){
  const show=(b.out.amt[r]||0)>0;
  return `<div class="stk${small?' sm':''}${show?'':' empty'}" ${show?`data-drag="out:${b.id}:${r}"`:''} data-anchor="out:${b.id}:${r}">${stackInner(b,r,small)}</div>`;
}
function liveCounts(){
  $('game').querySelectorAll('.stk[data-anchor^="out:"]').forEach(el=>{
    const [,bid,r]=el.dataset.anchor.split(':'), b=S.b[+bid], show=(b.out.amt[r]||0)>0;
    const inner=stackInner(b,r,el.classList.contains('sm')); if(el._in!==inner){ el._in=inner; el.innerHTML=inner; }
    el.classList.toggle('empty',!show); if(show) el.setAttribute('data-drag',`out:${bid}:${r}`); else el.removeAttribute('data-drag'); });
  $('game').querySelectorAll('.cs[data-anchor^="in:"]').forEach(el=>{
    const [,bid,r]=el.dataset.anchor.split(':'), b=S.b[+bid], amt=b.inb.amt[r]||0, cn=el.querySelector('.cn');
    if(cn&&cn.textContent!=String(amt)) cn.textContent=amt; });
}
function inHTML(b,r,need,off){
  const amt=b.inb.amt[r]||0; const red=!off&&amt<need;
  return `<div class="cs${red?' red':''}${off?' off':''}${gS(`in:${b.id}:${r}`)}" data-drop="in:${b.id}:${r}" data-anchor="in:${b.id}:${r}">${ic(r,20,!amt)}<b class="cn">${amt}</b>${need>1?`<b class="nd">×${need}</b>`:''}${r==='molten'?heatBar(b.inb):''}</div>`;
}
function recipe(d){
  const ins=d.in?Object.entries(d.in).map(([r,n])=>`<span class="rq">${n>1?`<b>${n}</b>`:''}${ic(r,16)}</span>`).join('')+'<span class="arr sm"></span>':'';
  const k=d.kind;
  if(k==='shed') return '<span class="num" style="font-size:14px">+2</span>'+botStatic();
  if(k==='factory') return ins+botStatic();
  if(k==='upgrade') return d.recipes.map(x=>`<span class="badge sm" style="background:${UP[x.up].c}">${UP[x.up].l}</span>`).join('');
  if(k==='super') return ic('battery',16)+'<span class="arr sm"></span><span class="lbl" style="color:#2b1d14">CHARGE</span>';
  if(k==='shield') return '<span class="dome" style="width:34px;height:20px;border-width:3px"></span>';
  if(k==='silo') return '<span class="lbl" style="color:#2b1d14">STACKS UP TO 60</span>';
  if(k==='power') return `<span class="lbl" style="color:#2b1d14">+${d.gen} POWER</span>`;
  if(k==='park') return '<span class="tree sm"></span><span class="lbl" style="color:#2b1d14">×2 NEXT DOOR</span>';
  if(k==='orders') return ic('coin',16)+'<span class="lbl" style="color:#2b1d14">COINS FOR ORDERS</span>';
  if(k==='signal') return '<span class="lbl" style="color:#2b1d14">SENDS SIGNALS</span>';
  if(k==='nest') return ic('spark',16)+'<span class="arr sm"></span>'+alienStatic({col:'green'});
  if(k==='copier') return '<span class="num" style="font-size:13px">1</span><span class="arr sm"></span><span class="num" style="font-size:13px">2</span>';
  if(k==='mixer') return d.recipes.map(x=>ic(x.out,16)).join('');
  if(k==='charge') return ic('spark',16)+'<span class="arr sm"></span><span class="lbl" style="color:#2b1d14">CHARGE UP</span>';
  if(k==='planter') return ins+ic(d.out,18);
  return ins+ic(d.out,18);
}
function titleHTML(b){
  const d=b.d; let x='';
  if(d.time&&S.L.day){ const on=b.built?active(b):(d.time===S.phase); x+=`<span class="tpill ${d.time}${on?' on':''}"><span class="${d.time==='day'?'sunb':'moonb'}"></span>${d.time==='day'?'DAY':'NIGHT'}</span>`; }
  else if(d.pw&&b.built) x+=`<span class="tpill pw${b.on?' on':''}" data-act="power:${b.id}"><span class="pdot"></span>${b.on?'ON':'OFF'}</span>`;
  else if(d.wobble&&b.built) x+=`<span class="tpill wob">SWAP ${Math.ceil(S.wobT)}</span>`;
  else if(d.team) x+=`<span class="tpill team">TEAM</span>`;
  else if(b.built&&parkBoost(b)>1) x+=`<span class="tpill park">PARK ×2</span>`;
  if(b.lampUntil>S.t) x+=`<span class="lampb">${ic('lamp',12)}${Math.ceil(b.lampUntil-S.t)}</span>`;
  const lv=b.built&&slotCount(b)>0?`<span class="lv">LV${b.lv}</span>`:(!b.built?'<span class="lv">PLAN</span>':'');
  const hb=d.hot&&b.built?`<span class="hbar"><i style="width:${(b.heat*100)|0}%"></i></span>`:'';
  return `<div class="tb">${d.name.toUpperCase()}${x}${lv}${hb}</div>`;
}
function costBox(key,r,p,n){ return `<div class="cw"><div class="cs${gS(key)}" data-drop="${key}" data-anchor="${key.startsWith('gcost')?'goal:'+r:key}">${ic(r,22,!p)}${p?`<b class="cn">${p}</b>`:''}</div><div class="lab"><b>${p}/${n}</b>${nm(r)}</div></div>`; }
function sideHTML(b){
  const d=b.d,k=d.kind||'prod';
  if(k==='upgrade'){ const rc=d.recipes[b.recipe]; const keys=[...new Set(d.recipes.flatMap(x=>Object.keys(x.in)))];
    return `<div class="row">${keys.map(r=>inHTML(b,r,rc.in[r]||0,!rc.in[r])).join('')}</div><div class="row">${d.recipes.map((x,j)=>`<div class="chip${j===b.recipe?' on':''}" data-act="recipe:${b.id}:${j}"><span class="badge" style="background:${UP[x.up].c}">${UP[x.up].l}</span></div>`).join('')}</div>`; }
  if(k==='merger'){ const l=d.lvIn, nmL=['','bot','silver','gold'];
    return `<div class="row" style="gap:4px;align-items:flex-start"><div class="cw"><div class="cond">${botStatic({lv:l})}</div><div class="lab">2× ${nmL[l]}</div></div><span class="arr" style="margin-top:15px"></span><div class="cw"><div class="cond" style="transform:scale(1.25)">${botStatic({lv:l+1})}</div><div class="lab">${nmL[l+1]}</div></div></div>`; }
  if(k==='charger'||k==='super') return `<div class="row" style="align-items:flex-start">${k==='super'?`<div class="cw">${inHTML(b,'battery',1)}<div class="lab">battery</div></div><span class="arr" style="margin-top:14px"></span>`:''}<div class="cw"><div class="plug">${k==='super'?'5s':'15s'}</div><div class="lab">charge</div></div></div>`;
  if(k==='planter'){ const pots=b.pots.map((g,j)=>g>=1?`<div class="pot ripe" data-act="harvest:${b.id}:${j}" style="--g:1"><i></i></div>`:`<div class="pot${g<0?' empty':''}" style="--g:${Math.max(0,g).toFixed(2)}"><i></i></div>`).join('');
    return `<div class="row tight" style="gap:3px">${inHTML(b,'seed',1)}${inHTML(b,'water',1)}<span class="arr"></span>${stackHTML(b,'veg')}</div><div class="pots">${pots}</div><div class="lab">tap ripe veg!</div>`; }
  if(k==='copier'){ const cur=copyRes(b); const outs=Object.keys(b.out.amt).filter(r=>b.out.amt[r]>0).slice(0,2);
    const inBox=cur?inHTML(b,cur,1):`<div class="cs${gS(`in:${b.id}:*`)}" data-drop="in:${b.id}:*" data-anchor="in:${b.id}:*"><span class="num" style="color:#a8936c">?</span></div>`;
    return `<div class="row" style="gap:5px;align-items:flex-start"><div class="cw">${inBox}<div class="lab">anything</div></div><span class="arr" style="margin-top:15px"></span><div class="cw"><div class="cond"><span class="num" style="font-size:20px">×2</span></div></div></div>
      <div class="row" style="gap:4px">${outs.length?outs.map(r=>stackHTML(b,r,true)).join(''):'<div class="stk sm empty"><span class="dia"></span></div>'}</div>`; }
  if(k==='mixer'){ const rc=d.recipes[b.recipe]; const keys=[...new Set(d.recipes.flatMap(x=>Object.keys(x.in)))];
    return `<div class="row tight" style="gap:3px">${keys.map(r=>inHTML(b,r,rc.in[r]||0,!rc.in[r])).join('')}</div>
      <div class="row" style="gap:4px">${d.recipes.map((x,j)=>`<div class="chip${j===b.recipe?' on':''}" data-act="recipe:${b.id}:${j}" style="width:34px;height:34px">${ic(x.out,18)}</div>`).join('')}</div>
      <div class="row" style="gap:2px">${d.recipes.map(x=>stackHTML(b,x.out,true)).join('')}</div>`; }
  const ins=d.in?Object.entries(d.in):[];
  let outs=[]; if(k==='factory') outs=['_bot']; else if(d.out==='belt') outs=['_belt']; else { outs=[d.out]; if(d.id==='furnace') outs.push('slag'); }
  const one=ins.length+outs.length<=3;
  const L=(x,l)=>one?`<div class="cw">${x}<div class="lab">${l}</div></div>`:x;
  const inH=ins.map(([r,n])=>L(inHTML(b,r,n),nm(r))).join('');
  const outH=outs.map(r=>r==='_bot'?L(`<div class="cond">${botStatic()}</div>`,'bot'):r==='_belt'?L(`<div class="cond">${ic('belt',26)}</div>`,beltsTotal()>=BELT_MAX?'max '+BELT_MAX:'belts '+beltsTotal()+'/'+BELT_MAX):L(stackHTML(b,r,r==='slag'),nm(r))).join('');
  if(!ins.length) return `<div class="row">${outH}</div>`;
  const tight=ins.length+outs.length===3;
  return one?`<div class="row${tight?' tight':''}" style="gap:${tight?2:5}px;align-items:flex-start">${inH}<span class="arr" style="margin-top:${tight?12:15}px"></span>${outH}</div>`
            :`<div class="row">${inH}</div><div class="row"><span class="arr"></span>${outH}</div>`;
}
function ordersBody(b){
  const t=b.orders.map((o,j)=>`<div class="ticket"><div class="cs${gS(`order:${b.id}:${j}`)}" data-drop="order:${b.id}:${j}">${ic(o.r,22,!o.p)}${o.p?`<b class="cn">${o.p}</b>`:''}</div><div class="lab"><b>${o.p}/${o.n}</b>${nm(o.r)}</div><div class="rw">${ic('coin',14)}×${o.coins}</div></div>`).join('');
  return `<div class="bd cen" style="gap:10px">${t}<span class="arr"></span><div class="cw">${stackHTML(b,'coin')}<div class="lab">coins</div></div></div>`;
}
function signalBody(b){
  const s=b.seq.map((r,j)=>`<div class="cs${j<b.pos?' done':j===b.pos?' now':''}">${ic(r,22,j>b.pos)}</div>`).join('');
  return `<div class="bd cen" style="flex-direction:column;gap:7px"><div class="lbl">DROP THESE IN ORDER</div><div class="seq${gS(`sig:${b.id}`)}" data-drop="sig:${b.id}" data-anchor="sig:${b.id}">${s}</div><div class="lab"><b>${S.signals}</b>signals sent</div></div>`;
}
function tradeBody(b){
  const o=b.offer; const outs=Object.keys(b.out.amt).filter(r=>b.out.amt[r]>0).slice(0,2);
  return `<div class="bd cen" style="gap:9px"><div class="cw"><span class="lbl">GIVE</span><div class="cs${gS(`trade:${b.id}`)}" data-drop="trade:${b.id}">${ic(o.give,22,!o.paid)}${o.paid?`<b class="cn">${o.paid}</b>`:''}</div><div class="lab"><b>${o.paid}/${o.gn}</b>${nm(o.give)}</div></div>
   <div class="cw"><span class="arr"></span><div class="dnbar" style="width:40px"><i style="width:${o.paid?100:(o.t/25*100)|0}%"></i></div></div>
   <div class="cw"><span class="lbl">GET</span><div class="cond">${ic(o.get,26)}</div><div class="lab"><b>×${o.qn}</b>${nm(o.get)}</div></div>
   <div class="row" style="gap:3px">${outs.length?outs.map(r=>stackHTML(b,r,true)).join(''):stackHTML(b,o.get,true)}</div></div>`;
}
function nestBody(b){
  return `<div class="bd cen" style="gap:12px"><div class="cw"><div class="vmeter"><span class="zone"></span><i style="height:${(b.temp*100)|0}%"></i></div><div class="lab">warm</div></div>
   <div class="cw">${inHTML(b,'spark',1)}<div class="lab">sparks</div></div><span class="arr"></span>
   <div class="cw"><div class="egg"><i style="height:${(b.egg*100)|0}%"></i></div><div class="lab">${b.temp>=0.4?'hatching':'too cold!'}</div></div><span class="arr"></span><div class="cond">${alienStatic({col:'green'})}</div></div>`;
}
function chargeBody(b){
  return `<div class="bd cen" style="flex-direction:column;gap:8px"><div class="row" style="gap:12px"><div class="cw">${inHTML(b,'spark',1)}<div class="lab">sparks</div></div>
   <div class="cw"><div class="hmeter"><i style="width:${(b.ch*100)|0}%"></i><span class="line"></span></div><div class="lab">${b.ch>=0.7?'CHARGED!':'keep it past the line'}</div></div></div><div class="lab"><b>${S.chargeT|0}s</b>charged</div></div>`;
}
function zz(cls,html){ return `<div class="ov zz ${cls}"><span class="zzp">${html}</span></div>`; }
function cardHTML(b){
  const d=b.d, fam=famOf(d), k=d.kind||'prod';
  if(!b.built&&(d.unlock!=null||!b.revealed)) return '';
  const sleep=b.built&&!active(b);
  let cls='card f-'+fam+(sleep?' sleep':'')+(b.newUntil>S.t?' new':'');
  let body='';
  if(!b.built){
    const costs=Object.entries(d.cost).map(([r,n])=>costBox(`cost:${b.id}:${r}`,r,b.paid[r]||0,n)).join('');
    const ready=Object.entries(d.cost).every(([r,n])=>(b.paid[r]||0)>=n);
    body=`<div class="bp"><div class="bpm"><span class="lbl">MAKES</span>${recipe(d)}</div>
      <div class="bpr"><div class="row" style="gap:12px;align-items:flex-start">${costs}</div><div class="bbtn sm${ready?' lit':''}" ${ready?`data-act="build:${b.id}"`:''}>BUILD</div></div></div>`;
  } else if(k==='shed') body=`<div class="bd cen"><span class="ok">✓</span><span class="num">+2</span>${botStatic()}${botStatic()}</div>`;
  else if(k==='shield') body=`<div class="bd cen"><div class="dome"></div></div>`;
  else if(k==='silo') body=`<div class="bd cen"><div class="cw"><div class="num" style="font-size:34px">60</div><div class="lab">max per stack now</div></div></div>`;
  else if(k==='power') body=`<div class="bd cen"><div class="plug" style="width:58px;height:58px;font-size:12px">+${d.gen}</div><div class="cw"><div class="num">${powerUsed()}/${powerCap()}</div><div class="lab">power in use</div></div></div>`;
  else if(k==='park') body=`<div class="bd cen"><span class="tree"></span><span class="tree b"></span><div class="cw"><div class="num">×2</div><div class="lab">buildings next door</div></div></div>`;
  else if(k==='orders') body=ordersBody(b);
  else if(k==='signal') body=signalBody(b);
  else if(k==='trade') body=tradeBody(b);
  else if(k==='nest') body=nestBody(b);
  else if(k==='charge') body=chargeBody(b);
  else {
    const n=b.slots.length;
    body=`<div class="bd"><div class="slots${n>2?' g4':''}">${b.slots.map((_,i)=>slotHTML(b,i)).join('')}</div><div class="side">${sideHTML(b)}</div></div>`;
    if(b.lv===1&&d.exp&&!S.L.noExp){ const xr=Object.entries(d.exp).every(([r,nn])=>(b.ep[r]||0)>=nn);
      body+=`<div class="xrow">${Object.entries(d.exp).map(([r,nn])=>`<div class="xc"><div class="cs md${gS(`exp:${b.id}:${r}`)}" data-drop="exp:${b.id}:${r}" data-anchor="exp:${b.id}:${r}">${ic(r,18,!b.ep[r])}</div><div class="lab l"><b>${b.ep[r]||0}/${nn}</b>${nm(r)}</div></div>`).join('')}<div class="bbtn sm${xr?' lit':''}" ${xr?`data-act="expand:${b.id}"`:''}>EXPAND</div></div>`; }
  }
  let ov='';
  if(sleep){
    if(d.pw&&!b.on) ov+=zz('red','POWER OFF · TAP THE SWITCH');
    else if(b.over) ov+=zz('red',`TOO HOT! <span class="zzl">drop ${ic('ice',12)} ice to cool</span>`);
    else if(d.time) ov+=zz('',`<span class="${d.time==='day'?'sunb':'moonb'}"></span>ASLEEP · WAKES AT ${d.time==='day'?'DAY':'NIGHT'}${d.time==='day'&&S.b.some(x=>x.d.id==='lamps'&&x.built)?` <span class="zzl">or drop a ${ic('lamp',12)}</span>`:''}`);
  } else if(b.built&&d.team&&b.slots.some(x=>x!=null)&&!teamOk(b)) ov+=zz('team','NEEDS A BOT + AN ALIEN');
  if(b.shadowUntil) ov+='<div class="ov shadow"></div>';
  if(b.cracked) ov+=`<div class="ov crack">${b.repair?`${botStatic({lv:(BOT(b.repair.bot)||{}).lv})}<span class="fix" style="animation:none">${Math.ceil(b.repair.t)}</span>`:'<span class="fix">FIX</span>'}</div>`;
  return `<div class="${cls}" data-drop="card:${b.id}">${titleHTML(b)}${body}${ov}</div>`;
}
function goalHTML(){
  const L=S.L, st=L.goal[S.goalStage]||{};
  const pp=L.goal.map((_,j)=>`<span class="pip${j<S.goalStage?' on':''}"></span>`).join('');
  let items='';
  for(const [k,v] of Object.entries(st)){
    if(k==='_bots') items+=`<div class="cw"><div class="cond">${botStatic()}</div><div class="lab"><b>${crewN().filter(w=>!isAlien(w)).length}/${v}</b>bots</div></div>`;
    else if(k==='_lv3') items+=`<div class="cw"><div class="cond">${botStatic({lv:3})}</div><div class="lab"><b>${S.bots.some(b=>b.lv>=3)?1:0}/1</b>gold bot</div></div>`;
    else if(k==='_allpad') items+=`<div class="cw"><div class="cond">${botStatic()}</div><div class="lab"><b>${crewN().filter(w=>w.loc.t==='pad').length}/${crewN().length}</b>on pad</div></div>`;
    else if(k==='_signals') items+=`<div class="cw"><div class="cond"><span class="dish"></span></div><div class="lab"><b>${S.signals}/${v}</b>signals</div></div>`;
    else if(k==='_aliens') items+=`<div class="cw"><div class="cond">${alienStatic({col:'green'})}</div><div class="lab"><b>${crewN().filter(isAlien).length}/${v}</b>aliens</div></div>`;
    else if(k==='_charge') items+=`<div class="cw"><div class="cond">${ic('spark',26)}</div><div class="lab"><b>${S.chargeT|0}/${v}s</b>charged</div></div>`;
    else if(k==='_handsfree') items+=`<div class="cw"><div class="cs${gS('gcost:'+st._beltRes)}" data-drop="gcost:${st._beltRes}" data-anchor="goal:${st._beltRes}">${ic(st._beltRes,22)}<b class="nd">${ic('belt',10)}</b></div><div class="lab"><b>${S.hf|0}/${v}s</b>by belt</div></div>`;
    else if(k[0]!=='_') items+=costBox('gcost:'+k,k,S.goalPaid[k]||0,v);
  }
  const ready=goalReady();
  return `<div class="card f-goal" data-drop="goal" data-anchor="goalcard"><div class="tb">${CH[S.ci].parts[S.i].n.toUpperCase()}<span style="display:flex;gap:5px">${pp}</span></div>
   <div class="bpm"><span class="lbl">EVERY STAGE</span>${botStatic({c:'#ffd23f'})}<span class="num" style="font-size:15px">+10% FASTER</span>${S.goalStage?`<span class="bonus" style="padding:3px 8px;font-size:14px">NOW +${S.goalStage*10}%</span>`:''}</div>
   <div class="bpr"><div class="row" style="gap:16px;align-items:flex-start">${items}</div>
   <div class="bbtn sm${ready?' lit':''}" ${ready?'data-act="goal"':''}>BUILD STAGE ${Math.min(S.goalStage+1,L.goal.length)}</div></div></div>`;
}
/* idle workers stand beside the build (or in front of it when the scene is wide), never on top of it */
const PADCACHE={};
function padPos(ci){
  if(PADCACHE[ci]) return PADCACHE[ci];
  const sw=(ART.SCN&&ART.SCN[ci]?ART.SCN[ci].w*3:360), a=[];
  const front=(y,off)=>{ const r=[]; for(let x=-300+off;x<=268;x+=34) r.push([x,y]); r.sort((p,q)=>Math.abs(p[0]+16)-Math.abs(q[0]+16)); return r; };
  if(sw<=420){ const st=sw/2+12;
    for(let col=0;col<3;col++) for(const y of [-62,-18,26]){ a.push([-(st+34)-col*38,y],[st+col*38,y]); }
    a.push(...front(68,0));
  } else { a.push(...front(68,0),...front(44,17)); }
  return PADCACHE[ci]=a;
}
function plotHTML(){
  const idle=S.bots.filter(w=>w.loc.t==='pad'&&!(dragKind()==='bot'&&S.drag.id===w.id));
  let h=`<div style="position:absolute;inset:0" data-drop="pad">${ART.plot(S.ci,CH[S.ci].parts.map((_,j)=>j<S.i),S.i,S.goalStage/S.L.goal.length)}`;
  const PP=padPos(S.ci); idle.forEach((w,k)=>{ const p=PP[k%PP.length]; h+=`<div class="pbot" style="left:calc(50% + ${p[0]}px);top:calc(50% + ${p[1]}px);z-index:3;--o:${((w.id*0.37)%1.7).toFixed(2)}">${workerHTML(w)}</div>`; });
  S.crates.forEach(c=>{ h+=`<div class="crate${c.open?' open':''}" data-drop="crate:${c.id}" style="left:calc(50% + ${c.x}px);top:calc(50% + ${c.y}px)">${c.open?`<b class="num" style="position:absolute;left:0;right:0;top:6px;text-align:center;color:#fff;text-shadow:0 2px 0 #2b1d14">${Math.ceil(c.open.t)}</b>`:''}</div>`; });
  S.spills.forEach(s=>{ h+=`<div class="spill" data-act="pick:${s.id}" style="left:calc(50% + ${s.x}px);top:calc(50% + ${s.y}px)">${ic(s.r,20)}<b class="cn">${s.n}</b></div>`; });
  let y=4; for(const r in S.pile.amt){ const n=S.pile.amt[r]; const dragging=dragKind()==='stack'&&S.drag.src.t==='pile'&&S.drag.res===r; if(n<1||dragging) continue;
    h+=`<div class="pile" style="top:${y}px"><div class="stk sm" data-drag="pile:${r}"><span class="dia"></span>${ic(r,18)}<b class="cn">${n}</b>${r==='molten'?heatBar(S.pile):''}</div></div>`; y+=50; }
  h+=`<div class="plab">${CH[S.ci].parts[S.i].n.toLowerCase()}</div></div>`;
  return h;
}
function dnHTML(){
  const day=S.phase==='day', s=Math.ceil(S.phaseT);
  return `<div class="dnp ${day?'day':'night'}"><div class="dnbig ${day?'sunb':'moonb'}"></div>
    <div class="dnc"><div class="dnt">${day?'DAY':'NIGHT'}</div><div class="dnbar2"><i style="width:${(S.phaseT/40*100)|0}%"></i></div><div class="dns">${day?'night':'day'} in ${s}s</div></div>
    <div class="dnl"><div class="dnr ${day?'on':'off'}"><span class="sunb"></span><b>DAY</b> buildings ${day?'working':'asleep'}</div>
      <div class="dnr ${day?'off':'on'}"><span class="moonb"></span><b>NIGHT</b> buildings ${day?'asleep':'working'}</div></div></div>`;
}
function hudHTML(){
  const L=S.L; let h=`<div class="chipL"><span class="n">${S.ci+1}-${S.i+1}</span>${L.name.toUpperCase()}</div>`;
  if(L.belts) h+=`<div class="hbox" style="left:200px">${ic('belt',24)}<span>${S.tray} free · ${beltsTotal()}/${BELT_MAX}</span></div>`;
  if(L.power) h+=`<div class="hbox" style="left:200px"><span class="pdot big"></span><span>POWER ${powerUsed()}/${powerCap()}</span></div>`;
  if(L.cap) h+=`<div class="hbox" style="left:200px"><span>STACK MAX ${capOf()}</span></div>`;
  if(L.tourists){ const n=S.bots.filter(w=>w.tour).length; h+=`<div class="hbox" style="left:200px"><span>${n?n+' visitors here':'bus in '+Math.ceil(S.busT)+'s'}</span></div>`; }
  if(DEBUG>BASE_SPEED) h+=`<div class="hbox dbg" style="right:172px">×${DEBUG}</div>`;
  return h;
}
function fx(el,text,cls){ if(!el||SCREEN!=='game') return; const r=sRect(el); const d=document.createElement('div'); d.className='fxt'+(cls?' '+cls:''); d.textContent=text; d.style.left=(r.x+r.w/2)+'px'; d.style.top=(r.y+r.h*0.4)+'px'; $('game').appendChild(d); setTimeout(()=>d.remove(),1250); }
function slotFill(b,i){
  const id=b.slots[i]; if(id==null) return 0; const w=BOT(id); if(!w||w.upT!=null) return 0; const k=b.d.kind;
  if(S.drag&&S.drag.kind==='bot'&&S.drag.id===id) return 0;
  if(k==='merger') return Math.min(1,(b.mt||0)/b.d.cycle);
  if(k==='charger'||k==='super') return w.charge/w.cap;
  return Math.min(1,w.prog/(b.d.cycle||3));
}
function updateBars(){
  if(!S) return; const g=$('game');
  g.querySelectorAll('[data-pg]').forEach(el=>{ const [bid,i]=el.dataset.pg.split(':'); const v=(slotFill(S.b[+bid],+i)*100).toFixed(1)+'%'; if(el._p!==v){ el._p=v; el.style.setProperty('--p',v); } });
  g.querySelectorAll('[data-drag^="bot:"]').forEach(el=>{ const sp=el.querySelector('.bt>span'); if(!sp) return; const w=BOT(+el.dataset.drag.slice(4)); const bs=w&&barOf(w); if(!bs) return;
    const hgt=Math.max(0,Math.min(100,bs[0])).toFixed(0)+'%'; if(sp._h!==hgt){ sp._h=hgt; sp.style.height=hgt; } if(sp._c!==bs[1]){ sp._c=bs[1]; sp.style.background=bs[1]; } });
}
function upd(el,key,html){ if(S.cache[key]!==html){ S.cache[key]=html; el.innerHTML=html; } }
function render(){
  if(!S) return;
  $('game').style.setProperty('--ph',(performance.now()/1000%1000).toFixed(2));
  S.b.forEach(b=>upd(S.cellEls[b.id],'c'+b.id,cardHTML(b)));
  upd(S.goalEl,'goal',goalHTML());
  if(S.dnEl) upd(S.dnEl,'dn',dnHTML());
  upd(S.plotEl,'plot',plotHTML());
  upd($('hud'),'hud',hudHTML());
  drawBelts(); updateBars();
}
function sRect(el){ const r=el.getBoundingClientRect(), s=STAGE.getBoundingClientRect(); return {x:(r.left-s.left)/K,y:(r.top-s.top)/K,w:r.width/K,h:r.height/K}; }
function anchorPt(sel){ const el=$('game').querySelector(`[data-anchor="${sel}"]`); if(!el) return null; const r=sRect(el); return [r.x+r.w/2,r.y+r.h/2]; }
const curve=(a,b)=>`M${a[0]},${a[1]} C${a[0]},${(a[1]+b[1])/2} ${b[0]},${(a[1]+b[1])/2} ${b[0]},${b[1]}`;
function drawBelts(){
  let p='',u='';
  S.belts.forEach((bl,k)=>{ const a=anchorPt(`out:${bl.from}:${bl.res}`); const b=beltEnd(bl);
    if(!a||!b) return; const d=curve(a,b); p+=`<path class="o" d="${d}"/><path class="i" d="${d}"/>`;
    if(!S.drag) u+=`<div class="unbelt" data-act="unbelt:${k}" style="left:${(a[0]+b[0])/2}px;top:${(a[1]+b[1])/2}px">×</div>`; });
  if(dragKind()==='belt'){ const a=anchorPt(`out:${S.drag.bid}:${S.drag.res}`); if(a){ const d=curve(a,[S.drag.x,S.drag.y]); p+=`<path class="o tmp" d="${d}"/><path class="i" d="${d}"/>`; } }
  $('belts').innerHTML=p; if(S.cache.unb!==u){ S.cache.unb=u; $('unb').innerHTML=u; }
}

/* ================= drag (interact.js) ================= */
const ghost=$('ghost');
function stagePt(e){ const r=STAGE.getBoundingClientRect(); return {x:(e.clientX-r.left)/K,y:(e.clientY-r.top)/K}; }
function placeGhost(){ const d=S.drag; ghost.style.left=(d.gx+(d.x-d.sx))+'px'; ghost.style.top=(d.gy+(d.y-d.sy))+'px'; }
const q=s=>$('game').querySelector('[data-drop="'+s+'"]');
function subKey(k){
  const dr=S.drag, p=k.split(':'), t=p[0];
  let bid=null;
  if(t==='card') bid=+p[1];
  else if(t==='bot'&&dr.kind!=='bot'){ const O=BOT(+p[1]); if(O&&O.loc.t==='slot'&&!act(k,false)) bid=O.loc.bid; else return k; }
  else if(t==='bot'&&dr.kind==='bot'){ const O=BOT(+p[1]); if(canMerge(BOT(dr.id),O)) return k; if(O&&O.loc.t==='slot') bid=O.loc.bid; else return 'pad'; }
  if(t==='goal'){ return act('gcost:'+dr.res,false)?'gcost:'+dr.res:k; }
  if(bid==null) return k;
  const b=S.b[bid];
  if(dr.kind==='bot'){ if(b.cracked) return 'card:'+bid; for(let i=0;i<b.slots.length;i++){ const s='slot:'+bid+':'+i; if(act(s,false)) return s; } return 'card:'+bid; }
  for(const c of ['cost','in','exp']){ const s=c+':'+bid+':'+dr.res; if(act(s,false)&&q(s)) return s; }
  for(const s of ['in:'+bid+':*','order:'+bid+':0','order:'+bid+':1','sig:'+bid,'trade:'+bid]) if(act(s,false)&&q(s)) return s;
  return 'card:'+bid;
}
function applyGlow(){
  const bk=dragKind()==='bot', B=bk&&BOT(S.drag.id);
  $('game').querySelectorAll('[data-drop]').forEach(el=>{
    const k=el.dataset.drop, p=k.split(':'), t=p[0]; let ok=act(k,false), cls='glow';
    if(bk){ if(t==='card') ok=ok&&S.b[+p[1]].cracked; else if(t==='bot'){ ok=canMerge(B,BOT(+p[1])); cls='mg'; } else if(t==='goal') ok=false; else if(t==='pad') cls='padglow'; }
    else { if(t==='slot'||t==='pad'||t==='goal'||t==='crate') ok=false; else if(t==='card') ok=ok&&subKey(k)===k; if(t==='bot') cls='mg'; }
    if(ok) el.classList.add(cls);
  });
}
function clearDragDom(){ $('game').querySelectorAll('.glow,.mg,.padglow,.hov').forEach(el=>el.classList.remove('glow','mg','padglow','hov')); }
function beginDrag(ev){
  const el=ev.target;
  if(SCREEN!=='game'||!S||S.paused||S.done||S.drag){ ev.interaction.stop(); return; }
  const [t,a,c]=el.dataset.drag.split(':'); let dr=null;
  if(t==='bot'){ const w=BOT(+a); if(w&&w.upT==null&&w.loc.t!=='repair'&&w.loc.t!=='crate') dr={kind:'bot',id:w.id}; }
  else if(t==='out'){ if((S.b[+a].out.amt[c]||0)>0) dr={kind:'stack',res:c,src:{t:'out',bid:+a}}; }
  else if(t==='pile'){ if((S.pile.amt[a]||0)>0) dr={kind:'stack',res:a,src:{t:'pile'}}; }
  else if(t==='belt'){ if(S.tray>0) dr={kind:'belt',res:c,bid:+a}; }
  if(!dr){ ev.interaction.stop(); return; }
  const r=sRect(el), p=stagePt(ev);
  Object.assign(dr,{el,gx:r.x,gy:r.y,sx:p.x,sy:p.y,x:p.x,y:p.y,hover:null});
  const cl=el.cloneNode(true); cl.style.visibility=''; cl.style.margin='0';
  [cl,...cl.querySelectorAll('*')].forEach(n=>['data-anchor','data-drag','data-drop','data-act'].forEach(x=>n.removeAttribute(x)));
  cl.querySelectorAll('.knob').forEach(n=>n.remove());
  if(dr.kind==='belt') cl.style.position='static';
  ghost.innerHTML=''; ghost.appendChild(cl);
  ghost.style.width=r.w+'px'; ghost.style.height=r.h+'px';
  ghost.style.transformOrigin=(p.x-r.x)+'px '+(p.y-r.y)+'px';
  ghost.classList.remove('hidden','snap'); void ghost.offsetWidth; ghost.classList.add('up');
  S.drag=dr; placeGhost(); sfx('pick');
  if(dr.kind==='stack'){ dr.hand=holder(); const src=srcH(dr), m=take(src,dr.res,src.amt[dr.res]||0); put(dr.hand,dr.res,m.n,m.heats); }
  if(dr.kind==='bot'||(dr.kind==='stack'&&dr.src.t==='pile')) el.style.visibility='hidden';
  applyGlow(); drawBelts(); if(dr.kind==='stack') liveCounts();
}
function moveDrag(ev){ if(!S||!S.drag) return; const p=stagePt(ev); S.drag.x=p.x; S.drag.y=p.y; placeGhost(); if(S.drag.kind==='belt') drawBelts(); }
function dropAt(cx,cy){
  const dr=S.drag; const els=document.elementsFromPoint(cx,cy);
  for(const el of els){ if(ghost.contains(el)) continue;
    let t=el.closest('[data-drop]');
    while(t){ if(t!==dr.el&&!dr.el.contains(t)&&act(t.dataset.drop,false)) return t.dataset.drop; t=t.parentElement&&t.parentElement.closest('[data-drop]'); } }
  return dr.hover&&dr.hover.dataset.drop;
}
let toastT=0;
function toast(html,belt){ const t=$('toast'); t.innerHTML=html; t.classList.add('show'); if(belt) $('game').classList.add('hintbelt'); sfx('toast');
  clearTimeout(toastT); toastT=setTimeout(()=>{ t.classList.remove('show'); $('game').classList.remove('hintbelt'); },3200); }
function beltToast(){
  const depot=S.b.find(b=>b.d.id==='depot');
  toast(S.tray>0?'Belts only here! Drag the yellow plug <span class="knob tk"></span> from a stack to this slot.'
    :beltsTotal()>=BELT_MAX?`All ${BELT_MAX} belts are in use! Tap × on a belt to free one.`
    :depot&&depot.built?'Out of belts! Make more at the Belt Depot, or tap × on a belt to free one.'
    :'Out of belts! Build a Belt Depot to make more.',true);
}
function endDrag(ev){
  const dr=S&&S.drag; if(!dr) return;
  const key=(ev&&ev.clientX!=null)?dropAt(ev.clientX,ev.clientY):(dr.hover&&dr.hover.dataset.drop);
  const did=!!key&&act(key,true);
  if(!did&&dr.kind==='stack'&&S.L.beltOnly&&ev&&ev.clientX!=null){ S.handOk=true; const rk=dropAt(ev.clientX,ev.clientY); S.handOk=false; if(rk&&rk!==key) beltToast(); }
  const giveBack=()=>{ if(dr.kind!=='stack') return; const m=take(dr.hand,dr.res,dr.hand.amt[dr.res]||0); put(srcH(dr),dr.res,m.n,m.heats); };
  if(did) giveBack();
  S.drag=null; S.pressing=false;
  if(did){ sfx('drop'); ghost.classList.add('hidden'); ghost.classList.remove('up'); updateReveal(true); }
  else { sfx('snap'); ghost.classList.add('snap'); ghost.classList.remove('up'); ghost.style.left=dr.gx+'px'; ghost.style.top=dr.gy+'px';
    clearDragDom(); S.pressing=true;
    setTimeout(()=>{ giveBack(); S.pressing=false; if(!S.drag){ ghost.classList.add('hidden'); dr.el.style.visibility=''; } S.cache={}; render(); },200);
    return; }
  clearDragDom(); S.cache={}; render();
}
$('game').addEventListener('pointerdown',e=>{ if(S&&e.target.closest('[data-drag]')) S.pressing=true; },true);
const unpress=()=>{ if(S) S.pressing=false; };
addEventListener('pointerup',unpress); addEventListener('pointercancel',unpress);
interact.dynamicDrop(true);
interact('#game [data-drag]').styleCursor(false).draggable({ listeners:{ start:beginDrag, move:moveDrag, end:endDrag } });
interact('#game [data-drop]').dropzone({
  overlap:'pointer',
  checker:(dragEv,ev,dropped,dz,dzEl)=>dropped&&!!(S&&S.drag)&&dzEl!==S.drag.el&&!S.drag.el.contains(dzEl)&&act(dzEl.dataset.drop,false),
  listeners:{
    dragenter(ev){ if(!S||!S.drag) return; const d=S.drag; if(d.hovEl) d.hovEl.classList.remove('hov');
      d.hover=ev.target; const sk=subKey(ev.target.dataset.drop); d.hovEl=q(sk)||ev.target; d.hovEl.classList.add('hov'); },
    dragleave(ev){ if(!S||!S.drag) return; const d=S.drag; if(d.hover===ev.target){ d.hover=null; if(d.hovEl) d.hovEl.classList.remove('hov'); d.hovEl=null; } }
  }
});
addEventListener('keydown',e=>{ if((e.key==='p'||e.key==='P')&&!e.repeat){ DEBUG=DEBUG===BASE_SPEED?100:BASE_SPEED; if(S) render(); } });


/* ================= first-level tutorial (1-1 only) ================= */
const HAND_URL=(()=>{ const G=['....kk......','...kwwk.....','...kwwk.....','...kwwkkk...','...kwwkwwkk.','.kkkwwkwwkwk','kwwkwwwwwwwk','kwwwwwwwwwwk','.kwwwwwwwwck','..kwwwwwwcck','..kwwwwwwck.','...kkkkkkk..'];
  try{ const c=document.createElement('canvas'); c.width=12; c.height=14; const x=c.getContext('2d'); const P={k:'#2b1d14',w:'#ffffff',c:'#d8cfbe'};
    G.forEach((row,y)=>[...row].forEach((ch,i)=>{ if(P[ch]){ x.fillStyle=P[ch]; x.fillRect(i,y+1,1,1); } })); return c.toDataURL(); }catch(e){ return ''; } })();
const tq=s=>$('game').querySelector(s);
const tHeap=()=>S.b[0], tBin=()=>S.b[2];
const tPadBot=()=>{ const ws=[...$('game').querySelectorAll('.pbot [data-drag^="bot:"]')]; if(!ws.length) return tq('[data-drop="slot:0:1"] [data-drag^="bot:"]');
  const T=S.tut; let el=T&&T.bot!=null&&ws.find(w=>w.dataset.drag==='bot:'+T.bot); if(!el){ el=ws[0]; if(T) T.bot=+el.dataset.drag.slice(4); } return el; };
const tScrap=()=>tq('[data-anchor="out:0:scrap"]');
const heapBots=()=>tHeap().slots.filter(x=>x!=null).length;
const TSTEPS=[
 {txt:()=>'Drag a <b>bot</b> into the <b>Scrap Heap</b>!',from:tPadBot,to:()=>tq('[data-drop="slot:0:'+(tHeap().slots[0]==null?0:1)+'"]'),carry:'bot',done:()=>heapBots()>=1},
 {txt:()=>'One more bot! Two bots work faster.',from:tPadBot,to:()=>tq('[data-drop="slot:0:'+(tHeap().slots[1]==null?1:0)+'"]'),carry:'bot',done:()=>heapBots()>=2},
 {txt:()=>`Look! They make <b>scrap</b> ${ART.ic('scrap',22)}. Wait for 10.`,at:tScrap,min:2.5,done:()=>(tHeap().out.amt.scrap||0)>=10||(tBin().paid.scrap||0)>=10||tBin().built},
 {txt:()=>`Drag the scrap ${ART.ic('scrap',22)} to the <b>Bolt Bin</b> plan!`,from:tScrap,to:()=>tq('[data-drop="cost:2:scrap"]'),carry:'scrap',done:()=>tBin().built||(tBin().paid.scrap||0)>=10},
 {txt:()=>'All paid! Tap <b>BUILD</b>!',tap:()=>S.cellEls[2].querySelector('.bbtn'),done:()=>tBin().built},
 {txt:()=>`Put a bot in the <b>Bolt Bin</b>. It makes bolts ${ART.ic('bolt',22)}!`,from:tPadBot,to:()=>tq('[data-drop="slot:2:0"]'),carry:'bot',done:()=>tBin().slots.some(x=>x!=null)},
 {txt:()=>`Now feed the <b>rocket</b>! Drag scrap ${ART.ic('scrap',22)} here.`,from:tScrap,to:()=>tq('[data-drop="gcost:scrap"]'),carry:'scrap',done:()=>(S.goalPaid.scrap||0)>0||S.goalStage>0},
 {txt:()=>'Fill every box, then tap <b>BUILD STAGE</b>. You can do it!',at:()=>S.goalEl&&S.goalEl.querySelector('.bpr'),ok:true}
];
function tutStart(){ if(!S) return; S.tut={step:-1,t:0}; $('tut').classList.remove('hidden'); tutGo(0); }
function tutEnd(){ if(S) S.tut=null; $('tut').classList.add('hidden'); prof().tut1=true; save(); }
function tutGo(n){
  const T=S.tut; while(n<TSTEPS.length-1&&TSTEPS[n].done&&TSTEPS[n].done()&&!TSTEPS[n].min) n++;
  T.step=n; T.t=0; const st=TSTEPS[n], bub=document.querySelector('#tut .tbub');
  bub.innerHTML=`<span class="tstep">${n+1}/${TSTEPS.length}</span><span class="tbot">${botStatic({c:'#ffd23f'})}</span><span style="flex:1">${st.txt()}</span>`+(st.ok?'<span class="tbtn go" data-act="tutok">OK!</span>':'<span class="tbtn" data-act="tutskip">SKIP</span>');
  bub.classList.remove('pop'); void bub.offsetWidth; bub.classList.add('pop');
  const hand=document.querySelector('#tut .thand'); hand.style.backgroundImage=`url(${HAND_URL})`;
  hand.querySelector('.tcarry').innerHTML=st.carry==='bot'?botStatic():st.carry?ART.ic(st.carry,30):'';
  T.vars=null; if(n>0) sfx('toast');
}
function ctr(el){ const r=sRect(el); return {x:r.x+r.w/2,y:r.y+r.h/2,r}; }
function setVar(el,k,v){ const s=v.toFixed(0)+'px'; if(el._v===undefined) el._v={}; if(el._v[k]!==s){ el._v[k]=s; el.style.setProperty(k,s); } }
function placeRing(el,target){ if(!target){ el.classList.remove('on'); return; } const r=sRect(target), p=7;
  el.style.left=(r.x-p)+'px'; el.style.top=(r.y-p)+'px'; el.style.width=(r.w+p*2)+'px'; el.style.height=(r.h+p*2)+'px'; el.classList.add('on'); }
function tutTick(dt){
  const T=S&&S.tut, box=$('tut'); if(!T){ return; }
  const hidden=SCREEN!=='game'||S.paused||S.done; box.classList.toggle('hidden',hidden); if(hidden) return;
  T.t+=dt; const st=TSTEPS[T.step];
  if(st.done&&st.done()&&T.t>=(st.min||0)){ tutGo(T.step+1); return; }
  const A=st.from&&st.from(), B=(st.to&&st.to())||(st.tap&&st.tap())||(st.at&&st.at());
  const hand=box.querySelector('.thand'), ra=box.querySelector('.tring.a'), rb=box.querySelector('.tring.b'), bub=box.querySelector('.tbub');
  const dragging=!!S.drag;
  placeRing(ra,dragging?null:A); placeRing(rb,B);
  const mode=dragging||!B?'':(A?'drag':'tap');
  if(hand._m!==mode){ hand._m=mode; hand.className='thand'+(mode?' '+mode:''); }
  if(B){ const b=ctr(B); setVar(hand,'--tbx',b.x-18); setVar(hand,'--tby',b.y-(st.at?b.r.h/2+46:2));
    if(A){ const a=ctr(A); setVar(hand,'--tax',a.x-18); setVar(hand,'--tay',a.y-2); }
  }
  { const bw=bub.offsetWidth||440; const x=Math.round(666-bw/2); if(bub._x!==x){ bub._x=x; bub.style.left=x+'px'; bub.style.top='70px'; } }

}

/* ================= actions ================= */
function openPause(){ S.paused=true; $('slSfx').value=DATA.settings.sfx; $('slMus').value=DATA.settings.mus; slLabels(); $('pause').classList.remove('hidden'); }
function slLabels(){ $('vSfx').textContent=+$('slSfx').value?$('slSfx').value:'Off'; $('vMus').textContent=+$('slMus').value?$('slMus').value:'Off'; }
$('slSfx').oninput=e=>{ DATA.settings.sfx=+e.target.value; ensureAudio(); sounds.gain.value=level(DATA.settings.sfx); slLabels(); sfx('tap'); };
$('slMus').oninput=e=>{ DATA.settings.mus=+e.target.value; ensureAudio(); music.gain.value=level(DATA.settings.mus); slLabels(); };
$('slSfx').onchange=$('slMus').onchange=()=>save();
function levelComplete(){
  S.done=true; prof().done[dk(S.ci,S.i)]=true; save(); sfx('fanfare'); hushUntil=performance.now()+1500;
  if(S.i===9){ setTimeout(()=>runFinale(S.ci),700); return; }
  $('dnTitle').textContent=CH[S.ci].parts[S.i].n.toUpperCase()+' BUILT!';
  $('dnRk').innerHTML=ART.plot(S.ci,CH[S.ci].parts.map((_,j)=>j<=S.i),-1,0,S.i);
  setTimeout(()=>sfx('clamp',0,true),1550);
  $('dnNext').classList.toggle('hidden',S.i>=9);
  $('done').classList.remove('hidden');
}
let finTimers=[];
function runFinale(ci){
  show('finale'); finTimers.forEach(clearTimeout); finTimers=[];
  const counts={bots:Math.max(4,Math.min(8,crewN().filter(w=>!isAlien(w)).length)),aliens:ci===2?Math.max(3,Math.min(6,crewN().filter(isAlien).length)):0};
  $('finScene').innerHTML=ART.finale(ci,counts); $('finEnd').classList.add('hidden');
  const root=$('finScene').firstElementChild; const set=f=>{ root.classList.remove('f1','f2','f3'); root.classList.add('f'+f); };
  const T=[[[500,1,'launch'],[3800,2,'landing'],[6400,3,'fanfare']],[[800,1,'saucer'],[3400,2,'warp'],[6200,3,'saucer']],[[1200,1,'warp'],[2400,2,'party'],[3600,3,'party']]][ci];
  T.forEach(([ms,f,s])=>finTimers.push(setTimeout(()=>{ set(f); sfx(s); },ms)));
  finTimers.push(setTimeout(()=>$('finEnd').classList.remove('hidden'),T[T.length-1][0]+1400));
}
const ACT={
  player:k=>{ DATA.player=k; save(); renderHome(); },
  play:()=>{ ensureAudio(); MAPCH=[2,1,0].find(ci=>chOpen(ci)); renderMap(); show('map'); },
  home:()=>{ renderHome(); show('home'); },
  ch:ci=>{ MAPCH=+ci; renderMap(); musicFor(); },
  lvl:i=>renderIntro(MAPCH,+i),
  go:()=>startLevel(pending.ci,pending.i),
  pause:()=>{ if(S&&!S.done) openPause(); },
  info:()=>{ if(!S||S.done) return; S.paused=true; const c=CH[S.ci];
    $('ifCh').textContent=`CHAPTER ${S.ci+1} · ${c.title.toUpperCase()}`; $('ifTitle').innerHTML=`<span style="color:#c42f4a">${S.i+1}</span> · ${S.L.name.toUpperCase()}`;
    $('ifNew').textContent=S.L.nw; $('ifTut').classList.toggle('hidden',!(S.ci===0&&S.i===0)); $('ifPart').innerHTML=`${ART.partTile(S.ci,S.i)}${c.parts[S.i].n}`; $('info').classList.remove('hidden'); },
  tutskip:()=>tutEnd(),
  tutok:()=>{ sfx('stage',0,true); tutEnd(); },
  tutreplay:()=>{ $('info').classList.add('hidden'); if(S){ S.paused=false; tutStart(); } },
  closeinfo:()=>{ $('info').classList.add('hidden'); if(S) S.paused=false; },
  resume:()=>{ S.paused=false; $('pause').classList.add('hidden'); },
  tomap:()=>{ if(S){ S.paused=true; S.done=true; MAPCH=S.ci; } $('pause').classList.add('hidden'); $('info').classList.add('hidden'); $('done').classList.add('hidden'); renderMap(); show('map'); },
  finmap:()=>{ finTimers.forEach(clearTimeout); MAPCH=Math.min(2,(S?S.ci:0)+1); if(!chOpen(MAPCH)) MAPCH=S.ci; renderMap(); show('map'); },
  next:()=>{ $('done').classList.add('hidden'); renderIntro(S.ci,S.i+1); },
  build:id=>{ const b=S.b[+id]; if(b.built) return; if(!Object.entries(b.d.cost).every(([r,n])=>(b.paid[r]||0)>=n)) return;
    b.built=true; onBuilt(b,true); sfx('build'); fx(S.cellEls[b.id],'BUILT!','g'); pruneBelts(); updateReveal(true); render(); },
  expand:id=>{ const b=S.b[+id]; if(b.lv!==1||!Object.entries(b.d.exp).every(([r,n])=>(b.ep[r]||0)>=n)) return; b.lv=2; while(b.slots.length<slotCount(b)) b.slots.push(null); sfx('expand'); fx(S.cellEls[b.id],'LV2!','b'); pruneBelts(); render(); },
  recipe:(id,j)=>{ S.b[+id].recipe=+j; sfx(S.b[+id].d.kind==='mixer'?'mix':'tap'); render(); },
  power:id=>{ const b=S.b[+id]; if(b.on){ b.on=false; sfx('powerOff'); } else if(powerUsed()<powerCap()){ b.on=true; sfx('powerOn'); } else toast('Not enough power! Turn another one off, or build a Big Panel.'); render(); },
  harvest:(id,j)=>{ const b=S.b[+id]; if(b.pots[+j]<1) return; b.pots[+j]=-1; put(b.out,'veg',3); sfx('harvest'); fx(S.cellEls[b.id],'+3','g'); updateReveal(true); render(); },
  pick:id=>{ const k=S.spills.findIndex(s=>s.id===+id); if(k<0) return; const s=S.spills[k]; put(S.pile,s.r,s.n); S.spills.splice(k,1); sfx('coin'); render(); },
  goal:()=>{ if(!goalReady()) return; S.goalStage++; S.goalPaid={}; S.hf=0; pruneBelts(); if(S.goalStage<S.L.goal.length) sfx('stage'); fx(S.goalEl,S.goalStage>=S.L.goal.length?'COMPLETE!':'+10% FASTER!');
    S.b.forEach(b=>{ if(b.d.unlock!=null&&!b.built&&S.goalStage>=b.d.unlock){ b.built=true; onBuilt(b,true); b.newUntil=S.t+1.2; } }); render(); if(S.goalStage>=S.L.goal.length) levelComplete(); },
  unbelt:k=>{ S.belts.splice(+k,1); S.tray++; sfx('retract'); render(); }
};
const QUIET=['tutok','build','expand','goal','recipe','power','harvest','pick','unbelt'];
function runAct(el){ const [t,a,c]=el.dataset.act.split(':'); if(!QUIET.includes(t)) sfx('tap'); if(ACT[t]) ACT[t](a,c); }
$('game').addEventListener('pointerdown',e=>{ const el=e.target.closest('[data-act]'); if(!el||(S&&S.drag)) return; e.preventDefault(); ensureAudio(); runAct(el); });
STAGE.addEventListener('click',e=>{ const el=e.target.closest('[data-act]'); if(!el||$('game').contains(el)) return; ensureAudio(); runAct(el); });

/* ================= loop ================= */
let last=performance.now(), lastR=0;
function loop(now){
  const dt=Math.min(0.1,(now-last)/1000); last=now;
  if(S&&S.tut) tutTick(dt);
  if(SCREEN==='game'&&S&&!S.paused&&!S.done){ tick(dt); updateBars(); if(now-lastR>90){ lastR=now; if(!S.drag&&!S.pressing) render(); else if(S.drag) liveCounts(); } }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
document.addEventListener('visibilitychange',()=>{ if(document.hidden&&SCREEN==='game'&&S&&!S.done&&!S.paused) openPause(); });
Store.ready(()=>{
  const d=Store.get();
  if(d&&d.profiles){ gen=d.gen||0; DATA.profiles.caleb=d.profiles.caleb||{done:{}}; DATA.profiles.ezra=d.profiles.ezra||{done:{}};
    DATA.settings=Object.assign(DATA.settings,d.settings||{}); DATA.player=d.player||'caleb'; }
  renderHome(); show('home');
});
renderHome();
