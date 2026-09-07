import pw from '/home/claude/.npm-global/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1440,height:900} });
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('file:///home/claude/build/index.html');
await p.evaluate(()=>{ localStorage.clear();          // the game lives in the database now
  var st = ArcadeStore('dragonseed'); st.remove(); st.remove('snaps'); st.flush(); });
await p.waitForTimeout(150);
await p.reload(); await p.click('#startBtn'); await p.waitForTimeout(200);

// the opening still opens
const pro = await p.evaluate(()=>({
  story: !!document.querySelector('#story .pro__card'),
  hidden: getComputedStyle(document.querySelector('#board')).visibility,
  title: document.querySelector('.pro__title')?.textContent }));
console.log('prologue', pro);

await p.evaluate(()=>Engine.prologueStep(99)); await p.waitForTimeout(150);
console.log('after skip: story empty?', await p.evaluate(()=>!document.querySelector('#story .pro')),
            'board', await p.evaluate(()=>getComputedStyle(document.querySelector('#board')).visibility));

// night 1 — plain scene, no egg, no choice
await p.evaluate(()=>{ Engine.state.coach=-1; Engine.endDay('test'); }); await p.waitForTimeout(200);
console.log('night1', await p.evaluate(()=>({
  card: !!document.querySelector('#story .pro__card'),
  kicker: document.querySelector('.pro__kicker')?.textContent,
  title: document.querySelector('.pro__title')?.textContent,
  quote: !!document.querySelector('.pro__quoteline'),
  rail: document.querySelector('#visitor')?.textContent.trim().length,
  btn: document.querySelector('#story .primary')?.textContent })));
await p.click('#story .primary'); await p.waitForTimeout(200);
console.log('after close', await p.evaluate(()=>({
  story: !!document.querySelector('#story .pro'),
  dayend: !!document.querySelector('.dayend__title'),
  dayendText: document.querySelector('.dayend__title')?.textContent })));

// night 2 — the egg asks
await p.evaluate(()=>{ Engine.startNextDay(); Engine.state.mapCoach=-1;
  const need = Engine.eveningFor(2).egg.needs;
  const pick = SPECIMENS.filter(s=>s.effect===need).slice(0,2).concat(SPECIMENS.slice(0,3));
  pick.forEach(s=>{ Engine.state.pots[s.id]=true; Engine.state.identified[s.id]=true; });
  Engine.endDay('test'); }); await p.waitForTimeout(220);
const egg = await p.evaluate(()=>({
  title: document.querySelector('.pro__title')?.textContent,
  what: document.querySelector('.eve2__eggwhat')?.textContent,
  pots: [...document.querySelectorAll('.eve2__pot')].map(e=>e.textContent).slice(0,6),
  leave: document.querySelector('#story .linkbtn')?.textContent }));
console.log('night2', egg);
await p.evaluate(()=>document.querySelector('.eve2__pot').click()); await p.waitForTimeout(260);
console.log('picked up', await p.evaluate(()=>({
  title: document.querySelector('.pro__title')?.textContent,
  used: document.querySelector('.eve2__whatline')?.textContent,
  give: [...document.querySelectorAll('.pro__acts button')].map(b=>b.textContent) })));
await p.evaluate(()=>[...document.querySelectorAll('.pro__acts button')]
  .find(b=>/^Give it/.test(b.textContent)).click()); await p.waitForTimeout(260);
console.log('fed', await p.evaluate(()=>({
  title: document.querySelector('.pro__title')?.textContent,
  plate: !!document.querySelector('.eve2__plate svg, .eve2__plate img'),
  body: document.querySelector('.pro__p')?.textContent.slice(0,50),
  modal: !!document.querySelector('#modal .modal, .modal__card'),
  btn: document.querySelector('#story .primary')?.textContent })));
await p.click('#story .primary'); await p.waitForTimeout(200);
console.log('closed', await p.evaluate(()=>({ story:!!document.querySelector('#story .pro'),
  dayend: !!document.querySelector('.dayend__title') })));

// nights 3-6 are plain; night 7 is the first choice
for (const _ of [3,4,5,6]) {
  await p.evaluate(()=>{ Engine.startNextDay(); Engine.state.clueCoach=-1;
    while (Engine.state.modal) Engine.closeModal(); Engine.endDay('test'); });
  await p.waitForTimeout(160);
  await p.evaluate(()=>{ if (Engine.state.evening) Engine.eveningDone(); });
  await p.waitForTimeout(120);
  await p.evaluate(()=>{ if (Engine.state.evening) Engine.eveningDone(); });
  await p.waitForTimeout(120);
}
await p.evaluate(()=>{ Engine.startNextDay();
  while (Engine.state.modal) Engine.closeModal(); Engine.endDay('test'); });
await p.waitForTimeout(220);
console.log('night7', await p.evaluate(()=>({
  day: Engine.today().day,
  prompt: document.querySelector('.pro__prompt')?.textContent.slice(0,60),
  opts: [...document.querySelectorAll('.evebtn')].map(e=>e.textContent),
  letter: !!document.querySelector('.eve2__letterbody'),
  escape: !!document.querySelector('#story .primary') })));
await p.evaluate(()=>document.querySelectorAll('.evebtn')[0].click()); await p.waitForTimeout(220);
console.log('chose', await p.evaluate(()=>({
  title: document.querySelector('.pro__title')?.textContent,
  body: document.querySelector('.pro__p')?.textContent.slice(0,60),
  flags: Object.keys(Engine.state.flags),
  btn: document.querySelector('#story .primary')?.textContent })));
await p.click('#story .primary'); await p.waitForTimeout(200);
console.log('closed7', await p.evaluate(()=>({ story:!!document.querySelector('#story .pro'),
  dayend: !!document.querySelector('.dayend__title'),
  seen: Object.keys(Engine.state.eveningsSeen) })));

// a save reload mid-evening should come back to the evening
await p.evaluate(()=>{ Engine.startNextDay();
  while (Engine.state.modal) Engine.closeModal(); Engine.endDay('test'); }); await p.waitForTimeout(300);
await p.reload(); await p.waitForTimeout(200); await p.click('#startBtn'); await p.waitForTimeout(300);
console.log('reload mid-night', await p.evaluate(()=>({
  card: !!document.querySelector('#story .pro__card'),
  title: document.querySelector('.pro__title')?.textContent })));

console.log('errors', errs);
await b.close();
