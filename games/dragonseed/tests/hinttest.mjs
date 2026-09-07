/* hinttest — the paid hint, in two goes.
 *
 * Press once and you get the request restated. Press again on the SAME
 * customer and you are told which plant it is, with a picture of it, and where
 * to get one if it is not on your shelf. Press again after that and it repeats
 * itself for free. The count is per customer, so the next one starts over.
 */
import pw from '/home/claude/.npm-global/lib/node_modules/playwright/index.js';
const b = await pw.chromium.launch();
const p = await b.newPage({ viewport:{width:1333,height:690} });
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('file:///home/claude/build/index.html');
await p.evaluate(()=>{ localStorage.clear(); var st=ArcadeStore('dragonseed'); st.remove(); st.remove('snaps'); st.flush(); });
await p.waitForTimeout(150); await p.reload(); await p.click('#startBtn'); await p.waitForTimeout(200);
await p.evaluate(()=>Engine.prologueStep(99)); await p.waitForTimeout(250);
await p.evaluate(()=>{ Engine.state.coach=-1; Engine.state.mapCoach=-1;
  while (Engine.state.modal) Engine.closeModal(); Engine.render(); });
await p.waitForTimeout(200);

const label1 = await p.evaluate(()=>document.querySelector('.hintbtn')?.textContent);
await p.evaluate(()=>Engine.hint()); await p.waitForTimeout(300);
const one = await p.evaluate(()=>({ title: Engine.state.modal.title,
  saysAgain: /Press Hint again/.test(Engine.state.modal.body),
  art: !!Engine.state.modal.artId, conf: Engine.state.confusion }));
await p.evaluate(()=>Engine.closeModal()); await p.waitForTimeout(200);

const label2 = await p.evaluate(()=>document.querySelector('.hintbtn')?.textContent);
await p.evaluate(()=>Engine.hint()); await p.waitForTimeout(400);
const two = await p.evaluate(()=>({ title: Engine.state.modal.title,
  names: Engine.state.modal.title.replace(/^It is /,''),
  art: !!Engine.state.modal.artId,
  plate: !!document.querySelector('.modal__art img, .modal__art svg'),
  conf: Engine.state.confusion }));
await p.evaluate(()=>Engine.closeModal()); await p.waitForTimeout(150);

// a third press repeats itself and costs nothing
await p.evaluate(()=>Engine.hint()); await p.waitForTimeout(300);
const three = await p.evaluate(()=>({ title: Engine.state.modal.title, conf: Engine.state.confusion }));
await p.evaluate(()=>Engine.closeModal()); await p.waitForTimeout(150);

// with an empty shelf, the second hint says where to walk to
const where = await p.evaluate(()=>{
  const st = Engine.state;
  st.pots = {}; st.pages = {}; st.identified = {}; st.hints = {}; st.modal = null;
  Engine.hint(); st.modal = null; Engine.hint();
  const m = st.modal; st.modal = null;
  return { title: m.title, body: m.body,
           namesAPlace: /It grows at /.test(m.body),
           tellsYouToGo: /open the map|not found|is shut/.test(m.body) };
});
// and the count is per customer
const next = await p.evaluate(()=>{ Engine.state.visitorIndex = 1; return Engine.hintLevel(); });
console.log(JSON.stringify({errs, label1, one, label2, two, three, where, next}, null, 1));
await b.close();
