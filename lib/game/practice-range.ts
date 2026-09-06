import * as THREE from 'three';
import { modelKit } from './model-kit.ts';
export const RANGE_TARGETS = [
  { x: -8, z: 20 },
  { x: 0, z: -5 },
  { x: 8, z: -40 },
];
export function practiceRange() {
  const root = new THREE.Group();
  root.name = 'Practice range';
  const k = modelKit('Range scenery');
  k.box(30, 0.4, 100, '#e7c88f', 0, -0.22, -5);
  for (const x of [-15, 15]) {
    k.box(0.5, 2, 100, '#b37b4f', x, 1, -5);
    k.box(0.7, 0.2, 100, '#e7bc7b', x, 2, -5);
  }
  k.box(30, 4, 0.5, '#b37b4f', 0, 2, -55);
  k.box(30, 1, 0.5, '#b37b4f', 0, 0.5, 45);
  for (let z = -50; z < 40; z += 5)
    for (const x of [-12, 12]) k.box(0.1, 0.015, 2, '#fff0ca', x, 0, z);
  root.add(k.finish());
  const targets = RANGE_TARGETS.map((p, i) => {
    const kit = modelKit('Practice target');
    kit.box(0.14, 1.3, 0.16, '#8d623e', 0, 0.6, 0);
    kit.box(1.2, 1.6, 0.18, '#203c4a', 0, 1.6, 0, 0.1);
    kit.box(
      0.85,
      1.2,
      0.04,
      ['#ff946b', '#6be6d0', '#bc9bff'][i],
      0,
      1.6,
      0.12,
      0.08,
    );
    kit.tube(0.28, 0.035, '#fff5d5', 0, 1.65, 0.16, 12);
    kit.tube(0.12, 0.04, '#203c4a', 0, 1.65, 0.19, 10);
    const t = kit.finish();
    t.position.set(p.x, 0, p.z);
    t.traverse((o) => (o.userData.practiceTarget = i));
    root.add(t);
    return t;
  });
  return { root, targets };
}
