import * as THREE from 'three';
import { WEAPONS } from './rules.ts';
import { batchIsland } from './render-world.ts';

// Shared silhouettes for held weapons and world drops. Forward is negative Z.
export function weaponModel(index: number) {
  const group = new THREE.Group();
  group.name = WEAPONS[index].short;
  const metal = new THREE.MeshStandardMaterial({
    color: '#263b43',
    roughness: 0.65,
  });
  const accent = new THREE.MeshStandardMaterial({
    color: WEAPONS[index].color,
    roughness: 0.8,
  });
  const wood = new THREE.MeshStandardMaterial({
    color: '#a4653c',
    roughness: 0.95,
  });
  const part = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    material = metal,
  ) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };
  const barrel = (
    radius: number,
    length: number,
    x: number,
    y: number,
    z: number,
    material = metal,
  ) => {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, length, 8),
      material,
    );
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };
  if (index === 0) {
    part(0.17, 0.17, 0.52, 0, 0, 0);
    part(0.18, 0.1, 0.36, 0, 0.09, -0.18, accent);
    barrel(0.035, 0.45, 0, 0.01, -0.48);
    part(0.13, 0.29, 0.16, 0, -0.18, -0.12, accent).rotation.x = 0.2;
    part(0.12, 0.24, 0.1, 0, -0.17, 0.18).rotation.x = -0.25;
    part(0.16, 0.2, 0.3, 0, -0.01, 0.37);
    part(0.035, 0.07, 0.06, 0, 0.16, -0.22);
  } else if (index === 1) {
    part(0.22, 0.2, 0.4, 0, 0, 0.02);
    barrel(0.055, 0.74, 0, 0.04, -0.44);
    barrel(0.045, 0.56, 0, -0.065, -0.37);
    part(0.23, 0.16, 0.25, 0, -0.035, -0.27, wood);
    for (let i = 0; i < 4; i++)
      part(0.24, 0.02, 0.025, 0, 0.055, -0.36 + i * 0.05, accent);
    part(0.17, 0.23, 0.43, 0, -0.055, 0.41, wood);
    part(0.045, 0.06, 0.05, 0, 0.12, -0.77, accent);
  } else {
    part(0.16, 0.17, 0.55, 0, 0, 0, accent);
    barrel(0.03, 0.78, 0, 0.025, -0.63);
    barrel(0.05, 0.12, 0, 0.025, -1.04);
    part(0.15, 0.22, 0.35, 0, -0.025, 0.42, accent);
    part(0.11, 0.2, 0.12, 0, -0.14, 0.1);
    part(0.09, 0.05, 0.24, 0, 0.13, -0.03);
    barrel(0.07, 0.36, 0, 0.22, -0.06);
    barrel(0.085, 0.09, 0, 0.22, -0.26);
    const lens = new THREE.MeshStandardMaterial({
      color: '#85f5ed',
      emissive: '#238886',
      emissiveIntensity: 0.4,
    });
    barrel(0.065, 0.01, 0, 0.22, -0.31, lens);
    part(0.025, 0.26, 0.035, -0.08, -0.14, -0.45).rotation.z = -0.35;
    part(0.025, 0.26, 0.035, 0.08, -0.14, -0.45).rotation.z = 0.35;
  }
  batchIsland(group, [], Infinity);
  return group;
}
