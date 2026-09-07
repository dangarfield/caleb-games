/* Every cutting that reaches the shelf raises a card — handed over, or dug up.
   And the card never says the name of a plant you have not identified. */
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

// nothing pops behind the opening panels
await p.evaluate(()=>{ Engine.state.pots={}; });
console.log('during the prologue', await p.evaluate(()=>({ pro: Engine.inPrologue(), modal: !!Engine.state.modal })));
await p.evaluate(()=>{ Engine.prologueStep(99); const st=Engine.state; st.coach=-1; st.mapCoach=-1; st.clueCoach=-1; });
await p.waitForTimeout(150);

// every card raised over five days, and whether any of them names an unnamed plant
const out = await p.evaluate(()=>{
  const cards=[], leaks=[];
  for (let i=0;i<400;i++){
    const st=Engine.state;
    if (st.modal && st.modal.kind!=='rite'){
      const m=st.modal;
      if (m.artIds) {
        cards.push({day:Engine.today().day, n:m.artIds.length, title:m.title});
        m.artIds.forEach(id=>{ const s=Clues.specimenById(id);
          if (!Engine.isIdentified(id) && (m.title+m.body).indexOf(s.name)!==-1) leaks.push(s.name); });
      }
      Engine.closeModal(); continue;
    }
    if (st.rite){ st.rite=null; st.modal=null; st.dread=0; continue; }
    if (st.evening){ Engine.eveningDone(); if(Engine.state.evening) Engine.eveningDone(); continue; }
    if (st.dayOver){ if (Engine.today().day>=5) break; Engine.startNextDay(); continue; }
    Engine.dismissVisitor();
  }
  return {cards, leaks};
});
console.log('cards over five days:', out.cards.length, '— cuttings:',
            out.cards.reduce((a,c)=>a+c.n,0));
console.log('names given away:', out.leaks);

// gathering raises the same card
await p.evaluate(()=>{ const st=Engine.state;
  if (st.dayOver) { if (st.evening) Engine.eveningDone(); Engine.startNextDay(); }
  while (Engine.state.modal) Engine.closeModal();
  HABITATS.forEach(h=>{ st.knownHabitats[h.id]=true; }); });
await p.waitForTimeout(200);
const gathered = await p.evaluate(()=>{
  const h = HABITATS.find(x=>Engine.exists(x) && !Engine.isShut(x) &&
    SPECIMENS.some(s=>s.habitat===x.id && !Engine.hasPot(s.id)));
  Engine.probeCell(h.cell);
  const m=Engine.state.modal;
  return { title:m.title, body:m.body, arts:(m.artIds||[]).length, place:h.short };
});
console.log('gathered', gathered);
await p.waitForTimeout(200);
await p.screenshot({path:'/tmp/pot-gather.png'});
console.log('errors', errs);
await b.close();
