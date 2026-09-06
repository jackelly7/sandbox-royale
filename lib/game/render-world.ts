import { ARENA_SCALE } from './arena.ts';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Bake stationary meshes into spatial chunks. Original collision meshes remain
// available to raycasts but no longer submit individual drawing commands.
export function batchIsland(
  world: THREE.Group,
  dynamic: THREE.Object3D[],
  cellSize = 45 * ARENA_SCALE,
) {
  const excluded = new Set<THREE.Object3D>();
  dynamic.forEach((root) => root.traverse((object) => excluded.add(object)));
  world.updateMatrixWorld(true);
  const sources: THREE.Mesh[] = [];
  const chunks = new Map<string, THREE.BufferGeometry[]>();
  world.traverse((object) => {
    if (
      !(object instanceof THREE.Mesh) ||
      object instanceof THREE.InstancedMesh ||
      excluded.has(object) ||
      object.userData.dynamic
    )
      return;
    if (!(object.material instanceof THREE.MeshStandardMaterial)) return;
    sources.push(object);
    const geometry = object.geometry.index
      ? object.geometry.toNonIndexed()
      : object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    const existingColors = geometry.getAttribute('color');
    for (const name of Object.keys(geometry.attributes))
      if (name !== 'position' && name !== 'normal' && name !== 'color')
        geometry.deleteAttribute(name);
    const count = geometry.getAttribute('position').count;
    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    geometry.computeBoundingBox();
    const low = geometry.boundingBox!.min.y,
      height = Math.max(0.01, geometry.boundingBox!.max.y - low);
    const colors = new Float32Array(count * 3);
    const tint = object.material.color;
    for (let i = 0; i < count; i++) {
      const shade = existingColors
        ? 1
        : 0.84 +
          (0.12 * (positions.getY(i) - low)) / height +
          0.04 * Math.max(0, normals.getY(i));
      colors[i * 3] =
        tint.r * (existingColors ? existingColors.getX(i) : shade);
      colors[i * 3 + 1] =
        tint.g * (existingColors ? existingColors.getY(i) : shade);
      colors[i * 3 + 2] =
        tint.b * (existingColors ? existingColors.getZ(i) : shade);
    }
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
