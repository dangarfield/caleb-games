// Main - game loop, state machine, initialization
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { generateBomb, buildBombScene } from './bomb-generator.js';
import { getComponentInstance, getVariantsForType } from './components/index.js';
import { HUD } from './hud.js';
import { ParticleSystem } from './particles.js';
import { ensureAudio, playExplosion, playSuccess, playLevelComplete, playCountdownTick } from './audio.js';
import { loadPlayerData, savePlayerData, getPlayers, getJobTitle, getRank } from './progression.js';

// State machine
const STATE = {
  MENU: 'menu',
  PLAYING: 'playing',
  EXPLODING: 'exploding',
  SUCCESS: 'success',
  LEVEL_COMPLETE: 'levelComplete',
  GAME_OVER: 'gameOver',
};

let state = STATE.MENU;
let scene, camera, renderer, controls;
let keyLight, fillLight;
let particleSystem;
let hud;
let gameData;

// Current game state
let currentPlayer = null;
let currentLevel = 1;
let currentRound = 1;
let bombData = null;
let bombGroup = null;
let interactables = [];
let timer = 50;
let timerRunning = false;
let currentSolutionStep = 0;
let lastTickSecond = -1;
let graceTimer = 1.0; // 1 second inspect grace
let graceActive = false;

// Clock for delta time
const clock = new THREE.Clock();

// Raycaster for interaction
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerDownPos = { x: 0, y: 0 };
let pointerDownTime = 0;
const TAP_THRESHOLD = 8; // pixels - less than this = tap, more = drag/rotate

function createBackground() {
  // Dark sky sphere with grid pattern (black/yellow theme)
  const skyGeo = new THREE.SphereGeometry(30, 32, 16);
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 512;
  skyCanvas.height = 512;
  const ctx = skyCanvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#050505');
  grad.addColorStop(0.3, '#0a0a08');
  grad.addColorStop(0.6, '#0f0f0a');
  grad.addColorStop(1, '#050505');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Subtle grid lines (yellow-tinted)
  ctx.strokeStyle = 'rgba(200, 180, 50, 0.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 512; i += 32) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke();
  }

  const skyTexture = new THREE.CanvasTexture(skyCanvas);
  const skyMat = new THREE.MeshBasicMaterial({
    map: skyTexture,
    side: THREE.BackSide,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);
  scene.userData.sky = sky;
  scene.userData.skyMat = skyMat;

  // Floating dust particles (amber)
  const dustCount = 200;
  const dustGeo = new THREE.BufferGeometry();
  const dustPositions = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    dustPositions[i * 3] = (Math.random() - 0.5) * 16;
    dustPositions[i * 3 + 1] = (Math.random() - 0.5) * 16;
    dustPositions[i * 3 + 2] = (Math.random() - 0.5) * 16;
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dustMat = new THREE.PointsMaterial({
    color: 0xaa8800,
    size: 0.03,
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  scene.add(dust);

  // Cache reference for animate loop (avoid scene.traverse)
  scene.userData.dust = dust;
}

function init() {
  const container = document.getElementById('game-container');

  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050505);

  // Camera
  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 4);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.8;
  container.appendChild(renderer.domElement);

  // Controls (orbit for bomb inspection)
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.rotateSpeed = 0.8;

  // Lighting - 3 lights for performance (ambient + key + fill)
  const ambient = new THREE.HemisphereLight(0xaabbdd, 0x444422, 1.2);
  scene.add(ambient);

  keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
  keyLight.position.set(3, 4, 5);
  scene.add(keyLight);

  fillLight = new THREE.DirectionalLight(0x99aadd, 0.8);
  fillLight.position.set(-3, 1, -3);
  scene.add(fillLight);

  // Background environment - floating dust/stars + gradient sky
  createBackground();

  // Particle system
  particleSystem = new ParticleSystem(scene);

  // HUD
  // Player select shown on load (no auto-load)
  hud = new HUD();

  // Interaction events
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointerup', onPointerUp);

  // Keyboard shortcuts (dev)
  window.addEventListener('keydown', onKeyDown);

  // Resize
  window.addEventListener('resize', onResize);

  // UI buttons — player select
  document.querySelectorAll('.player-btn').forEach(btn => {
    btn.addEventListener('click', () => selectPlayer(btn.dataset.player));
  });
  updatePlayerButtons();
  document.getElementById('retryBtn').addEventListener('click', retryLevel);

  // Start render loop
  animate();
}

