/* The first four days underline the words that matter; day five does not. */
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
await p.evaluate(()=>{ Engine.prologueStep(99); const st=Engine.state; st.coach=-1; st.mapCoach=-1; st.clueCoach=-1; });
await p.waitForTimeout(150);

// the data: which days carry marks at all
console.log('days with underlines', await p.evaluate(()=>DAYS.map(d=>
  d.day + ':' + d.visitors.filter(v=>v.hi&&v.hi.length).length)));

// every marked phrase really is in its line
console.log('phrases missing from their line', await p.evaluate(()=>{
  const bad=[]; DAYS.forEach(d=>d.visitors.forEach(v=>(v.hi||[]).forEach(h=>{
    if (v.line.indexOf(h)===-1) bad.push(v.id+': '+h); })));
  return bad; }));

// rendered, typed out, in the DOM
const seen=[];
for (let i=0;i<4;i++){
  const marks = await p.evaluate(()=>{
    const out=[];
    for (let k=0;k<20;k++){
      const st=Engine.state;
      if (st.modal){ Engine.closeModal(); continue; }
      break;
    }
    return null;
  });
  await p.evaluate(()=>document.querySelector('.vis')?.click()); await p.waitForTimeout(200);
  seen.push(await p.evaluate(()=>({ day: Engine.today().day, who: Engine.visitor()?.name,
    marks: [...document.querySelectorAll('.vis__key')].map(e=>e.textContent) })));
  await p.evaluate(()=>{ Engine.dismissVisitor(); while(Engine.state.modal) Engine.closeModal(); });
  await p.waitForTimeout(250);
}
console.log(seen);

// day five is on its own
await p.evaluate(()=>{
  for (let i=0;i<300;i++){
    const st=Engine.state;
    if (st.modal && st.modal.kind!=='rite'){ Engine.closeModal(); continue; }
    if (st.rite){ st.rite=null; st.modal=null; st.dread=0; continue; }
    if (st.evening){ Engine.eveningDone(); if(Engine.state.evening) Engine.eveningDone(); continue; }
    if (st.dayOver){ Engine.startNextDay(); if (Engine.today().day>=5) return; continue; }
    Engine.dismissVisitor();
  }
});
await p.evaluate(()=>{ while(Engine.state.modal) Engine.closeModal(); document.querySelector('.vis')?.click(); });
await p.waitForTimeout(400);
console.log('day 5', await p.evaluate(()=>({ day: Engine.today().day,
  marks: document.querySelectorAll('.vis__key').length,
  text: document.querySelector('.vis__line')?.textContent.slice(0,60) })));
console.log('errors', errs);
await b.close();
