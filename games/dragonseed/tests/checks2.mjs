import pw from '/home/claude/.npm-global/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1440,height:900} });
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('file:///home/claude/build/index.html');
await p.evaluate(()=>{ localStorage.clear();          // the game lives in the database now
  var st = ArcadeStore('dragonseed'); st.remove(); st.remove('snaps'); st.flush(); });
await p.waitForTimeout(150);
await p.reload(); await p.click('#startBtn'); await p.waitForTimeout(300);
await p.evaluate(()=>Engine.prologueStep(99));  // past the opening panels
await p.waitForTimeout(200);
const r = await p.evaluate(async ()=>{
  const raf=()=>new Promise(r=>requestAnimationFrame(r));
  const zc=[];
  for (const n of [1,10,50]) { for(let i=0;i<n;i++){Engine.render(); await raf();} zc.push({renders:n, retained:Engine.zoneCount()}); }
  Engine.placeOnDesk('n128',50,50);
  ['colour','form','petals'].forEach(a=>Engine.reveal('n128',a));
  const d0=Engine.state.dread;
  Engine.nameAs('n128','n052'); const d1=Engine.state.dread;
  Engine.nameAs('n128','n201'); const d2=Engine.state.dread;
  Engine.nameAs('n128','n233'); const d3=Engine.state.dread;
  await raf(); await raf();
  return { zoneCounts: zc, dread:{start:d0, after1:d1, after2:d2, after3:d3},
           struck: Object.keys(Engine.state.wrongPages.n128).length,
           dayOver: Engine.state.dayOver };
});
const contrast = await p.evaluate(()=>{
  Engine.openOverlay('book');
  return new Promise(res=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
    function parse(c){const m=(c.match(/[\d.]+/g)||[]).map(Number);return {r:m[0]||0,g:m[1]||0,b:m[2]||0,a:m.length>3?m[3]:1};}
    // an rgba() layer is see-through: composite it over what is actually behind it
    function solid(el){let c=parse(getComputedStyle(el).backgroundColor);
      let node=el.parentElement;
      while(c.a<1&&node){const u=parse(getComputedStyle(node).backgroundColor);
        c={r:c.r*c.a+u.r*u.a*(1-c.a),g:c.g*c.a+u.g*u.a*(1-c.a),b:c.b*c.a+u.b*u.a*(1-c.a),a:c.a+u.a*(1-c.a)};
        node=node.parentElement;}
      return c;}
    function lum(c){const m=[c.r,c.g,c.b].map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)});
      return 0.2126*m[0]+0.7152*m[1]+0.0722*m[2];}
    function ratio(a,b){const [x,y]=[lum(a),lum(b)].sort((m,n)=>n-m);return (x+0.05)/(y+0.05);}
    const out={};
    [['.sheet__count','.sheet'],['.page__bin','.page'],['.page__unnamed','.page'],['.notes__lead','.notes'],['.tag','.page']].forEach(([f,bs])=>{
      const fe=document.querySelector(f), be=document.querySelector(bs); if(!fe||!be)return;
      out[f]=+ratio(parse(getComputedStyle(fe).color),solid(be)).toFixed(2);
    });
    res(out);
  })));
});
console.log(JSON.stringify({errs,...r,contrast},null,1));
await b.close();
