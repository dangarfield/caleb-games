import * as THREE from 'three';

export class GuideArrow {
  constructor(scene) {
    this.scene = scene;
    this.mesh = null;
    this.visible = false;
    this.create();
  }

  create() {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.3);
    shape.lineTo(-0.2, 0);
    shape.lineTo(-0.07, 0);
    shape.lineTo(-0.07, -0.3);
    shape.lineTo(0.07, -0.3);
    shape.lineTo(0.07, 0);
    shape.lineTo(0.2, 0);
    shape.closePath();

    const geo = new THREE.ShapeGeometry(shape);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthTest: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.renderOrder = 999;
    this.mesh.visible = false;
    this.scene.add(this.mesh);
  }

  show(playerPos, targetPos) {
    if (!this.mesh) return;
    this.mesh.visible = true;
    this.visible = true;
    this.update(0, playerPos, targetPos);
  }

  hide() {
    if (!this.mesh) return;
    this.mesh.visible = false;
    this.visible = false;
  }

  update(time, playerPos, targetPos) {
    if (!this.visible || !this.mesh) return;

    const dir = new THREE.Vector3().subVectors(targetPos, playerPos);
    dir.y = 0;
    dir.normalize();

    this.mesh.position.set(
      playerPos.x + dir.x * 2,
      playerPos.y + 0.5 + Math.sin(time * 3) * 0.15,
      playerPos.z + dir.z * 2
    );

    const angle = Math.atan2(dir.x, dir.z);
    this.mesh.rotation.set(-Math.PI / 2, 0, -angle);

    this.mesh.material.opacity = 0.6 + Math.sin(time * 4) * 0.3;
  }

  dispose() {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      this.scene.remove(this.mesh);
    }
  }
}
