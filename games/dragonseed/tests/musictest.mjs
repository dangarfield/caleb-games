/* musictest — the theme.
 *
 * Nothing may be fetched and nothing may play until the screen has been
 * touched. It must loop, have no controls of any kind, and pause itself when
 * the tab goes to the back. One file, fetched only after the gesture.
 */
import pw from '/home/claude/.npm-global/lib/node_modules/playwright/index.js';
const b = await pw.chromium.launch();
const p = await b.newPage({ viewport:{width:1333,height:690} });
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
const got=[]; p.on('request', r => { if (/audio\//.test(r.url())) got.push(r.url().split('/').pop()); });

await p.goto('file:///home/claude/build/index.html');
await p.waitForTimeout(1200);
const quiet = await p.evaluate(()=>{ const a=document.getElementById('theme');
  return { paused:a.paused, t:a.currentTime, loop:a.loop, controls:a.hasAttribute('controls'),
           src:a.getAttribute('src') }; });

const fetchedBeforeTouch = [...got];

// one gesture, anywhere — deliberately not the Open the shop button
await p.mouse.click(60, 400);
await p.waitForTimeout(600);
const started = await p.evaluate(()=>{ const a=document.getElementById('theme');
  return { paused:a.paused, playing:a.currentTime>0, vol:+a.volume.toFixed(2) }; });

// tab to the back
await p.evaluate(()=>{ Object.defineProperty(document,'hidden',{value:true,configurable:true});
  document.dispatchEvent(new Event('visibilitychange')); });
await p.waitForTimeout(300);
const hidden = await p.evaluate(()=>document.getElementById('theme').paused);
await p.evaluate(()=>{ Object.defineProperty(document,'hidden',{value:false,configurable:true});
  document.dispatchEvent(new Event('visibilitychange')); });
await p.waitForTimeout(400);
const back = await p.evaluate(()=>document.getElementById('theme').paused);

// nothing anywhere offers to turn it off
const ui = await p.evaluate(()=>
  !!document.querySelector('[class*=mute],[class*=volume],[class*=sound],[id*=mute],[id*=volume]'));

console.log(JSON.stringify({
  errs,
  silentUntilTouched: quiet.paused && quiet.t === 0,
  nothingFetchedBeforeTouch: fetchedBeforeTouch.length === 0,
  quiet, started,
  pausesWhenHidden: hidden, resumesWhenBack: !back,
  anyMuteUi: ui,
  filesFetched: [...new Set(got)]
}, null, 1));
await b.close();