function selectPlayer(name) {
  ensureAudio();
  currentPlayer = name;
  gameData = loadPlayerData(name);
  currentLevel = gameData.currentLevel || 1;
  currentRound = gameData.currentRound || 1;

  // Hide main overlay, show level select screen
  document.getElementById('overlay').classList.add('hidden');
  showLevelSelect();
}

function showLevelSelect() {
  const screen = document.getElementById('level-select-screen');
  screen.classList.remove('hidden');

  // Header
  document.getElementById('ls-player-name').textContent = currentPlayer;
  document.getElementById('ls-player-title').textContent = getJobTitle(gameData.highestLevel || 1);

  // Build grid
  const grid = document.getElementById('level-grid');
  grid.innerHTML = '';
  const highest = gameData.highestLevel || 1;
  const maxVisible = Math.max(20, highest + 1);

  for (let lvl = 1; lvl <= maxVisible; lvl++) {
    const btn = document.createElement('button');
    const unlocked = lvl <= highest;
    btn.className = `level-btn ${unlocked ? 'unlocked' : 'locked'}`;

    const numEl = document.createElement('span');
    numEl.textContent = lvl;
    btn.appendChild(numEl);

    if (lvl <= 20) {
      const titleEl = document.createElement('div');
      titleEl.className = 'level-title';
      titleEl.textContent = getJobTitle(lvl);
      btn.appendChild(titleEl);
    }

    if (unlocked) {
      btn.addEventListener('click', () => {
        currentLevel = lvl;
        currentRound = 1;
        gameData.currentLevel = currentLevel;
        gameData.currentRound = currentRound;
        savePlayerData(currentPlayer, gameData);
        screen.classList.add('hidden');
        startRound();
      });
    }

    grid.appendChild(btn);
  }

  // Switch player button
  document.getElementById('switch-player-btn').onclick = () => {
    screen.classList.add('hidden');
    document.getElementById('overlay').classList.remove('hidden');
    updatePlayerButtons();
  };
}

function updatePlayerButtons() {
  const players = getPlayers();
  ['Caleb', 'Ezra'].forEach(name => {
    const data = players[name] || { highestLevel: 1 };
    const infoEl = document.getElementById(`${name.toLowerCase()}-info`);
    if (infoEl) {
      infoEl.textContent = `Level ${data.highestLevel || 1} — ${getJobTitle(data.highestLevel || 1)}`;
    }
  });
}

function startGame() {
  // Legacy fallback
  document.getElementById('overlay').classList.add('hidden');
  startRound();
}

function startRound() {
  debugMode = false;
  const debugBtns = document.getElementById('debug-shape-btns');
  if (debugBtns) debugBtns.remove();

  state = STATE.PLAYING;
  timer = 50;
  timerRunning = false;
  graceActive = true;
  graceTimer = 1.0;
  currentSolutionStep = 0;
  lastTickSecond = -1;

  // Clean previous bomb
  if (bombGroup) {
    scene.remove(bombGroup);
    bombGroup.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    });
  }
  interactables = [];
  particleSystem.clear();

  // Generate and build bomb
  bombData = generateBomb(currentLevel, currentRound);
  const built = buildBombScene(bombData);
  bombGroup = built.bombGroup;
  interactables = built.interactables;
  scene.add(bombGroup);

  // Reset camera
  controls.reset();
  camera.position.set(0, 0, 4);

  // Update HUD
  hud.show();
  hud.setLevel(currentLevel, currentRound);
  hud.setTimer(timer);
  hud.setSolution(bombData.solution);
}

function retryLevel() {
  document.getElementById('game-over-overlay').classList.add('hidden');
  currentRound = 1;
  startRound();
}

// --- Debug Mode ---
let debugMode = false;

