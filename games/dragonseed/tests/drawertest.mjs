import fs from 'node:fs';
fs.mkdirSync('/tmp/dsshots', { recursive: true });
import pw from '/home/claude/.npm-global/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1333,height:690} });
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('file:///home/claude/build/index.html');
await p.evaluate(()=>{ localStorage.clear();          // the game lives in the database now
  var st = ArcadeStore('dragonseed'); st.remove(); st.remove('snaps'); st.flush(); });
await p.waitForTimeout(150);
await p.reload(); await p.click('#startBtn'); await p.waitForTimeout(200);
await p.evaluate(()=>Engine.prologueStep(99)); await p.waitForTimeout(150);
// jump to day 3, first customer served, so the drawer exists
await p.evaluate(()=>{ const st=Engine.state; st.coach=-1; st.mapCoach=-1;
  Engine.startNextDay(); Engine.startNextDay(); });
await p.waitForTimeout(250);
await p.evaluate(()=>{ while (Engine.state.modal) Engine.closeModal(); }); await p.waitForTimeout(200);
await p.evaluate(()=>document.querySelector('.vis')?.click()); await p.waitForTimeout(200);
const s0 = await p.evaluate(()=>({
  day: Engine.today().day, drawer: Engine.hasDrawer(), papers: Engine.paperList().length,
  unread: Engine.unreadPapers(), tab: !!document.querySelector('.drawertab'),
  coach: document.querySelector('.coach__of')?.textContent,
  lit: [...document.querySelectorAll('.is-coached')].map(e=>e.className.split(' ')[0]) }));
await p.evaluate(()=>document.querySelector('.drawertab').click()); await p.waitForTimeout(200);
const s1 = await p.evaluate(()=>({
  view: Engine.state.deskView, notes: document.querySelectorAll('.note2').length,
  coach: document.querySelector('.coach__step--now .coach__text')?.textContent,
  lit: [...document.querySelectorAll('.is-coached')].map(e=>e.className.split(' ')[0]) }));
await p.screenshot({path:'/tmp/dsshots/d1-drawer.png', clip:{x:215,y:45,width:620,height:560}});
// a tap on a note opens it out, in place, without moving it
const first = await p.locator('.note2.is-coached, .note2').first().boundingBox();
await p.mouse.click(first.x+first.width/2, first.y+first.height/2); await p.waitForTimeout(400);
const s2 = await p.evaluate(()=>{
  const sh=document.querySelector('.note2--up'); const r=sh.getBoundingClientRect();
  return { open: !!sh, title: sh.querySelector('.paper__title').textContent,
           w: Math.round(r.width), h: Math.round(r.height),
           read: !!sh.querySelector('.paper__read'),
           gotLine: sh.querySelector('.paper__got')?.textContent?.slice(0,60),
           pages: Object.keys(Engine.state.pages).length,
           coach: document.querySelector('.coach__step--now .coach__text')?.textContent };
});
await p.screenshot({path:'/tmp/dsshots/d2-note.png'});
// shove the open one about — anywhere on it is the handle now
const box = await p.locator('.note2--up').boundingBox();
await p.mouse.move(box.x+box.width/2, box.y+24); await p.mouse.down();
for (let i=1;i<=8;i++) await p.mouse.move(box.x+box.width/2-120*i/8, box.y+24+90*i/8);
await p.mouse.up(); await p.waitForTimeout(300);
const s3 = await p.evaluate(()=>{ const a=Engine.state.noteAt[Engine.state.openPaper];
  return { x: a && +a.x.toFixed(2), y: a && +a.y.toFixed(2), stillOpen: !!Engine.state.openPaper }; });
// tapping the bare drawer puts it down again
await p.mouse.click(240, 660); await p.waitForTimeout(300);
const s4 = await p.evaluate(()=>({
  closed: !document.querySelector('.note2--up'),
  done: [...document.querySelectorAll('.note2')].map(n=>n.className.includes('paper--done')),
  ticks: document.querySelectorAll('.paper__read').length,
  unread: Engine.unreadPapers() }));
// and the tick un-reads it
await p.evaluate(()=>document.querySelector('.paper__read')?.click()); await p.waitForTimeout(300);
const s5 = await p.evaluate(()=>({ read: Object.keys(Engine.state.papersRead).length,
  ticks: document.querySelectorAll('.paper__read').length }));
await p.screenshot({path:'/tmp/dsshots/d3-done.png', clip:{x:215,y:45,width:620,height:560}});
console.log(JSON.stringify({errs,s0,s1,s2,moved:s3,s4,s5},null,1));
await b.close();
