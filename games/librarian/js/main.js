import * as THREE from 'three';
import { Player } from './player.js';
import { createLibrary, buildSlotMarkers } from './library.js';
import { GameState, saveHighScore } from './game-state.js';
import { scatterBooks } from './book-objects.js';
import { InteractionManager } from './interaction.js';
import { UI } from './ui.js';
import { GuideArrow } from './guide-arrow.js';
import { createPhysicsWorld, stepPhysics } from './physics.js';

let renderer, scene, camera;
let player, gameState, interaction, ui, guideArrow;
let shelfData = [];
let bookObjects = [];
let clock;
let gameActive = false;
let particleSystem = null;

function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  document.body.prepend(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0520);
  scene.fog = new THREE.Fog(0x0a0520, 8, 18);

  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);

  createPhysicsWorld();

  player = new Player(camera);
  gameState = new GameState();
  ui = new UI(player, gameState);
  interaction = new InteractionManager(player, gameState, scene, camera);
  guideArrow = new GuideArrow(scene);

  clock = new THREE.Clock();

  shelfData = createLibrary(scene);
  interaction.setShelfData(shelfData);

  createParticles();

  window.addEventListener('resize', onResize);
  setupInput();

  gameState.onVictory = () => {
    gameActive = false;
    player.unlock();
    document.exitPointerLock();
    ui.hide();
    guideArrow.hide();
    saveHighScore('standard', gameState.getElapsed());
    setTimeout(() => ui.showVictory(), 500);
  };

  animate();
}

let particleBasePositions = null;

function createParticles() {
  const count = 150;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  particleBasePositions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * 10;
    const y = Math.random() * 7;
    const z = (Math.random() - 0.5) * 14;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    particleBasePositions[i * 3] = x;
    particleBasePositions[i * 3 + 1] = y;
    particleBasePositions[i * 3 + 2] = z;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xaa88ff,
    size: 0.04,
    transparent: true,
    opacity: 0.5,
  });
  particleSystem = new THREE.Points(geo, mat);
  scene.add(particleSystem);
}

function setupInput() {
  renderer.domElement.addEventListener('click', () => {
    if (gameActive && !document.pointerLockElement) {
      renderer.domElement.requestPointerLock();
    }
  });

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === renderer.domElement) {
      player.lock();
    } else {
      player.unlock();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (!gameActive) return;

    switch (e.code) {
      case 'KeyE':
        interaction.interact();
        ui.update();
        break;
      case 'KeyQ':
        interaction.dropBook();
        ui.update();
        break;
      case 'KeyR':
        player.cycleBooks();
        ui.update();
        break;
      case 'KeyM':
        e.preventDefault();
        ui.toggleMap();
        break;
      case 'KeyI':
        e.preventDefault();
        ui.toggleInfo();
        break;
      case 'Digit1':
        window.useAbility('insight');
        break;
      case 'Digit2':
        window.useAbility('sort');
        break;
      case 'Digit3':
        window.useAbility('guide');
        break;
    }
  });
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.getElapsedTime();

  if (gameActive) {
    stepPhysics(dt);

    player.update(dt);
    interaction.update(dt);
    ui.update();

    bookObjects.forEach(bo => {
      if (!bo.data.shelved) bo.syncMeshToBody();
    });

    const guide = interaction.getGuideTarget();
    if (guide) {
      guideArrow.update(time, player.getPosition(), guide.position);
    } else {
      guideArrow.hide();
    }

    if (particleSystem && particleBasePositions) {
      particleSystem.rotation.y = time * 0.02;
      const positions = particleSystem.geometry.attributes.position.array;
      for (let i = 0; i < positions.length; i += 3) {
        positions[i + 1] = particleBasePositions[i + 1] + Math.sin(time * 0.5 + i) * 0.3;
      }
      particleSystem.geometry.attributes.position.needsUpdate = true;
    }
  }

  renderer.render(scene, camera);
}

window.startGame = function () {
  document.getElementById('overlay').style.display = 'none';
  ui.hideVictory();

  bookObjects.forEach(bo => {
    scene.remove(bo.mesh);
    bo.dispose();
  });
  bookObjects = [];

  interaction.clearPlacedBooks();
  player.carrying = [];

  const books = gameState.start();
  buildSlotMarkers(shelfData, books);
  bookObjects = scatterBooks(books, scene);
  interaction.setBookObjects(bookObjects);

  camera.position.set(0, 1.6, 4);
  camera.rotation.set(0, 0, 0);

  gameActive = true;
  ui.show();
  ui.update();

  renderer.domElement.requestPointerLock();
};

window.restartGame = function () {
  ui.hideVictory();
  document.getElementById('overlay').style.display = 'flex';
  gameActive = false;
};

window.toggleMap = function () {
  if (!gameActive) return;
  ui.toggleMap();
};

window.toggleInfo = function () {
  if (!gameActive) return;
  ui.toggleInfo();
};

window.useAbility = function (name) {
  if (!gameActive) return;
  if (name === 'insight') {
    interaction.useInsight();
  } else if (name === 'sort') {
    interaction.useSort();
  } else if (name === 'guide') {
    interaction.useGuide();
    const target = interaction.getGuideTarget();
    if (target) guideArrow.show(player.getPosition(), target.position);
  }
};

init();
