/* Species has to be a real gate: the right effect for the wrong species is wrong. */
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
const out = await p.evaluate(()=>{
  const st=Engine.state; st.coach=-1;
  // day 5: Goodwife Pell wants a cough cure FOR A DRAGON
  for(let i=0;i<4;i++) Engine.startNextDay();
  SPECIMENS.forEach(s=>{ if(Engine.hasPot(s.id)&&Engine.hasPage(s.id)) st.identified[s.id]=true; });
  while(Engine.visitor() && Engine.visitor().id!=='v_pell5') Engine.state.visitorIndex++;
  const v=Engine.visitor();
  const human = SPECIMENS.find(s=>s.effect==='cough' && s.species==='human');
  const dragon = SPECIMENS.find(s=>s.effect==='cough' && s.species==='dragon');
  const r={ visitor:v.name, who:v.who, line:v.line.slice(0,64),
            humanPlant:human.name, dragonPlant:dragon.name,
            humanUse:human.use.slice(0,58), dragonUse:dragon.use.slice(0,58) };
  st.pots[human.id]=st.pages[human.id]=st.identified[human.id]=true;
  st.pots[dragon.id]=st.pages[dragon.id]=st.identified[dragon.id]=true;
  const d0=st.dread;
  Engine.give(human.id);                       // right effect, wrong species
  r.wrongSpeciesRejected = Engine.state.dread > d0;
  while(Engine.state.modal) Engine.closeModal();
  const served0 = Engine.state.served;
  Engine.give(dragon.id);                       // right effect, right species
  r.rightSpeciesAccepted = Engine.state.served > served0;
  // and the book can be searched by who it is for
  r.searchDragon = SPECIMENS.filter(s=>Clues.search(s,'dragons',true)).length;
  r.searchCough = SPECIMENS.filter(s=>Clues.search(s,'cough',true)).map(s=>s.name+'/'+s.species);
  return r;
});
console.log(JSON.stringify({errs,...out},null,1));
await b.close();
