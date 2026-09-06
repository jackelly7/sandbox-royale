import * as THREE from 'three';
import { REBOOT_STATIONS, type ComebackToken } from './comeback.ts';
import { modelKit } from './model-kit.ts';
export class ComebackModels {
  root = new THREE.Group();
  stations: THREE.Group[] = [];
  tokens = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.55, 0.55, 0.14, 8),
    new THREE.MeshBasicMaterial({ color: '#7fffd2' }),
    16,
  );
  matrix = new THREE.Matrix4();
  constructor() {
    for (const s of REBOOT_STATIONS) {
      const k = modelKit('Comeback station');
      k.box(1.4, 0.7, 1.4, '#ddbd7b', 0, 0.35, 0);
      k.box(1.6, 0.15, 1.6, '#80e9c2', 0, 0.8, 0);
      for (const x of [-0.65, 0.65])
        for (const z of [-0.65, 0.65])
          k.box(0.3, 0.45, 0.3, '#eddb9e', x, 1, z);
      k.box(0.1, 2.5, 0.1, '#6a675c', 0, 1.8, 0);
      k.box(0.9, 0.7, 0.06, '#74f5c4', 0.4, 2.8, 0);
      const model = k.finish();
      model.position.set(s.x, 0, s.z);
      this.stations.push(model);
      this.root.add(model);
    }
    this.tokens.frustumCulled = false;
    this.tokens.count = 0;
    this.root.add(this.tokens);
  }
  update(
    tokens: ComebackToken[],
    team: number | undefined,
    open: boolean,
    time: number,
  ) {
    this.root.visible = open;
    let n = 0;
    for (const t of tokens) {
      if (t.team !== team || t.carriedBy) continue;
      this.matrix.makeRotationZ(Math.PI / 2);
      this.matrix.setPosition(t.x, 1.2 + Math.sin(time * 3) * 0.15, t.z);
      this.tokens.setMatrixAt(n++, this.matrix);
    }
    this.tokens.count = n;
    this.tokens.instanceMatrix.needsUpdate = true;
  }
}
