import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Bake stationary meshes into spatial chunks. Original collision meshes remain
// available to raycasts but no longer submit individual drawing commands.
export function batchIsland(
  world: THREE.Group,
  dynamic: THREE.Object3D[],
  cellSize = 45,
) {
  const excluded = new Set<THREE.Object3D>();
  dynamic.forEach((root) => root.traverse((object) => excluded.add(object)));
  world.updateMatrixWorld(true);
  const sources: THREE.Mesh[] = [];
  const chunks = new Map<string, THREE.BufferGeometry[]>();
  world.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || excluded.has(object)) return;
    if (!(object.material instanceof THREE.MeshStandardMaterial)) return;
    sources.push(object);
    const geometry = object.geometry.index
      ? object.geometry.toNonIndexed()
      : object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    for (const name of Object.keys(geometry.attributes))
      if (name !== 'position' && name !== 'normal')
        geometry.deleteAttribute(name);
    const count = geometry.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++)
      object.material.color.toArray(colors, i * 3);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const point = new THREE.Vector3().setFromMatrixPosition(object.matrixWorld);
    const key = `${Math.floor(point.x / cellSize)},${Math.floor(point.z / cellSize)}`;
    const list = chunks.get(key) ?? [];
    list.push(geometry);
    chunks.set(key, list);
  });
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
  });
  for (const geometries of chunks.values()) {
    const geometry = mergeGeometries(geometries);
    if (!geometry) throw new Error('Island geometry could not be combined');
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'Island terrain batch';
    world.add(mesh);
    geometries.forEach((g) => g.dispose());
  }
  for (const mesh of sources) {
    mesh.removeFromParent();
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  }
  return { before: sources.length, after: chunks.size };
}
