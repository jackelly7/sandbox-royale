import * as THREE from 'three';
// Clip a small camera volume along the boom, including corners and thin walls.
export function shoulderCamera(
  eye: THREE.Vector3,
  yaw: number,
  pitch: number,
  aiming: boolean,
  boxes: THREE.Box3[],
) {
  const forward = new THREE.Vector3(
    -Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch),
  );
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const desired = eye
    .clone()
    .addScaledVector(forward, aiming ? -2.3 : -4.3)
    .addScaledVector(right, aiming ? 0.6 : 0.8);
  desired.y += aiming ? 0.3 : 0.65;
  const direction = desired.clone().sub(eye),
    length = direction.length();
  const ray = new THREE.Ray(eye, direction.normalize());
  const box = new THREE.Box3(),
    hit = new THREE.Vector3();
  let distance = length;
  for (const solid of boxes) {
    box.copy(solid).expandByScalar(0.2);
    if (box.containsPoint(eye)) {
      distance = 0;
      break;
    }
    if (ray.intersectBox(box, hit))
      distance = Math.min(distance, Math.max(0, eye.distanceTo(hit) - 0.08));
  }
  if (direction.y < 0)
    distance = Math.min(distance, Math.max(0, (eye.y - 0.25) / -direction.y));
  return {
    position: eye.clone().addScaledVector(direction, distance),
    target: eye.clone().addScaledVector(forward, 30),
    distance,
  };
}
export function convergedAim(origin: THREE.Vector3, target: THREE.Vector3) {
  const d = target.clone().sub(origin).normalize();
  return {
    yaw: Math.atan2(-d.x, -d.z),
    pitch: Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)),
  };
}
