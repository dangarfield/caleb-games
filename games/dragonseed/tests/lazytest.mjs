/* The counter-only player: never opens the map, never reads a note. This SHOULD
   fail now — the map and the drawer are the critical path. */
import pw from '/home/claude/.npm-global/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1440,height:900} });
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('file:///home/claude/build/index.html');
await p.evaluate(()=>{ localStorage.clear();          // the game lives in the database now
  var st = ArcadeStore('dragonseed'); st.remove(); st.remove('snaps'); st.flush(); });
await p.waitForTimeout(150);
await p.reload(); await p.click('#startBtn'); await p.waitForTimeout(250);
await p.evaluate(()=>Engine.prologueStep(99)); await p.waitForTimeout(150);
const r = await p.evaluate(() => {
  const stuck=[]; const sellableish = id => Engine.hasPot(id) && Engine.hasPage(id);
  const fits = (s,who) => !who || who==='both' || s.species===who || s.species==='both';
  function ensureNamed(s){
    if (Engine.isIdentified(s.id)) return true;
    if (!Engine.hasPage(s.id)) return false;
    Engine.placeOnDesk(s.id); ['colour','form','petals'].forEach(a=>Engine.reveal(s.id,a));
    return Engine.nameAs(s.id, s.id);
  }
  function pick(v){
    if (v.kind==='effect')
      return SPECIMENS.filter(s=>s.effect===v.needs && fits(s,v.who) && sellableish(s.id))[0]||null;
    for (const id of (v.accepts||[])) if (sellableish(id)) return Clues.specimenById(id);
    return null;
  }
  for (let g=0; g<2000; g++){
    const st=Engine.state;
    if (st.modal && st.modal.kind==='rite'){
      for (let t=0;t<6;t++){ const o=Engine.state.rite; if(!o) break;
        if(o[t]===t) continue; Engine.riteSwap(o.indexOf(t), t); } continue; }
    if (st.modal){ Engine.closeModal(); continue; }
    if (st.finished) break;
    if (st.evening){ Engine.eveningDone(); continue; }          // never feeds the egg either
    if (st.dayOver){ Engine.startNextDay(); continue; }
    const d=Engine.today(), v=Engine.visitor();
    if (!v){ Engine.endDay(null); continue; }
    if (['visit','gift','lead'].includes(v.kind)){ Engine.dismissVisitor(); continue; }
    if (v.kind==='recipe'){
      let ok=true;
      for (const need of v.needs){
        const c=SPECIMENS.filter(x=>x.effect===need && fits(x,v.who) && sellableish(x.id))[0];
        if(!c || !ensureNamed(c)){ stuck.push(`day ${d.day} ${v.name} (recipe): no ${need}`); ok=false; break; }
        Engine.give(c.id);
      }
      if(!ok){ Engine.endDay('stuck'); } continue;
    }
    const s=pick(v);
    if(!s || !ensureNamed(s)){ stuck.push(`day ${d.day} ${v.name} (${v.kind}): nothing on the shelf answers it`);
                               Engine.endDay('stuck'); continue; }
    const d0=Engine.state.dread;
    Engine.give(s.id);
    if (Engine.state.dread > d0){ stuck.push(`day ${d.day} ${v.name}: ${s.name} refused`); Engine.endDay('stuck'); }
  }
  return { stuck, served: Engine.state.served, opened: Object.keys(Engine.state.opened).length,
           pots: Object.keys(Engine.state.pots).length };
});
console.log('pageerrors:', errs);
console.log('counter-only player: served', r.served, '| doors opened', r.opened, '| pots', r.pots);
console.log('got stuck', r.stuck.length, 'times. First five:');
r.stuck.slice(0,5).forEach(x=>console.log('  -',x));
console.log(r.stuck.length ? '\nGOOD: the map and the drawer are load-bearing.'
                           : '\nBAD: the whole game is completable from the counter.');
await b.close();
