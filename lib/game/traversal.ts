import { ARENA_SCALE } from './arena.ts';
export const BUS_SECONDS = 18;
export const BUS_HEIGHT = 65;
export const BUS_FROM = { x: -140, z: -65 };
export const BUS_TO = { x: 140, z: 65 };
export function busPosition(seconds: number) {
  const t = Math.max(0, Math.min(1, seconds / BUS_SECONDS));
  return {
    x: BUS_FROM.x + (BUS_TO.x - BUS_FROM.x) * t,
    y: BUS_HEIGHT,
    z: BUS_FROM.z + (BUS_TO.z - BUS_FROM.z) * t,
  };
}
// Clear approaches outside the castle walls and shelters; shared by both simulations.
export const LAUNCH_PADS = [
  [-58, -44],
  [48, -60],
  [-56, 44],
  [55, 35],
  [5, 62],
  [4, -8],
].map(([x, z]) => ({ x: x * ARENA_SCALE, z: z * ARENA_SCALE }));
// Twice the old horizontal reach, with the same descent and landing timing.
export const GLIDE_SPEED = 20;
export const LIFT_SECONDS = 0.85;
export const LIFT_SPEED = 34;
export function padAt(x: number, y: number, z: number) {
  return y >= 1.5 && y <= 2.4
    ? LAUNCH_PADS.findIndex((p) => Math.hypot(p.x - x, p.z - z) <= 2)
    : -1;
}
export function glideHeight(y: number, dt: number, liftRemaining = 0) {
  const lift = Math.min(dt, Math.max(0, liftRemaining));
  return Math.max(1.7, y + lift * LIFT_SPEED - (dt - lift) * 6);
}

export function canGlideFire(
  dropping: boolean,
  onBus: boolean,
  launchAt: number | undefined,
  now: number,
) {
  return (
    dropping &&
    !onBus &&
    launchAt !== undefined &&
    launchAt >= 0 &&
    now >= launchAt + LIFT_SECONDS * 1000
  );
}
