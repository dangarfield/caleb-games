/* going out: as often as you like, and a wasted walk costs a pip of dread.
   Also: helping somebody wipes the book search and the effect filter. */
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

// two trips in one day, both to places that still have something on them
console.log('two trips', await p.evaluate(()=>{
  const st=Engine.state;
  HABITATS.forEach(h=>{ st.knownHabitats[h.id]=true; });   // pretend we found them all
  const out=[];
  for (let i=0;i<2;i++){
    const h = HABITATS.find(x=>Engine.exists(x) && !Engine.isShut(x) &&
      SPECIMENS.some(s=>s.habitat===x.id && !Engine.hasPot(s.id)));
    const pots = Object.keys(st.pots).length;
    Engine.probeCell(h.cell); while (Engine.state.modal) Engine.closeModal();
    out.push({ place:h.short, gained: Object.keys(st.pots).length - pots,
               trips: st.tripsToday, dread: st.dread });
  }
  return out;
}));

// a place you have stripped bare: still lets you go, and charges you for it
console.log('wasted trip', await p.evaluate(()=>{
  const st=Engine.state;
  const h = HABITATS.find(x=>Engine.exists(x) && !Engine.isShut(x));
  SPECIMENS.filter(s=>s.habitat===h.id).forEach(s=>{ st.pots[s.id]=true; });
  const d0=st.dread, t0=st.tripsToday, pots0=Object.keys(st.pots).length;
  Engine.probeCell(h.cell);
  const modal = { kind: Engine.state.modal?.kind, title: Engine.state.modal?.title,
                  body: (Engine.state.modal?.body||'').slice(0,60) };
  while (Engine.state.modal && Engine.state.modal.kind !== 'rite') Engine.closeModal();
  return { place:h.short, dread:[d0, st.dread], trips:[t0, st.tripsToday],
           potsUnchanged: Object.keys(st.pots).length===pots0, modal,
           log: st.log[0] };
}));

// dread caps out and lays the rite behind the card, as a wrong answer does
console.log('third wasted trip', await p.evaluate(()=>{
  const st=Engine.state;
  const h = HABITATS.find(x=>Engine.exists(x) && !Engine.isShut(x));
  Engine.probeCell(h.cell); while (Engine.state.modal && Engine.state.modal.kind!=='rite') Engine.closeModal();
  Engine.probeCell(h.cell); while (Engine.state.modal && Engine.state.modal.kind!=='rite') Engine.closeModal();
  return { dread: st.dread, modal: Engine.state.modal?.kind, rite: !!st.rite };
}));

// a new day resets the count
console.log('new day', await p.evaluate(()=>{
  while (Engine.state.modal && Engine.state.modal.kind==='rite'){
    const o=Engine.state.rite; if(!o) break;
    for (let i=0;i<o.length;i++) for (let j=0;j<o.length;j++) Engine.riteSwap(i,j);
    if (Engine.state.rite===null) break; else break;
  }
  Engine.state.rite=null; Engine.state.modal=null; Engine.state.dread=0;
  Engine.endDay('test'); if (Engine.state.evening) Engine.eveningDone();
  Engine.startNextDay();
  return { day: Engine.today().day, trips: Engine.state.tripsToday };
}));

// helping somebody clears the search and the filter
console.log('book cleared', await p.evaluate(()=>{
  const st=Engine.state;
  const d=Engine.today();
  const v=d.visitors.find(x=>x.kind==='show'||x.kind==='effect'||x.kind==='describe');
  st.visitorIndex=d.visitors.indexOf(v);
  const want=SPECIMENS.find(s=>Clues.answers(s,v));
  st.pots[want.id]=true; st.pages[want.id]=true; st.identified[want.id]=true;
  Engine.openOverlay('book');
  Engine.setBookQuery('sleep'); Engine.setBookEffect(want.effect); Engine.setBookPick(want.id);
  const before={ q:st.bookQuery, e:st.bookEffect, pick:st.bookPick, spread:st.bookSpread };
  Engine.give(want.id);
  return { before, after:{ q:st.bookQuery, e:st.bookEffect, pick:st.bookPick, spread:st.bookSpread },
           served: st.served, who: v.name };
}));
await p.waitForTimeout(150);
console.log('search box after', await p.evaluate(()=>{
  while (Engine.state.modal) Engine.closeModal();
  Engine.openOverlay('book');
  return document.querySelector('.book__tools .search')?.value;
}));
console.log('errors', errs);
await b.close();
