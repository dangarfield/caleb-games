// duel-scene.js — 3D stage for the sword duel: a ship deck (boarding) or a town square (sneak).
// Two duellists side-on (player left, enemy right), brawlers behind, a camera that follows the fight.
import * as THREE from 'three';

const STRIKE = { high: 'strikeHigh', mid: 'strikeMid', low: 'strikeLow' };
const PARRY = { high: 'parryHigh', mid: 'parryMid', low: 'parryLow' };
const HOLD_P = { strike: 0.3, parry: 0.5 };
const H_Y = { high: 1.95, mid: 1.35, low: 0.62 };

/** Town: hide houses/palms/clutter between the fight line (z = tz) and the camera so nothing blocks the view. */
function clearSightline(town, tz) {
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), zero = new THREE.Matrix4().makeScale(0, 0, 0), box = new THREE.Box3();
  town.updateMatrixWorld(true);
  town.traverse(o => {
    if (o.isInstancedMesh) {
      let hit = false;
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m); p.setFromMatrixPosition(m).applyMatrix4(o.matrixWorld);
        if (p.z > tz - 1.6 && p.z < tz + 12 && Math.abs(p.x) < 11) { o.setMatrixAt(i, zero); hit = true; }
      }
      if (hit) { o.instanceMatrix.needsUpdate = true; o.computeBoundingSphere && o.computeBoundingSphere(); }
    } else if (o.isMesh && o.name === 'clutter') {
      box.setFromObject(o); if (box.max.z > tz && box.min.z < tz + 12) o.visible = false;
    }
  });
}

/**
 * buildStage(PLT, opts) → stage
 * opts: { kind:'deck'|'town', who, age, pWeapon, eWeapon, enemyKind:'captain'|'soldier', nation, brawl:bool }
 */
