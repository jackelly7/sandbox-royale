import * as THREE from 'three';
import { batchIsland } from './render-world.ts';

export function parachuteModel() {
  const group = new THREE.Group();
  group.name = 'Parachute';
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(3.3, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({
      color: '#ffffff',
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 1,
    }),
  );
  const position = canopy.geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const angle = Math.atan2(position.getZ(i), position.getX(i));
    const segment = Math.floor(((angle + Math.PI) / Math.PI) * 6);
    new THREE.Color(
      segment % 3 === 0 ? '#e9dfb9' : segment % 3 === 1 ? '#5eada7' : '#efad62',
    ).toArray(colors, i * 3);
  }
  canopy.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  canopy.scale.y = 0.4;
  canopy.position.y = 5;
  group.add(canopy);
  for (const x of [-1, 1])
    for (const z of [-1, 1]) {
      const bottom = new THREE.Vector3(x * 0.35, 1.4, z * 0.15);
      const top = new THREE.Vector3(x * 2.2, 5, z * 2.2);
      const delta = top.clone().sub(bottom);
      const cord = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, delta.length(), 4),
        new THREE.MeshStandardMaterial({ color: '#e9f3de' }),
      );
      cord.position.copy(bottom.add(top).multiplyScalar(0.5));
      cord.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        delta.normalize(),
      );
      group.add(cord);
    }
  batchIsland(group, [], Infinity);
  group.traverse((object) => {
    object.raycast = () => {};
    if (object instanceof THREE.Mesh) object.material.side = THREE.DoubleSide;
  });
  return group;
}
