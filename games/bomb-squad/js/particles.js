// Particle effects - explosion and success spark systems using mesh instances
import * as THREE from 'three';

// Shared geometries
const particleSphereGeo = new THREE.SphereGeometry(1, 6, 6);
const debrisGeo = new THREE.BoxGeometry(1, 1, 1);

export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
  }

  createExplosion(position) {
    // Fireball core flash
    const flashGeo = new THREE.SphereGeometry(0.8, 12, 12);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 1,
    });
    const flash = new THREE.Mesh(flashGeo, flashMat);
    flash.position.copy(position);
    this.scene.add(flash);
    this.particles.push({
      mesh: flash,
      vel: new THREE.Vector3(0, 0, 0),
      life: 0,
      maxLife: 0.4,
      type: 'flash',
    });

    // Fire chunks (small spheres flying outward)
    for (let i = 0; i < 25; i++) {
      const size = 0.04 + Math.random() * 0.08;
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color().lerpColors(
          new THREE.Color(0xff2200),
          new THREE.Color(0xffaa00),
          Math.random()
        ),
        emissive: 0xff4400,
        emissiveIntensity: 0.8 + Math.random() * 0.5,
        roughness: 0.9,
      });
      const mesh = new THREE.Mesh(particleSphereGeo, mat);
      mesh.scale.setScalar(size);
      mesh.position.copy(position);

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 6
      );

      this.scene.add(mesh);
      this.particles.push({
        mesh,
        vel,
        life: 0,
        maxLife: 0.6 + Math.random() * 0.6,
        type: 'fire',
      });
    }

    // Debris chunks (dark angular pieces)
    for (let i = 0; i < 15; i++) {
      const sx = 0.02 + Math.random() * 0.06;
      const sy = 0.02 + Math.random() * 0.04;
      const sz = 0.02 + Math.random() * 0.05;
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color().lerpColors(
          new THREE.Color(0x222222),
          new THREE.Color(0x555544),
          Math.random()
        ),
        roughness: 0.9,
        metalness: 0.3,
      });
      const mesh = new THREE.Mesh(debrisGeo, mat);
      mesh.scale.set(sx, sy, sz);
      mesh.position.copy(position);
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 5,
        Math.random() * 4 + 1,
        (Math.random() - 0.5) * 5
      );

      this.scene.add(mesh);
      this.particles.push({
        mesh,
        vel,
        rotVel: new THREE.Vector3(
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 10
        ),
        life: 0,
        maxLife: 1.0 + Math.random() * 0.5,
        type: 'debris',
      });
    }

    // Smoke puffs (larger, slower, fading)
    for (let i = 0; i < 12; i++) {
      const size = 0.1 + Math.random() * 0.2;
      const mat = new THREE.MeshBasicMaterial({
        color: 0x333333,
        transparent: true,
        opacity: 0.6,
      });
      const mesh = new THREE.Mesh(particleSphereGeo, mat);
      mesh.scale.setScalar(size);
      mesh.position.copy(position);
      mesh.position.add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 0.3
      ));

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 1.5,
        Math.random() * 2 + 0.5,
        (Math.random() - 0.5) * 1.5
      );

      this.scene.add(mesh);
      this.particles.push({
        mesh,
        vel,
        life: 0,
        maxLife: 1.5 + Math.random() * 1.0,
        type: 'smoke',
        startSize: size,
      });
    }
  }

  createSparks(position) {
    // Small green success flash (subtle, not square dots)
    const flashGeo = new THREE.SphereGeometry(0.15, 8, 8);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0x44ff88,
      transparent: true,
      opacity: 0.8,
    });
    const flash = new THREE.Mesh(flashGeo, flashMat);
    flash.position.copy(position);
    this.scene.add(flash);
    this.particles.push({
      mesh: flash,
      vel: new THREE.Vector3(0, 0, 0),
      life: 0,
      maxLife: 0.3,
      type: 'successFlash',
    });

    // A few small bright sparks
    for (let i = 0; i < 8; i++) {
      const size = 0.015 + Math.random() * 0.02;
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color().lerpColors(
          new THREE.Color(0x44ff88),
          new THREE.Color(0xffffff),
          Math.random() * 0.5
        ),
        transparent: true,
        opacity: 1,
      });
      const mesh = new THREE.Mesh(particleSphereGeo, mat);
      mesh.scale.setScalar(size);
      mesh.position.copy(position);

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 4,
        (Math.random() - 0.5) * 4,
        (Math.random() - 0.5) * 4
      );

      this.scene.add(mesh);
      this.particles.push({
        mesh,
        vel,
        life: 0,
        maxLife: 0.3 + Math.random() * 0.2,
        type: 'spark',
      });
    }
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;

      if (p.life >= p.maxLife) {
        this.scene.remove(p.mesh);
        p.mesh.geometry !== particleSphereGeo && p.mesh.geometry !== debrisGeo && p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        this.particles.splice(i, 1);
        continue;
      }

      const t = p.life / p.maxLife;

      // Apply velocity
      p.mesh.position.x += p.vel.x * dt;
      p.mesh.position.y += p.vel.y * dt;
      p.mesh.position.z += p.vel.z * dt;

      if (p.type === 'fire') {
        p.vel.y -= 4 * dt; // gravity
        p.mesh.material.opacity = 1 - t;
        p.mesh.material.transparent = true;
        p.mesh.material.emissiveIntensity = (1 - t) * 1.2;
        p.mesh.scale.setScalar(p.mesh.scale.x * (1 - dt * 1.5));
      } else if (p.type === 'debris') {
        p.vel.y -= 8 * dt; // heavier gravity
        if (p.rotVel) {
          p.mesh.rotation.x += p.rotVel.x * dt;
          p.mesh.rotation.y += p.rotVel.y * dt;
          p.mesh.rotation.z += p.rotVel.z * dt;
        }
        p.mesh.material.opacity = 1 - t * 0.5;
        p.mesh.material.transparent = true;
      } else if (p.type === 'smoke') {
        p.vel.y -= 0.3 * dt; // slow rise
        p.mesh.material.opacity = 0.6 * (1 - t);
        // Grow over time
        const scale = p.startSize * (1 + t * 2);
        p.mesh.scale.setScalar(scale);
      } else if (p.type === 'flash') {
        p.mesh.material.opacity = 1 - t;
        const scale = 0.8 + t * 1.5;
        p.mesh.scale.setScalar(scale);
      } else if (p.type === 'successFlash') {
        p.mesh.material.opacity = 0.8 * (1 - t);
        p.mesh.scale.setScalar(0.15 + t * 0.3);
      } else if (p.type === 'spark') {
        p.vel.y -= 3 * dt;
        p.mesh.material.opacity = 1 - t;
        p.mesh.scale.setScalar(p.mesh.scale.x * (1 - dt * 3));
      }
    }
  }

  clear() {
    for (const p of this.particles) {
      this.scene.remove(p.mesh);
      p.mesh.geometry !== particleSphereGeo && p.mesh.geometry !== debrisGeo && p.mesh.geometry.dispose();
      p.mesh.material.dispose();
    }
    this.particles = [];
  }
}
