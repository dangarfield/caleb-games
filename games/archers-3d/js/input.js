import { game } from './state.js';

const keys = {};
const joystick = { active: false, sx: 0, sy: 0, cx: 0, cy: 0, dx: 0, dy: 0, id: null };
const _gw = document.getElementById('game-wrapper');
function _lx(cx) { return _gw ? cx - _gw.getBoundingClientRect().left : cx; }
function _ly(cy) { return _gw ? cy - _gw.getBoundingClientRect().top : cy; }

export function setupInput(canvas) {
  document.addEventListener('keydown', e => { keys[e.code] = true; });
  document.addEventListener('keyup', e => { keys[e.code] = false; });

  canvas.addEventListener('pointerdown', e => {
    if (game.state !== 'playing' && game.state !== 'exiting') {
      // Release joystick if dying/dead
      if (joystick.active) { joystick.active = false; joystick.dx = 0; joystick.dy = 0; }
      return;
    }
    if (!joystick.active) {
      joystick.active = true;
      joystick.id = e.pointerId;
      joystick.sx = _lx(e.clientX);
      joystick.sy = _ly(e.clientY);
      joystick.cx = _lx(e.clientX);
      joystick.cy = _ly(e.clientY);
      joystick.dx = 0;
      joystick.dy = 0;
      canvas.setPointerCapture(e.pointerId);
    }
  });

  canvas.addEventListener('pointermove', e => {
    if (joystick.active && e.pointerId === joystick.id) {
      joystick.cx = _lx(e.clientX);
      joystick.cy = _ly(e.clientY);
      const dx = joystick.cx - joystick.sx;
      const dy = joystick.cy - joystick.sy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const maxR = 50;
      if (d > maxR) {
        joystick.dx = dx / d;
        joystick.dy = dy / d;
      } else if (d > 8) {
        joystick.dx = dx / maxR;
        joystick.dy = dy / maxR;
      } else {
        joystick.dx = 0;
        joystick.dy = 0;
      }
    }
  });

  canvas.addEventListener('pointerup', e => {
    if (joystick.active && e.pointerId === joystick.id) {
      joystick.active = false;
      joystick.dx = 0;
      joystick.dy = 0;
    }
  });

  canvas.addEventListener('pointercancel', e => {
    if (joystick.active && e.pointerId === joystick.id) {
      joystick.active = false;
      joystick.dx = 0;
      joystick.dy = 0;
    }
  });
}

export function getInput() {
  let dx = 0, dy = 0;
  if (keys['ArrowLeft'] || keys['KeyA']) dx -= 1;
  if (keys['ArrowRight'] || keys['KeyD']) dx += 1;
  if (keys['ArrowUp'] || keys['KeyW']) dy -= 1;
  if (keys['ArrowDown'] || keys['KeyS']) dy += 1;
  if (joystick.active) { dx += joystick.dx; dy += joystick.dy; }
  const m = Math.sqrt(dx * dx + dy * dy);
  if (m > 1) { dx /= m; dy /= m; }
  return { dx, dy, moving: m > 0.1 };
}

export function getJoystick() {
  return joystick;
}

export function getKeys() {
  return keys;
}

export function setupLevelUpKeys(pickSkillFn) {
  document.addEventListener('keydown', e => {
    if (game.state === 'levelUp') {
      for (let i = 1; i <= 5; i++) {
        if (e.code === 'Digit' + i || e.code === 'Numpad' + i) { pickSkillFn(i - 1); break; }
      }
    }
  });
}
