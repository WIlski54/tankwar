import * as THREE from "three";

const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

export class ParticlePool {
  constructor(scene, capacity = 1400) {
    this.capacity = capacity;
    this.geometry = new THREE.BoxGeometry(1, 1, 1);
    this.material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: 0.94,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, capacity);
    this.mesh.name = "PooledEffects";
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.active = [];
    this.free = Array.from({ length: capacity }, (_, index) => capacity - 1 - index);
    this.matrix = new THREE.Matrix4();
    this.quaternion = new THREE.Quaternion();
    this.scale = new THREE.Vector3();
    this.color = new THREE.Color();
    for (let index = 0; index < capacity; index += 1) {
      this.mesh.setMatrixAt(index, hiddenMatrix);
      this.mesh.setColorAt(index, this.color.setRGB(0, 0, 0));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    scene.add(this.mesh);
  }

  spawn({
    position,
    velocity,
    color,
    life = 0.7,
    scale = [0.1, 0.1, 0.35],
    gravity = 10,
    spin = null,
    grow = 0,
  }) {
    const slot = this.free.pop();
    if (slot === undefined) return false;
    const particle = {
      slot,
      position: position.clone(),
      velocity: velocity.clone(),
      color: new THREE.Color(color),
      life,
      maxLife: life,
      baseScale: new THREE.Vector3(...scale),
      gravity,
      rotation: new THREE.Euler(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
      ),
      spin: spin ?? new THREE.Vector3(
        (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 6,
      ),
      grow,
    };
    this.active.push(particle);
    this.writeParticle(particle, 1);
    return true;
  }

  writeParticle(particle, fraction) {
    this.quaternion.setFromEuler(particle.rotation);
    const size = particle.grow
      ? 1 + particle.grow * (1 - fraction)
      : Math.min(1, fraction * 3.5);
    this.scale.copy(particle.baseScale).multiplyScalar(size);
    this.matrix.compose(particle.position, this.quaternion, this.scale);
    this.mesh.setMatrixAt(particle.slot, this.matrix);
    this.mesh.setColorAt(particle.slot, this.color.copy(particle.color).multiplyScalar(
      0.3 + fraction * 0.7,
    ));
  }

  update(dt) {
    for (let index = this.active.length - 1; index >= 0; index -= 1) {
      const particle = this.active[index];
      particle.life -= dt;
      if (particle.life <= 0) {
        this.mesh.setMatrixAt(particle.slot, hiddenMatrix);
        this.free.push(particle.slot);
        this.active.splice(index, 1);
        continue;
      }
      particle.velocity.y -= particle.gravity * dt;
      particle.position.addScaledVector(particle.velocity, dt);
      particle.rotation.x += particle.spin.x * dt;
      particle.rotation.y += particle.spin.y * dt;
      particle.rotation.z += particle.spin.z * dt;
      this.writeParticle(particle, particle.life / particle.maxLife);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear() {
    for (const particle of this.active) {
      this.mesh.setMatrixAt(particle.slot, hiddenMatrix);
      this.free.push(particle.slot);
    }
    this.active.length = 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  get count() {
    return this.active.length;
  }
}

export class ShellPool {
  constructor(scene) {
    this.scene = scene;
    this.geometry = new THREE.SphereGeometry(1, 10, 10);
    this.materials = new Map();
    this.available = [];
  }

  material(color) {
    const key = new THREE.Color(color).getHex();
    if (!this.materials.has(key)) {
      this.materials.set(key, new THREE.MeshBasicMaterial({
        color: key,
        toneMapped: false,
      }));
    }
    return this.materials.get(key);
  }

  acquire(color, radius) {
    const mesh = this.available.pop() ?? this.createMesh();
    mesh.material = this.material(color);
    mesh.scale.setScalar(radius);
    mesh.visible = true;
    this.scene.add(mesh);
    return mesh;
  }

  createMesh() {
    return new THREE.Mesh(this.geometry, this.material(0xffffff));
  }

  release(mesh) {
    this.scene.remove(mesh);
    mesh.visible = false;
    mesh.position.set(0, -999, 0);
    this.available.push(mesh);
  }
}
