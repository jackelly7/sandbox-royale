import * as THREE from 'three';
export const PARTICLE_LIMIT = 96;
// One draw call and a fixed pool, independent of the number of shots fired.
export class ActionParticles {
  mesh = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(1, 0),
    new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }),
    PARTICLE_LIMIT,
  );
  particles = Array.from({ length: PARTICLE_LIMIT }, () => ({
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    life: 0,
    total: 1,
    size: 0.1,
    kind: '',
  }));
  cursor = 0;
  matrix = new THREE.Matrix4();
  dummy = new THREE.Object3D();
  color = new THREE.Color();
  constructor() {
    this.mesh.name = 'Pooled sand sparks and casings';
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.matrix.makeScale(0, 0, 0);
    for (let i = 0; i < PARTICLE_LIMIT; i++)
      this.mesh.setMatrixAt(i, this.matrix);
    this.mesh.visible = false;
  }
  burst(
    at: { x: number; y: number; z: number },
    kind: 'sand' | 'shield' | 'elimination' | 'casing',
    count = 5,
  ) {
    for (let n = 0; n < count; n++) {
      const i = this.cursor++ % PARTICLE_LIMIT,
        p = this.particles[i],
        angle = i * 2.399;
      Object.assign(p, {
        x: at.x,
        y: at.y,
        z: at.z,
        vx: Math.cos(angle) * (kind === 'casing' ? 2 : 1.8),
        vy: kind === 'elimination' ? 3.4 : 1.4 + (i % 4) * 0.35,
        vz: Math.sin(angle) * 1.8,
        life: kind === 'casing' ? 0.7 : 0.48,
        total: kind === 'casing' ? 0.7 : 0.48,
        size: kind === 'elimination' ? 0.08 : kind === 'casing' ? 0.035 : 0.055,
        kind,
      });
      this.color.set(
        kind === 'shield'
          ? '#77e6ff'
          : kind === 'casing'
            ? '#eeb655'
            : kind === 'elimination'
              ? ['#80ebd1', '#ffba76', '#c7adff'][i % 3]
              : '#e5c08a',
      );
      this.mesh.setColorAt(i, this.color);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.visible = true;
  }
  update(dt: number) {
    if (!this.mesh.visible) return;
    let alive = 0;
    this.particles.forEach((p, i) => {
      p.life = Math.max(0, p.life - dt);
      if (!p.life) {
        this.matrix.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, this.matrix);
        return;
      }
      alive++;
      p.vy -= dt * 7;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.035) {
        p.y = 0.035;
        p.vy = Math.abs(p.vy) * 0.25;
      }
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.rotation.set(p.life * 7, i + p.life * 5, 0);
      const scale = p.size * Math.min(1, p.life / 0.12);
      this.dummy.scale.set(
        scale,
        p.kind === 'casing' ? scale * 2.4 : scale,
        scale,
      );
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.visible = alive > 0;
  }
  clear() {
    this.particles.forEach((p) => (p.life = 0));
    this.update(0);
    this.mesh.visible = false;
  }
}
