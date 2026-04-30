import { game } from './state.js';

const _gw = document.getElementById('game-wrapper');
function _w() { return _gw ? _gw.clientWidth : innerWidth; }
function _h() { return _gw ? _gw.clientHeight : innerHeight; }

// Arena dimensions based on grid size with square cells.
// Width is determined by screen width (with padding), height = gridH * cellSize.
// The arena can be taller than the screen — the camera handles scrolling.
export function arena() {
  const grid = game.mapGrid || { w: 11, h: 15 };
  const pad = 30;
  const maxW = 500;
  const aw = Math.min(_w() - pad * 2, maxW);
  const cellSize = aw / grid.w;
  const ah = cellSize * grid.h;
  const ax = (_w() - aw) / 2;
  // Center vertically based on screen, but the arena may extend beyond
  const ay = (_h() - ah) / 2;
  return { x: ax, y: ay, w: aw, h: ah, cellSize };
}

// Tile size in pixels. All game distances are expressed in tiles and
// multiplied by T() at runtime so they scale with screen size.
// Reference: at 500px arena width with 11-col grid, T() ≈ 45.45px.
export function T() {
  const grid = game.mapGrid || { w: 11 };
  const aw = Math.min(_w() - 60, 500);
  return aw / grid.w;
}
