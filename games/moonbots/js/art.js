/* art.js: Moonbots placeholder art, shared by index.html and sprite-lab.html.
   Everything is CSS shapes for now; swap in a sprite sheet later by editing only this file. */
(function () {
var CSS = `
.ri{display:inline-flex;align-items:center;justify-content:center;width:var(--s);height:var(--s);background:var(--c);border:3px solid #2b1d14;flex:none;position:relative;box-sizing:border-box}
.ri b{font:700 10px/1 'Pixelify Sans';color:#fff;text-shadow:0 1px 0 #2b1d14,1px 0 0 #2b1d14,-1px 0 0 #2b1d14,0 -1px 0 #2b1d14}
.ri.sq{border-radius:4px;transform:rotate(-8deg)}
.ri.ci{border-radius:50%}
.ri.rc{height:calc(var(--s)*.64);border-radius:3px}
.ri.pl{height:calc(var(--s)*.6);border-radius:999px}
.ri.di{transform:rotate(45deg) scale(.82);border-radius:3px}.ri.di b{transform:rotate(-45deg)}
.ri.dim{opacity:.32}

.bot{position:relative;width:32px;height:36px;flex:none;cursor:grab;box-sizing:border-box}
.bot *{box-sizing:border-box}
.bot .dm{position:absolute;left:0;top:0;width:32px;height:26px;background:#d9541e;border:3px solid #2b1d14;border-radius:16px 16px 5px 5px}
.bot .ey{position:absolute;left:9px;top:5px;width:14px;height:14px;border-radius:50%;background:#fff;border:3px solid #2b1d14;box-shadow:inset 3px 3px 0 #2b1d14}
.bot .bs{position:absolute;left:6px;bottom:0;width:20px;height:12px;background:#5b4a3d;border:3px solid #2b1d14}
.bot .an{position:absolute;left:14px;top:-8px;width:4px;height:9px;background:#2b1d14}
.bot .an::after{content:'';position:absolute;left:-4px;top:-7px;width:12px;height:12px;border-radius:50%;background:#ff5a4a;border:2px solid #2b1d14;box-sizing:border-box}
.bot.lv2 .dm{background:#b9c6cf}
.bot.lv3 .dm{background:#f2c230;box-shadow:0 0 12px 4px #ffe27a}.bot.lv3 .bs{background:#c99a1a}.bot.lv3 .an::after{background:#fff36a}
.bot.flat .dm{background:#8d8172}.bot.flat .ey{background:#8d8172;box-shadow:none;height:6px;top:10px;border-radius:3px}
.bot.tour .dm{background:#3a8fd8}
.bot .ub{position:absolute;right:-8px;bottom:-3px;width:17px;height:17px;border:2px solid #2b1d14;border-radius:4px;font:700 11px/1 'Pixelify Sans';color:#fff;display:flex;align-items:center;justify-content:center}
.bot .bt,.alien .bt{position:absolute;left:-10px;bottom:1px;width:8px;height:26px;background:#2b1d14;border:2px solid #2b1d14;border-radius:4px;display:flex;flex-direction:column;justify-content:flex-end;overflow:hidden;box-sizing:border-box;z-index:2}
.alien .bt{bottom:3px}
.bot .bt span,.alien .bt span{display:block;width:100%;background:#4cd964;border-radius:2px}
.bot.st,.alien.st{cursor:default}
.mg{filter:drop-shadow(0 0 4px #ffd23f) drop-shadow(0 0 4px #ffd23f)}

.alien{position:relative;width:34px;height:36px;flex:none;cursor:grab;--ac:#2fb8a8;box-sizing:border-box}
.alien *{box-sizing:border-box}
.alien .bd{position:absolute;left:1px;top:8px;width:32px;height:28px;border-radius:50% 50% 42% 42%;background:var(--ac);border:3px solid #2b1d14}
.alien .e{position:absolute;left:9px;top:12px;width:16px;height:16px;border-radius:50%;background:#fff;border:3px solid #2b1d14;box-shadow:inset 4px 4px 0 #2b1d14}
.alien .m{position:absolute;left:13px;top:29px;width:8px;height:3px;background:#2b1d14;border-radius:2px}
.alien .a1,.alien .a2{position:absolute;top:0;width:3px;height:11px;background:#2b1d14}
.alien .a1{left:9px;transform:rotate(-18deg)}.alien .a2{right:9px;transform:rotate(18deg)}
.alien .a1::after,.alien .a2::after{content:'';position:absolute;left:-3px;top:-5px;width:9px;height:9px;border-radius:50%;background:var(--ac);border:2px solid #2b1d14}
.alien.hungry .bd{filter:saturate(.35) brightness(.9)}.alien.hungry .e{height:8px;top:16px;box-shadow:none;background:#2b1d14}
.alien.hungry::after{content:'!';position:absolute;right:-6px;top:-4px;width:14px;height:14px;border-radius:50%;background:#ff5a4a;border:2px solid #2b1d14;color:#fff;font:700 10px/10px 'Pixelify Sans';text-align:center}

/* doors / worker slots */
.slot{--sb:#cdbb98;--pc:#9fd87a;position:relative;width:48px;height:62px;background:linear-gradient(to top,var(--pc) var(--p,0%),var(--sb) var(--p,0%));border:3px solid #2b1d14;border-radius:25px 25px 6px 6px;display:flex;align-items:flex-end;justify-content:center;padding-bottom:10px;flex:none;box-sizing:border-box}
.slot.rd{border-radius:50%;height:52px;width:52px;padding-bottom:8px;align-items:center;justify-content:center;padding:0;--sb:#c9b6d8}
.slot.rd.cl{border-color:var(--dc);box-shadow:inset 0 0 0 3px #2b1d14;--sb:color-mix(in srgb,var(--dc) 35%,#e4d6b8)}
.slot.sq{border-radius:8px;--sb:#d8cfa8}
.slot.chg{--pc:#ffe27a}
.slot.nap>*:not(.pg){opacity:.45}
.slot.nap::after{content:'zz';position:absolute;top:2px;right:4px;font:700 12px 'Pixelify Sans';color:#6b4aa0}
.slot .pg{position:absolute;left:5px;right:5px;bottom:2px;height:4px;background:#a8936c;border-radius:2px;overflow:hidden}
.slot.rd .pg{bottom:5px;left:10px;right:10px}
.slot .pg i{display:block;height:100%;background:#3f9b4a}
.slot .pg.ch i{background:#ffd23f}

/* board patterns */
.pat-dots{background-image:radial-gradient(rgba(60,30,10,.16) 2px,transparent 2.6px);background-size:30px 30px}
.pat-craters{background-image:radial-gradient(circle at 50% 50%,rgba(0,0,0,.13) 0 10px,rgba(255,255,255,.1) 11px 13px,transparent 14px),radial-gradient(circle,rgba(255,255,255,.14) 0 2.5px,transparent 3.5px);background-size:130px 110px,44px 38px;background-position:0 0,13px 20px}
.pat-bubbles{background-image:radial-gradient(circle,transparent 0 7px,rgba(255,255,255,.2) 8px 10px,transparent 11px),radial-gradient(circle,rgba(255,255,255,.14) 0 3px,transparent 4px);background-size:92px 84px,40px 46px;background-position:0 0,20px 10px}

/* centre plot: shared */
.halo{position:absolute;left:50%;top:50%;width:580px;height:210px;margin:-105px 0 0 -290px;border-radius:50%;background:rgba(60,30,10,.12)}
.padd{position:absolute;left:50%;top:50%;width:440px;height:176px;margin:-80px 0 0 -220px;background:#2b1d14;clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%)}
.padd i{position:absolute;left:8px;right:8px;top:4px;bottom:8px;background:#8b6a4a;clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%)}
.padd.made i{background:#a9a59c;background-image:repeating-linear-gradient(45deg,transparent 0 14px,rgba(43,29,20,.12) 14px 16px)}
.padd.moon i{background:#c9c6bb;background-image:radial-gradient(circle,rgba(0,0,0,.12) 0 7px,transparent 8px);background-size:60px 40px}
.padd.zib i{background:#9a7ac0;background-image:radial-gradient(circle,rgba(255,255,255,.18) 0 5px,transparent 6px);background-size:46px 34px}
@keyframes clampin{0%{transform:translateY(-140px)}70%{transform:translateY(6px)}85%{transform:translateY(-4px)}100%{transform:translateY(0)}}
.clampin{animation:clampin .8s ease-out both}
/* chapter 1: rocket */
.rkt{position:absolute;left:50%;top:50%;transform:translate(-50%,-100%);margin-top:28px;display:flex;flex-direction:column-reverse;align-items:center;pointer-events:none}
.pt{width:46px;height:13px;border:2px solid #2b1d14;margin-top:-2px;background:var(--c);box-sizing:border-box}
.pt.todo{background:transparent;border:2px dashed rgba(43,29,20,.3)}
.pt.cur{background:linear-gradient(to top,var(--c) var(--fp),rgba(255,255,255,.55) var(--fp));box-shadow:0 0 0 3px #ffd23f}
.pt.cone{width:0;height:0;border:none;border-left:23px solid transparent;border-right:23px solid transparent;border-bottom:22px solid rgba(43,29,20,.18);background:none;margin-top:0}
.pt.cone.on{border-bottom-color:#c42f4a}
.pt.cone.cur{box-shadow:none;filter:drop-shadow(0 -3px 0 #ffd23f)}
/* chapter 2: moon city */
.cb{position:absolute;border:3px solid #2b1d14;background:var(--c);box-sizing:border-box;pointer-events:none}
.cb.todo,.tp.todo{background:transparent!important;border:2px dashed rgba(43,29,20,.32)!important;box-shadow:none!important;outline:none!important;filter:none!important}
.cb.todo::before,.cb.todo::after,.tp.todo::before,.tp.todo::after{display:none}
.cb.cur,.tp.cur{opacity:calc(.35 + .65 * var(--f,0));box-shadow:0 0 0 3px #ffd23f}
.cb.dome{border-radius:50% 50% 6px 6px/90% 90% 6px 6px;background:linear-gradient(135deg,rgba(255,255,255,.6),rgba(255,255,255,.05) 60%),var(--c)}
.cb.tower{border-radius:4px}
.cb.tower::after{content:'';position:absolute;left:50%;top:-16px;width:18px;height:16px;margin-left:-9px;border-radius:50% 50% 3px 3px;background:#3a8fd8;border:3px solid #2b1d14;box-sizing:border-box}
.cb.green{border-radius:22px 22px 4px 4px;background:repeating-linear-gradient(90deg,rgba(255,255,255,.5) 0 3px,transparent 3px 10px),var(--c)}
.cb.power{background:repeating-linear-gradient(90deg,#22264a 0 8px,#5a7ae8 8px 10px);transform:skewX(-12deg)}
.cb.house::before{content:'';position:absolute;left:-7px;right:-7px;top:-19px;height:18px;background:#c42f4a;clip-path:polygon(50% 0,100% 100%,0 100%)}
.cb.block{background:repeating-linear-gradient(0deg,transparent 0 6px,rgba(255,226,122,.9) 6px 10px),var(--c)}
.cb.park{border:none;background:none}
.cb.park::before,.cb.park::after{content:'';position:absolute;bottom:0;border-radius:50%;background:#4cb050;border:3px solid #2b1d14;box-sizing:border-box}
.cb.park::before{left:0;width:24px;height:24px}.cb.park::after{right:0;width:20px;height:32px;background:#2f8a4a}
.cb.mall{background:repeating-linear-gradient(90deg,#e85a9a 0 8px,#fff 8px 16px) top/100% 9px no-repeat,var(--c)}
.cb.port::after{content:'';position:absolute;left:50%;bottom:100%;width:12px;height:26px;margin-left:-6px;background:#e8e0d0;border:3px solid #2b1d14;border-bottom:none;border-radius:6px 6px 0 0;box-sizing:border-box}
.cb.lights{height:12px;border:none;background:radial-gradient(circle,#ffe27a 3px,transparent 4px) 0 0/22px 12px repeat-x;filter:drop-shadow(0 0 4px #ffd23f)}
.cb.lights.todo{background:none!important;border:none!important;border-top:2px dashed rgba(43,29,20,.3)!important}
/* chapter 3: teleporter */
.tp{position:absolute;box-sizing:border-box;border:3px solid #2b1d14;background:var(--c);pointer-events:none}
.tp.pad{width:170px;height:42px;border-radius:50%;left:50%;margin-left:-85px;top:calc(50% + 4px);box-shadow:inset 0 -6px 0 rgba(0,0,0,.2)}
.tp.ring{width:104px;height:104px;border-radius:50%;background:transparent;border:10px solid var(--c);box-shadow:0 0 0 3px #2b1d14,inset 0 0 0 3px #2b1d14;left:50%;margin-left:-52px;top:calc(50% - 86px)}
.tp.ring.cur{box-shadow:0 0 0 3px #2b1d14,inset 0 0 0 3px #2b1d14,0 0 0 7px #ffd23f}
.tp.core{width:34px;height:34px;border-radius:50%;left:50%;margin-left:-17px;top:calc(50% - 51px);box-shadow:0 0 14px 4px rgba(255,122,26,.6)}
.tp.lens{width:22px;height:22px;transform:rotate(45deg);left:50%;margin-left:-11px;top:calc(50% - 98px)}
.tp.panel{width:42px;height:30px;border-radius:5px;left:calc(50% + 66px);top:calc(50% - 30px);background:radial-gradient(circle,#ff5a4a 3px,transparent 4px) 6px 6px/12px 10px,var(--c)}
.tp.ant{width:7px;height:62px;left:calc(50% - 94px);top:calc(50% - 56px);border-width:2px}
.tp.ant::after{content:'';position:absolute;left:-8px;top:-16px;width:18px;height:18px;border-radius:50%;background:#ff5a4a;border:3px solid #2b1d14;box-sizing:border-box}
.tp.coil{width:22px;height:40px;left:calc(50% - 76px);top:calc(50% - 30px);border-radius:6px;background:repeating-linear-gradient(0deg,var(--c) 0 5px,#2b1d14 5px 7px)}
.tp.coil.r{left:calc(50% + 54px);top:calc(50% - 68px)}
.tp.map{width:170px;height:20px;left:50%;margin-left:-85px;top:calc(50% - 104px);border:none;background:radial-gradient(circle,#fff 2.5px,transparent 3.5px) 0 0/24px 10px,radial-gradient(circle,#ffe27a 2px,transparent 3px) 12px 10px/30px 10px;filter:drop-shadow(0 0 3px #fff)}
.tp.map.todo{border:2px dashed rgba(43,29,20,.3)!important}
.tp.bal{width:26px;height:32px;border-radius:50% 50% 48% 48%;top:calc(50% - 74px)}
.tp.bal::after{content:'';position:absolute;left:50%;top:100%;width:2px;height:22px;background:#2b1d14}
.tp.bal.l{left:calc(50% - 150px)}.tp.bal.r{left:calc(50% + 124px);--c:#3a8fd8!important}
.tp.beam{width:64px;left:50%;margin-left:-32px;top:calc(50% - 104px);height:130px;border:none;background:linear-gradient(rgba(170,240,255,0),rgba(170,240,255,.85) 40%,rgba(255,255,255,.2));box-shadow:0 0 24px 8px rgba(170,240,255,.5)}
.tp.beam.todo{border:2px dashed rgba(43,29,20,.3)!important}

/* crates, spills, misc plot objects */
.crate{position:absolute;width:40px;height:34px;margin:-17px 0 0 -20px;background:repeating-linear-gradient(90deg,#c8873a 0 9px,#a86a2a 9px 11px);border:3px solid #2b1d14;border-radius:4px;box-sizing:border-box;z-index:4}
.crate::before{content:'';position:absolute;left:-10px;right:-10px;top:-26px;height:18px;border-radius:30px 30px 0 0;background:repeating-linear-gradient(90deg,#fff 0 10px,#e8463a 10px 20px);border:3px solid #2b1d14;border-bottom:none;box-sizing:border-box}
.crate::after{content:'';position:absolute;left:4px;right:4px;top:-9px;height:9px;border-left:2px solid #2b1d14;border-right:2px solid #2b1d14}
.crate.open{animation:pulse .5s infinite}
.spill{position:absolute;width:40px;height:40px;margin:-20px;border-radius:50%;background:rgba(255,255,255,.65);border:3px solid #fff;box-shadow:0 0 0 3px #2b1d14,0 0 14px 4px rgba(255,255,255,.6);display:flex;align-items:center;justify-content:center;z-index:5;cursor:pointer;animation:bob .7s infinite alternate}
@keyframes bob{to{transform:translateY(-5px)}}
@keyframes pulse{50%{transform:scale(1.08)}}

/* chapter finales */
.fin{position:absolute;inset:0;overflow:hidden;font-family:'Pixelify Sans',sans-serif}
.fin *{box-sizing:border-box}
.fin .sky{position:absolute;inset:0}
.fin .stars{position:absolute;inset:0;background-image:radial-gradient(#cfd6ff 1.3px,transparent 1.7px),radial-gradient(#8f97d6 1px,transparent 1.4px);background-size:97px 83px,61px 53px;background-position:12px 20px,40px 8px}
.fin .ftxt{position:absolute;left:50%;top:56px;transform:translateX(-50%);font:36px/1.3 'Press Start 2P',monospace;color:#ffd23f;text-shadow:0 5px 0 #2b1d14;text-align:center;white-space:nowrap;opacity:0;transition:opacity .8s;z-index:20}
.fin .ftxt small{display:block;font:700 22px 'Pixelify Sans';color:#fff;text-shadow:0 2px 0 #2b1d14;margin-top:10px}
.fin.f3 .ftxt{opacity:1}
.fin .fbots{position:absolute;left:50%;bottom:170px;transform:translateX(-50%);display:flex;gap:16px;align-items:flex-end;z-index:6}
.fin .fbots>*{transform:scale(1.4)}
.fin .msurf{position:absolute;left:-100px;right:-100px;bottom:-260px;height:460px;border-radius:50%;background:#e8e2cc;border:6px solid #2b1d14;box-shadow:inset -30px -20px 0 #cfc6a8}
.fin .plotbig{position:absolute;left:50%;width:650px;height:209px;margin-left:-325px;transform:scale(1.7);transform-origin:50% 100%}
.fin.static *{transition:none!important}
/* ch1: launch + moon landing */
.lay{position:absolute;display:block;background-size:100% 100%;background-repeat:no-repeat;image-rendering:pixelated;image-rendering:crisp-edges}
.fin .scn{top:auto}
.fin0 .sky.space{background:linear-gradient(#05071a,#141a3e 70%,#2a2a50)}
.fin0 .sky.dusk{background:linear-gradient(#3a2a6a,#c8607a 45%,#ff9a5a 75%,#ffd08a);transition:opacity 2.6s}
.fin0.f1 .sky.dusk,.fin0.f2 .sky.dusk,.fin0.f3 .sky.dusk{opacity:0}
.fin0 .stars2,.fin1 .stars2,.fin2 .stars2{left:0;top:0;width:1336px;height:692px}
.fin0 .stars2{opacity:.2;transition:opacity 2.5s}
.fin0.f1 .stars2,.fin0.f2 .stars2,.fin0.f3 .stars2{opacity:1}
.fin0 .yardw{position:absolute;inset:0;transition:transform 3.2s ease-in,opacity 3s;transform-origin:50% 100%}
.fin0.f1 .yardw{transform:translateY(560px) scale(.7);opacity:.5}
.fin0.f2 .yardw,.fin0.f3 .yardw{display:none}
.fin0.f1 .yardw .yl{animation:fshake .1s linear 10}
@keyframes fshake{25%{transform:translate(-3px,1px)}75%{transform:translate(3px,-1px)}}
.fin .yl{left:-2px;bottom:0;width:1336px;height:256px}
.fin0 .ycrowd{position:absolute;bottom:64px;display:flex;gap:26px;align-items:flex-end;z-index:6}
.fin0 .ycrowd.l{right:calc(50% + 190px)}.fin0 .ycrowd.r{left:calc(50% + 190px)}
.fin .m{transform:scale(1.7);transform-origin:50% 100%}
.fin0 .ycrowd .m>*{animation:hop .35s infinite alternate}
.fin0 .ycrowd .m:nth-child(2n)>*{animation-delay:.17s}
@keyframes hop{to{transform:translateY(-7px)}}
.fin0 .rocketw{position:absolute;left:50%;bottom:60px;width:600px;height:350px;margin-left:-300px;transition:transform 3.4s cubic-bezier(.55,0,.85,.35);z-index:5}
.fin0.f1 .rocketw{transform:translateY(-1200px)}
.fin0.f2 .rocketw,.fin0.f3 .rocketw{transform:translateY(-60px);transition:transform 2.4s cubic-bezier(.15,.7,.3,1)}
.fin0 .flame{left:270px;top:276px;width:60px;height:100px;opacity:0;transform-origin:50% 0;animation:flick .08s infinite alternate}
.fin0.f1 .flame,.fin0.f2 .flame{opacity:1}
.fin0.f3 .flame{opacity:0;transition:opacity .3s}
@keyframes flick{to{transform:scaleY(1.25) scaleX(.88)}}
.fin .puffs{position:absolute;left:50%;z-index:4;pointer-events:none}
.fin .puffs i{position:absolute;width:64px;height:64px;margin:-32px;border-radius:50%;background:#efe8d8;border:4px solid #2b1d14;box-shadow:inset -8px -8px 0 #cfc6b0;opacity:0}
.fin0 .puffs.lift{bottom:96px}.fin0.f1 .puffs.lift i{animation:puff 2.6s ease-out forwards}
.fin0 .puffs.land{bottom:192px}.fin0.f2 .puffs.land i{animation:puff 1.8s ease-out 1.9s forwards}
@keyframes puff{0%{opacity:0;transform:translate(0,0) scale(.3)}12%{opacity:1}100%{opacity:0;transform:translate(var(--dx),var(--dy)) scale(2)}}
.fin0 .moonw{position:absolute;left:0;right:0;bottom:0;height:360px;transform:translateY(400px);transition:transform 2.2s cubic-bezier(.2,.7,.3,1)}
.fin0.f2 .moonw,.fin0.f3 .moonw{transform:none}
.fin .mgl{left:-2px;bottom:0;width:1336px;height:360px}
.fin0 .earthsm{right:110px;top:84px;width:112px;height:112px;opacity:0;transition:opacity 1.5s 1s}
.fin0.f2 .earthsm,.fin0.f3 .earthsm{opacity:1}
.fin0 .mcrowd{position:absolute;bottom:186px;display:flex;gap:24px;align-items:flex-end;z-index:6}
.fin0 .mcrowd.l{right:calc(50% + 110px)}.fin0 .mcrowd.r{left:calc(50% + 110px)}
.fin0 .mcrowd .m{opacity:0;transform:scale(1.7) translate(var(--fx),-20px);transition:opacity .3s,transform .55s cubic-bezier(.3,1.5,.5,1)}
.fin0.f3 .mcrowd .m{opacity:1;transform:scale(1.7)}
.fin0.f3 .mcrowd .m>*{animation:hop .4s infinite alternate}
.fin0 .flagl{left:calc(50% + 400px);bottom:184px;width:64px;height:104px;transform:scaleY(0);transform-origin:50% 100%;transition:transform .5s 1.4s cubic-bezier(.3,1.6,.5,1)}
.fin0.f3 .flagl{transform:none}
/* ch2 */
.fin1 .sky{background:linear-gradient(#05071a,#141a3e 70%,#2a2a50)}
.fin1 .earth{position:absolute;right:120px;top:70px;width:90px;height:90px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#7ad85a 0 18%,transparent 19%),radial-gradient(circle at 65% 60%,#5cc04a 0 16%,transparent 17%),#3a8fd8;border:4px solid #2b1d14}
.fin1 .city{position:absolute;inset:0;filter:brightness(.4);transition:filter 1.4s}
.fin1.f1 .city,.fin1.f2 .city,.fin1.f3 .city{filter:none}
.fin1 .city .plotbig{bottom:110px}
.fin .plotbig .halo{display:none}
.saucer{position:absolute;left:50%;top:70px;width:280px;height:90px;margin-left:-140px;z-index:8}
.saucer .cup{position:absolute;left:80px;top:0;width:120px;height:56px;border-radius:60px 60px 0 0;background:rgba(122,216,90,.55);border:5px solid #2b1d14}
.saucer .cup::after{content:'';position:absolute;left:38px;top:16px;width:34px;height:30px;border-radius:50% 50% 40% 40%;background:#5cc04a;border:3px solid #2b1d14}
.saucer .disc{position:absolute;left:0;top:44px;width:280px;height:46px;border-radius:50%;background:#b9c6cf;border:5px solid #2b1d14;background-image:radial-gradient(circle,#ffd23f 5px,transparent 6px);background-size:40px 46px;background-position:10px 0}
.fin1 .saucer{transform:translateY(-420px);transition:transform 2.2s cubic-bezier(.2,.7,.3,1)}
.fin1.f1 .saucer,.fin1.f2 .saucer{transform:none}
.fin1.f3 .saucer{transform:translate(900px,-380px) scale(.4);transition:transform 2.2s ease-in}
.fin1 .beam{position:absolute;left:50%;top:150px;width:360px;height:400px;margin-left:-180px;background:linear-gradient(rgba(160,255,200,.8),rgba(160,255,200,.12));clip-path:polygon(38% 0,62% 0,100% 100%,0 100%);opacity:0;transition:opacity .6s;z-index:7}
.fin1.f2 .beam{opacity:1}
.fin1 .fbots{bottom:110px}
.fin1 .fbots>*{transition:transform 2.4s ease-in,opacity 2.4s}
.fin1.f2 .fbots>*,.fin1.f3 .fbots>*{transform:translateY(-360px) scale(.4);opacity:0}
/* ch3: teleport home + party */
.fin2 .sky{background:linear-gradient(#3a1f5a,#7a4a9a 70%,#b07ac0)}
.fin2 .zground{position:absolute;left:-100px;right:-100px;bottom:-300px;height:480px;border-radius:50%;background:#9a7ac0;border:6px solid #2b1d14;background-image:radial-gradient(circle,rgba(255,255,255,.2) 0 8px,transparent 9px);background-size:80px 60px}
.fin2 .zib .plotbig{bottom:110px}
.fin2 .zcrowd{position:absolute;left:50%;bottom:110px;transform:translateX(-50%);display:flex;gap:300px;z-index:6}
.fin2 .zcrowd>div{display:flex;gap:18px;align-items:flex-end}
.fin2 .zcrowd .m>*{animation:hop .5s infinite alternate}
.fin2 .flash{position:absolute;inset:0;background:#fff;opacity:0;transition:opacity .6s;pointer-events:none;z-index:30}
.fin2.f1 .flash{opacity:1}
.fin2 .home{display:none;position:absolute;inset:0;overflow:hidden}
.fin2.f2 .zib,.fin2.f3 .zib{display:none}
.fin2.f2 .home,.fin2.f3 .home{display:block}
.fin2 .hsky{position:absolute;inset:0;background:linear-gradient(#4aa0e0,#9ad4f4 55%,#d8f2ff)}
.fin2 .sunl{right:110px;top:36px;width:96px;height:96px;animation:spin 24s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.fin2 .cloud{width:176px;height:56px;animation:drift 42s linear infinite}
@keyframes drift{from{transform:translateX(-320px)}to{transform:translateX(1720px)}}
.fin2 .bunt{left:-2px;width:1336px;height:64px;z-index:3}
.fin2 .trophy{position:absolute;left:10px;bottom:74px;width:264px;height:154px}
.fin2 .portal{position:absolute;right:10px;bottom:74px;width:264px;height:154px}
.fin2 .tablel{left:50%;margin-left:-220px;bottom:122px;width:440px;height:104px;z-index:4}
.fin2 .cakel{left:50%;margin-left:-66px;bottom:214px;width:132px;height:120px;z-index:5}
.fin2 .giftl{bottom:214px;width:54px;height:54px;z-index:5}
.fin2 .spk{bottom:122px;width:72px;height:102px;z-index:4;animation:thump .45s infinite;transform-origin:50% 100%}
@keyframes thump{50%{transform:scale(1.07)}}
.fin2 .notel{width:24px;height:30px;z-index:6;animation:floatn 2.4s linear infinite;opacity:0}
@keyframes floatn{0%{opacity:0;transform:translate(0,0)}15%{opacity:1}100%{opacity:0;transform:translate(var(--dx,20px),-170px)}}
.fin2 .bal{width:42px;height:66px;z-index:3;animation:bob 1.2s infinite alternate}
.fin2 .bal::after{content:'';position:absolute;left:50%;top:96%;width:3px;height:var(--len,110px);margin-left:-1px;background:#2b1d14}
.fin2 .dance{position:absolute;left:0;right:0;bottom:30px;display:flex;justify-content:center;gap:30px;align-items:flex-end;z-index:8}
.fin2 .dance .m>*{animation:hop .38s infinite alternate}
.fin2 .dance .m.s>*{animation:sway .55s infinite alternate ease-in-out}
.fin2 .dance .m.j>*{animation:jump .7s infinite}
.fin2 .dance .m:nth-child(3n)>*{animation-delay:.2s}
@keyframes sway{from{transform:rotate(-14deg)}to{transform:rotate(14deg)}}
@keyframes jump{0%,100%{transform:translateY(0)}40%,60%{transform:translateY(-18px)}}
.fin2 .fireworks{display:none;position:absolute;inset:0;pointer-events:none;z-index:2}
.fin2.f3 .fireworks{display:block}
.fin2 .fireworks i{position:absolute;width:8px;height:8px;margin:-4px;border-radius:50%;opacity:0;animation:burst 1.9s ease-out infinite}
@keyframes burst{0%{transform:scale(.08);opacity:1}70%{opacity:1}100%{transform:scale(1);opacity:0}}
.fin2 .confetti{display:none;position:absolute;inset:0;pointer-events:none;z-index:10}
.fin2.f3 .confetti{display:block}
.fin2 .confetti i{position:absolute;top:-20px;width:10px;height:14px;animation:fall 2.6s linear infinite}
@keyframes fall{to{transform:translateY(760px) rotate(540deg)}}
.fin.static .confetti i{animation:none;transform:translateY(var(--y,200px)) rotate(30deg)}
.fin.static .fireworks i{animation:none;opacity:1;transform:scale(.8)}
.fin2 .ftxt{top:40px}
`;
var st = document.createElement('style'); st.setAttribute('data-art', ''); st.textContent = CSS; document.head.appendChild(st);

var RES = {
 scrap:{c:'#d97a3a',s:'sq',a:'Sc'},bolt:{c:'#a7b0ba',s:'ci',a:'Bo'},plate:{c:'#5fa8a0',s:'rc',a:'Pl'},copper:{c:'#c8733a',s:'ci',a:'Cu'},
 wire:{c:'#e0a040',s:'pl',a:'Wi'},hull:{c:'#7d8c99',s:'sq',a:'Hu'},oil:{c:'#3b3b46',s:'ci',a:'Oi'},fuel:{c:'#e8463a',s:'pl',a:'Fu'},
 lithium:{c:'#b8cde6',s:'di',a:'Li'},battery:{c:'#4cb050',s:'rc',a:'Ba'},titanium:{c:'#9aa0c8',s:'di',a:'Ti'},alloy:{c:'#6e7fb8',s:'rc',a:'Al'},
 nozzle:{c:'#4a5a78',s:'ci',a:'No'},ore:{c:'#8a5a4a',s:'sq',a:'Fe'},molten:{c:'#ff7a1a',s:'ci',a:'Mo'},slag:{c:'#5a5048',s:'sq',a:'Sg'},
 sand:{c:'#e6c98a',s:'sq',a:'Sa'},glass:{c:'#a8e0e8',s:'di',a:'Gl'},beam:{c:'#6a7078',s:'pl',a:'Be'},silicon:{c:'#7a7aa8',s:'di',a:'Si'},
 cell:{c:'#2a5ab8',s:'rc',a:'Ce'},lamp:{c:'#ffd23f',s:'ci',a:'La'},chip:{c:'#2f8a4a',s:'sq',a:'Ch'},board:{c:'#1d6a5a',s:'rc',a:'Bd'},
 belt:{c:'#ffd23f',s:'pl',a:'Bt'},clay:{c:'#b8704a',s:'ci',a:'Cl'},tile:{c:'#d8cfbe',s:'sq',a:'Tl'},
 // chapter 2
 rock:{c:'#9a9a9a',s:'sq',a:'Rk'},ice:{c:'#bfe8f5',s:'di',a:'Ic'},water:{c:'#3a8fd8',s:'ci',a:'Wa'},brick:{c:'#b5502e',s:'rc',a:'Br'},
 pipe:{c:'#7d8c99',s:'pl',a:'Pi'},seed:{c:'#8a6a2b',s:'ci',a:'Se'},veg:{c:'#4cb050',s:'sq',a:'Vg'},meal:{c:'#e8a040',s:'rc',a:'Me'},
 gear:{c:'#8a8f9a',s:'ci',a:'Ge'},sapling:{c:'#2f8a4a',s:'di',a:'Sp'},toy:{c:'#e85a9a',s:'sq',a:'Ty'},coin:{c:'#ffd23f',s:'ci',a:'Cn'},
 // chapter 3
 goo:{c:'#7ad85a',s:'ci',a:'Go'},crystal:{c:'#b07ae8',s:'di',a:'Cr'},padtile:{c:'#8f97d6',s:'sq',a:'Pt'},spark:{c:'#ffe27a',s:'di',a:'Sk'},
 core:{c:'#ff7a1a',s:'ci',a:'Co'},fruit:{c:'#e8463a',s:'ci',a:'Fr'},moss:{c:'#5a9a3a',s:'sq',a:'Ms'},bubble:{c:'#9fd8f0',s:'ci',a:'Bu'},
 ring:{c:'#c8c8d8',s:'pl',a:'Rg'},snack:{c:'#e8a040',s:'sq',a:'Sn'},lens:{c:'#a8e0e8',s:'ci',a:'Le'},button:{c:'#c42f4a',s:'ci',a:'Bn'},
 panel:{c:'#4a5a78',s:'rc',a:'Pn'},rod:{c:'#6a7078',s:'pl',a:'Ro'},coil:{c:'#d9a03a',s:'ci',a:'Ci'},stardust:{c:'#f6efd9',s:'di',a:'Sd'},
 starmap:{c:'#22264a',s:'rc',a:'Sm'},pred:{c:'#e8463a',s:'pl',a:'R'},pblue:{c:'#3a8fd8',s:'pl',a:'B'},pyellow:{c:'#f2c230',s:'pl',a:'Y'},
 ppurple:{c:'#8a4ac0',s:'pl',a:'P'},porange:{c:'#ff8a2a',s:'pl',a:'O'},pgreen:{c:'#4cb050',s:'pl',a:'G'},balloon:{c:'#e85a9a',s:'ci',a:'Bl'},
 cake:{c:'#f1e7d0',s:'rc',a:'Ck'}
};
var NM = {nozzle:'nozzle ring',cell:'solar cell',beam:'steel beam',ore:'iron ore',hull:'hull panel',tile:'ceramic tile',molten:'molten steel',
 rock:'moon rock',veg:'veggies',padtile:'pad tile',core:'power core',rod:'antenna rod',starmap:'star map',
 pred:'red paint',pblue:'blue paint',pyellow:'yellow paint',ppurple:'purple paint',porange:'orange paint',pgreen:'green paint'};
var UP = {drill:{c:'#8a5a2b',l:'D',n:'Drill arm'},magnet:{c:'#c0392b',l:'M',n:'Magnet hand'},wheels:{c:'#34495e',l:'W',n:'Wheels'},jet:{c:'#e67e22',l:'J',n:'Jet Boots'}};
var ACOL = {pink:'#e85a9a',green:'#5cc04a',blue:'#3a8fd8'};

var CHAPTERS = [
 {key:'moon',title:'To the Moon',short:'MOON',pattern:'pat-dots',mapBg:'#d39a5e',pad:'',
  parts:[{n:'Launch Pad',c:'#a9a59c'},{n:'Booster',c:'#d9541e'},{n:'Fuel Tank',c:'#e8e0d0'},{n:'Fins',c:'#c42f4a'},{n:'Engine Bell',c:'#6a7078'},
   {n:'Crew Capsule',c:'#b9c6cf'},{n:'Solar Wings',c:'#2a5ab8'},{n:'Nav Computer',c:'#1d6a5a'},{n:'Heat Shield',c:'#3b3b46'},{n:'Nose Cone',c:'#c42f4a'}],
  levels:[{name:'Junk Hill',bg:'#d39a5e'},{name:'Rust Flats',bg:'#c98a62'},{name:'Bot Garage',bg:'#bfa062'},{name:'Assembly Line',bg:'#a9a89a'},
   {name:'Twin Town',bg:'#d4a08a'},{name:'The Foundry',bg:'#b07a5a'},{name:'Solar Ridge',bg:'#d8b46a'},{name:'Conveyor Works',bg:'#9fb0a4'},
   {name:'Flat-Battery Bay',bg:'#9aa2b4'},{name:'Meteor Shower',bg:'#a08aa0'}]},
 {key:'city',title:'Moon City',short:'CITY',pattern:'pat-craters',mapBg:'#9a9fb0',pad:'moon',
  parts:[{n:'Habitat Dome',c:'#a8e0e8'},{n:'Water Tower',c:'#b9c6cf'},{n:'Greenhouse',c:'#7ad85a'},{n:'Power Station',c:'#3a5ab8'},{n:'Moon Homes',c:'#e8e0d0'},
   {n:'Workshop',c:'#8a8f9a'},{n:'Park',c:'#4cb050'},{n:'Moon Mall',c:'#f1e7d0'},{n:'Spaceport',c:'#c8c8d8'},{n:'City Lights',c:'#ffd23f'}],
  levels:[{name:'Crater Camp',bg:'#a3a7b5'},{name:'Ice Fields',bg:'#a9bcc9'},{name:'Green Dome',bg:'#9fb39a'},{name:'Sun Farm',bg:'#b8b49a'},
   {name:'Moon Homes',bg:'#b0a5a8'},{name:'Lava Vents',bg:'#a88a80'},{name:'Park Place',bg:'#9fb3a0'},{name:'Shaky Ground',bg:'#a8a090'},
   {name:'Tourist Town',bg:'#a0a8c0'},{name:'City Lights',bg:'#7f849e'}]},
 {key:'home',title:'Home Again',short:'HOME',pattern:'pat-bubbles',mapBg:'#8a74a8',pad:'zib',
  parts:[{n:'Teleporter Pad',c:'#8f97d6'},{n:'Power Core',c:'#ff7a1a'},{n:'Ring Frame',c:'#c8c8d8'},{n:'Crystal Lens',c:'#a8e0e8'},{n:'Control Panel',c:'#4a5a78'},
   {n:'Antenna',c:'#6a7078'},{n:'Beam Coil',c:'#d9a03a'},{n:'Star Map',c:'#22264a'},{n:'Party Supplies',c:'#e85a9a'},{n:'Home Beam',c:'#9fe8ff'}],
  levels:[{name:'Bubble Beach',bg:'#8fb8c8'},{name:'Teamwork Towers',bg:'#9a8fc0'},{name:'Rainbow Ridge',bg:'#b89ac0'},{name:'Snack Shack',bg:'#c0a08f'},
   {name:'Wobble Woods',bg:'#8fb09a'},{name:'Egg Nest',bg:'#c0b08f'},{name:'Copy Cave',bg:'#8a8aa8'},{name:'Swap Shop',bg:'#a89ab8'},
   {name:'Paint Party',bg:'#c09ab0'},{name:'Home Beam',bg:'#7a6a9a'}]}
];

function nm(r){ return NM[r] || r; }

/* ---------- pixel-art resource icons (12x12). k outline, w white, a base, b shade, c light, d second colour, e second shade ---------- */
var TPL = {
 junk:['............','.......kk...','......kddk..','..kkk.kdek..','.kcaak.kk...','.kaaabk.....','..kbbk.kkk..','...kk.kcaak.','..kkk.kaabk.','.kddek.kbk..','..kkk...k...','............'],
 bolt:['............','...kkkkkk...','..kccccaak..','..kbbbbbbk..','...kkkkkk...','....kcak....','....kkkk....','....kcak....','....kkkk....','....kcak....','.....kk.....','............'],
 plate:['............','............','....kkkkkkk.','...kcccccak.','..kcaaaaabk.','.kcaaaaabk..','kcaaaaabk...','kaaaaabk....','kbbbbbk.....','kkkkkk......','............','............'],
 chunk:['............','....kkkk....','..kkccaak...','.kccaaaabk..','.kcaaaaaabk.','kcaaabaaabk.','kaaaaaaabbk.','kaabaaaabbk.','.kaaaaabbk..','..kbbbbbk...','...kkkkk....','............'],
 coil:['............','.kkkkkkkkkk.','.kddddddddk.','..kccacack..','..kaacaack..','..kccacack..','..kaacaack..','..kccacack..','.kddddddddk.','.kkkkkkkkkk.','............','............'],
 panel:['............','.kkkkkkkkkk.','.kccccccack.','.kckaaaakbk.','.kcaaaaaabk.','.kcaaaaaabk.','.kcaaaaaabk.','.kckaaaakbk.','.kabbbbbbbk.','.kkkkkkkkkk.','............','............'],
 drop:['.....kk.....','....kcak....','....kcak....','...kcaaak...','..kcwaaabk..','..kcwaaabk..','.kcaaaaaabk.','.kaaaaaaabk.','.kaaaaaabbk.','..kabbbbbk..','...kkkkkk...','............'],
 can:['............','..kkk.......','.kbbbkkkkk..','.kkkcccccak.','..kcakaakak.','..kcaakkaak.','..kcakaakak.','..kcaaaaaak.','..kcaaaaabk.','..kbbbbbbbk.','..kkkkkkkkk.','............'],
 gem:['............','...kkkkkk...','..kcwkcabk..','.kcwckaaabk.','kkkkkkkkkkkk','.kcaaaaaabk.','..kcaaaabk..','...kcaabk...','....kabk....','.....kk.....','............','............'],
 battery:['............','....kkkk....','....kwwk....','..kkkkkkkk..','..kcaaaaak..','..kcaaaaak..','..kwwwwwwk..','..kcaaaaak..','..kcaaaabk..','..kbbbbbbk..','..kkkkkkkk..','............'],
 bar:['............','............','............','...kkkkkk...','..kccccaak..','.kcaaaaaabk.','kcaaaaaaabbk','kaaaaaaabbbk','kbbbbbbbbbbk','kkkkkkkkkkkk','............','............'],
 ring:['............','...kkkkkk...','..kccccaak..','.kcakkkkabk.','.kckk..kkbk.','.kck....kbk.','.kak....kbk.','.kakk..kkbk.','.kaakkkkbbk.','..kbbbbbbk..','...kkkkkk...','............'],
 pile:['............','............','............','.....kk.....','....kcak....','...kcaaak...','..kcaabaak..','.kcaaaaaabk.','kcaabaaaabbk','kaaaaaabbbbk','kkkkkkkkkkkk','............'],
 pane:['............','.kkkkkkkkkk.','.kcccccccak.','.kcwccccaak.','.kcwcccaaak.','.kcccccaaak.','.kccccaaaak.','.kcccaaaawk.','.kccaaaaawk.','.kaaaaaaaak.','.kkkkkkkkkk.','............'],
 ibeam:['............','.kkkkkkkkkk.','.kcccccaaak.','.kkkkcakkkk.','....kcak....','....kcak....','....kcak....','....kcak....','.kkkkaakkkk.','.kcaaaabbbk.','.kkkkkkkkkk.','............'],
 solar:['............','...kkkkkkkk.','..kckckckak.','..kkkkkkkkk.','.kckckckak..','.kkkkkkkkk..','kckckckak...','kkkkkkkkk...','....kk......','...kddk.....','...kkkk.....','............'],
 lamp:['....kkkk....','...kwcaak...','..kwcaaaak..','..kcaaaaak..','..kcaaaabk..','...kcaabk...','....kaak....','....kkkk....','....kddk....','....kkkk....','.....kk.....','............'],
 chip:['............','..k.k.k.k...','.kkkkkkkkk..','kkcccccaakk.','.kcaaaaaak..','kkcadddaakk.','.kcadddaak..','kkcaaaaabkk.','.kbbbbbbbk..','.kkkkkkkkk..','..k.k.k.k...','............'],
 board:['............','kkkkkkkkkkkk','kaaaaaaaaaak','kakkkaaddaak','kakwkaaddaak','kakkkaaddaak','kaddddddaaak','kaadaakkkaak','kaadaakwkaak','kaaaaakkkaak','kkkkkkkkkkkk','............'],
 belt:['............','............','..kkkkkkkk..','.kaakaakaak.','kak......kak','kk........kk','kak......kak','.kaakaakaak.','..kkkkkkkk..','............','............','............'],
 tile:['............','.kkkkkkkkkk.','.kwcccccaak.','.kcwccccaak.','.kccaaaaaak.','.kccaaaaabk.','.kcaaaaaabk.','.kcaaaaabbk.','.kaaaaabbbk.','.kkkkkkkkkk.','............','............'],
 brick:['............','............','.kkkkkkkkkk.','.kcccckccak.','.kaaaakaabk.','.kkkkkkkkkk.','.kcakccccak.','.kabkaaaabk.','.kkkkkkkkkk.','............','............','............'],
 pipe:['............','............','.kk.....kk..','kcakkkkkcak.','kcaccccccak.','kaaaaaaaaak.','kabbbbbbbak.','kbakkkkkbak.','.kk.....kk..','............','............','............'],
 seed:['............','............','....kkk.....','...kcaak....','..kcaaaak...','..kcaaaabk..','..kaaaaabk..','...kaaabk...','....kbbk....','.....kk.....','............','............'],
 carrot:['..k.k.k.....','.kakakak....','..kaaak.....','..kkkkkk....','..kdddddk...','...kdedek...','...kddddk...','....kdek....','....kddk....','.....kdk....','.....kk.....','............'],
 bowl:['............','...w..w.....','....w..w....','...w..w.....','.kkkkkkkkkk.','kdddddddddek','kcaaaaaaaabk','.kcaaaaaabk.','..kaaaaabk..','...kkkkkk...','............','............'],
 gear:['............','....kkkk....','.kk.kaak.kk.','.kakaaaakak.','..kaakkaak..','.kkakddkakk.','.kaakddkaak.','..kaakkaak..','.kakaaaabak.','.kk.kbbk.kk.','....kkkk....','............'],
 sprout:['............','............','..kkk.kkk...','.kaaak.kcak.','.kaaabkcaak.','..kkbkkakk..','....kbk.....','....kbk.....','...kkkkk....','..kdddddk...','..kkkkkkk...','............'],
 cube:['............','...kkkkkkk..','..kccccccak.','.kkkkkkkkbk.','.kcaaaaakbk.','.kcawwaakbk.','.kcwaawakbk.','.kcwwwwakbk.','.kcwaawakk..','.kkkkkkkkk..','............','............'],
 coin:['............','....kkkk....','..kkccaakk..','..kcaccaak..','.kcaacaaabk.','.kcaacaaabk.','.kcaacaaabk.','.kaaacaaabk.','..kaaaaabk..','..kkbbbbkk..','....kkkk....','............'],
 slime:['............','............','....kkk.....','...kcwak....','..kcwaaak...','..kcaaaaakk.','.kcaaaaaaabk','kcaaaaaaaabk','kaaaaaaaabbk','kbbbbbbbbbbk','kkkkkkkkkkkk','............'],
 star:['.....kk.....','.....kck....','....kcck....','kkkkkcaakkkk','kcccccaaaabk','.kcaaaaaabk.','..kcaaaabk..','..kcaabaak..','.kcabkkbaak.','.kabk..kbbk.','.kkk....kkk.','............'],
 orb:['............','....kkkk....','..kkwcaakk..','..kwcaaaak..','.kddddddddk.','.kcaaaaaabk.','.kddddddddk.','.kaaaaaabbk.','..kaaaabbk..','..kkbbbbkk..','....kkkk....','............'],
 fruit:['.....kk.....','.....kek.kk.','....kkekkdk.','..kkcakakk..','.kcwaaaaabk.','.kcwaaaaabk.','.kcaaaaaabk.','.kaaaaaaabk.','..kaaaaabk..','..kkbkkbkk..','...kk..kk...','............'],
 ball:['............','....kkkk....','..kkccaakk..','..kcwwaaak..','.kcwaaaaabk.','.kcaaaaaabk.','.kaaaaaaabk.','.kaaaaaabbk.','..kaaabbbk..','..kkbbbbkk..','....kkkk....','............'],
 cookie:['............','...kkkkkk...','..kccaaaak..','.kcaakaaabk.','.kaaaaaakbk.','.kakaaaaabk.','.kaaaakaabk.','.kaaaaaaabk.','..kakaaabk..','...kkkkkk...','............','............'],
 lens:['............','...kkkkkk...','..kddddddk..','.kdwccaaadk.','.kdwcaaaadk.','.kdcaaaaadk.','.kdaaaaaadk.','.kdaaaaaadk.','..kddddddk..','...kkkkkkk..','........kkk.','.........kk.'],
 button:['............','............','...kkkkkk...','..kccaaaak..','.kcakaakabk.','.kaaaaaaabk.','.kakaakaabk.','..kaaaaabk..','...kkkkkk...','............','............','............'],
 rod:['...kkk......','..kdddk.....','..kdwdk.....','...kkkk.....','....kcak....','....kcak....','....kcak....','....kcak....','....kcak....','...kkaakk...','...kbbbbk...','...kkkkkk...'],
 sparkle:['............','..k.........','.kak....k...','..k....kak..','......kcaak.','.......kak..','...k....k...','..kak.......','.kcaak..k...','..kak..kak..','...k....k...','............'],
 scroll:['............','.kkkkkkkkkk.','kbaaaaaaaabk','.kaadaaadak.','.kaaaadaaak.','.kadaaaaaak.','.kaaadaadak.','.kadaaaaaak.','kbaaaaaaaabk','.kkkkkkkkkk.','............','............'],
 paint:['............','....kkkk....','...k....k...','..kkkkkkkk..','..kddddddk..','..kceeeeek..','..kcaaaaak..','..kcaaaaak..','..kcaaaabk..','..kbbbbbbk..','..kkkkkkkk..','............'],
 balloon:['....kkkk....','..kkccaakk..','..kcwaaaak..','.kcwaaaaabk.','.kcaaaaaabk.','.kaaaaaaabk.','..kaaaaabk..','...kaaabk...','....kbbk....','.....kk.....','......k.....','.....k......'],
 cake:['.....k......','.....d......','....kkk.....','..kkkkkkkk..','.kddddddddk.','.kdedddeddk.','.kaaaaaaaak.','.kaaaaaaaak.','.kddddddddk.','.kaaaaaaaak.','.kkkkkkkkkk.','............']
};
var SPRMAP = {
 scrap:['junk','#d97a3a','#9aa3ad'],bolt:['bolt','#a7b0ba'],plate:['plate','#5fa8a0'],copper:['chunk','#d4803a'],wire:['coil','#e0a040','#7d8c99'],
 hull:['panel','#7d8c99'],oil:['drop','#4a4a58'],fuel:['can','#e8463a'],lithium:['gem','#b8cde6'],battery:['battery','#4cb050'],
 titanium:['chunk','#9aa0c8'],alloy:['bar','#6e7fb8'],nozzle:['ring','#5a6a88'],ore:['chunk','#8a5a4a'],molten:['drop','#ff7a1a'],
 slag:['chunk','#5a5048'],sand:['pile','#e6c98a'],glass:['pane','#a8e0e8'],beam:['ibeam','#7a8088'],silicon:['gem','#8a8ac0'],
 cell:['solar','#2a5ab8','#8a8f9a'],lamp:['lamp','#ffd23f','#8a8f9a'],chip:['chip','#2f8a4a','#c8c8d8'],board:['board','#1d6a5a','#ffd23f'],
 belt:['belt','#ffd23f'],clay:['pile','#b8704a'],tile:['tile','#d8cfbe'],
 rock:['chunk','#9a9a9a'],ice:['gem','#bfe8f5'],water:['drop','#3a8fd8'],brick:['brick','#b5502e'],pipe:['pipe','#8a98a5'],
 seed:['seed','#a8823a'],veg:['carrot','#4cb050','#ff8a2a'],meal:['bowl','#e8a040','#f1e7d0'],gear:['gear','#9aa0aa','#5a6070'],
 sapling:['sprout','#4cb050','#8a6a2b'],toy:['cube','#e85a9a'],coin:['coin','#ffd23f'],
 goo:['slime','#7ad85a'],crystal:['gem','#b07ae8'],padtile:['tile','#8f97d6'],spark:['star','#ffe27a'],core:['orb','#ff7a1a','#ffe27a'],
 fruit:['fruit','#e8463a','#4cb050'],moss:['pile','#5a9a3a'],bubble:['ball','#9fd8f0'],ring:['ring','#c8c8d8'],snack:['cookie','#d9a05a'],
 lens:['lens','#a8e0e8','#b9c6cf'],button:['button','#c42f4a'],panel:['panel','#4a5a78'],rod:['rod','#7a8088','#ff5a4a'],coil:['coil','#d9a03a','#6a7078'],
 stardust:['sparkle','#f6efd9'],starmap:['scroll','#f1e7d0','#22264a'],
 pred:['paint','#c9d0d6','#e8463a'],pblue:['paint','#c9d0d6','#3a8fd8'],pyellow:['paint','#c9d0d6','#f2c230'],
 ppurple:['paint','#c9d0d6','#8a4ac0'],porange:['paint','#c9d0d6','#ff8a2a'],pgreen:['paint','#c9d0d6','#4cb050'],
 balloon:['balloon','#e85a9a'],cake:['cake','#f1e7d0','#e85a9a']
};
function mixHex(h, t, f) { var a = parseInt(h.slice(1), 16), b = parseInt(t.slice(1), 16);
  var r = Math.round(((a >> 16) & 255) * (1 - f) + ((b >> 16) & 255) * f), g = Math.round(((a >> 8) & 255) * (1 - f) + ((b >> 8) & 255) * f), bl = Math.round((a & 255) * (1 - f) + (b & 255) * f);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1); }
var SPRITE_URL = {};
(function buildSprites() {
  var css = '.ri.px{background-color:transparent!important;border:none!important;border-radius:0!important;transform:none!important;height:var(--s)!important;background-size:100% 100%;background-repeat:no-repeat;image-rendering:pixelated;image-rendering:crisp-edges}.ri.px b{display:none}\n';
  try {
    var cv = document.createElement('canvas'); cv.width = 12; cv.height = 12; var cx = cv.getContext('2d');
    Object.keys(SPRMAP).forEach(function (r) {
      var m = SPRMAP[r], g = TPL[m[0]]; if (!g) return;
      var base = m[1], d = m[2] || '#2b1d14';
      var pal = {k:'#2b1d14', w:'#ffffff', a:base, b:mixHex(base, '#000000', .32), c:mixHex(base, '#ffffff', .42), d:d, e:mixHex(d, '#000000', .3)};
      cx.clearRect(0, 0, 12, 12);
      for (var y = 0; y < 12; y++) { var row = (g[y] || ''); for (var x = 0; x < 12; x++) { var ch = row[x]; if (!ch || ch === '.' || !pal[ch]) continue; cx.fillStyle = pal[ch]; cx.fillRect(x, y, 1, 1); } }
      SPRITE_URL[r] = cv.toDataURL('image/png');
      css += '.rx-' + r + '{background-image:url(' + SPRITE_URL[r] + ')}\n';
    });
  } catch (e) {}
  var s2 = document.createElement('style'); s2.setAttribute('data-art-sprites', ''); s2.textContent = css; document.head.appendChild(s2);
})();
/* ICON_SCALE: one knob for every resource icon in the game. 1 = original size. */
var ICON_SCALE = 1.25;
function ic(r, sz, dim) { sz = Math.round((sz || 22) * ICON_SCALE); if (SPRITE_URL[r]) return '<i class="ri px rx-' + r + (dim ? ' dim' : '') + '" style="--s:' + sz + 'px"></i>'; var R = RES[r] || {c:'#ccc',s:'sq',a:'?'}; return '<i class="ri ' + R.s + (dim ? ' dim' : '') + '" style="--c:' + R.c + ';--s:' + sz + 'px"><b>' + R.a + '</b></i>'; }
/* one worker sprite: o = {kind:'bot'|'alien', lv, up, col, flat, tour, hungry, bar, barCol, c, cls, attrs} */
function worker(o) {
  o = o || {};
  var bar = o.bar != null ? '<span class="bt"><span style="height:' + Math.max(0, Math.min(100, o.bar)) + '%;' + (o.barCol ? 'background:' + o.barCol : '') + '"></span></span>' : '';
  if (o.kind === 'alien') {
    return '<div class="alien' + (o.hungry ? ' hungry' : '') + (o.cls ? ' ' + o.cls : '') + '" style="--ac:' + (ACOL[o.col] || o.col || '#2fb8a8') + '" ' + (o.attrs || '') + '><span class="a1"></span><span class="a2"></span><span class="bd"></span><span class="e"></span><span class="m"></span>' + bar + '</div>';
  }
  var lv = o.lv || 1;
  return '<div class="bot lv' + lv + (o.flat ? ' flat' : '') + (o.tour ? ' tour' : '') + (o.cls ? ' ' + o.cls : '') + '" ' + (o.attrs || '') + '><span class="dm"' + (o.c ? ' style="background:' + o.c + '"' : '') + '></span><span class="ey"></span><span class="bs"></span>' + (lv > 1 ? '<span class="an"></span>' : '') +
    (o.up ? '<b class="ub" style="background:' + UP[o.up].c + '">' + UP[o.up].l + '</b>' : '') + (o.tour ? '<b class="ub" style="background:#22264a">T</b>' : '') + bar + '</div>';
}
function botStatic(o) { o = o || {}; return worker({kind:'bot', lv:o.lv, up:o.up, c:o.c, flat:o.flat, tour:o.tour, cls:'st'}); }
function alienStatic(o) { o = o || {}; return worker({kind:'alien', col:o.col || 'green', hungry:o.hungry, cls:'st'}); }

/* centre plot: ci chapter, done[10] booleans, cur = index being built (-1 none), frac 0..1, anim = index to clamp in */
var RK_ORDER = [4, 1, 3, 2, 6, 8, 7, 5];
var CITY = [{x:0,w:84,h:44,sh:'dome'},{x:-82,w:22,h:40,sh:'tower'},{x:82,w:50,h:34,sh:'green'},{x:-140,w:42,h:26,sh:'power'},{x:142,w:42,h:30,sh:'house'},
  {x:-198,w:44,h:36,sh:'block'},{x:200,w:46,h:32,sh:'park'},{x:-258,w:58,h:30,sh:'mall'},{x:262,w:48,h:20,sh:'port'},{x:0,w:580,h:12,sh:'lights'}];
var TELE = ['pad','core','ring','lens','panel','ant','coil','map','bal','beam'];
function stateCls(i, done, cur) { return done[i] && i !== cur ? '' : (i === cur ? ' cur' : ' todo'); }
/* ---------- centre builds: one pixel-art scene per chapter, built from 10 layered parts ---------- */
var K = '#2b1d14';
function mx(h, t, f) { return mixHex(h, t, f); }
function dk(c, f) { return mx(c, '#000000', f == null ? .28 : f); }
function lt(c, f) { return mx(c, '#ffffff', f == null ? .4 : f); }
function layer(w, h, fn, noOl) {
  var c = document.createElement('canvas'); c.width = w; c.height = h; var g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  var D = {
    r: function (x, y, ww, hh, col) { g.fillStyle = col; g.fillRect(x, y, ww, hh); },
    p: function (x, y, col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); },
    el: function (cx, cy, rx, ry, col) { g.fillStyle = col; for (var y = -ry; y <= ry; y++) { var hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry + .25)))); g.fillRect(cx - hw, cy + y, hw * 2 + 1, 1); } },
    dome: function (cx, base, rx, ry, col) { g.fillStyle = col; for (var y = 0; y <= ry; y++) { var hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry + .25)))); g.fillRect(cx - hw, base - y, hw * 2 + 1, 1); } },
    ring: function (cx, cy, ro, ri, col, shade) { for (var y = -ro; y <= ro; y++) for (var x = -ro; x <= ro; x++) { var d = Math.sqrt(x * x + y * y); if (d <= ro + .3 && d >= ri - .3) { g.fillStyle = shade && (x + y > ro * .5) ? shade : (x + y < -ro * .6 ? lt(col, .35) : col); g.fillRect(cx + x, cy + y, 1, 1); } } },
    poly: function (pts, col) { g.fillStyle = col; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); g.fill(); },
    cyl: function (x, y, ww, hh, col) { g.fillStyle = col; g.fillRect(x, y, ww, hh); var l = Math.max(1, Math.round(ww * .2)), s = Math.max(1, Math.round(ww * .25)); g.fillStyle = lt(col, .45); g.fillRect(x + 1, y, l, hh); g.fillStyle = dk(col, .22); g.fillRect(x + ww - s, y, s, hh); }
  };
  fn(D);
  var id = g.getImageData(0, 0, w, h), d = id.data, i, n = w * h, al = new Uint8Array(n), ol = new Uint8Array(n);
  for (i = 0; i < n; i++) { if (d[i * 4 + 3] >= 110) { d[i * 4 + 3] = 255; al[i] = 1; } else { d[i * 4 + 3] = 0; } }
  for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) { i = y * w + x; if (al[i]) continue;
    if (!noOl && ((x > 0 && al[i - 1]) || (x < w - 1 && al[i + 1]) || (y > 0 && al[i - w]) || (y < h - 1 && al[i + w]))) { ol[i] = 1; d[i * 4] = 43; d[i * 4 + 1] = 29; d[i * 4 + 2] = 20; d[i * 4 + 3] = 255; } }
  g.putImageData(id, 0, 0);
  // blueprint ghost: pale silhouette + dotted outline
  var gc = document.createElement('canvas'); gc.width = w; gc.height = h; var gg = gc.getContext('2d'), gi = gg.createImageData(w, h), q = gi.data;
  for (y = 0; y < h; y++) for (x = 0; x < w; x++) { i = y * w + x;
    if (ol[i]) { if ((x + y) % 2 === 0) { q[i * 4] = 43; q[i * 4 + 1] = 29; q[i * 4 + 2] = 20; q[i * 4 + 3] = 150; } }
    else if (al[i]) { q[i * 4] = 255; q[i * 4 + 1] = 255; q[i * 4 + 2] = 255; q[i * 4 + 3] = 46; } }
  gg.putImageData(gi, 0, 0);
  return {full: c.toDataURL('image/png'), ghost: gc.toDataURL('image/png')};
}
var SCN_DEF = [
 {w:120, h:70, z:[0,4,1,3,2,6,8,5,7,9],
  ground: function (D) { D.el(60, 64, 56, 5, '#8b6a4a'); D.el(60, 63, 53, 3, '#a07a52'); D.r(12, 61, 5, 2, '#9aa3ad'); D.r(100, 61, 6, 2, '#d97a3a'); D.r(22, 64, 3, 2, '#6a7078'); D.r(92, 64, 4, 1, '#b9c6cf'); D.r(106, 64, 3, 1, '#c8733a'); },
  parts: [
   function (D) { // launch pad + gantry
     D.r(36, 56, 48, 3, '#b9b5ac'); D.r(36, 59, 48, 3, '#7d7a72'); for (var i = 0; i < 12; i++) D.r(37 + i * 4, 59, 2, 3, i % 2 ? '#3b3b46' : '#ffd23f');
     D.r(48, 51, 3, 5, '#6a7078'); D.r(69, 51, 3, 5, '#6a7078');
     D.r(26, 13, 2, 43, '#d9541e'); D.r(32, 13, 2, 43, '#d9541e'); for (var y = 16; y < 54; y += 6) { D.r(26, y, 8, 1, '#a8441a'); for (var k = 0; k < 5; k++) D.p(28 + k * .8 | 0, y + 1 + k, '#a8441a'); }
     D.r(25, 11, 10, 2, '#c42f4a'); D.p(30, 10, '#ffd23f'); D.r(34, 40, 16, 2, '#d9541e'); D.r(49, 38, 2, 5, '#6a7078'); },
   function (D) { D.cyl(52, 37, 16, 14, '#e8e0d0'); D.r(52, 42, 16, 3, '#d9541e'); D.p(54, 39, '#9aa3ad'); D.p(65, 39, '#9aa3ad'); D.p(54, 48, '#9aa3ad'); D.p(65, 48, '#9aa3ad'); },
   function (D) { D.cyl(52, 26, 16, 11, '#cfd6dc'); D.r(52, 28, 16, 1, '#ff8a2a'); D.r(52, 33, 16, 1, '#ff8a2a'); D.r(57, 30, 6, 2, '#3b3b46'); },
   function (D) { D.poly([[51, 42], [51, 52], [44, 56], [44, 49]], '#c42f4a'); D.poly([[69, 42], [69, 52], [76, 56], [76, 49]], '#c42f4a'); D.r(45, 50, 2, 5, '#e8463a'); D.r(73, 50, 2, 5, '#a3243a'); },
   function (D) { D.poly([[55, 51], [65, 51], [67, 56], [53, 56]], '#5a6070'); D.r(56, 52, 2, 3, '#8a8f9a'); D.r(54, 55, 13, 1, '#3b3b46'); },
   function (D) { D.poly([[52, 24], [68, 24], [64, 14], [56, 14]], '#b9c6cf'); D.poly([[54, 23], [56, 23], [58, 15], [57, 15]], '#e8eef2'); },
   function (D) { D.r(46, 29, 6, 1, '#6a7078'); D.r(68, 29, 6, 1, '#6a7078'); D.r(30, 26, 16, 7, '#2a5ab8'); D.r(74, 26, 16, 7, '#2a5ab8');
     for (var i = 0; i < 4; i++) { D.r(30 + i * 4, 26, 1, 7, '#5a8ae8'); D.r(74 + i * 4, 26, 1, 7, '#5a8ae8'); } D.r(30, 29, 16, 1, '#5a8ae8'); D.r(74, 29, 16, 1, '#5a8ae8'); },
   function (D) { D.el(60, 19, 2, 2, '#1d6a5a'); D.p(59, 18, '#7ad85a'); D.p(60, 19, '#9fe8a0'); D.r(65, 8, 1, 7, '#6a7078'); D.r(63, 8, 5, 1, '#9aa3ad'); D.p(65, 7, '#ff5a4a'); },
   function (D) { D.r(50, 24, 20, 2, '#3b3b46'); D.r(51, 24, 18, 1, '#5a5a68'); },
   function (D) { D.poly([[56, 14], [64, 14], [60, 3]], '#c42f4a'); D.r(58, 9, 1, 4, '#e8463a'); D.p(60, 4, '#ffd23f'); }
  ]},
 {w:200, h:70, z:[0,1,3,5,7,2,8,4,6,9],
  ground: function (D) { D.el(100, 63, 97, 6, '#9a978c'); D.el(100, 62, 95, 4, '#c9c6bb'); D.el(28, 64, 4, 1, '#a9a69b'); D.el(160, 63, 5, 1, '#a9a69b'); D.el(118, 65, 3, 1, '#a9a69b'); D.r(8, 60, 184, 1, '#b5b2a6'); },
  parts: [
   function (D) { D.dome(100, 59, 22, 20, '#a8e0e8'); [-12, -4, 4, 12].forEach(function (o) { var hh = Math.round(20 * Math.sqrt(1 - (o * o) / 484)); D.r(100 + o, 59 - hh, 1, hh, '#7ab8c8'); });
     D.r(80, 50, 41, 1, '#7ab8c8'); D.p(88, 43, '#ffffff'); D.p(89, 42, '#ffffff'); D.p(87, 45, '#ffffff'); D.r(78, 58, 45, 2, '#8a8f9a'); D.r(97, 51, 7, 7, '#4a5a78'); D.p(102, 54, '#ffd23f'); },
   function (D) { D.r(64, 43, 2, 16, '#6a7078'); D.r(74, 43, 2, 16, '#6a7078'); D.r(66, 50, 8, 1, '#6a7078'); D.cyl(62, 27, 16, 16, '#b9c6cf'); D.r(62, 31, 16, 1, '#8a98a5'); D.r(62, 39, 16, 1, '#8a98a5'); D.dome(70, 27, 8, 4, '#8a98a5'); D.el(70, 35, 2, 2, '#3a8fd8'); },
   function (D) { D.dome(135, 59, 11, 12, '#c8f0d8'); D.r(128, 54, 3, 5, '#4cb050'); D.r(133, 51, 3, 8, '#2f8a4a'); D.r(138, 54, 3, 5, '#4cb050'); D.r(142, 55, 2, 4, '#5cc04a'); D.p(129, 53, '#e85a9a'); D.p(139, 53, '#ffd23f'); D.r(124, 58, 23, 2, '#8a8f9a'); },
   function (D) { D.cyl(42, 47, 18, 12, '#8a8f9a'); D.r(48, 53, 4, 6, '#3b3b46'); D.poly([[40, 46], [50, 46], [50, 41], [40, 44]], '#2a5ab8'); D.poly([[52, 46], [62, 46], [62, 41], [52, 44]], '#2a5ab8');
     D.r(44, 42, 1, 3, '#5a8ae8'); D.r(56, 42, 1, 3, '#5a8ae8'); D.p(56, 50, '#ffd23f'); D.p(55, 51, '#ffd23f'); D.p(56, 52, '#ffd23f'); },
   function (D) { D.r(172, 49, 9, 10, '#e8e0d0'); D.poly([[171, 49], [182, 49], [176, 43]], '#c42f4a'); D.r(174, 52, 3, 3, '#ffd23f'); D.r(178, 54, 2, 5, '#8a5a2b');
     D.r(183, 47, 11, 12, '#d8cfbe'); D.poly([[182, 47], [195, 47], [188, 40]], '#3a8fd8'); D.r(185, 50, 3, 3, '#ffd23f'); D.r(189, 50, 3, 3, '#ffd23f'); D.r(187, 55, 2, 4, '#8a5a2b'); },
   function (D) { D.cyl(21, 45, 18, 14, '#7d8c99'); D.poly([[21, 45], [27, 39], [27, 45]], '#5a6a88'); D.poly([[27, 45], [33, 39], [33, 45]], '#5a6a88'); D.poly([[33, 45], [39, 39], [39, 45]], '#5a6a88');
     D.r(24, 50, 9, 9, '#6a7078'); D.r(24, 52, 9, 1, '#4a5060'); D.r(24, 55, 9, 1, '#4a5060'); D.el(36, 49, 1, 1, '#ffd23f'); },
   function (D) { D.el(52, 66, 11, 2, '#4cb050'); D.r(44, 59, 2, 6, '#8a5a2b'); D.el(45, 56, 4, 4, '#4cb050'); D.r(58, 60, 2, 6, '#8a5a2b'); D.el(59, 57, 3, 4, '#2f8a4a'); D.r(48, 63, 6, 1, '#c8873a'); D.p(48, 64, '#8a5a2b'); D.p(53, 64, '#8a5a2b'); D.p(51, 66, '#e85a9a'); D.p(55, 66, '#ffd23f'); },
   function (D) { D.r(3, 44, 17, 15, '#f1e7d0'); for (var i = 0; i < 6; i++) D.r(3 + i * 3, 44, 3, 3, i % 2 ? '#ffffff' : '#e85a9a'); D.r(5, 49, 13, 5, '#a8e0e8'); D.r(9, 54, 4, 5, '#4a5a78'); D.r(5, 40, 13, 3, '#ffd23f'); },
   function (D) { D.el(159, 59, 10, 2, '#8a8f9a'); D.p(151, 59, '#ffd23f'); D.p(167, 59, '#ffd23f'); D.cyl(156, 40, 6, 17, '#e8e0d0'); D.poly([[156, 40], [162, 40], [159, 33]], '#c42f4a'); D.r(156, 46, 6, 1, '#d9541e');
     D.poly([[155, 51], [155, 57], [152, 57]], '#c42f4a'); D.poly([[162, 51], [162, 57], [165, 57]], '#c42f4a'); },
   function (D) { [11, 42, 63, 90, 112, 147, 168, 197].forEach(function (x) { D.r(x, 52, 1, 8, '#3b3b46'); D.p(x, 51, '#ffe27a'); D.p(x - 1, 51, '#ffe27a'); });
     var cols = ['#ffe27a', '#e85a9a', '#9fe8ff', '#7ad85a']; for (var x = 6; x < 196; x += 4) { var y = Math.round(36 + 3 * Math.sin(x / 9)); D.p(x, y, cols[(x / 4 | 0) % 4]); } }
  ]},
 {w:120, h:70, z:[0,9,2,6,1,3,4,5,7,8],
  ground: function (D) { D.el(60, 64, 57, 5, '#6a4a90'); D.el(60, 63, 55, 3, '#9a7ac0'); D.el(14, 62, 2, 1, '#c8a8e0'); D.el(104, 63, 2, 1, '#c8a8e0'); D.r(9, 59, 1, 4, '#e8e0d0'); D.el(9, 58, 3, 1, '#e85a9a'); D.r(110, 60, 1, 3, '#e8e0d0'); D.el(110, 59, 2, 1, '#7ad85a'); },
  parts: [
   function (D) { D.el(60, 58, 27, 4, '#7a82c0'); D.el(60, 57, 25, 2, '#b0b8f0'); for (var i = -3; i <= 3; i++) D.p(60 + i * 7, 60, '#9fe8ff'); },
   function (D) { D.cyl(57, 50, 7, 6, '#6a7078'); D.el(60, 47, 4, 4, '#ff7a1a'); D.p(58, 45, '#ffe27a'); D.p(59, 45, '#ffe27a'); D.p(58, 46, '#ffe27a'); },
   function (D) { D.ring(60, 28, 20, 15, '#c8c8d8', '#9a9aaa'); D.r(41, 45, 5, 11, '#8a8f9a'); D.r(74, 45, 5, 11, '#8a8f9a'); D.p(60, 9, '#9fe8ff'); D.p(41, 28, '#9fe8ff'); D.p(79, 28, '#9fe8ff'); },
   function (D) { D.poly([[60, 1], [65, 6], [60, 11], [55, 6]], '#b07ae8'); D.p(58, 4, '#ffffff'); D.p(59, 3, '#e8d0ff'); },
   function (D) { D.cyl(90, 50, 12, 7, '#4a5a78'); D.poly([[88, 50], [104, 50], [102, 45], [90, 45]], '#5a6a88'); D.p(92, 47, '#ff5a4a'); D.p(95, 47, '#ffd23f'); D.p(98, 47, '#7ad85a'); D.r(93, 52, 6, 3, '#9fe8ff'); },
   function (D) { D.r(22, 13, 2, 43, '#7a8088'); D.r(19, 54, 8, 3, '#6a7078'); D.el(20, 12, 5, 2, '#b9c6cf'); D.r(22, 6, 1, 5, '#7a8088'); D.p(22, 5, '#ff5a4a'); D.r(20, 30, 6, 1, '#6a7078'); D.r(20, 42, 6, 1, '#6a7078'); },
   function (D) { [33, 81].forEach(function (x) { D.cyl(x, 30, 6, 18, '#d9a03a'); for (var i = 1; i < 6; i++) D.r(x, 30 + i * 3, 6, 1, '#8a5a2b'); D.r(x - 1, 29, 8, 2, '#6a7078'); D.r(x - 1, 47, 8, 2, '#6a7078'); D.r(x + 2, 49, 2, 7, '#6a7078'); }); },
   function (D) { [[86, 16], [91, 13], [97, 18], [103, 14], [108, 20], [94, 23], [100, 25], [88, 22]].forEach(function (s, i) { D.p(s[0], s[1], i % 3 ? '#9fe8ff' : '#ffffff'); }); D.p(96, 43, '#9fe8ff'); D.p(96, 42, '#9fe8ff'); },
   function (D) { D.r(13, 13, 1, 18, '#8a8f9a'); D.r(18, 15, 1, 16, '#8a8f9a'); D.el(12, 9, 3, 4, '#e85a9a'); D.el(18, 11, 3, 4, '#3a8fd8'); D.p(11, 7, '#ffffff'); D.p(17, 9, '#ffffff');
     D.r(106, 33, 1, 12, '#8a8f9a'); D.el(106, 29, 3, 4, '#ffd23f'); D.p(105, 27, '#ffffff'); D.r(8, 52, 9, 5, '#f1e7d0'); D.r(8, 52, 9, 2, '#e85a9a'); D.p(12, 50, '#ff7a1a'); D.r(12, 51, 1, 1, '#3a8fd8');
     D.r(108, 54, 7, 5, '#e85a9a'); D.r(111, 54, 1, 5, '#ffd23f'); D.r(108, 56, 7, 1, '#ffd23f'); },
   function (D) { D.el(60, 28, 15, 15, '#7ac8f0'); D.el(60, 28, 11, 11, '#bfe8f5'); D.el(60, 28, 6, 6, '#3a8fd8'); D.p(58, 26, '#5cc04a'); D.p(59, 26, '#5cc04a'); D.p(62, 29, '#5cc04a'); D.p(61, 30, '#5cc04a'); D.p(58, 30, '#7ad85a'); D.p(57, 24, '#ffffff'); D.r(56, 44, 9, 8, '#d8fbff'); }
  ]}
];
var SCN = [];
(function buildScenes() {
  var css = '.scn{position:absolute;left:50%;top:0;pointer-events:none}.scn i{position:absolute;inset:0;background-size:100% 100%;background-repeat:no-repeat;image-rendering:pixelated;image-rendering:crisp-edges}' +
    '.scn i.cur{animation:curglow 1.4s ease-in-out infinite}@keyframes curglow{50%{filter:drop-shadow(0 0 3px #ffd23f) drop-shadow(0 0 1px #fff)}}\n';
  try {
    SCN_DEF.forEach(function (sd, ci) {
      var g = layer(sd.w, sd.h, sd.ground); css += '.sc' + ci + '-g{background-image:url(' + g.full + ')}\n';
      sd.parts.forEach(function (fn, i) { var L2 = layer(sd.w, sd.h, fn); css += '.sc' + ci + '-' + i + '{background-image:url(' + L2.full + ')}.sc' + ci + '-' + i + 'h{background-image:url(' + L2.ghost + ')}\n'; });
      SCN[ci] = {w: sd.w, h: sd.h, z: sd.z};
    });
  } catch (e) { if (window.console) console.warn('scene build failed', e); }
  var s3 = document.createElement('style'); s3.setAttribute('data-art-scenes', ''); s3.textContent = css; document.head.appendChild(s3);
})();
function plot(ci, done, cur, frac, anim) {
  done = done || []; frac = frac || 0; if (cur == null) cur = -1;
  var sc = SCN[ci]; if (!sc) return '';
  var S = 3, h = '<div class="scn" style="width:' + sc.w * S + 'px;height:' + sc.h * S + 'px;margin-left:-' + (sc.w * S / 2) + 'px"><i class="sc' + ci + '-g"></i>';
  sc.z.forEach(function (i) {
    var c = 'sc' + ci + '-' + i;
    if (done[i] && i !== cur) h += '<i class="' + c + (i === anim ? ' clampin' : '') + '"></i>';
    else if (i === cur) h += '<i class="' + c + ' cur" style="clip-path:inset(' + Math.round((1 - Math.max(.15, frac)) * 100) + '% 0 0 0)"></i>';
  });
  return h + '</div>';
}
function partTile(ci, i, size) {
  size = size || 260; var sc = SCN[ci], P = CHAPTERS[ci];
  if (!sc) return '<div style="width:' + size + 'px;height:' + (size / 2) + 'px;border:4px solid #2b1d14;border-radius:8px;background:' + P.parts[i].c + '"></div>';
  var k = size / sc.w, hh = Math.round(sc.h * k), lay = '<i class="sc' + ci + '-g"></i>';
  sc.z.forEach(function (j) { if (j < i) lay += '<i class="sc' + ci + '-' + j + '"></i>'; else if (j === i) lay += '<i class="sc' + ci + '-' + j + ' cur"></i>'; });
  return '<div style="position:relative;width:' + (size + 8) + 'px;height:' + (hh + 8) + 'px;border:4px solid #2b1d14;border-radius:10px;overflow:hidden;background:' + P.levels[i].bg + '">' +
    '<div class="scn" style="left:0;top:0;width:' + size + 'px;height:' + hh + 'px">' + lay + '</div></div>';
}
function all10() { return [1,1,1,1,1,1,1,1,1,1].map(Boolean); }
/* chapter finale scenes; the game adds f1..f3 over time, the sprite lab shows each frame with .static */
/* ---------- finale art layers ---------- */
var FINL = {};
(function buildFinale() {
  var css = '';
  function add(name, w, h, fn, noOl) { try { var L = layer(w, h, fn, noOl); FINL[name] = L.full; css += '.fl-' + name + '{background-image:url(' + L.full + ')}\n'; } catch (e) {} }
  function rngs(seed) { return function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }; }
  add('stars', 334, 173, function (D) { var r = rngs(7); for (var i = 0; i < 170; i++) { var x = r() * 334 | 0, y = r() * 173 | 0, c = r() < .25 ? '#9fb0ff' : (r() < .2 ? '#ffe27a' : '#ffffff'); D.p(x, y, c); }
    for (i = 0; i < 9; i++) { var x2 = r() * 334 | 0, y2 = r() * 120 | 0; D.p(x2, y2, '#fff'); D.p(x2 - 1, y2, '#cfd6ff'); D.p(x2 + 1, y2, '#cfd6ff'); D.p(x2, y2 - 1, '#cfd6ff'); D.p(x2, y2 + 1, '#cfd6ff'); } }, true);
  add('yard', 334, 64, function (D) {
    D.r(0, 30, 334, 34, '#c98a50'); D.r(0, 30, 334, 3, '#e0a868'); for (var x = 3; x < 334; x += 9) D.p(x, 36 + (x * 7) % 24, '#a8703a');
    D.el(44, 32, 34, 12, '#7d8c99'); D.el(42, 29, 25, 8, '#a7b0ba'); D.ring(28, 22, 6, 3, '#3b3b46'); D.poly([[48, 22], [64, 18], [66, 22], [50, 26]], '#d97a3a'); D.r(56, 14, 3, 10, '#6a7078'); D.cyl(70, 18, 9, 12, '#4cb050'); D.r(70, 21, 9, 1, '#2f8a4a');
    D.el(290, 32, 36, 14, '#8a6a5a'); D.el(296, 28, 26, 9, '#a8806a'); D.cyl(272, 15, 9, 14, '#c42f4a'); D.r(272, 19, 9, 1, '#8a2030'); D.r(296, 16, 22, 3, '#9aa3ad'); D.ring(312, 22, 5, 2, '#3b3b46');
    D.r(238, 0, 4, 31, '#ffd23f'); for (var y = 2; y < 30; y += 5) { D.p(239, y, '#c99a1a'); D.p(240, y + 1, '#c99a1a'); } D.r(212, 1, 44, 3, '#ffd23f'); D.r(250, 4, 6, 4, '#3b3b46'); D.r(215, 4, 1, 12, '#3b3b46'); D.r(212, 16, 7, 3, '#6a7078');
    for (x = 104; x <= 206; x += 17) { D.r(x, 21, 2, 10, '#8a8f9a'); } D.r(104, 24, 104, 1, '#a7b0ba'); D.r(104, 28, 104, 1, '#a7b0ba'); });
  add('moon', 334, 90, function (D) {
    D.el(167, 150, 262, 110, '#c9c6bb'); D.el(167, 152, 258, 104, '#d8d4c8');
    [[60, 70, 15, 4], [118, 58, 9, 3], [250, 63, 17, 5], [300, 80, 10, 3], [196, 84, 8, 2], [30, 86, 9, 2], [150, 76, 6, 2]].forEach(function (c) { D.el(c[0], c[1], c[2], c[3], '#a9a69b'); D.el(c[0], c[1] - 1, c[2] - 2, c[3] - 1, '#bdb9ad'); D.r(c[0] - c[2] + 2, c[1] + c[3], c[2] * 2 - 4, 1, '#e8e4d8'); });
    D.el(90, 62, 3, 2, '#9a978c'); D.el(220, 72, 4, 2, '#9a978c'); D.el(270, 52, 2, 1, '#9a978c'); });
  add('earth', 28, 28, function (D) { D.el(14, 14, 13, 13, '#3a8fd8'); D.el(9, 10, 5, 4, '#5cc04a'); D.el(18, 17, 6, 4, '#5cc04a'); D.el(16, 5, 3, 2, '#7ad85a'); D.el(7, 19, 2, 2, '#5cc04a');
    D.r(4, 14, 7, 1, '#ffffff'); D.r(15, 9, 6, 1, '#ffffff'); D.r(11, 23, 5, 1, '#ffffff'); for (var y = 2; y < 27; y++) { var hw = Math.round(13 * Math.sqrt(Math.max(0, 1 - ((y - 14) * (y - 14)) / 169.25))); D.r(14 + hw - 3, y, 3, 1, 'rgba(10,20,60,.35)'); } });
  add('flag', 16, 26, function (D) { D.r(1, 0, 2, 26, '#b9c6cf'); D.r(3, 1, 12, 9, '#c42f4a'); D.r(3, 5, 12, 2, '#ffd23f'); D.el(8, 3, 1, 1, '#ffffff'); D.r(0, 24, 4, 2, '#8a8f9a'); });
  add('flame', 12, 20, function (D) { D.poly([[0, 0], [12, 0], [10, 9], [6, 20], [2, 9]], '#ff7a1a'); D.poly([[2.5, 0], [9.5, 0], [8, 7], [6, 14], [4, 7]], '#ffd23f'); D.r(5, 0, 2, 6, '#ffffff'); });
  add('cloud', 44, 14, function (D) { D.el(12, 9, 9, 5, '#ffffff'); D.el(24, 6, 11, 6, '#ffffff'); D.el(34, 9, 8, 4, '#ffffff'); D.r(4, 10, 38, 4, '#ffffff'); D.r(5, 12, 36, 2, '#dfe8f0'); });
  add('sun', 24, 24, function (D) { D.el(12, 12, 7, 7, '#ffd23f'); D.el(10, 10, 3, 3, '#fff3a0'); [[11, 0, 2, 3], [11, 21, 2, 3], [0, 11, 3, 2], [21, 11, 3, 2]].forEach(function (q) { D.r(q[0], q[1], q[2], q[3], '#ffb03a'); }); D.r(3, 3, 2, 2, '#ffb03a'); D.r(19, 3, 2, 2, '#ffb03a'); D.r(3, 19, 2, 2, '#ffb03a'); D.r(19, 19, 2, 2, '#ffb03a'); });
  add('bunting', 334, 16, function (D) { var cols = ['#e85a9a', '#ffd23f', '#3a8fd8', '#4cb050', '#ff7a1a'], x;
    for (x = 0; x < 334; x++) D.p(x, 2 + Math.round(5 * Math.sin(x / 334 * Math.PI)), '#3b3b46');
    for (x = 4, i = 0; x < 330; x += 14, i++) { var y = 3 + Math.round(5 * Math.sin((x + 5) / 334 * Math.PI)); D.poly([[x, y], [x + 10, y], [x + 5, y + 9]], cols[i % 5]); } var i; });
  add('table', 110, 26, function (D) { D.r(8, 6, 4, 20, '#8a5a2b'); D.r(98, 6, 4, 20, '#8a5a2b'); D.r(0, 0, 110, 7, '#e85a9a'); D.r(0, 2, 110, 1, '#ff9ac8'); for (var x = 0; x < 110; x += 10) D.el(x + 5, 7, 5, 3, '#e85a9a'); });
  add('cake', 44, 40, function (D) { D.el(22, 37, 21, 2, '#b9c6cf'); D.cyl(4, 22, 36, 14, '#f6e8d0'); D.r(4, 22, 36, 3, '#e85a9a'); [8, 15, 22, 29, 35].forEach(function (x, i) { D.r(x, 25, 2, 2 + i % 2, '#e85a9a'); });
    D.cyl(10, 11, 24, 11, '#f6d8a0'); D.r(10, 11, 24, 3, '#7ac8f0'); [13, 20, 27].forEach(function (x) { D.r(x, 14, 2, 2, '#7ac8f0'); });
    [[15, '#e85a9a'], [21, '#3a8fd8'], [27, '#ffd23f']].forEach(function (c) { D.r(c[0], 4, 2, 7, c[1]); D.r(c[0], 1, 2, 3, '#ff7a1a'); D.p(c[0], 1, '#ffd23f'); });
    [[8, 30, '#4cb050'], [14, 32, '#3a8fd8'], [24, 31, '#ffd23f'], [32, 30, '#e85a9a'], [18, 18, '#e85a9a'], [26, 17, '#4cb050']].forEach(function (s) { D.p(s[0], s[1], s[2]); }); });
  ['#e85a9a', '#3a8fd8', '#4cb050', '#ffd23f', '#8a4ac0', '#ff7a1a'].forEach(function (c, k) {
    add('gift' + k, 18, 18, function (D) { D.r(1, 5, 16, 12, c); D.r(8, 5, 2, 12, '#fff3a0'); D.r(0, 3, 18, 3, dk(c)); D.r(8, 3, 2, 3, '#fff3a0'); D.el(6, 1, 2, 1, '#ffd23f'); D.el(11, 1, 2, 1, '#ffd23f'); });
    add('bal' + k, 14, 22, function (D) { D.el(7, 8, 6, 8, c); D.r(4, 4, 1, 3, '#ffffff'); D.p(5, 3, '#ffffff'); D.r(6, 16, 3, 2, dk(c)); });
    add('note' + k, 8, 10, function (D) { D.r(5, 0, 2, 8, c); D.r(5, 0, 3, 2, c); D.el(4, 8, 2, 1, c); }); });
  add('spk', 24, 34, function (D) { D.r(0, 0, 24, 34, '#3b3b46'); D.r(1, 1, 22, 1, '#5a5a68'); D.el(12, 11, 7, 7, '#6a7078'); D.el(12, 11, 3, 3, '#22264a'); D.el(12, 26, 5, 5, '#6a7078'); D.el(12, 26, 2, 2, '#22264a'); D.p(3, 31, '#ff5a4a'); });
  var s4 = document.createElement('style'); s4.setAttribute('data-art-finale', ''); s4.textContent = css; document.head.appendChild(s4);
})();
function sceneLayers(ci, idx, sc, extra) {
  var d = SCN[ci]; if (!d) return '';
  var w = d.w * sc, hh = d.h * sc, h = '<div class="scn" style="position:absolute;left:50%;width:' + w + 'px;height:' + hh + 'px;margin-left:-' + (w / 2) + 'px;' + (extra || '') + '">';
  idx.forEach(function (i) { h += '<i class="sc' + ci + '-' + i + '"></i>'; });
  return h + '</div>';
}
function crowdM(list, extra) { return list.map(function (x, i) { return '<div class="m ' + (extra ? extra(i) : '') + '" style="' + (x.st || '') + '">' + x.h + '</div>'; }).join(''); }
/* chapter finale scenes; the game adds f1..f3 over time, the sprite lab shows each frame with .static */
function finale(ci, o) {
  o = o || {}; var nb = o.bots || 6, na = o.aliens || 0, i;
  var B = []; for (i = 0; i < nb; i++) B.push({h: botStatic({lv: i === 0 ? 3 : (i < 3 ? 2 : 1)})});
  var cols = ['pink', 'green', 'blue'], AL = []; for (i = 0; i < na; i++) AL.push({h: alienStatic({col: cols[i % 3]})});
  if (ci === 0) {
    var half = Math.ceil(nb / 2), L = B.slice(0, half), R = B.slice(half);
    var puffs = function (n, spread) { var s = ''; for (var k = 0; k < n; k++) { var dx = ((k / (n - 1)) * 2 - 1) * spread, dy = -20 - (k % 3) * 18; s += '<i style="--dx:' + dx.toFixed(0) + 'px;--dy:' + dy + 'px;animation-delay:' + (k * .08).toFixed(2) + 's"></i>'; } return s; };
    var mL = L.map(function (x, k) { return {h: x.h, st: '--fx:' + (60 + k * 50) + 'px;transition-delay:' + (k * .18) + 's'}; });
    var mR = R.map(function (x, k) { return {h: x.h, st: '--fx:-' + (60 + k * 50) + 'px;transition-delay:' + ((k + L.length) * .18) + 's'}; });
    return '<div class="fin fin0"><div class="sky space"></div><i class="lay stars2 fl-stars"></i><div class="sky dusk"></div><i class="lay earthsm fl-earth"></i>' +
      '<div class="moonw"><i class="lay mgl fl-moon"></i><div class="puffs land">' + puffs(8, 220) + '</div></div>' +
      '<div class="yardw"><i class="lay yl fl-yard"></i>' + sceneLayers(0, [0], 5, 'bottom:60px') +
        '<div class="ycrowd l">' + crowdM(L) + '</div><div class="ycrowd r">' + crowdM(R) + '</div><div class="puffs lift">' + puffs(10, 300) + '</div></div>' +
      '<div class="rocketw">' + sceneLayers(0, [4, 1, 3, 2, 6, 8, 5, 7, 9], 5, 'bottom:0') + '<i class="lay flame fl-flame"></i></div>' +
      '<div class="mcrowd l">' + crowdM(mL) + '</div><div class="mcrowd r">' + crowdM(mR) + '</div><i class="lay flagl fl-flag"></i>' +
      '<div class="ftxt">WE MADE IT<br>TO THE MOON!</div></div>';
  }
  if (ci === 1) {
    var h1 = '<div class="fin fin1"><div class="sky"></div><i class="lay stars2 fl-stars"></i><div class="earth"></div><div class="msurf"></div>' +
      '<div class="city"><div class="plotbig">' + plot(1, all10(), -1, 1) + '</div></div>' +
      '<div class="beam"></div><div class="saucer"><div class="cup"></div><div class="disc"></div></div>' +
      '<div class="fbots">' + B.map(function (x) { return x.h; }).join('') + '</div>' +
      '<div class="ftxt">OFF TO PLANET ZIB!<small>The aliens want to meet you!</small></div></div>';
    var k2 = 0; return h1.replace(/<div class="bot([^"]*)"/g, function (m) { return m + ' style="transition-delay:' + (k2++ * 0.25) + 's"'; });
  }
  var cc = ['#e85a9a', '#3a8fd8', '#ffd23f', '#5cc04a', '#ff7a1a', '#8a4ac0'];
  var conf = ''; for (i = 0; i < 56; i++) conf += '<i style="left:' + ((i * 97) % 1333) + 'px;background:' + cc[i % 6] + ';animation-delay:' + ((i * 0.37) % 2.6).toFixed(2) + 's;--y:' + ((i * 53) % 520 + 40) + 'px"></i>';
  var fw = ''; [[220, 120, 0], [1100, 100, .6], [640, 70, 1.1], [420, 170, 1.5], [880, 180, .3]].forEach(function (p, k) { var sh = []; for (var j = 0; j < 14; j++) { var an = j / 14 * Math.PI * 2; sh.push((Math.cos(an) * 80).toFixed(0) + 'px ' + (Math.sin(an) * 80).toFixed(0) + 'px 0 3px ' + cc[(j + k) % 6]); }
    fw += '<i style="left:' + p[0] + 'px;top:' + p[1] + 'px;box-shadow:' + sh.join(',') + ';animation-delay:' + p[2] + 's"></i>'; });
  var bals = ''; [[318, 268, 0, 150], [350, 300, 1, 120], [380, 262, 2, 160], [905, 280, 3, 140], [940, 252, 4, 170], [972, 296, 5, 120]].forEach(function (p, k) { bals += '<i class="lay bal fl-bal' + p[2] + '" style="left:' + p[0] + 'px;bottom:' + p[1] + 'px;--len:' + p[3] + 'px;animation-delay:' + (k * .2) + 's"></i>'; });
  var notes = ''; for (i = 0; i < 6; i++) notes += '<i class="lay notel fl-note' + i + '" style="' + (i % 2 ? 'right:' + (190 + (i % 3) * 14) : 'right:' + (300 - (i % 3) * 10)) + 'px;bottom:230px;--dx:' + (i % 2 ? 30 : -30) + 'px;animation-delay:' + (i * .4) + 's"></i>';
  var dancers = []; for (i = 0; i < Math.max(B.length, AL.length); i++) { if (B[i]) dancers.push(B[i]); if (AL[i]) dancers.push(AL[i]); }
  var zB = B.slice(0, 3), zA = AL.slice(0, 3);
  return '<div class="fin fin2"><div class="zib"><div class="sky"></div><i class="lay stars2 fl-stars" style="opacity:.6"></i><div class="zground"></div><div class="plotbig">' + plot(2, all10(), -1, 1) + '</div>' +
      '<div class="zcrowd"><div>' + crowdM(zB) + '</div><div>' + crowdM(zA) + '</div></div></div>' +
    '<div class="home"><div class="hsky"></div><i class="lay sunl fl-sun"></i><i class="lay cloud fl-cloud" style="top:120px;left:0"></i><i class="lay cloud fl-cloud" style="top:60px;left:0;animation-delay:-18s"></i><i class="lay cloud fl-cloud" style="top:170px;left:0;animation-delay:-31s;opacity:.85"></i>' +
      '<div class="fireworks">' + fw + '</div>' +
      '<i class="lay bunt fl-bunting" style="top:130px"></i><i class="lay bunt fl-bunting" style="top:178px;transform:scaleX(-1)"></i>' +
      '<i class="lay yl fl-yard"></i>' + sceneLayers(0, [0, 4, 1, 3, 2, 6, 8, 5, 7, 9], 2.2, 'left:150px;bottom:72px') + sceneLayers(2, [0, 9, 2, 6, 1, 3, 4, 5, 7], 2.2, 'left:calc(100% - 150px);bottom:72px') +
      bals + '<i class="lay tablel fl-table"></i><i class="lay cakel fl-cake"></i><i class="lay giftl fl-gift4" style="left:calc(50% - 196px)"></i><i class="lay giftl fl-gift1" style="left:calc(50% - 138px);width:40px;height:40px"></i><i class="lay giftl fl-gift2" style="left:calc(50% + 96px)"></i><i class="lay giftl fl-gift3" style="left:calc(50% + 154px);width:40px;height:40px"></i>' +
      '<i class="lay spk fl-spk" style="right:300px"></i><i class="lay spk fl-spk" style="right:206px;animation-delay:.22s"></i>' + notes +
      '<div class="dance">' + crowdM(dancers, function (k) { return ['', 's', 'j'][k % 3]; }) + '</div></div>' +
    '<div class="confetti">' + conf + '</div><div class="flash"></div>' +
    '<div class="ftxt">WELCOME HOME!<small>Party time with all your friends!</small></div></div>';
}
window.ART = {sceneLayers:sceneLayers, SCN:SCN, SPRITE_URL:SPRITE_URL, TPL:TPL, SPRMAP:SPRMAP, RES:RES, NM:NM, nm:nm, UP:UP, ACOL:ACOL, CHAPTERS:CHAPTERS, ic:ic, worker:worker, botStatic:botStatic, alienStatic:alienStatic,
  plot:plot, partTile:partTile, finale:finale, CITY:CITY, TELE:TELE};
})();
