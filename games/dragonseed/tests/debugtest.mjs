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
await p.evaluate(()=>Engine.prologueStep(99)); await p.waitForTimeout(150);
await p.evaluate(()=>{ Engine.state.coach=-1; Engine.state.mapCoach=-1; Engine.state.clueCoach=-1; });

// play three days of dismissals so there is a timeline to look at
await p.evaluate(()=>{
  for (let i=0;i<24;i++){
    const st=Engine.state;
    if (st.modal) { Engine.closeModal(); continue; }
    if (st.evening) { Engine.eveningDone(); if (Engine.state.evening) Engine.eveningDone(); continue; }
    if (st.dayOver) { Engine.startNextDay(); continue; }
    Engine.dismissVisitor();
  }
});
await p.waitForTimeout(200);
const l0 = await p.evaluate(()=>({ n: Engine.snapCount(), day: Engine.today().day,
  vi: Engine.state.visitorIndex, list: Engine.snapList().slice(0,3),
  tail: Engine.snapList().slice(-2) }));
console.log('timeline', JSON.stringify(l0,null,1));

// open it from the day in the top bar
await p.click('.top__day'); await p.waitForTimeout(200);
const ui = await p.evaluate(()=>({
  card: !!document.querySelector('.dbg__card'),
  rows: document.querySelectorAll('.dbg__row').length,
  days: [...document.querySelectorAll('.dbg__day')].map(e=>e.textContent),
  now: document.querySelector('.dbg__row--now')?.textContent,
  scrolledToBottom: (()=>{const l=document.querySelector('.dbg__list');
    return l.scrollTop + l.clientHeight >= l.scrollHeight - 2;})() }));
console.log('ui', ui);
await p.screenshot({path:'/tmp/dbg.png'});

// jump back to day 2, customer 3
const target = await p.evaluate(()=>Engine.snapList().find(s=>s.day===2 && s.n===3).i);
await p.evaluate(i=>{ [...document.querySelectorAll('.dbg__row')][i].click(); }, target);
await p.waitForTimeout(250);
console.log('after rewind', await p.evaluate(()=>({
  day: Engine.today().day, vi: Engine.state.visitorIndex,
  who: Engine.visitor()?.name, served: Engine.state.served,
  snaps: Engine.snapCount(), open: Engine.state.debug,
  counter: document.querySelector('.rail__count')?.textContent })));

// playing on appends, and the wiped futures stay wiped
await p.evaluate(()=>{ Engine.dismissVisitor(); if (Engine.state.modal) Engine.closeModal(); });
await p.waitForTimeout(200);
console.log('played on', await p.evaluate(()=>({ snaps: Engine.snapCount(),
  tail: Engine.snapList().slice(-1) })));

// and it survives a reload
await p.reload(); await p.waitForTimeout(200); await p.click('#startBtn'); await p.waitForTimeout(300);
console.log('after reload', await p.evaluate(()=>({ snaps: Engine.snapCount(),
  day: Engine.today().day, vi: Engine.state.visitorIndex, debug: Engine.state.debug })));

// the day is clickable with a card up — the scrim used to eat the click
await p.evaluate(()=>{ Engine.state.debug=false; Engine.announce({kind:'info',title:'A card',body:'x',cta:'ok'}); });
await p.waitForTimeout(200);
await p.click('.top__day');
await p.waitForTimeout(200);
console.log('over a modal', await p.evaluate(()=>({ open: Engine.state.debug,
  card: !!document.querySelector('.dbg__card'),
  topAt: document.elementFromPoint(720,450)?.className })));

// Save now adds a hand save; Shift+D toggles
const n0 = await p.evaluate(()=>Engine.snapCount());
await p.evaluate(()=>[...document.querySelectorAll('.dbg__acts button')].find(b=>b.textContent==='Save now').click());
await p.waitForTimeout(200);
console.log('save now', await p.evaluate(()=>({ n: Engine.snapCount(),
  last: Engine.snapList().slice(-1)[0].hand,
  rowText: [...document.querySelectorAll('.dbg__who')].slice(-1)[0]?.textContent })), 'was', n0);
await p.keyboard.press('Escape'); await p.waitForTimeout(150);
await p.keyboard.press('Shift+D'); await p.waitForTimeout(200);
console.log('shift+D', await p.evaluate(()=>Engine.state.debug));
await p.keyboard.press('Shift+D'); await p.waitForTimeout(150);
console.log('shift+D again', await p.evaluate(()=>Engine.state.debug));

// typing in the book search must not open it
await p.evaluate(()=>{ while(Engine.state.modal) Engine.closeModal(); Engine.openOverlay('book'); });
await p.waitForTimeout(250);
await p.click('.book__tools .search'); await p.keyboard.type('D');
await p.waitForTimeout(150);
console.log('typing D in search', await p.evaluate(()=>({ debug: Engine.state.debug, q: Engine.state.bookQuery })));
await p.evaluate(()=>{ Engine.setBookQuery(''); Engine.closeOverlay(); });

// the index label is back
await p.evaluate(()=>Engine.openOverlay('book')); await p.waitForTimeout(250);
console.log('index', await p.evaluate(()=>{
  const rows=[...document.querySelectorAll('.index__link')];
  const none=rows.filter(r=>r.querySelector('.index__none'));
  return { rows: rows.length, labelled: none.length,
    text: none[0]?.querySelector('.index__none').textContent,
    sample: none[0]?.querySelector('.index__name').textContent };
}));
console.log('errors', errs);
await b.close();
