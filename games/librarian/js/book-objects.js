import * as THREE from 'three';
import { createBookBody, removeBody, tossBody } from './physics.js';

const BOOK_WIDTH = 0.3;
const BOOK_HEIGHT = 0.4;
const BOOK_DEPTH = 0.15;

export class BookObject {
  constructor(bookData, position, addToWorld = true) {
    this.data = bookData;
    this.mesh = createBookMesh(bookData);
    this.mesh.position.copy(position);
    this.mesh.userData = { type: 'book', bookData: bookData, bookObject: this };
    this.highlighted = false;
    this.onShelf = false;
    this.body = addToWorld ? createBookBody(position) : null;
  }

  setHighlight(on) {
    const body = this.mesh.children[0];
    if (on && !this.highlighted) {
      body.material.forEach(m => { m.emissive.setHex(0xffffff); m.emissiveIntensity = 0.25; });
      this.highlighted = true;
    } else if (!on && this.highlighted) {
      body.material.forEach(m => { m.emissive.setHex(0x000000); m.emissiveIntensity = 0; });
      this.highlighted = false;
    }
  }

  toss(direction, speed) {
    if (this.body) {
      tossBody(this.body, direction, speed);
    }
  }

  syncMeshToBody() {
    if (!this.body || this.onShelf) return;
    this.mesh.position.copy(this.body.position);
    this.mesh.quaternion.copy(this.body.quaternion);
  }

  dispose() {
    if (this.body) {
      removeBody(this.body);
      this.body = null;
    }
    this.mesh.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (child.material.map) child.material.map.dispose();
        child.material.dispose();
      }
    });
  }
}

function createBookMesh(bookData) {
  const group = new THREE.Group();

  const spineTex = new THREE.CanvasTexture(createSpineTexture(bookData));
  const pageEdgeColor = 0xfff8e7;

  const mats = [
    new THREE.MeshStandardMaterial({ color: bookData.color, roughness: 0.5 }), // +x (page edge — colored to match covers)
    new THREE.MeshStandardMaterial({ map: spineTex, roughness: 0.4 }),          // -x (spine)
    new THREE.MeshStandardMaterial({ color: pageEdgeColor, roughness: 0.8 }),   // +y top (pages)
    new THREE.MeshStandardMaterial({ color: pageEdgeColor, roughness: 0.8 }),   // -y bottom (pages)
    new THREE.MeshStandardMaterial({ color: bookData.color, roughness: 0.5 }),  // +z front cover
    new THREE.MeshStandardMaterial({ color: bookData.color, roughness: 0.5 }),  // -z back cover
  ];

  const bodyGeo = new THREE.BoxGeometry(BOOK_DEPTH, BOOK_HEIGHT, BOOK_WIDTH);
  const body = new THREE.Mesh(bodyGeo, mats);
  body.castShadow = true;
  group.add(body);

  return group;
}

function createSpineTexture(bookData) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Use same color as the covers
  const c = bookData.color;
  const r = (c >> 16) & 0xff, g = (c >> 8) & 0xff, b = c & 0xff;
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, 128, 256);

  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(0, 0, 128, 4);
  ctx.fillRect(0, 252, 128, 4);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(bookData.seriesLabel, 64, 80);

  ctx.font = 'bold 36px Segoe UI, sans-serif';
  ctx.fillText(`#${bookData.volume}`, 64, 140);

  ctx.font = '14px Segoe UI, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  const words = bookData.series.split(' ');
  let y = 190;
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > 110) {
      ctx.fillText(line, 64, y);
      line = word;
      y += 16;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, 64, y);

  return canvas;
}

export function createShelvedBookMesh(bookData) {
  const group = new THREE.Group();
  const bodyGeo = new THREE.BoxGeometry(BOOK_DEPTH, BOOK_HEIGHT * 0.9, BOOK_WIDTH * 0.9);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: bookData.color,
    roughness: 0.5,
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  group.add(body);
  return group;
}

export function scatterBooks(books, scene) {
  const bookObjects = [];
  const floorArea = { minX: -2.0, maxX: 2.0, minZ: -1.5, maxZ: 5 };

  books.forEach((bookData, i) => {
    const x = floorArea.minX + Math.random() * (floorArea.maxX - floorArea.minX);
    const z = floorArea.minZ + Math.random() * (floorArea.maxZ - floorArea.minZ);
    // Spread books over height so they rain down and pile up via collisions
    const y = 0.5 + Math.random() * 4;

    const pos = new THREE.Vector3(x, y, z);
    const bookObj = new BookObject(bookData, pos);
    bookObj.syncMeshToBody();
    scene.add(bookObj.mesh);
    bookObjects.push(bookObj);
  });

  return bookObjects;
}

export { BOOK_WIDTH, BOOK_HEIGHT, BOOK_DEPTH };
