import fs from 'node:fs';
fs.mkdirSync('/tmp/dsshots', { recursive: true });
import pw from '/home/claude/.npm-global/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:844,height:390}, deviceScaleFactor:2, isMobile:true, hasTouch:true });
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('file:///home/claude/build/index.html');
await p.evaluate(()=>{ localStorage.clear();          // the game lives in the database now
  var st = ArcadeStore('dragonseed'); st.remove(); st.remove('snaps'); st.flush(); });
await p.waitForTimeout(150);
await p.reload();
await p.screenshot({path:'/tmp/dsshots/ph-00-start.png'});
await p.click('#startBtn'); await p.waitForTimeout(300);
await p.evaluate(()=>Engine.prologueStep(99));  // past the opening panels
await p.waitForTimeout(200);
await p.screenshot({path:'/tmp/dsshots/ph-01-desk.png'});
// overflow check
const ov = await p.evaluate(()=>({docW:document.documentElement.scrollWidth, winW:window.innerWidth,
  overflow: document.documentElement.scrollWidth > window.innerWidth}));
await p.click('#tabs button[data-view="shelf"]'); await p.waitForTimeout(250);
await p.screenshot({path:'/tmp/dsshots/ph-02-shelf.png'});
await p.evaluate(()=>{Engine.placeOnDesk('n128',50,50);['colour','form','petals'].forEach(a=>Engine.reveal('n128',a));});
await p.click('#tabs button[data-view="desk"]'); await p.waitForTimeout(250);
await p.screenshot({path:'/tmp/dsshots/ph-03-lens.png'});
await p.evaluate(()=>Engine.openOverlay('book')); await p.waitForTimeout(300);
await p.screenshot({path:'/tmp/dsshots/ph-04-book.png'});
await p.click('#tabs button[data-view="visitor"]'); await p.waitForTimeout(250);
await p.screenshot({path:'/tmp/dsshots/ph-05-counter.png'});
// header collision check
const heads = await p.evaluate(()=>{
  const out=[];
  document.querySelectorAll('.rail__head, .desk__head').forEach(h=>{
    const kids=[...h.children].map(c=>c.getBoundingClientRect());
    for(let i=1;i<kids.length;i++) if(kids[i].left < kids[i-1].right-1) out.push(h.className);
  });
  return out;
});
console.log(JSON.stringify({errs,ov,collisions:heads},null,1));
await b.close();
