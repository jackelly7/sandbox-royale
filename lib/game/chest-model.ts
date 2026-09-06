import * as THREE from 'three';
import { modelKit } from './model-kit.ts';
export function chestModel() {
  const root = new THREE.Group();
  root.name = 'Toy treasure chest';
  const body = modelKit('Chest base');
  body.box(1.65, 0.85, 1.1, '#cc743b', 0, 0.48, 0);
  for (const x of [-0.56, 0.56])
    body.box(0.14, 0.88, 1.14, '#ffcc4d', x, 0.48, 0);
  body.box(0.28, 0.32, 0.13, '#ffdc63', 0, 0.84, 0.6);
  body.box(0.08, 0.12, 0.025, '#45332c', 0, 0.85, 0.68);
  for (const y of [0.24, 0.5, 0.72])
    body.add(new THREE.PlaneGeometry(1.62, 0.018), '#9c532c', 0, y, 0.57);
  for (const x of [-0.56, 0.56])
    for (const y of [0.2, 0.72])
      body.add(new THREE.PlaneGeometry(0.04, 0.045), '#fff2af', x, y, 0.61);
  root.add(body.finish());
  const top = modelKit('Chest lid');
  top.box(1.7, 0.4, 1.15, '#e59a4a', 0, 0.16, 0.55);
  for (const x of [-0.56, 0.56])
    top.box(0.15, 0.42, 1.19, '#ffdc63', x, 0.16, 0.55);
  const hinge = top.finish();
  hinge.name = 'Chest hinge';
  hinge.position.set(0, 0.9, -0.55);
  root.add(hinge);
  const glow = new THREE.Mesh(
    new THREE.RingGeometry(0.95, 1.3, 8),
    new THREE.MeshBasicMaterial({
      color: '#ffd04a',
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.06;
  glow.name = 'Chest glow';
  root.add(glow);
  root.traverse((o) => {
    o.userData.dynamic = true;
  });
  return root;
}

import { CHEST_SPOTS, type ChestState } from './chests.ts';
export class ChestInstances {
  root = new THREE.Group();
  angles = CHEST_SPOTS.map(() => 0);
  parts: THREE.InstancedMesh[] = [];
  matrix = new THREE.Matrix4();
  local = new THREE.Matrix4();
  indices: number[];
  constructor(chests: ChestState[]) {
    this.indices = chests.flatMap((c, i) => (c.active ? [i] : []));
    const prototype = chestModel();
    const sources = [
      prototype.children[0].children[0],
      prototype.children[1].children[0],
      prototype.children[2],
    ] as THREE.Mesh[];
    this.root.name = 'Instanced treasure chests';
    for (const source of sources) {
      const mesh = new THREE.InstancedMesh(
        source.geometry,
        source.material,
        this.indices.length,
      );
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < this.indices.length; i++) {
        const p = CHEST_SPOTS[this.indices[i]];
        this.matrix.makeTranslation(p.x, 0, p.z);
        mesh.setMatrixAt(i, this.matrix);
      }
      mesh.computeBoundingSphere();
      if (mesh.boundingSphere) mesh.boundingSphere.radius += 3;
      this.parts.push(mesh);
      this.root.add(mesh);
    }
  }
  update(chests: ChestState[], dt: number) {
    for (let slot = 0; slot < this.indices.length; slot++) {
      const i = this.indices[slot];
      const c = chests[i],
        p = CHEST_SPOTS[i];
      this.angles[i] +=
        ((c?.openedAt ? -1.8 : 0) - this.angles[i]) * Math.min(1, dt * 9);
      for (let part = 0; part < 3; part++) {
        if (!c?.active || (part === 2 && c.openedAt))
          this.matrix.makeScale(0, 0, 0);
        else {
          this.matrix.makeTranslation(p.x, 0, p.z);
          if (part === 1) {
            this.local.makeRotationX(this.angles[i]);
            this.local.setPosition(0, 0.9, -0.55);
            this.matrix.multiply(this.local);
          }
          if (part === 2) {
            this.local.makeRotationX(-Math.PI / 2);
            this.local.setPosition(0, 0.06, 0);
            this.matrix.multiply(this.local);
          }
        }
        this.parts[part].setMatrixAt(slot, this.matrix);
      }
    }
    for (const mesh of this.parts) mesh.instanceMatrix.needsUpdate = true;
  }
}
