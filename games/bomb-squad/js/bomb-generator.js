// Bomb Generator - seeded procedural bomb assembly pipeline
import * as THREE from 'three';
import { getShape } from './shapes/index.js';
import { getComponentInstance, getVariantsForType } from './components/index.js';
import { ScrewPanel } from './screw-panel.js';
import {
  getSolutionCount,
  getUnlockedComponents,
  getScrewPanelCount,
  getAvailableShapes,
} from './progression.js';

// Mulberry32 PRNG
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateBomb(level, round) {
  const seed = level * 1000 + round;
  const rng = mulberry32(seed);

  // 1. Pick shape
  const availableShapes = getAvailableShapes(level);
  const shapeName = availableShapes[Math.floor(rng() * availableShapes.length)];
  const shapeDefinition = getShape(shapeName);

  // 2. Instantiate face/slot layout
  const faces = shapeDefinition.faces.map(face => ({
    ...face,
    slots: face.slots.map(slot => ({
      ...slot,
      component: null,
      componentMesh: null,
      screwPanel: null,
    })),
  }));

  // 3. Place components — each type+variant combo can only appear ONCE on the bomb.
  //    Not all slots need to be filled (some stay empty).
  const unlockedTypes = getUnlockedComponents(level);
  const allSlots = [];
  const usedCombos = new Set(); // enforces uniqueness across entire bomb

  // Collect all slots
  for (const face of faces) {
    for (const slot of face.slots) {
      allSlots.push({ face, slot });
    }
  }

  // Shuffle slots for random placement order
  for (let i = allSlots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [allSlots[i], allSlots[j]] = [allSlots[j], allSlots[i]];
  }

  // Determine how many slots to fill (leave some empty, especially at lower levels)
  const minFill = Math.max(6, getSolutionCount(level) + 4);
  const maxFill = Math.min(allSlots.length, minFill + Math.floor(level * 1.5));
  const fillCount = Math.min(allSlots.length, minFill + Math.floor(rng() * (maxFill - minFill + 1)));

  const filledSlots = [];
  let keypadPlaced = false;
  for (let i = 0; i < allSlots.length && filledSlots.length < fillCount; i++) {
    const { face, slot } = allSlots[i];

    // Try to place a unique type+variant combo
    let placed = false;
    const typeOrder = [...unlockedTypes];
    // Shuffle type order for variety
    for (let t = typeOrder.length - 1; t > 0; t--) {
      const j = Math.floor(rng() * (t + 1));
      [typeOrder[t], typeOrder[j]] = [typeOrder[j], typeOrder[t]];
    }

    for (const type of typeOrder) {
      // Only 1 keypad per bomb
      if (type === 'keypad' && keypadPlaced) continue;

      const variants = getVariantsForType(type);
      const variantOrder = [...variants];
      for (let v = variantOrder.length - 1; v > 0; v--) {
        const j = Math.floor(rng() * (v + 1));
        [variantOrder[v], variantOrder[j]] = [variantOrder[j], variantOrder[v]];
      }
      for (const variant of variantOrder) {
        const key = `${type}:${variant}`;
        if (!usedCombos.has(key)) {
          usedCombos.add(key);
          slot.component = { type, variant };
          filledSlots.push({ face, slot });
          placed = true;
          if (type === 'keypad') keypadPlaced = true;
          break;
        }
      }
      if (placed) break;
    }
    // If no unique combo available, leave slot empty
  }

  // 4. Choose solution targets from placed components
  const solutionCount = getSolutionCount(level);
  const solution = [];

  // Shuffle filled slots for random selection
  const shuffled = [...filledSlots];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  for (const { face, slot } of shuffled) {
    if (solution.length >= solutionCount) break;
    solution.push({
      type: slot.component.type,
      variant: slot.component.variant,
      faceId: face.id,
      slotId: slot.id,
    });
  }

  // 5. Validate — since every placed component has a unique type+variant,
  //    each solution instruction is inherently unambiguous.

  // 6. Assign screw panels (never cover more than 1 solution target)
  const screwPanelCount = getScrewPanelCount(level);
  let solutionPanels = 0;

  const panelCandidates = [...filledSlots];
  for (let i = panelCandidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [panelCandidates[i], panelCandidates[j]] = [panelCandidates[j], panelCandidates[i]];
  }

  let panelsPlaced = 0;
  for (const { face, slot } of panelCandidates) {
    if (panelsPlaced >= screwPanelCount) break;
    // Never cover a key with a panel
    if (slot.component && slot.component.type === 'turnKey') continue;
    const isSolution = solution.some(
      s => s.faceId === face.id && s.slotId === slot.id
    );
    if (isSolution && solutionPanels >= 1) continue; // max 1 solution behind panel
    if (isSolution) solutionPanels++;

    slot.hasScrewPanel = true;
    panelsPlaced++;
  }

  return {
    shapeName,
    shapeDefinition,
    faces,
    solution,
    seed,
  };
}

