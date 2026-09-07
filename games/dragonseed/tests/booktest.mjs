import pw from '/home/claude/.npm-global/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1440,height:900} });
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('file:///home/claude/build/index.html');
await p.evaluate(()=>{ localStorage.clear();          // the game lives in the database now
  var st = ArcadeStore('dragonseed'); st.remove(); st.remove('snaps'); st.flush(); });
await p.waitForTimeout(150); await p.reload();
await p.click('#startBtn'); await p.waitForTimeout(300);
await p.evaluate(()=>Engine.prologueStep(99));  // past the opening panels
await p.waitForTimeout(200);
const settle=()=>p.waitForTimeout(300);

// index by name, alphabetical, clickable
await p.evaluate(()=>Engine.openOverlay('book')); await settle();
const idx = await p.evaluate(()=>({
  first: document.querySelector('.index__name').textContent,
  sorted: (()=>{const n=[...document.querySelectorAll('.index__name')].map(x=>x.textContent);
    return JSON.stringify(n)===JSON.stringify([...n].sort((a,b)=>a.localeCompare(b)));})(),
  where: document.querySelector('.book__where').textContent }));

// naming: notes narrow the book, the claim is on the right leaf
await p.evaluate(()=>{ Engine.placeOnDesk('n128'); ['colour','form','petals'].forEach(a=>Engine.reveal('n128',a));
  Engine.setBookSpread(0); }); await settle();
const chips = await p.evaluate(()=>[...document.querySelectorAll('.notes__chips .chip')].map(c=>c.textContent));
await p.evaluate(()=>{ Engine.toggleFilter('colour','blue'); Engine.toggleFilter('form','bell'); }); await settle();
const filtered = await p.evaluate(()=>({
  names: [...document.querySelectorAll('.index__name')].map(n=>n.textContent),
  where: document.querySelector('.book__where').textContent }));

// jump to it and claim it
await p.evaluate(()=>{ document.querySelector('.index__link').click(); }); await settle();
const onPage = await p.evaluate(()=>({
  split: !!document.querySelector('.spread--split'),
  name: document.querySelector('.leaf--art .leaf__name').textContent,
  claim: document.querySelector('.leaf--text .leaf__claim').textContent }));
await p.evaluate(()=>document.querySelector('.leaf--text .leaf__claim').click()); await settle();
const claimed = await p.evaluate(()=>({ named: Engine.isIdentified('n128'), modal: !!document.querySelector('.modal') }));

// identified marks in the book and on the rail
await p.evaluate(()=>{ Engine.closeModal(); Engine.clearFilter(); Engine.openOverlay('book'); Engine.setBookSpread(0); }); await settle();
const marks = await p.evaluate(()=>({
  tick: document.querySelectorAll('.index__link--known .tick').length,
  potNamed: document.querySelectorAll('.pot--named').length }));

// desk -> shelf drag still works
await p.evaluate(()=>Engine.closeOverlay()); await settle();
const before = await p.evaluate(()=>Engine.state.onDesk ? 1 : 0);
const stand = await p.$('.stand'); const rail = await p.$('#shelf');
const sb = await stand.boundingBox(), rb = await rail.boundingBox();
await p.mouse.move(sb.x+sb.width/2, sb.y+sb.height/2);
await p.mouse.down();
const tx = rb.x + rb.width/2, ty = rb.y + 220;
const ox = sb.x + sb.width/2, oy = sb.y + sb.height/2;
for (let i=1;i<=14;i++) await p.mouse.move(ox + (tx-ox)*i/14, oy + (ty-oy)*i/14);
await p.mouse.up(); await p.waitForTimeout(250);
const after = await p.evaluate(()=>({ desk: Engine.state.onDesk?1:0 }));

console.log(JSON.stringify({errs,idx,chips,filtered,onPage,claimed,marks,dragBack:{before,after}},null,1));
await b.close();
