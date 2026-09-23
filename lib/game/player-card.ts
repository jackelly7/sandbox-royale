import * as THREE from 'three';
import { canReach } from './chests.ts';
import { smokeBlocks, type Smoke } from './battlefield.ts';
import type { Bounds } from './movement.ts';

const samples = [
  [0, 1.25, 0],
  [0, 1.95, 0],
  [0, 0.4, 0],
  [-0.3, 1.25, 0],
  [0.3, 1.25, 0],
];
const eye = new THREE.Vector3(),
  target = new THREE.Vector3(),
  clip = new THREE.Vector3();
// Test the character itself: a card above cover must not reveal a hidden player.
export function playerBodyVisible(
  camera: THREE.Camera,
  body: THREE.Object3D,
  boxes: readonly Bounds[],
  smokes: Smoke[],
  now: number,
) {
  if (!body.visible) return false;
  camera.updateWorldMatrix(true, false);
  body.updateWorldMatrix(true, false);
  eye.setFromMatrixPosition(camera.matrixWorld);
  return samples.some(([x, y, z]) => {
    target.set(x, y, z).applyMatrix4(body.matrixWorld);
    clip.copy(target).project(camera);
    return (
      Math.abs(clip.x) <= 1 &&
      Math.abs(clip.y) <= 1 &&
      Math.abs(clip.z) <= 1 &&
      canReach(eye, target, boxes, 85) &&
      !smokeBlocks(eye, target, smokes, now)
    );
  });
}