function flashWarningLight() {
  // Pulse all scene lights to red dramatically
  const duration = 300;
  const startTime = performance.now();

  const origKeyColor = 0xffffff;
  const origFillColor = 0x99aadd;

  const pulse = () => {
    const elapsed = performance.now() - startTime;
    const t = Math.min(1, elapsed / duration);
    // Sharp in, smooth out
    const intensity = t < 0.3 ? t / 0.3 : 1 - (t - 0.3) / 0.7;

    // Lerp key light white → red
    keyLight.color.setRGB(1, 1 - intensity * 0.8, 1 - intensity * 0.9);
    keyLight.intensity = 1.6 + intensity * 2;

    // Lerp fill light → red
    fillLight.color.setRGB(0.6 + intensity * 0.4, 0.67 * (1 - intensity * 0.7), 0.87 * (1 - intensity * 0.8));
    fillLight.intensity = 0.8 + intensity * 1.5;

    // Pulse sky sphere color from dark to red
    if (scene.userData.skyMat) {
      scene.userData.skyMat.color.setRGB(
        0.02 + intensity * 0.3,
        0.02 * (1 - intensity),
        0.02 * (1 - intensity)
      );
    }
    // Also pulse scene background
    scene.background.setRGB(
      0.02 + intensity * 0.2,
      0.02 * (1 - intensity * 0.8),
      0.02 * (1 - intensity * 0.8)
    );

    if (t < 1) {
      requestAnimationFrame(pulse);
    } else {
      // Reset
      keyLight.color.setHex(origKeyColor);
      keyLight.intensity = 1.6;
      fillLight.color.setHex(origFillColor);
      fillLight.intensity = 0.8;
      if (scene.userData.skyMat) {
        scene.userData.skyMat.color.setRGB(1, 1, 1);
      }
      scene.background.setHex(0x050505);
    }
  };
  pulse();

  // Screen vignette flash
  const container = document.getElementById('game-container');
  container.style.boxShadow = 'inset 0 0 100px rgba(255,0,0,0.5)';
  setTimeout(() => { container.style.boxShadow = 'none'; }, 300);
}

function showToast(message, color) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
    background: ${color || 'rgba(46,204,113,0.9)'}; color: #fff;
    padding: 10px 24px; border-radius: 8px; font: bold 16px sans-serif;
    z-index: 9999; pointer-events: none; transition: opacity 0.5s;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; }, 1500);
  setTimeout(() => { toast.remove(); }, 2000);
}

function startDebugMode() {
  debugMode = true;
  state = STATE.PLAYING;
  timerRunning = false; // no timer in debug
  graceActive = false;
  currentSolutionStep = 0;

  document.getElementById('overlay').classList.add('hidden');
  document.getElementById('game-over-overlay').classList.add('hidden');
  hud.hide();

  // Clean previous bomb
  if (bombGroup) {
    scene.remove(bombGroup);
    bombGroup.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    });
  }
  interactables = [];
  particleSystem.clear();

  buildDebugBomb();
}

