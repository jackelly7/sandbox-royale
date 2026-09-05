export type Bounds = { min: readonly number[]; max: readonly number[] };
export type Point = { x: number; y: number; z: number };
export const MOVE = {
  run: 10,
  sprint: 14.5,
  crouch: 4.8,
  jump: 8.5,
  eye: 1.7,
  mantleSeconds: 0.42,
};
export function smoothVelocity(current: number, target: number, dt: number) {
  return (
    current +
    (target - current) * (1 - Math.exp(-dt * (target === 0 ? 22 : 16)))
  );
}
export function blocksBody(
  x: number,
  z: number,
  feet: number,
  boxes: readonly Bounds[],
) {
  return boxes.some(
    (b) =>
      b.max[1] > feet + 0.08 &&
      b.min[1] < feet + 1.8 &&
      x > b.min[0] - 0.46 &&
      x < b.max[0] + 0.46 &&
      z > b.min[2] - 0.46 &&
      z < b.max[2] + 0.46,
  );
}
export function groundAt(
  x: number,
  z: number,
  feet: number,
  boxes: readonly Bounds[],
) {
  let top = 0;
  for (const b of boxes)
    if (
      b.max[1] <= feet + 0.12 &&
      b.max[1] > top &&
      x > b.min[0] - 0.25 &&
      x < b.max[0] + 0.25 &&
      z > b.min[2] - 0.25 &&
      z < b.max[2] + 0.25
    )
      top = b.max[1];
  return top;
}
export function mantleTarget(
  p: Point,
  yaw: number,
  boxes: readonly Bounds[],
): Point | null {
  const dx = -Math.sin(yaw),
    dz = -Math.cos(yaw),
    feet = p.y - MOVE.eye;
  let nearest = Infinity,
    result: Point | null = null;
  for (const b of boxes) {
    const rise = b.max[1] - feet;
    if (rise < 0.4 || rise > 3 || b.min[1] > feet + 0.3) continue;
    let near = 0,
      far = 2;
    for (const [v, d, min, max] of [
      [p.x, dx, b.min[0], b.max[0]],
      [p.z, dz, b.min[2], b.max[2]],
    ]) {
      if (Math.abs(d) < 1e-6) {
        if (v < min || v > max) far = -1;
      } else {
        const a = (min - v) / d,
          c = (max - v) / d;
        near = Math.max(near, Math.min(a, c));
        far = Math.min(far, Math.max(a, c));
      }
    }
    if (near > far || near > 1.5 || near >= nearest) continue;
    const travel = Math.min(near + 0.6, far);
    const x = p.x + dx * travel,
      z = p.z + dz * travel;
    if (blocksBody(x, z, b.max[1], boxes)) continue;
    nearest = near;
    result = { x, y: b.max[1] + MOVE.eye, z };
  }
  return result;
}
export function mantlePoint(from: Point, to: Point, t: number): Point {
  const progress = Math.max(0, Math.min(1, t));
  const lift = Math.min(1, progress / 0.65),
    across = Math.max(0, (progress - 0.25) / 0.75);
  const smooth = (v: number) => v * v * (3 - 2 * v);
  return {
    x: from.x + (to.x - from.x) * smooth(across),
    z: from.z + (to.z - from.z) * smooth(across),
    y: from.y + (to.y - from.y) * smooth(lift),
  };
}