// Build the 3D scene from generated bomb data
export function buildBombScene(bombData) {
  const { shapeDefinition, faces, solution } = bombData;
  const bombGroup = new THREE.Group();

  // Create body mesh
  const body = shapeDefinition.createBody();
  bombGroup.add(body);

  // All interactive meshes for raycasting
  const interactables = [];

  // Place components on each face
  for (const face of faces) {
    const faceGroup = new THREE.Group();

    // Position and rotate face group
    faceGroup.position.copy(face.position);
    faceGroup.rotation.copy(face.rotation);

    for (const slot of face.slots) {
      if (!slot.component) continue;

      const componentInstance = getComponentInstance(slot.component.type);
      if (!componentInstance) continue;

      const mesh = componentInstance.createMesh(slot.size, slot.component.variant);
      mesh.position.set(slot.localPosition.x, slot.localPosition.y, 0);

      // Tag mesh with identity for interaction
      mesh.userData.faceId = face.id;
      mesh.userData.slotId = slot.id;
      mesh.userData.componentType = slot.component.type;
      mesh.userData.variant = slot.component.variant;

      // Check if this is a solution target
      const isSolution = solution.some(
        s => s.faceId === face.id && s.slotId === slot.id
      );
      mesh.userData.isSolution = isSolution;

      // Bind interaction
      componentInstance.bindInteraction(mesh);

      // Add screw panel cover if needed
      if (slot.hasScrewPanel) {
        const panel = new ScrewPanel(slot.size);
        panel.group.position.set(slot.localPosition.x, slot.localPosition.y, 0.05);
        faceGroup.add(panel.group);
        slot.screwPanelInstance = panel;

        // Register screw panel meshes as interactable (must be actual Meshes for raycasting)
        panel.screws.forEach(screwGrp => {
          screwGrp.traverse(child => {
            if (child.isMesh) {
              child.userData.isScrew = true;
              child.userData.panel = panel;
              child.userData.screwGroup = screwGrp;
              child.userData.faceId = face.id;
              child.userData.slotId = slot.id;
              interactables.push(child);
            }
          });
        });
        // Also register plate mesh
        panel.plate.userData.faceId = face.id;
        panel.plate.userData.slotId = slot.id;
        interactables.push(panel.plate);
      }

      slot.componentMesh = mesh;
      faceGroup.add(mesh);

      // Register all child meshes as interactable
      mesh.traverse(child => {
        if (child.isMesh) {
          child.userData.parentComponent = mesh;
          child.userData.faceId = face.id;
          child.userData.slotId = slot.id;
          interactables.push(child);
        }
      });
    }

    bombGroup.add(faceGroup);
  }

  // If there's a keypad on the bomb, place a code hint label on the bomb body
  let keypadCode = null;
  for (const face of faces) {
    for (const slot of face.slots) {
      if (slot.component && slot.component.type === 'keypad') {
        keypadCode = slot.component.variant;
        break;
      }
    }
    if (keypadCode) break;
  }
  if (keypadCode) {
    // Find an empty slot to place the code label, or use a face with space
    let labelFace = null;
    let labelPos = { x: 0, y: 0 };
    for (const face of faces) {
      for (const slot of face.slots) {
        if (!slot.component) {
          labelFace = face;
          labelPos = slot.localPosition;
          break;
        }
      }
      if (labelFace) break;
    }
    // Fallback: place it on the first face at an offset position
    if (!labelFace) {
      labelFace = faces[0];
      labelPos = { x: 0, y: 0 };
    }

    const labelGeo = new THREE.PlaneGeometry(0.5, 0.15);
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 256;
    labelCanvas.height = 64;
    const ctx = labelCanvas.getContext('2d');
    ctx.fillStyle = '#111122';
    ctx.fillRect(0, 0, 256, 64);
    ctx.strokeStyle = '#ffd32a';
    ctx.lineWidth = 3;
    ctx.strokeRect(3, 3, 250, 58);
    ctx.fillStyle = '#ffd32a';
    ctx.font = 'bold 30px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`CODE: ${keypadCode.split('').join(' ')}`, 128, 32);
    const labelTex = new THREE.CanvasTexture(labelCanvas);
    const labelMat = new THREE.MeshStandardMaterial({
      map: labelTex,
      emissive: 0x222200,
      emissiveIntensity: 0.4,
    });
    const label = new THREE.Mesh(labelGeo, labelMat);

    // Create a face group at the same position/rotation as the chosen face
    const codeFaceGroup = new THREE.Group();
    codeFaceGroup.position.copy(labelFace.position);
    codeFaceGroup.rotation.copy(labelFace.rotation);
    label.position.set(labelPos.x, labelPos.y, 0.01);
    codeFaceGroup.add(label);
    bombGroup.add(codeFaceGroup);
  }

  return { bombGroup, interactables };
}
