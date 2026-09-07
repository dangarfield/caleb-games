import fs from 'node:fs';
fs.mkdirSync('/tmp/dsshots', { recursive: true });
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
await p.evaluate(()=>Engine.prologueStep(99)); await p.waitForTimeout(150);
await p.evaluate(()=>{ const st=Engine.state; st.coach=-1; st.mapCoach=-1; st.clueCoach=-1;
  for(let i=0;i<4;i++) Engine.startNextDay();
  st.knownHabitats['coast']=true; delete st.leads['coast'];
  SPECIMENS.forEach(s=>{ if(Engine.hasPot(s.id)&&Engine.hasPage(s.id)) st.identified[s.id]=true; });
  Engine.openOverlay('map'); });
await p.waitForTimeout(250);
const a = await p.evaluate(()=>({ tip: document.querySelector('.shuttip')?.textContent?.trim().slice(0,60),
  shutCells: document.querySelectorAll('.mapcell--shut').length }));
await p.evaluate(()=>Engine.probeCell('B2')); await p.waitForTimeout(250);
const c = await p.evaluate(()=>({
  panel: !!document.querySelector('.shut'),
  name: document.querySelector('.shut__name')?.textContent,
  why: document.querySelector('.shut__why')?.textContent,
  wants: document.querySelector('.give--shut .give__sub')?.textContent,
  onShelf: [...document.querySelectorAll('.shut__have .bookbtn')].map(x=>x.textContent) }));
await p.screenshot({path:'/tmp/dsshots/g1.png', clip:{x:215,y:45,width:620,height:420}});
const before = await p.evaluate(()=>Engine.hasPot('n635'));
await p.evaluate(()=>document.querySelector('.shut__have .bookbtn').click()); await p.waitForTimeout(250);
const after = await p.evaluate(()=>({ modal: document.querySelector('.modal__title')?.textContent,
  body: document.querySelector('.modal__body')?.textContent?.slice(0,120),
  liverstonePot: Engine.hasPot('n635'), liverstonePage: Engine.hasPage('n635'),
  opened: Engine.state.opened['coast'] }));
console.log(JSON.stringify({errs,a,c,before,after},null,1));
await b.close();