function buildDebugBomb() {
  const debugGroup = new THREE.Group();
  interactables = [];

  // Use a large cube shape as base
  const bodyGeo = new THREE.BoxGeometry(2.5, 2.5, 2.5);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a2a3e, roughness: 0.6, metalness: 0.4 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  debugGroup.add(body);

  const types = ['wire', 'button', 'keypad', 'switch', 'turnKey', 'holdButton', 'pressureValve'];
  const slotSize = { w: 0.7, h: 0.7 };

  // Place components on each face of the cube
  const faceConfigs = [
    { pos: [0, 0, 1.26], rot: [0, 0, 0] },         // front
    { pos: [0, 0, -1.26], rot: [0, Math.PI, 0] },   // back
    { pos: [1.26, 0, 0], rot: [0, Math.PI/2, 0] },  // right
    { pos: [-1.26, 0, 0], rot: [0, -Math.PI/2, 0] },// left
    { pos: [0, 1.26, 0], rot: [-Math.PI/2, 0, 0] }, // top
    { pos: [0, -1.26, 0], rot: [Math.PI/2, 0, 0] }, // bottom
  ];

  // Build component list: prioritise 1 of each TYPE first, then fill with extra variants
  // Only 1 keypad allowed
  const allComponents = [];
  const usedCombos = new Set();

  // First pass: one of each type (first variant)
  for (const type of types) {
    const variants = getVariantsForType(type);
    const variant = variants[0];
    const key = `${type}:${variant}`;
    usedCombos.add(key);
    allComponents.push({ type, variant });
  }

  // Second pass: fill with more variants (skip keypad — only 1 allowed)
  const maxSlots = 24; // 6 faces × 4 slots
  for (const type of types) {
    if (type === 'keypad') continue; // only 1 keypad total
    const variants = getVariantsForType(type);
    for (let i = 1; i < variants.length && allComponents.length < maxSlots; i++) {
      const variant = variants[i];
      const key = `${type}:${variant}`;
      if (!usedCombos.has(key)) {
        usedCombos.add(key);
        allComponents.push({ type, variant });
      }
    }
  }

  // Find the keypad code for displaying
  const keypadEntry = allComponents.find(c => c.type === 'keypad');
  const keypadCode = keypadEntry ? keypadEntry.variant : '1234';

  // Place them across faces, 4 per face in a 2x2 grid
  const positions2x2 = [
    { x: -0.45, y: 0.45 },
    { x: 0.45, y: 0.45 },
    { x: -0.45, y: -0.45 },
    { x: 0.45, y: -0.45 },
  ];

  let compIdx = 0;

  for (const face of faceConfigs) {
    const faceGroup = new THREE.Group();
    faceGroup.position.set(...face.pos);
    faceGroup.rotation.set(...face.rot);

    for (const localPos of positions2x2) {
      if (compIdx >= allComponents.length) break;
      const { type, variant } = allComponents[compIdx];
      const instance = getComponentInstance(type);
      if (!instance) { compIdx++; continue; }

      const mesh = instance.createMesh(slotSize, variant);
      mesh.position.set(localPos.x, localPos.y, 0);
      mesh.userData.componentType = type;
      mesh.userData.variant = variant;
      mesh.userData.isSolution = true;
      instance.bindInteraction(mesh);

      // Wrap onInteract to show toast
      const origInteract = mesh.userData.onInteract;
      const origKeyPress = mesh.userData.onKeyPress;
      mesh.userData.onInteract = () => {
        const result = origInteract ? origInteract() : null;
        if (result === true) {
          showToast(`✓ ${variant} ${type} — DONE`, 'rgba(46,204,113,0.9)');
        } else if (result === null) {
          showToast(`… ${variant} ${type} — in progress`, 'rgba(52,152,219,0.9)');
        }
        return result;
      };
      if (origKeyPress) {
        mesh.userData.onKeyPress = (digit) => {
          const result = origKeyPress(digit);
          if (result === true) {
            showToast(`✓ keypad ${variant} — DONE`, 'rgba(46,204,113,0.9)');
          }
          return result;
        };
      }

      faceGroup.add(mesh);
      mesh.traverse(child => {
        if (child.isMesh) {
          child.userData.parentComponent = mesh;
          interactables.push(child);
        }
      });
      compIdx++;
    }
    debugGroup.add(faceGroup);
  }

  // Add keypad code label on the top face
  const codeLabelGeo = new THREE.PlaneGeometry(1.2, 0.3);
  const codeLabelCanvas = document.createElement('canvas');
  codeLabelCanvas.width = 320;
  codeLabelCanvas.height = 64;
  const cCtx = codeLabelCanvas.getContext('2d');
  cCtx.fillStyle = '#1a1a2e';
  cCtx.fillRect(0, 0, 320, 64);
  cCtx.strokeStyle = '#ffd32a';
  cCtx.lineWidth = 4;
  cCtx.strokeRect(4, 4, 312, 56);
  cCtx.fillStyle = '#ffd32a';
  cCtx.font = 'bold 32px monospace';
  cCtx.textAlign = 'center';
  cCtx.textBaseline = 'middle';
  cCtx.fillText(`CODE: ${keypadCode.split('').join(' ')}`, 160, 34);
  const codeLabelTex = new THREE.CanvasTexture(codeLabelCanvas);
  const codeLabelMat = new THREE.MeshStandardMaterial({ map: codeLabelTex, emissive: 0x222200, emissiveIntensity: 0.4 });
  const codeLabel = new THREE.Mesh(codeLabelGeo, codeLabelMat);
  // Place on top face, offset so it doesn't overlap a slot
  codeLabel.position.set(0, 1.27, 0);
  codeLabel.rotation.x = -Math.PI / 2;
  debugGroup.add(codeLabel);

  // Add screw panels on a separate pass
  addDebugScrewPanels(debugGroup, faceConfigs);

  bombGroup = debugGroup;
  scene.add(bombGroup);

  // Override solution so tapping anything doesn't explode
  bombData = { solution: allComponents.map((c, i) => ({ ...c, faceId: 'debug', slotId: `${i}` })) };
  currentSolutionStep = 0;

  controls.reset();
  camera.position.set(0, 0, 5);

  const typeCounts = {};
  allComponents.forEach(c => { typeCounts[c.type] = (typeCounts[c.type] || 0) + 1; });
  const summary = types.map(t => `${t}:${typeCounts[t] || 0}`).join(' ');
  showToast(`DEBUG: ${allComponents.length} components — ${summary}`, 'rgba(108,92,231,0.9)');

  // Add shape selector buttons
  showDebugShapeButtons();
}