export function buildStage(PLT, o) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.3, 2000);
  const deck = o.kind !== 'town';
  const base = deck ? PLT.scenes.duelDeck() : PLT.scenes.townSquare({ nation: o.nation === 'pirate' ? 'spain' : (o.nation || 'spain') });
  scene.add(base.root);
  const extras = []; // characters we own and animate
  let parent, ship = null, dy;
  const CELL = deck ? 0.36 : 0.55, GAP = 1.1;
  const C0 = deck ? 0.2 : 0;
  const TZ = 5.5; // town: fight line z
  const LX = -1.25; // deck: fight line sits on the near side of the deck, masts behind

  // --- the duellists
  const player = PLT.characters.captain({ who: o.who === 'ezra' ? 'ezra' : 'caleb', age: o.age || 20 });
  player.setWeapon(o.pWeapon || 'cutlass');
  let enemy;
  if (o.enemyKind === 'soldier') enemy = PLT.characters.soldier({ nation: o.nation === 'pirate' ? 'spain' : (o.nation || 'spain'), musket: false });
  else {
    const coat = o.nation && o.nation !== 'pirate' ? PLT.palette['nation_' + o.nation] : null;
    enemy = PLT.characters.captain({ who: 'enemy', age: 44, outfit: coat ? { coat } : undefined });
  }
  enemy.setWeapon(o.eWeapon || 'cutlass');

  if (deck) {
    ship = base.ship; parent = ship;
    if (o.nation && ship.setNation) { try { ship.setNation(o.nation); } catch (e) { /* keep default */ } }
    if (ship.setSailState) ship.setSailState('furl'); // furled sails keep the view of the fight clear
    const hl = ship.userData.halfLength || 9;
    dy = z => ship.userData.deckY(z / hl);
    // swap the scene's own duellists for ours
    for (const a of [base.actors.player, base.actors.enemy]) { ship.remove(a); a.dispose && a.dispose(); }
    // move its brawlers behind the fight (far side from the camera, +x)
    const [a1, a2, a3] = base.actors.crew, bx = (ship.userData.stats && ship.userData.stats.beam || 5) * 0.3;
    a1.position.set(bx, dy(-2.6), -2.6); a1.rotation.y = 0.3;
    a2.position.set(bx + 0.2, dy(-1.0), -1.0); a2.rotation.y = Math.PI + 0.3;
    a3.position.set(bx + 0.4, dy(4.6), 4.6); a3.rotation.y = -2.0;
    const b1 = PLT.characters.sailor(21), b2 = PLT.characters.sailor(33);
    b1.position.set(bx - 0.1, dy(2.3), 2.3); b1.rotation.y = 0.2; b2.position.set(bx + 0.1, dy(3.9), 3.9); b2.rotation.y = Math.PI + 0.2;
    ship.add(b1, b2); extras.push(b1, b2);
    for (const a of [a1, a2, a3, b1, b2]) a.visible = o.brawl !== false;
  } else {
    parent = base.root; dy = () => 1.0;
    for (const a of base.actors) { if (a.userData.orbit) { a.userData.orbit = null; a.visible = false; } }
    clearSightline(base.town || base.root, TZ);
    if (o.brawl !== false) {
      const nat = o.nation === 'pirate' ? 'spain' : (o.nation || 'spain');
      const pairs = [[-4.2, TZ - 3.2], [3.6, TZ - 3.6], [0.2, TZ - 5.0]];
      pairs.forEach(([x, z], i) => {
        const s = PLT.characters.sailor(40 + i * 7), g = PLT.characters.soldier({ nation: nat, musket: false });
        s.position.set(x - 0.55, 1.0, z); s.rotation.y = Math.PI / 2; g.position.set(x + 0.55, 1.0, z); g.rotation.y = -Math.PI / 2;
        base.root.add(s, g); extras.push(s, g);
      });
    }
  }
  parent.add(player, enemy);

  // brawl animation for our extra characters (pairs trade blows)
  const strikes = ['strikeHigh', 'strikeMid', 'strikeLow'], parries = ['parryHigh', 'parryMid', 'parryLow'];
  const brawlT = extras.map((_, i) => 0.3 + i * 0.37);

  // --- track placement
  const st = { center: 0, target: 0, pOff: 0, eOff: 0, shake: 0, t: 0, over: null };
  const along = (u, lateral, out) => {
    if (deck) out.set(LX, 0, u); else out.set(u, 1.0, TZ);
    if (deck) out.y = dy(u);
    return out;
  };
  const cellU = pos => C0 + (Math.max(-1, Math.min(9, pos)) - 4) * CELL;
  st.center = st.target = cellU(4);
  if (deck) { player.rotation.y = 0; enemy.rotation.y = Math.PI; } else { player.rotation.y = Math.PI / 2; enemy.rotation.y = -Math.PI / 2; }

  // --- hold poses (wind-up / raised guard) via the character's onUpdate hook
  const hold = { p: null, e: null };
  player.onUpdate = (dt, s) => { if (hold.p != null && s.p > hold.p) s.p = hold.p; };
  enemy.onUpdate = (dt, s) => { if (hold.e != null && s.p > hold.e) s.p = hold.e; };

  const act = {
    enemyWindup(h) { enemy.setAction(STRIKE[h], { restart: true }); hold.e = HOLD_P.strike; },
    enemyRelease() { hold.e = null; },
    enemyParry(h) { hold.e = null; enemy.setAction(PARRY[h], { restart: true }); },
    enemyHit() { hold.e = null; enemy.setAction('hit', { restart: true }); st.eOff = 0.45; st.shake = 0.18; },
    enemyStagger() { hold.e = null; enemy.setAction('stagger', { restart: true }); st.eOff = 0.3; },
    playerStrike(h) { hold.p = null; player.setAction(STRIKE[h], { restart: true }); },
    playerParry(h, holdIt) { player.setAction(PARRY[h], { restart: true }); hold.p = holdIt ? HOLD_P.parry : null; },
    playerRelease() { hold.p = null; },
    playerHit() { hold.p = null; player.setAction('hit', { restart: true }); st.pOff = 0.45; st.shake = 0.3; },
    end(won) {
      hold.p = hold.e = null; st.over = won ? 'won' : 'lost';
      player.setAction(won ? 'cheer' : 'surrender'); enemy.setAction(won ? 'surrender' : 'cheer');
    },
  };

  const v = new THREE.Vector3(), w = new THREE.Vector3(), look = new THREE.Vector3(), tmp = new THREE.Vector3();
  function setTrack(pos) { st.target = cellU(pos); }
  function update(dt, t) {
    st.t += dt;
    base.update(dt, t, null);
    const k = 1 - Math.exp(-dt * 6);
    st.center += (st.target - st.center) * k;
    st.pOff *= Math.exp(-dt * 5); st.eOff *= Math.exp(-dt * 5); st.shake *= Math.exp(-dt * 7);
    const pu = st.center - GAP - st.pOff, eu = st.center + GAP + st.eOff + (st.over === 'won' ? 0.5 : 0);
    along(pu, 0, v); player.position.copy(v);
    along(eu, 0, v); enemy.position.copy(v);
    player.update(dt); enemy.update(dt);
    for (let i = 0; i < extras.length; i++) {
      const a = extras[i]; a.update(dt);
      if (!a.visible) continue;
      brawlT[i] -= dt;
      if (brawlT[i] <= 0) {
        brawlT[i] = 0.8 + Math.random() * 0.9;
        const kk = Math.floor(Math.random() * 3), mate = extras[i ^ 1];
        a.setAction(strikes[kk]); if (mate && Math.random() < 0.8) mate.setAction(Math.random() < 0.75 ? parries[kk] : 'hit');
      }
    }
    // camera: side-on, follows the fight
    const sh = st.shake, jx = (Math.sin(st.t * 61) * sh) * 0.25, jy = (Math.cos(st.t * 47) * sh) * 0.2;
    if (deck) {
      const y0 = dy(st.center);
      ship.localToWorld(w.set(-7.7, y0 + 3.1 + Math.sin(t * 0.3) * 0.15 + jy, st.center + 0.2 + jx));
      ship.localToWorld(look.set(LX, y0 + 1.15, st.center + 0.2));
    } else {
      w.set(st.center + 0.2 + jx, 1.0 + 2.8 + jy, TZ + 8.6); look.set(st.center + 0.2, 2.25, TZ);
    }
    camera.position.copy(w); camera.lookAt(look);
    if (base.sky && base.sky.update) base.sky.update(camera);
  }
  /** Screen point (canvas NDC → out {x,y} in 0..1 of the canvas) for a height on the enemy. */
  function enemyPoint(h, out) {
    tmp.set(0, H_Y[h] || 1.3, 0.45); enemy.localToWorld(tmp); tmp.project(camera);
    out.x = (tmp.x + 1) / 2; out.y = (1 - tmp.y) / 2; return out;
  }
  function actorPoint(which, y, out) {
    tmp.set(0, y, 0); (which === 'p' ? player : enemy).localToWorld(tmp); tmp.project(camera);
    out.x = (tmp.x + 1) / 2; out.y = (1 - tmp.y) / 2; return out;
  }
  function setWeapons(pw, ew) { player.setWeapon(pw); enemy.setWeapon(ew); }
  function dispose() {
    player.onUpdate = enemy.onUpdate = null;
    try { base.dispose(); } catch (e) { console.error(e); }
    scene.remove(base.root);
  }
  return { scene, camera, player, enemy, act, setTrack, update, enemyPoint, actorPoint, setWeapons, dispose, base };
}
