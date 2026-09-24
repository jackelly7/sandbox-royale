import { blocksBody, groundAt, type Bounds, type Point } from './movement.ts';
export type ArenaBlock = {
  x: number;
  z: number;
  y: number;
  w: number;
  h: number;
  d: number;
  color: string;
  role?: 'ramp';
};
export const GUN_RADIUS = 51;
export const ARENA_BLOCKS: ArenaBlock[] = [];
const block = (
  x: number,
  z: number,
  w: number,
  h: number,
  d: number,
  y = h / 2,
  color = '#cfab73',
  role?: 'ramp',
) => ARENA_BLOCKS.push({ x, z, w, h, d, y, color, role });
// A 76 x 68 courtyard. Open ground routes surround a central castle and two tunnels.
block(0, -34, 78, 7, 2);
block(0, 34, 78, 7, 2);
block(-38, 0, 2, 7, 68);
block(38, 0, 2, 7, 68);
for (const side of [-1, 1]) {
  for (const x of [-7, 7]) block(x, side * 9, 6, 3.8, 1.4);
  for (const z of [-6, 6]) block(side * 10, z, 1.4, 3.8, 6);
  // Bucket forts: a walkable deck above a three-meter-high tunnel.
  block(side * 23, 0, 10, 0.5, 12, 3.25, side < 0 ? '#7cb9cc' : '#bf94c7');
  for (const z of [-4.5, 4.5]) {
    block(side * 28, z, 1, 3, 3);
    block(side * 18, z, 1, 3, 3);
  }
  // Low parapets protect the deck, with two gaps for shooting and descending.
  block(side * 28, 0, 1, 1, 12, 4, '#ecce93');
  block(side * 23, -6, 10, 1, 1, 4, '#ecce93');
  // Smooth visible ramp; shallow collision steps support ordinary running.
  for (let i = 0; i < 28; i++)
    block(
      side * 23,
      6 + (i + 0.5) * 0.4,
      5,
      (28 - i) * 0.125,
      0.4,
      (28 - i) * 0.0625,
      '#e1bf83',
      'ramp',
    );
  // Sheltered spawns and offset cover break up the long outside lanes.
  block(side * 27, -22, 8, 2.6, 1.5);
  block(side * 31, 23, 1.5, 2.6, 8);
  block(side * 7, 23, 5, 1.3, 3, undefined, '#dfa67d');
  block(side * 7, -23, 5, 1.3, 3, undefined, '#9abfa8');
}
block(0, 0, 3, 1.2, 3, undefined, '#e6c26b');
for (const x of [-10, 10])
  for (const z of [-9, 9]) {
    block(x, z, 2, 4.3, 2, 2.15, '#e8c68c');
    block(x, z, 2.6, 0.6, 2.6, 4.6, '#f1d9a5');
  }
export const GUN_COLLIDERS: Bounds[] = ARENA_BLOCKS.map((b) => ({
  min: [b.x - b.w / 2, b.y - b.h / 2, b.z - b.d / 2],
  max: [b.x + b.w / 2, b.y + b.h / 2, b.z + b.d / 2],
}));
export const GUN_SPAWNS = [
  { x: -32, z: -28 },
  { x: 32, z: 28 },
  { x: 32, z: -28 },
  { x: -32, z: 28 },
  { x: -32, z: -12 },
  { x: 32, z: -12 },
  { x: -14, z: 28 },
  { x: 14, z: -28 },
  { x: -14, z: -28 },
  { x: 14, z: 28 },
  { x: -32, z: 12 },
  { x: 32, z: 12 },
  { x: -3, z: 28 },
  { x: 3, z: -28 },
  { x: -32, z: 0 },
  { x: 32, z: 0 },
];
// The same step-up rule is used by the client, server and ramp verification.
export function arenaGround(x: number, z: number, feet: number) {
  return Math.max(
    ...[
      [0, 0],
      [0.21, 0],
      [-0.21, 0],
      [0, 0.21],
      [0, -0.21],
    ].map(([dx, dz]) => groundAt(x + dx, z + dz, feet, GUN_COLLIDERS)),
  );
}
export function arenaStep(x: number, z: number, feet: number) {
  const next = Math.max(feet, arenaGround(x, z, feet + 0.27));
  return blocksBody(x, z, next, GUN_COLLIDERS) ? null : next;
}

// Sweep in short steps and slide along walls using the same rule on both ends.
export function arenaMove(position: Point, dx: number, dz: number) {
  const result = { x: position.x, y: position.y, z: position.z };
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.25));
  for (let i = 0; i < steps; i++) {
    const x = result.x + dx / steps;
    const a = arenaStep(x, result.z, result.y - 1.7);
    if (a !== null) {
      result.x = x;
      result.y = Math.max(result.y, a + 1.7);
    }
    const z = result.z + dz / steps;
    const b = arenaStep(result.x, z, result.y - 1.7);
    if (b !== null) {
      result.z = z;
      result.y = Math.max(result.y, b + 1.7);
    }
  }
  return result;
}