function showDebugShapeButtons() {
  // Remove existing buttons if any
  const existing = document.getElementById('debug-shape-btns');
  if (existing) existing.remove();

  const container = document.createElement('div');
  container.id = 'debug-shape-btns';
  container.style.cssText = `
    position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
    display: flex; gap: 8px; z-index: 9999; pointer-events: auto;
  `;

  const shapes = ['cube', 'cylinder', 'sphere', 'suitcase', 'briefcase'];
  shapes.forEach(shapeName => {
    const btn = document.createElement('button');
    btn.textContent = shapeName;
    btn.style.cssText = `
      padding: 8px 16px; border: none; border-radius: 8px;
      background: rgba(108,92,231,0.8); color: #fff;
      font: bold 13px sans-serif; cursor: pointer;
      transition: transform 0.1s;
    `;
    btn.addEventListener('click', () => {
      loadDebugShape(shapeName);
    });
    btn.addEventListener('pointerenter', () => { btn.style.transform = 'scale(1.1)'; });
    btn.addEventListener('pointerleave', () => { btn.style.transform = 'scale(1)'; });
    container.appendChild(btn);
  });

  // Shadow map toggle
  const shadowBtn = document.createElement('button');
  shadowBtn.textContent = `Shadows: ${renderer.shadowMap.enabled ? 'ON' : 'OFF'}`;
  shadowBtn.style.cssText = `
    padding: 8px 16px; border: none; border-radius: 8px;
    background: rgba(231,76,60,0.8); color: #fff;
    font: bold 13px sans-serif; cursor: pointer;
    transition: transform 0.1s;
  `;
  shadowBtn.addEventListener('click', () => {
    renderer.shadowMap.enabled = !renderer.shadowMap.enabled;
    if (renderer.shadowMap.enabled) {
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      keyLight.castShadow = true;
    } else {
      keyLight.castShadow = false;
    }
    renderer.shadowMap.needsUpdate = true;
    shadowBtn.textContent = `Shadows: ${renderer.shadowMap.enabled ? 'ON' : 'OFF'}`;
  });
  container.appendChild(shadowBtn);

  document.body.appendChild(container);
}

