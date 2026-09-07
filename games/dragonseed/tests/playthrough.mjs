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
await p.reload(); await p.click('#startBtn'); await p.waitForTimeout(250);

const report = await p.evaluate(async () => {
  const log=[], fail=[], evenings=[], read=[], fed=[], found=[], doors=[]; let trips=0;
  const sleep = ms => new Promise(r=>setTimeout(r,ms));

  const sellable = id => Engine.hasPot(id) && Engine.hasPage(id);
  const fits = (s,who) => !who || who==='both' || s.species===who || s.species==='both';
  function pickAnswer(v){
    if (v.kind === 'effect') {
      const c = SPECIMENS.filter(s=>s.effect===v.needs && fits(s,v.who) && sellable(s.id));
      return c[0] || null;
    }
    for (const id of (v.accepts || [])) if (sellable(id)) return Clues.specimenById(id);
    return null;
  }

  function ensureNamed(s){
    if (Engine.isIdentified(s.id)) return true;
    if (!Engine.hasPage(s.id)) return false;      // no leaf to match it to yet
    Engine.placeOnDesk(s.id);
    ['colour','form','petals'].forEach(a=>Engine.reveal(s.id,a));
    return Engine.nameAs(s.id, s.id);
  }

  /* read every note in the drawer, walk every lead, take today's one trip */
  function workTheDrawer(){
    for (const n of Engine.paperList()){
      if (Engine.state.papersRead[n.id]) continue;
      Engine.readPaper(n.id); read.push(n.id);
      Engine.closePaper();
      while (Engine.state.modal) Engine.closeModal();
    }
  }
  function workTheMap(){
    if (!Engine.hasMap()) return;
    for (const h of HABITATS){
      if (!Engine.exists(h)) continue;
      if (Engine.isLead(h.id)) {
        Engine.probeCell(h.cell);
        if (Engine.isLocated(h.id)) found.push(`${h.short} at ${h.cell}`);
        else fail.push(`lead for ${h.short} does not resolve at ${h.cell}`);
        while (Engine.state.modal) Engine.closeModal();
      }
    }
    /* anything shut wants a plant, and behind twelve of them is the only
       cutting of something somebody asks for later */
    for (let pass=0; pass<4; pass++){
      let moved = false;
      for (const h of HABITATS){
        if (!Engine.exists(h) || !Engine.isLocated(h.id) || !Engine.isShut(h)) continue;
        const key = SPECIMENS.find(x => h.keys.includes(x.effect) && Engine.hasPot(x.id)
                                        && Engine.hasPage(x.id));
        if (!key) continue;
        if (!ensureNamed(key)) continue;
        Engine.openPlace(h.id, key.id);
        while (Engine.state.modal) Engine.closeModal();
        if (Engine.state.opened[h.id]) { doors.push(`${h.short} \u2190 ${key.name}`); moved = true; }
      }
      if (!moved) break;
    }
    /* going out is no longer once a day. Take every place that still has
       something growing on it — and never one that does not, because walking
       out to a stripped place is a pip of dread. */
    for (let t = 0; t < 8 && !Engine.state.dayOver; t++) {
      const open = HABITATS.find(h => Engine.exists(h) && Engine.isLocated(h.id) &&
        !Engine.isShut(h) && SPECIMENS.some(x => x.habitat === h.id && !Engine.hasPot(x.id)));
      if (!open) break;
      const before = Engine.state.tripsToday;
      Engine.probeCell(open.cell); while (Engine.state.modal) Engine.closeModal();
      if (Engine.state.tripsToday === before) break;   // it refused; don't spin
      trips++;
    }
  }

  for (let guard=0; guard<1600; guard++){
    const st = Engine.state;
    if (st.modal && st.modal.kind === 'rite') {          // solve the rite and carry on
      for (let t=0;t<6;t++){ const o=Engine.state.rite; if(!o) break;
        if (o[t]===t) continue; Engine.riteSwap(o.indexOf(t), t); }
      continue;
    }
    if (st.modal) { Engine.closeModal(); continue; }   // modals gate the day now
    if (st.finished) break;
    if (st.evening) {                                   // the card between the days
      const e = Engine.eveningFor(Engine.today().day);
      evenings.push(e.day);
      if (e.egg) {
        const f = SPECIMENS.find(x=>x.effect===e.egg.needs && fits(x,'dragon') && sellable(x.id));
        if (f && ensureNamed(f)) { Engine.feedEgg(f.id); fed.push(e.day); }
        else { fail.push(`evening ${e.day}: nothing to feed the egg (${e.egg.needs})`); Engine.eveningDone(); }
      } else if (e.choice) Engine.eveningChoose(e.choice.options[0].flag, e.choice.options[0].reply);
      else Engine.eveningDone();
      /* feeding the egg and taking a choice both leave the reply panel up now
         (story.js draws it as the second half of the same card) — dismiss it */
      if (Engine.state.evening) Engine.eveningDone();
      continue;
    }
    if (st.dayOver) { Engine.startNextDay(); continue; }
    workTheDrawer(); workTheMap();
    const d = Engine.today(), v = Engine.visitor();
    if (!v) { Engine.endDay(null); continue; }

    if (v.kind === 'visit' || v.kind === 'gift' || v.kind === 'lead'){
      Engine.dismissVisitor(); continue;
    }

    if (v.kind === 'recipe'){
      let stuck = false;
      for (const need of v.needs){
        const c = SPECIMENS.filter(x=>x.effect===need && fits(x,v.who) && sellable(x.id))[0];
        if (!c){ fail.push(`day ${d.day} ${v.name} (recipe): nothing for ${need}`); stuck = true; break; }
        if (!ensureNamed(c)) fail.push(`day ${d.day} ${v.name}: could not name ${c.name}`);
        const before = Engine.state.dread;
        Engine.give(c.id);
        if (Engine.state.dread > before)
          fail.push(`day ${d.day} ${v.name} (recipe): ${c.name} REJECTED for ${need}`);
      }
      if (stuck) { Engine.endDay('bot stuck'); continue; }
      log.push(`day ${d.day} ${v.name}: recipe of ${v.needs.length}`);
      continue;
    }

    const s = pickAnswer(v);
    if (!s){ fail.push(`day ${d.day} ${v.name} (${v.kind}): NO ANSWER ON THE SHELF`);
             Engine.endDay('bot stuck'); continue; }
    if (!ensureNamed(s)){ fail.push(`day ${d.day} ${v.name}: could not name ${s.name}`); }
    const dreadBefore = st.dread;
    Engine.give(s.id);
    if (Engine.state.dread > dreadBefore) {
      fail.push(`day ${d.day} ${v.name} (${v.kind}): ${s.name} was REJECTED`);
      Engine.endDay('bot stuck');                 // do not sit here trying it again
    } else log.push(`day ${d.day} ${v.name}: ${s.name}`);
  }

  return { fail, served: Engine.state.served, day: Engine.today().day,
           finished: Engine.state.finished,
           named: Object.keys(Engine.state.identified).length,
           flags: Object.keys(Engine.state.flags),
           evenings: evenings.length, trips, located: found.length,
           papersRead: read.length, eggFed: fed.length, doors,
           opened: Object.keys(Engine.state.opened).length,
           pots: Object.keys(Engine.state.pots).length,
           pages: Object.keys(Engine.state.pages).length,
           handled: log.length, sample: log.slice(0,3).concat(['...']).concat(log.slice(-3)) };
});

console.log('pageerrors:', errs);
console.log(JSON.stringify(report,null,1));
await p.screenshot({path:'/tmp/dsshots/shot-06-ending.png'});
await b.close();
