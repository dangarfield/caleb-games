/* The book fetches: an identified plant you hold can be picked up from its page. */
import pw from '/home/claude/.npm-global/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const b = await chromium.launch();
const p = await b.newPage({viewport:{width:1440,height:900}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('file:///home/claude/build/index.html');
await p.evaluate(()=>{ localStorage.clear();
  var st = ArcadeStore('dragonseed'); st.remove(); st.remove('snaps'); st.flush(); });
await p.waitForTimeout(150);
await p.reload(); await p.waitForTimeout(400); await p.click('#startBtn'); await p.waitForTimeout(400);
await p.evaluate(()=>{ Engine.prologueStep(99); Engine.state.coach=-1; }); await p.waitForTimeout(200);
const id = await p.evaluate(()=>{ const id=Object.keys(Engine.state.pots).find(i=>Engine.hasPage(i));
  Engine.placeOnDesk(id); Engine.nameAs(id,id); while(Engine.state.modal) Engine.closeModal();
  Engine.returnToShelf(id); return id; });
await p.waitForTimeout(250);
async function openPage(id) {
  await p.evaluate(()=>Engine.openOverlay('book')); await p.waitForTimeout(250);
  await p.evaluate((id)=>{ const name = SPECIMENS.find(s=>s.id===id).name;
    [...document.querySelectorAll('.index__link')].find(e=>e.textContent.indexOf(name)===0)?.click(); }, id);
  await p.waitForTimeout(300);
}
await openPage(id);
console.log('identified page:', await p.evaluate(()=>({
  idtag: !!document.querySelector('.idtag'),
  pick: document.querySelector('.leaf__pick')?.textContent })));
await p.evaluate(()=>document.querySelector('.leaf__pick').click()); await p.waitForTimeout(300);
console.log('picked up:', await p.evaluate(()=>({ onDesk: Engine.state.onDesk,
  bookShut: Engine.state.overlay === null, standing: !!document.querySelector('.stand') })), 'wanted', id);
// while the desk is busy, no fetching
await openPage(id);
console.log('desk busy:', await p.evaluate(()=>({ pick: !!document.querySelector('.leaf__pick') })));
// a page you hold no cutting for offers nothing
await p.evaluate(()=>{ Engine.clearDesk(); const id2 = Object.keys(Engine.state.pages)
    .find(i=>!Engine.hasPot(i)); Engine.state.identified[id2]=true; window.__none = id2; });
await p.evaluate(()=>{ Engine.openOverlay('book');
  Engine.setBookQuery(SPECIMENS.find(s=>s.id===window.__none).name); });
await p.waitForTimeout(300);
await p.evaluate(()=>document.querySelector('.index__link')?.click());
await p.waitForTimeout(300);
console.log('no cutting:', await p.evaluate(()=>{
  const name = SPECIMENS.find(s=>s.id===window.__none).name;
  const leaf = [...document.querySelectorAll('.leaf')]
    .find(l=>l.querySelector('.leaf__name')?.textContent === name);
  return { name, found: !!leaf, idtag: !!leaf?.querySelector('.idtag'),
           pick: !!leaf?.querySelector('.leaf__pick') };
}));
// and an identified plant is findable by typing its name
console.log('search by name:', await p.evaluate(()=>{
  const named = SPECIMENS.find(s=>Engine.isIdentified(s.id));
  const other = SPECIMENS.find(s=>!Engine.isIdentified(s.id) && Engine.state.pages[s.id]);
  Engine.openOverlay('book'); Engine.setBookQuery(named.name);
  const hit = Engine.bookList().filter(s=>Clues.search(s, named.name.toLowerCase(), Engine.isIdentified(s.id)));
  const miss = Engine.bookList().filter(s=>Clues.search(s, other.name.toLowerCase(), Engine.isIdentified(s.id)));
  Engine.setBookQuery('');
  return { named: named.name, foundByName: hit.map(s=>s.name),
           unnamed: other.name, itsNameFinds: miss.map(s=>s.name) };
}));
console.log('errors', errs);
await b.close();