function loadDebugShape(shapeName) {
  import('./shapes/index.js').then(({ getShape }) => {
    const shapeDefinition = getShape(shapeName);

    // Clean previous bomb
    if (bombGroup) {
      scene.remove(bombGroup);
      bombGroup.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
          else child.material.dispose();
        }
      });
    }
    interactables = [];

    const debugGroup = new THREE.Group();

    // Create body
    const body = shapeDefinition.createBody();
    debugGroup.add(body);

    // Place one component per slot to visualize the layout
    const types = ['wire', 'button', 'switch', 'turnKey', 'holdButton', 'pressureValve', 'keypad'];
    const slotSize = { w: 0.55, h: 0.55 };
    let compIdx = 0;

    for (const face of shapeDefinition.faces) {
      const faceGroup = new THREE.Group();
      faceGroup.position.copy(face.position);
      faceGroup.rotation.copy(face.rotation);

      for (const slot of face.slots) {
        const type = types[compIdx % types.length];
        const variants = getVariantsForType(type);
        const variant = variants[compIdx % variants.length];
        const instance = getComponentInstance(type);
        if (!instance) { compIdx++; continue; }

        const mesh = instance.createMesh(slot.size || slotSize, variant);
        mesh.position.set(slot.localPosition.x, slot.localPosition.y, 0);
        mesh.userData.componentType = type;
        mesh.userData.variant = variant;
        mesh.userData.isSolution = true;
        instance.bindInteraction(mesh);

        const origInteract = mesh.userData.onInteract;
        mesh.userData.onInteract = () => {
          const result = origInteract ? origInteract() : null;
          if (result === true) showToast(`✓ ${variant} ${type}`, 'rgba(46,204,113,0.9)');
          return result;
        };

        faceGroup.add(mesh);
        mesh.traverse(child => {
          if (child.isMesh) {
            child.userData.parentComponent = mesh;
            interactables.push(child);
          }
        });
        compIdx++;
      }
      debugGroup.add(faceGroup);
    }

    bombGroup = debugGroup;
    scene.add(bombGroup);
    bombData = { solution: [] };
    currentSolutionStep = 0;

    controls.reset();
    camera.position.set(0, 0, 5);

    showToast(`Shape: ${shapeName} — ${shapeDefinition.faces.length} faces`, 'rgba(108,92,231,0.9)');
  });
}

function addDebugScrewPanels(debugGroup, faceConfigs) {
  // Add 2 screw panels on the back face as demo
  import('./screw-panel.js').then(({ ScrewPanel }) => {
    const slotSize = { w: 0.7, h: 0.7 };
    const panelFace = faceConfigs[1]; // back face
    const panelGroup = new THREE.Group();
    panelGroup.position.set(...panelFace.pos);
    panelGroup.rotation.set(...panelFace.rot);

    const panelPositions = [
      { x: -0.45, y: 0.45 },
      { x: 0.45, y: -0.45 },
    ];

    for (const pos of panelPositions) {
      const panel = new ScrewPanel(slotSize);
      panel.group.position.set(pos.x, pos.y, 0.06);
      panelGroup.add(panel.group);

      // Register screw child meshes as interactable
      panel.screws.forEach(screwGrp => {
        screwGrp.traverse(child => {
          if (child.isMesh) {
            child.userData.isScrew = true;
            child.userData.panel = panel;
            child.userData.screwGroup = screwGrp;
            child.userData.faceId = 'debug';
            child.userData.slotId = 'panel';
            interactables.push(child);
          }
        });
      });
      interactables.push(panel.plate);
    }

    debugGroup.add(panelGroup);
    showToast('Screw panels on BACK face', 'rgba(85,102,119,0.9)');
  });
}

function onKeyDown(event) {
  if (event.key === 'l' || event.key === 'L') {
    if (!currentPlayer) { currentPlayer = 'Caleb'; gameData = loadPlayerData('Caleb'); }
    const input = prompt('Jump to level:');
    const level = parseInt(input, 10);
    if (level && level > 0) {
      currentLevel = level;
      currentRound = 1;
      gameData.currentLevel = currentLevel;
      gameData.currentRound = currentRound;
      savePlayerData(currentPlayer, gameData);
      document.getElementById('overlay').classList.add('hidden');
      document.getElementById('game-over-overlay').classList.add('hidden');
      startRound();
    }
  }
  if (event.key === 'd' || event.key === 'D') {
    startDebugMode();
  }
}

