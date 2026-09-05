import * as THREE from 'three';
import { modelKit } from './model-kit.ts';
export function launchPadModel() {
  const k = modelKit('Toy launch pad');
  k.add(
    new THREE.CylinderGeometry(2.6, 2.6, 0.12, 6, 1, true),
    '#343e49',
    0,
    0.06,
    0,
  );
  const base = k.add(new THREE.CircleGeometry(2.6, 6), '#343e49', 0, 0.13, 0);
  base.rotation.x = -Math.PI / 2;
  const ring = k.add(
    new THREE.RingGeometry(1.7, 2.2, 6),
    '#71eaca',
    0,
    0.14,
    0,
  );
  ring.rotation.x = -Math.PI / 2;
  for (const x of [-1, 1]) {
    const arrow = k.add(
      new THREE.PlaneGeometry(0.24, 1.1),
      '#71eaca',
      x * 0.35,
      0.15,
      0,
    );
    arrow.rotation.set(-Math.PI / 2, 0, x * 0.6);
  }
  return k.finish();
}
export function dropBusModel() {
  const k = modelKit('Sandbox drop bus');
  k.box(4, 2.6, 9, '#f6c955', 0, 0, 0, 0.25);
  k.box(3.8, 0.45, 8.8, '#343e49', 0, -1.35, 0);
  k.box(3.65, 1, 0.08, '#86cedc', 0, 0.45, -4.52);
  for (const side of [-1, 1]) {
    for (let z = -3; z <= 3; z += 1.5)
      k.box(0.08, 0.9, 1.15, '#86cedc', side * 2.02, 0.5, z);
    for (const z of [-2.8, 2.8]) {
      const wheel = k.tube(0.7, 0.35, '#343e49', side * 2, -1.15, z, 8);
      wheel.rotation.set(0, 0, Math.PI / 2);
    }
    k.box(0.15, 5, 0.15, '#343e49', side * 1.4, 3.4, 0);
  }
  const balloon = k.add(
    new THREE.SphereGeometry(4, 10, 6),
    '#71eaca',
    0,
    7.5,
    0,
  );
  balloon.scale.set(1.1, 1.2, 1.5);
  return k.finish();
}
