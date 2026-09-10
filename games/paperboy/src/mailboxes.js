// The day on the mailboxes.
//
// The "SUN" on every box is extruded text baked into paper-level.glb — the
// letters are geometry, so there is nothing to set. Instead each label mesh is
// hidden and a small plate is hung in exactly its place, carrying a canvas
// texture that gets redrawn with the current day. One texture, shared by all
// twelve boxes, so a day change is a single redraw.
//
// (The alternative is seven text objects per box in the .blend. This looks the
// same and costs nothing.)
import * as THREE from 'three';
import { DAYS } from './config.js';

const LABEL = /^Mailbox_SUN_Text/;
const W = 192;
const H = 72;

export class Mailboxes {
    constructor() {
        this.plates = [];
        this.canvas = null;
        this.texture = null;
        this.day = -1;
    }

    build(root) {
        const found = [];
        root.traverse(o => { if (o.isMesh && LABEL.test(o.name)) found.push(o); });
        if (!found.length) return 0;

        this.canvas = document.createElement('canvas');
        this.canvas.width = W;
        this.canvas.height = H;
        this.texture = new THREE.CanvasTexture(this.canvas);
        this.texture.colorSpace = THREE.SRGBColorSpace;
        this.texture.anisotropy = 4;
        const material = new THREE.MeshStandardMaterial({
            map: this.texture, transparent: true, roughness: 0.5,
            // Sits a hair off the box's face, so no z-fighting with the red.
            depthWrite: false,
        });

        const box = new THREE.Box3();
        for (const mesh of found) {
            box.setFromObject(mesh);
            const size = box.getSize(new THREE.Vector3());
            const centre = box.getCenter(new THREE.Vector3());
            // The label plate faces back down the street (-X), the way he comes.
            const plate = new THREE.Mesh(new THREE.PlaneGeometry(size.z * 1.05, size.y * 1.35), material);
            plate.rotation.y = -Math.PI / 2;
            plate.position.set(centre.x - 0.012, centre.y, centre.z);
            plate.name = `${mesh.name}_Day`;   // still ignored by ROLE_RULES
            plate.renderOrder = 2;
            mesh.visible = false;
            (mesh.parent || root).add(plate);
            // Positioned in world space, so undo the parent's transform.
            const parent = plate.parent;
            parent.updateWorldMatrix(true, false);
            plate.applyMatrix4(new THREE.Matrix4().copy(parent.matrixWorld).invert());
            this.plates.push(plate);
        }
        this.setDay(0);
        // Anta arrives after the first paint; redraw once it is in.
        document.fonts?.ready?.then(() => this.draw());
        return this.plates.length;
    }

    setDay(day) {
        if (!this.texture || day === this.day) return;
        this.day = day;
        this.draw();
    }

    draw() {
        if (!this.texture) return;
        const text = DAYS[(this.day + DAYS.length) % DAYS.length].slice(0, 3);
        const c = this.canvas.getContext('2d');
        c.clearRect(0, 0, W, H);
        c.fillStyle = '#f5f5f0';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.font = `${Math.round(H * 0.8)}px Anta, system-ui, sans-serif`;
        c.fillText(text, W / 2, H / 2 + 2);
        this.texture.needsUpdate = true;
    }
}