function onPointerDown(event) {
  pointerDownPos = { x: event.clientX, y: event.clientY };
  pointerDownTime = performance.now();

  // For hold-button, start the hold immediately on down
  if (state !== STATE.PLAYING) return;

  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(interactables, false);
  if (hits.length === 0) return;

  const hit = hits[0].object;
  let componentMesh = hit.userData.parentComponent || hit;
  while (componentMesh && !componentMesh.userData.componentType) {
    componentMesh = componentMesh.parent;
  }
  if (componentMesh && componentMesh.userData.componentType === 'holdButton' && componentMesh.userData.onPointerDown) {
    componentMesh.userData.onPointerDown();
  }
}

function onPointerUp(event) {
  if (state !== STATE.PLAYING) return;

  // Check if this was a drag (rotate) or a tap (interact)
  const dx = event.clientX - pointerDownPos.x;
  const dy = event.clientY - pointerDownPos.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > TAP_THRESHOLD) {
    // It was a drag/rotate — do NOT interact, but handle hold-button release
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(interactables, false);
    for (const hit of hits) {
      let componentMesh = hit.object.userData.parentComponent || hit.object;
      while (componentMesh && !componentMesh.userData.componentType) {
        componentMesh = componentMesh.parent;
      }
      if (componentMesh && componentMesh.userData.componentType === 'holdButton' && componentMesh.userData.onPointerUp) {
        componentMesh.userData.onPointerUp();
      }
    }
    return;
  }

  // It was a tap — process the interaction
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(interactables, false);

  if (hits.length === 0) return;

  const hit = hits[0].object;

  // Check if it's a screw
  let screwGroup = null;
  let obj = hit;
  while (obj) {
    if (obj.userData && obj.userData.isScrew) {
      // Could be the screwGroup itself or a child mesh with screwGroup ref
      screwGroup = obj.userData.screwGroup || obj;
      break;
    }
    obj = obj.parent;
  }

  if (screwGroup && screwGroup.userData.panel) {
    screwGroup.userData.panel.handleScrewTap(screwGroup);
    return;
  }

  // Check if it's a screw panel plate (not a component)
  if (hit.userData && hit.userData.isScrewPanel) return;

  // Find the parent component mesh
  let componentMesh = hit.userData.parentComponent || hit;
  while (componentMesh && !componentMesh.userData.componentType) {
    componentMesh = componentMesh.parent;
  }
  if (!componentMesh || !componentMesh.userData.componentType) return;

  // Handle keypad key press specially
  if (componentMesh.userData.componentType === 'keypad' && hit.userData && hit.userData.isKey) {
    if (componentMesh.userData.onKeyPress) {
      const result = componentMesh.userData.onKeyPress(hit.userData.digit);
      if (result === true) {
        handleCorrectInteraction(componentMesh);
      }
      return;
    }
  }

  // Handle hold button release
  if (componentMesh.userData.componentType === 'holdButton' && componentMesh.userData.onPointerUp) {
    const result = componentMesh.userData.onPointerUp();
    if (result === true) {
      handleCorrectInteraction(componentMesh);
    }
    return;
  }

  // Normal interaction
  handleComponentTap(componentMesh);
}

function handleComponentTap(componentMesh) {
  // Debug mode: just fire the interaction, no fail condition
  if (debugMode) {
    if (componentMesh.userData.onInteract) {
      componentMesh.userData.onInteract();
    }
    return;
  }

  // If this component is already solved/interacted, ignore the tap
  if (componentMesh.userData.cut || componentMesh.userData.pressed ||
      componentMesh.userData.toggled || componentMesh.userData.turned ||
      componentMesh.userData.held || componentMesh.userData.solved) {
    return;
  }

  const currentTarget = bombData.solution[currentSolutionStep];

  // Check if this is the correct next target
  if (
    componentMesh.userData.componentType === currentTarget.type &&
    componentMesh.userData.variant === currentTarget.variant
  ) {
    // Correct! Trigger interaction animation
    if (componentMesh.userData.onInteract) {
      const result = componentMesh.userData.onInteract();
      if (result === true) {
        handleCorrectInteraction(componentMesh);
      }
      // null means still in progress (multi-step like valve taps)
    }
  } else {
    // WRONG! Explode
    triggerExplosion();
  }
}

