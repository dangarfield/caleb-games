/* Two tabs must not overwrite each other, and a full localStorage must not
   touch the game at all now that everything lives in the database. */
import pw from '/home/claude/.npm-global/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const b = await chromium.launch();
const ctx = await b.newContext();
const a = await ctx.newPage();
const errs=[]; a.on('pageerror',e=>errs.push('A '+e.message));
await a.goto('file:///home/claude/build/index.html');
await a.evaluate(()=>{ localStorage.clear();
  var st = ArcadeStore('dragonseed'); st.remove(); st.remove('snaps'); st.flush(); });
await a.waitForTimeout(300);
await a.reload(); await a.waitForTimeout(400); await a.click('#startBtn'); await a.waitForTimeout(400);
await a.evaluate(()=>{ Engine.prologueStep(99); Engine.state.coach=-1;
  for (let i=0;i<40;i++){ const st=Engine.state;
    if (st.modal && st.modal.kind!=='rite'){ Engine.closeModal(); continue; }
    if (st.evening){ Engine.eveningDone(); continue; }
    if (st.dayOver){ Engine.startNextDay(); return; }
    Engine.dismissVisitor(); } });
await a.waitForTimeout(600);

// a second tab opens on the same save and is left there
const c = await ctx.newPage();
c.on('pageerror',e=>errs.push('B '+e.message));
await c.goto('file:///home/claude/build/index.html');
await c.waitForTimeout(400); await c.click('#startBtn'); await c.waitForTimeout(500);
const bAt = await c.evaluate(()=>({ day: Engine.today().day, vi: Engine.state.visitorIndex }));

// the playing tab moves on
await a.evaluate(()=>{ for (let i=0;i<4;i++){ Engine.dismissVisitor();
  while(Engine.state.modal) Engine.closeModal(); } });
await a.waitForTimeout(600);
const aAt = await a.evaluate(()=>({ day: Engine.today().day, vi: Engine.state.visitorIndex }));

// the stale tab writes (twice: the first is refused in the transaction, the
// second time it knows it and says so)
await c.evaluate(()=>{ Engine.save(); }); await c.waitForTimeout(400);
const stale = await c.evaluate(()=>({ ok: Engine.save(), note: Engine.saveInfo().note }));
await c.waitForTimeout(400);

// the playing tab reloads and must be where IT was
await a.reload(); await a.waitForTimeout(400); await a.click('#startBtn'); await a.waitForTimeout(600);
const back = await a.evaluate(()=>({ day: Engine.today().day, vi: Engine.state.visitorIndex }));
console.log('tab B sat at', bAt, '| tab A played to', aAt, '| A reloads at', back);
console.log('stale tab refused:', stale);
if (back.vi !== aAt.vi || back.day !== aAt.day) console.log('FAIL — a stale tab clobbered the save');
if (stale.ok) console.log('FAIL — the stale tab thinks it saved');

// a full localStorage is now none of the game's business
console.log('localStorage full:', await a.evaluate(()=>{
  try { for (let i=0;i<12;i++) localStorage.setItem('junk'+i, 'x'.repeat(512*1024)); } catch (e) {}
  Engine.state.served = 42; Engine.save();
  return { saved: Engine.saveInfo().note === "", note: Engine.saveInfo().note,
           ourKeys: Object.keys(localStorage).filter(k=>k.indexOf('caleb')===0) };
}));
await a.waitForTimeout(400);
await a.reload(); await a.waitForTimeout(400); await a.click('#startBtn'); await a.waitForTimeout(600);
console.log('and it still came back:', await a.evaluate(()=>({ served: Engine.state.served,
  snaps: Engine.snapCount() })));
console.log('errors', errs);
await b.close();
