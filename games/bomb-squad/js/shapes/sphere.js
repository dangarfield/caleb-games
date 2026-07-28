// Sphere bomb shape - round bomb with 6 evenly-spaced panel areas
import * as THREE from 'three';

const RADIUS = 0.9;

export const SphereShape = {
  name: 'sphere',

  createBody() {
    const group = new THREE.Group();

    // Outer shell - translucent metallic sphere
    const geo = new THREE.SphereGeometry(RADIUS, 32, 24);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x3e3a4e,
      roughness: 0.25,
      metalness: 0.5,
      transparent: true,
      opacity: 0.85,
    });
    const mesh = new THREE.Mesh(geo, mat);
    group.add(mesh);

    // Inner explosive core - pulsing energy ball
    const coreGeo = new THREE.IcosahedronGeometry(RADIUS * 0.35, 1);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xff4400,
      emissive: 0xff2200,
      emissiveIntensity: 0.7,
      roughness: 0.9,
      wireframe: true,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    group.add(core);

    // Solid inner mass
    const innerGeo = new THREE.SphereGeometry(RADIUS * 0.25, 12, 12);
    const innerMat = new THREE.MeshStandardMaterial({
      color: 0xcc2200,
      emissive: 0x881100,
      emissiveIntensity: 0.5,
    });
    const inner = new THREE.Mesh(innerGeo, innerMat);
    group.add(inner);

    // Equatorial band (thicker)
    const bandGeo = new THREE.TorusGeometry(RADIUS + 0.01, 0.035, 10, 32);
    const bandMat = new THREE.MeshStandardMaterial({ color: 0x778899, metalness: 0.8, roughness: 0.2 });
    const band = new THREE.Mesh(bandGeo, bandMat);
    band.rotation.x = Math.PI / 2;
    group.add(band);

    // Second band (perpendicular)
    const band2 = new THREE.Mesh(bandGeo, bandMat);
    band2.rotation.z = Math.PI / 2;
    group.add(band2);

    // Fuse on top (classic bomb look)
    const fuseGeo = new THREE.CylinderGeometry(0.03, 0.04, 0.25, 10);
    const fuseMat = new THREE.MeshStandardMaterial({ color: 0x556666, metalness: 0.6, roughness: 0.4 });
    const fuse = new THREE.Mesh(fuseGeo, fuseMat);
    fuse.position.y = RADIUS + 0.12;
    group.add(fuse);

    // Fuse sparking string
    const stringCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, RADIUS + 0.25, 0),
      new THREE.Vector3(0.06, RADIUS + 0.32, 0.03),
      new THREE.Vector3(-0.03, RADIUS + 0.38, -0.02),
      new THREE.Vector3(0.02, RADIUS + 0.42, 0.01),
    ]);
    const stringGeo = new THREE.TubeGeometry(stringCurve, 10, 0.008, 5, false);
    const stringMat = new THREE.MeshStandardMaterial({ color: 0xaa7733, emissive: 0x553300, emissiveIntensity: 0.3 });
    const string = new THREE.Mesh(stringGeo, stringMat);
    group.add(string);

    // Spark at tip
    const sparkGeo = new THREE.SphereGeometry(0.025, 8, 8);
    const sparkMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xff6600, emissiveIntensity: 1.0 });
    const spark = new THREE.Mesh(sparkGeo, sparkMat);
    spark.position.set(0.02, RADIUS + 0.42, 0.01);
    group.add(spark);

    return group;
  },

  faces: (() => {
    // 12 individual positions around the sphere, each with 1 slot
    // This ensures each component gets its own radial orientation
    const directions = [
      { id: 'front', dir: [0, 0, 1] },
      { id: 'back', dir: [0, 0, -1] },
      { id: 'right', dir: [1, 0, 0] },
      { id: 'left', dir: [-1, 0, 0] },
      { id: 'top', dir: [0, 0.85, 0.5] },
      { id: 'bottom', dir: [0, -0.85, 0.5] },
      { id: 'top-right', dir: [0.7, 0.7, 0] },
      { id: 'top-left', dir: [-0.7, 0.7, 0] },
      { id: 'bot-right', dir: [0.7, -0.5, 0.5] },
      { id: 'bot-left', dir: [-0.7, -0.5, 0.5] },
      { id: 'back-right', dir: [0.7, 0, -0.7] },
      { id: 'back-left', dir: [-0.7, 0, -0.7] },
    ];

    const s = 0.45;

    return directions.map(f => {
      const normal = new THREE.Vector3(...f.dir).normalize();
      const position = normal.clone().multiplyScalar(RADIUS + 0.02);
      const up = Math.abs(normal.y) > 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
      const quat = new THREE.Quaternion();
      const lookMat = new THREE.Matrix4().lookAt(normal, new THREE.Vector3(0, 0, 0), up);
      quat.setFromRotationMatrix(lookMat);
      const euler = new THREE.Euler().setFromQuaternion(quat);

      return {
        id: f.id,
        normal,
        position,
        rotation: euler,
        bounds: { width: s, height: s },
        slots: [{ id: 'center', localPosition: { x: 0, y: 0 }, size: { w: s, h: s } }],
      };
    });
  })(),
};
