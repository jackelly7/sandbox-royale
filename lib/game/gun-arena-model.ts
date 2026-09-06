import * as THREE from 'three';
import { ARENA_BLOCKS } from './gun-arena.ts';
import { modelKit } from './model-kit.ts';
export function gunArenaModel() {
  const k = modelKit('Sandcastle courtyard');
  k.box(96, 0.6, 88, '#b77954', 0, -0.65, 0);
  k.box(76, 0.4, 68, '#e9ce96', 0, -0.2, 0);
  for (const b of ARENA_BLOCKS)
    if (b.role !== 'ramp') k.box(b.w, b.h, b.d, b.color, b.x, b.y, b.z);
  for (const side of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(11.2, 0);
    shape.lineTo(0, 3.5);
    shape.closePath();
    const ramp = new THREE.ExtrudeGeometry(shape, {
      depth: 5,
      bevelEnabled: false,
    });
    ramp.rotateY(-Math.PI / 2);
    ramp.translate(2.5, 0, 6);
    k.add(ramp, '#dfbd80', side * 23, 0, 0);
    // A rim and handle make the elevated forts read as toy buckets.
    k.box(0.35, 1.7, 0.35, '#fff0c4', side * 27.5, 4.4, -4);
    k.box(0.35, 1.7, 0.35, '#fff0c4', side * 18.5, 4.4, -4);
    k.box(9.3, 0.35, 0.35, '#fff0c4', side * 23, 5.25, -4);
    k.box(0.15, 3, 0.15, '#685948', side * 23, 5, -5);
    k.box(2.2, 1, 0.1, side < 0 ? '#46a6d5' : '#bf72ce', side * 23 + 1, 6, -5);
  }
  for (let x = -36; x <= 36; x += 4)
    for (const z of [-34, 34]) k.box(2.2, 0.9, 2, '#f1d9a5', x, 7.45, z);
  // Raked lanes guide players between the fort, courtyard and covered routes.
  for (const x of [-14, 14])
    for (let z = -28; z <= 28; z += 3)
      k.box(0.08, 0.015, 1.4, '#d4b681', x, 0.015, z);
  return k.finish();
}
