// Wire component - colored insulated cables, cut by tapping
// On cut: the wire splits at the midpoint — each half's free end droops down
// while the terminal ends remain fixed to the bomb surface.
import * as THREE from 'three';
import { playWireSnip } from '../audio.js';

const WIRE_COLORS = {
  red: 0xe74c3c,
  blue: 0x3498db,
  yellow: 0xf1c40f,
  white: 0xecf0f1,
  black: 0x2c3e50,
};

export class WireComponent {
  static type = 'wire';
  static variants = Object.keys(WIRE_COLORS);

  createMesh(slotSize, variant) {
    const group = new THREE.Group();
    const color = WIRE_COLORS[variant] || 0xffffff;
    const w = slotSize.w * 0.9;
    const tubeRadius = Math.max(0.025, slotSize.w * 0.05);

    const wireMat = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.6,
      metalness: 0.1,
    });

    // Full wire as a single bendy tube (smooth wave)
    const points = [
      new THREE.Vector3(-w / 2, 0, 0),
      new THREE.Vector3(-w / 2.8, 0.06, 0.02),
      new THREE.Vector3(-w / 6, -0.05, 0.04),
      new THREE.Vector3(0, 0.06, 0.035),
      new THREE.Vector3(w / 6, -0.05, 0.04),
      new THREE.Vector3(w / 2.8, 0.06, 0.02),
      new THREE.Vector3(w / 2, 0, 0),
    ];
    const curve = new THREE.CatmullRomCurve3(points);
    const tubeGeo = new THREE.TubeGeometry(curve, 24, tubeRadius, 8, false);
    const tube = new THREE.Mesh(tubeGeo, wireMat);
    group.add(tube);

    // Terminal blocks (fixed to bomb)
    const termGeo = new THREE.BoxGeometry(0.05, 0.055, 0.04);
    const termMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.7 });
    const leftTerm = new THREE.Mesh(termGeo, termMat);
    leftTerm.position.set(-w / 2, 0, 0);
    group.add(leftTerm);
    const rightTerm = new THREE.Mesh(termGeo, termMat);
    rightTerm.position.set(w / 2, 0, 0);
    group.add(rightTerm);

    // Grommets
    const grommetGeo = new THREE.TorusGeometry(tubeRadius + 0.008, 0.006, 8, 12);
    const grommetMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
    const lg = new THREE.Mesh(grommetGeo, grommetMat);
    lg.position.set(-w / 2 + 0.015, 0, 0);
    lg.rotation.y = Math.PI / 2;
    group.add(lg);
    const rg = new THREE.Mesh(grommetGeo, grommetMat);
    rg.position.set(w / 2 - 0.015, 0, 0);
    rg.rotation.y = Math.PI / 2;
    group.add(rg);

    // Store data for cut animation
    group.userData.componentType = 'wire';
    group.userData.variant = variant;
    group.userData.cut = false;
    group.userData.tube = tube;
    group.userData.wirePoints = points.map(p => p.clone());
    group.userData.tubeRadius = tubeRadius;
    group.userData.wireMat = wireMat;
    group.userData.wireW = w;

    return group;
  }

  bindInteraction(mesh, onCorrect, onWrong) {
    mesh.userData.onInteract = () => {
      if (mesh.userData.cut) return;
      mesh.userData.cut = true;
      playWireSnip();

      const tube = mesh.userData.tube;
      const points = mesh.userData.wirePoints;
      const tubeRadius = mesh.userData.tubeRadius;
      const wireMat = mesh.userData.wireMat;
      const w = mesh.userData.wireW;
      const parent = tube.parent;

      // Hide original single wire
      tube.visible = false;

      // Split into left half and right half at the midpoint (index 3)
      const leftPoints = points.slice(0, 4).map(p => p.clone());
      const rightPoints = points.slice(3).map(p => p.clone());

      // Create left half tube (static geometry — created once)
      const leftCurve = new THREE.CatmullRomCurve3(leftPoints);
      const leftGeo = new THREE.TubeGeometry(leftCurve, 12, tubeRadius, 8, false);
      const leftMat = wireMat.clone();
      const leftTube = new THREE.Mesh(leftGeo, leftMat);
      // Wrap in a group pivoting from the fixed end (left terminal)
      const leftPivot = new THREE.Group();
      leftPivot.position.set(points[0].x, points[0].y, points[0].z);
      leftTube.position.set(-points[0].x, -points[0].y, -points[0].z);
      leftPivot.add(leftTube);
      parent.add(leftPivot);

      // Create right half tube (static geometry — created once)
      const rightCurve = new THREE.CatmullRomCurve3(rightPoints);
      const rightGeo = new THREE.TubeGeometry(rightCurve, 12, tubeRadius, 8, false);
      const rightMat = wireMat.clone();
      const rightTube = new THREE.Mesh(rightGeo, rightMat);
      // Wrap in a group pivoting from the fixed end (right terminal)
      const lastPt = points[points.length - 1];
      const rightPivot = new THREE.Group();
      rightPivot.position.set(lastPt.x, lastPt.y, lastPt.z);
      rightTube.position.set(-lastPt.x, -lastPt.y, -lastPt.z);
      rightPivot.add(rightTube);
      parent.add(rightPivot);

      // Copper exposed circles at the cut ends
      const copperMat = new THREE.MeshStandardMaterial({ color: 0xd4760a, metalness: 0.8, roughness: 0.3 });
      const copperGeo = new THREE.CircleGeometry(tubeRadius * 1.1, 8);
      const leftCopperEnd = new THREE.Mesh(copperGeo, copperMat);
      leftCopperEnd.position.copy(leftPoints[3]);
      parent.add(leftCopperEnd);
      const rightCopperEnd = new THREE.Mesh(copperGeo, copperMat);
      rightCopperEnd.position.copy(rightPoints[0]);
      rightCopperEnd.rotation.y = Math.PI;
      parent.add(rightCopperEnd);

      // Animate: rotate each pivot so the free end droops down
      // No geometry rebuild — just rotating the group from its fixed terminal
      const duration = 600;
      const startTime = performance.now();

      const animate = () => {
        const elapsed = performance.now() - startTime;
        const t = Math.min(1, elapsed / duration);
        const ease = t * t;

        // Get world "down" in pivot's local space
        const worldDown = new THREE.Vector3(0, -1, 0);
        const parentWorldQuat = new THREE.Quaternion();
        leftPivot.parent.getWorldQuaternion(parentWorldQuat);
        const localDown = worldDown.clone().applyQuaternion(parentWorldQuat.invert());

        // Negate to droop downward
        leftPivot.rotation.x = -localDown.z * ease * 0.5;
        leftPivot.rotation.z = localDown.y * ease * 0.4;

        rightPivot.rotation.x = -localDown.z * ease * 0.5;
        rightPivot.rotation.z = -localDown.y * ease * 0.4;

        if (t < 1) requestAnimationFrame(animate);
      };
      animate();

      return true;
    };
  }
}