function handleCorrectInteraction(componentMesh) {
  // Advance to next step
  hud.advanceStep();
  currentSolutionStep++;
  particleSystem.createSparks(componentMesh.getWorldPosition(new THREE.Vector3()));
  playSuccess();

  // Check if bomb fully defused
  if (currentSolutionStep >= bombData.solution.length) {
    bombDefused();
  }
}

function bombDefused() {
  state = STATE.SUCCESS;
  timerRunning = false;

  gameData.totalDefused = (gameData.totalDefused || 0) + 1;

  // Advance round
  currentRound++;
  if (currentRound > 5) {
    // Level complete!
    currentRound = 1;
    currentLevel++;
    if (currentLevel > (gameData.highestLevel || 1)) {
      gameData.highestLevel = currentLevel;
    }
    gameData.currentLevel = currentLevel;
    gameData.currentRound = currentRound;
    savePlayerData(currentPlayer, gameData);

    playLevelComplete();
    showLevelComplete();
  } else {
    gameData.currentRound = currentRound;
    savePlayerData(currentPlayer, gameData);

    // Brief pause then next round
    setTimeout(() => {
      startRound();
    }, 1200);
  }
}

function showLevelComplete() {
  state = STATE.LEVEL_COMPLETE;
  const overlay = document.getElementById('game-over-overlay');
  const title = document.getElementById('game-over-title');
  const text = document.getElementById('game-over-text');
  const btn = document.getElementById('retryBtn');

  const jobTitle = getJobTitle(gameData.highestLevel || currentLevel);
  title.textContent = '🎉 LEVEL COMPLETE!';
  title.style.color = '#2ecc71';
  text.textContent = `${currentPlayer} — ${jobTitle} | Bombs defused: ${gameData.totalDefused}`;
  btn.textContent = 'Next Level';
  btn.onclick = () => {
    overlay.classList.add('hidden');
    startRound();
  };

  overlay.classList.remove('hidden');
}

function triggerExplosion() {
  state = STATE.EXPLODING;
  timerRunning = false;
  playExplosion();

  // Create explosion at bomb center
  if (bombGroup) {
    particleSystem.createExplosion(new THREE.Vector3(0, 0, 0));
    // Delay hiding bomb until fireball engulfs it
    setTimeout(() => {
      if (bombGroup) bombGroup.visible = false;
    }, 300);
  }

  // Show game over after delay
  setTimeout(() => {
    showGameOver();
  }, 1500);
}

function showGameOver() {
  state = STATE.GAME_OVER;
  const overlay = document.getElementById('game-over-overlay');
  const title = document.getElementById('game-over-title');
  const text = document.getElementById('game-over-text');
  const btn = document.getElementById('retryBtn');

  title.textContent = '💥 BOOM!';
  title.style.color = '#e74c3c';
  text.textContent = `Round failed - restarting Level ${currentLevel}`;
  btn.textContent = 'Try Again';
  btn.onclick = retryLevel;

  overlay.classList.remove('hidden');
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();

  controls.update();
  particleSystem.update(dt);

  // Timer logic
  if (state === STATE.PLAYING) {
    if (graceActive) {
      graceTimer -= dt;
      if (graceTimer <= 0) {
        graceActive = false;
        timerRunning = true;
      }
    }

    if (timerRunning) {
      timer -= dt;
      hud.setTimer(timer);

      // Tick sound in final 10 seconds + red warning flash
      const sec = Math.ceil(timer);
      if (timer <= 10 && sec !== lastTickSecond && sec > 0) {
        lastTickSecond = sec;
        playCountdownTick();
        flashWarningLight();
      }

      if (timer <= 0) {
        triggerExplosion();
      }
    }
  }

  // Slow rotation when not interacting (subtle idle)
  if (bombGroup && state === STATE.PLAYING && !controls.isDragging) {
    bombGroup.rotation.y += dt * 0.05;
  }

  // Animate background dust (cached reference)
  if (scene.userData.dust) {
    scene.userData.dust.rotation.y += dt * 0.02;
    scene.userData.dust.rotation.x += dt * 0.005;
  }

  renderer.render(scene, camera);
}

// Initialize on load
init();
