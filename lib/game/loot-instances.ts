import * as THREE from 'three';
type Drop = { mesh: THREE.Group; kind: number; used: boolean };
export class LootInstances {
  root = new THREE.Group();
  batches: {
    mesh: THREE.InstancedMesh;
    drops: Drop[];
    animated: boolean;
    offset: number;
  }[] = [];
  matrix = new THREE.Matrix4();
  constructor(drops: Drop[]) {
    this.root.name = 'Instanced supplies';
    // Quadrants retain useful frustum culling. Rings and beams share geometry
    // across all five item types, with color set once per instance.
    const groups = new Map<string, { drop: Drop; part: number }[]>();
    for (const drop of drops)
      for (let part = 0; part < 3; part++) {
        const p = drop.mesh.position;
        const key = `${p.x < 0 ? 0 : 1}:${p.z < 0 ? 0 : 1}:${part}:${part === 0 ? drop.kind : 'all'}`;
        const entries = groups.get(key) ?? [];
        entries.push({ drop, part });
        groups.set(key, entries);
      }
    const colors = ['#85e2bc', '#ffc06a', '#cf9cf4', '#78dfee', '#ff7474'];
    for (const entries of groups.values()) {
      const { drop, part } = entries[0];
      const object = drop.mesh.children[part];
      object.updateMatrix();
      const source = (part === 0 ? object.children[0] : object) as THREE.Mesh;
      source.updateMatrix();
      const geometry = source.geometry.clone();
      geometry.applyMatrix4(
        part === 0
          ? new THREE.Matrix4().multiplyMatrices(object.matrix, source.matrix)
          : object.matrix,
      );
      const material =
        part === 0
          ? (source.material as THREE.Material).clone()
          : new THREE.MeshBasicMaterial({
              color: '#ffffff',
              transparent: true,
              opacity: part === 1 ? 0.32 : 0.14,
              depthWrite: false,
            });
      const mesh = new THREE.InstancedMesh(geometry, material, entries.length);
      mesh.name =
        part === 0
          ? 'Supply models'
          : part === 1
            ? 'Supply rings'
            : 'Supply beacons';
      if (part === 0) mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      entries.forEach(({ drop }, i) => {
        this.matrix.makeTranslation(
          drop.mesh.position.x,
          0,
          drop.mesh.position.z,
        );
        mesh.setMatrixAt(i, this.matrix);
        if (part !== 0) mesh.setColorAt(i, new THREE.Color(colors[drop.kind]));
      });
      mesh.computeBoundingSphere();
      if (mesh.boundingSphere) mesh.boundingSphere.radius += 1;
      this.root.add(mesh);
      this.batches.push({
        mesh,
        drops: entries.map((e) => e.drop),
        animated: part === 0,
        offset: part === 0 ? 0.85 - object.position.y : 0,
      });
    }
    drops.forEach((d) =>
      d.mesh.children.forEach((o) => {
        o.visible = false;
      }),
    );
  }
  update(time: number) {
    for (const batch of this.batches) {
      let changed = batch.animated;
      batch.drops.forEach((drop, i) => {
        if (!batch.animated && drop.mesh.userData.lastUsed === drop.used)
          return;
        changed = true;
        if (drop.used) this.matrix.makeScale(0, 0, 0);
        else {
          this.matrix.makeRotationY(batch.animated ? time * 0.7 : 0);
          this.matrix.setPosition(
            drop.mesh.position.x,
            batch.animated ? Math.sin(time * 2) * 0.15 + batch.offset : 0,
            drop.mesh.position.z,
          );
        }
        batch.mesh.setMatrixAt(i, this.matrix);
      });
      if (changed) batch.mesh.instanceMatrix.needsUpdate = true;
    }
    this.batches.forEach((batch) =>
      batch.drops.forEach((d) => {
        d.mesh.userData.lastUsed = d.used;
      }),
    );
  }
}
