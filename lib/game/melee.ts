import type { Bounds, Point } from './movement.ts';
export const MELEE = {
  damage: 25,
  range: 2.6,
  interval: 0.65,
  animation: 0.42,
};
export type MeleeBody = Bounds & { id: string };
// The same short cone and solid-cover check runs in solo and on the server.
export function meleeTarget(
  origin: Point,
  yaw: number,
  pitch: number,
  targets: MeleeBody[],
  walls: Bounds[],
) {
  const forward = [
    -Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch),
  ];
  let closest: {
    id: string;
    point: [number, number, number];
    distance: number;
  } | null = null;
  for (const body of targets) {
    const point: [number, number, number] = [
      (body.min[0] + body.max[0]) / 2,
      Math.max(body.min[1] + 0.1, Math.min(body.max[1] - 0.1, origin.y)),
      (body.min[2] + body.max[2]) / 2,
    ];
    const delta = [
      point[0] - origin.x,
      point[1] - origin.y,
      point[2] - origin.z,
    ];
    const distance = Math.hypot(...delta);
    if (distance > MELEE.range || (closest && distance >= closest.distance))
      continue;
    if (
      distance > 0.01 &&
      delta.reduce((sum, value, i) => sum + value * forward[i], 0) / distance <
        Math.cos(0.7)
    )
      continue;
    const start = [origin.x, origin.y, origin.z];
    const blocked = walls.some((wall) => {
      let near = 0,
        far = 1;
      for (let axis = 0; axis < 3; axis++) {
        if (Math.abs(delta[axis]) < 1e-8) {
          if (start[axis] < wall.min[axis] || start[axis] > wall.max[axis])
            return false;
        } else {
          const a = (wall.min[axis] - start[axis]) / delta[axis],
            b = (wall.max[axis] - start[axis]) / delta[axis];
          near = Math.max(near, Math.min(a, b));
          far = Math.min(far, Math.max(a, b));
          if (near > far) return false;
        }
      }
      return near < 0.999 && far >= 0;
    });
    if (!blocked) closest = { id: body.id, point, distance };
  }
  return closest;
}
export function meleeBody(
  id: string,
  x: number,
  y: number,
  z: number,
  crouching = false,
  downed = false,
): MeleeBody {
  return {
    id,
    min: [x - 0.47, y - 1.68, z - 0.32],
    max: [
      x + 0.47,
      y - 1.7 + (downed ? 0.85 : crouching ? 1.5 : 2.28),
      z + 0.32,
    ],
  };
}
