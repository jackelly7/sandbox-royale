import { ARENA_SCALE } from './arena.ts';
import { MAP } from './map-data.ts';
import type { WorldDrop } from './loot.ts';
import type { Bounds, Point } from './movement.ts';
export type ChestState = { active: boolean; openedAt: number };
export const CHEST_SPOTS = [
  { x: 18 * ARENA_SCALE, z: -23 * ARENA_SCALE },
  { x: -22 * ARENA_SCALE, z: -16 * ARENA_SCALE },
  ...[21, 24, 27, 30, 33, 36, 39, 42, 14, 18].map((i) => ({
    x: MAP.loot[i].x,
    z: MAP.loot[i].z,
  })),
];
function hash(seed: string) {
  let n = 2166136261;
  for (const c of seed) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}
export function chestLayout(seed: string): ChestState[] {
  const chosen = new Set([
    0,
    1,
    ...CHEST_SPOTS.map((_, i) => i)
      .slice(2)
      .sort((a, b) => hash(`${seed}:${a}`) - hash(`${seed}:${b}`))
      .slice(0, 6),
  ]);
  return CHEST_SPOTS.map((_, i) => ({ active: chosen.has(i), openedAt: 0 }));
}
export function chestDrops(seed: string, index: number): WorldDrop[] {
  const spot = CHEST_SPOTS[index],
    roll = hash(`${seed}:loot:${index}`);
  const rarity = roll % 100 < 55 ? 1 : roll % 100 < 90 ? 2 : 3;
  return [roll % 3, 3 + ((roll >>> 8) % 2)].map((kind, i) => ({
    x: spot.x + (i - 0.5) * 1.8,
    z: spot.z + 1.8,
    kind,
    rarity: kind < 3 ? rarity : 0,
    used: false,
  }));
}
// Shared interaction visibility stops opening or collecting through walls/ceilings.
export function canReach(
  from: Point,
  to: Point,
  boxes: readonly Bounds[],
  range = 3.8,
) {
  if (Math.hypot(from.x - to.x, from.y - to.y, from.z - to.z) > range)
    return false;
  return !boxes.some((b) => {
    let near = 0,
      far = 1;
    for (const [axis, i] of [
      ['x', 0],
      ['y', 1],
      ['z', 2],
    ] as const) {
      const d = to[axis] - from[axis];
      if (Math.abs(d) < 1e-7) {
        if (from[axis] < b.min[i] || from[axis] > b.max[i]) return false;
      } else {
        const a = (b.min[i] - from[axis]) / d,
          c = (b.max[i] - from[axis]) / d;
        near = Math.max(near, Math.min(a, c));
        far = Math.min(far, Math.max(a, c));
      }
    }
    return near <= far && far > 0.02 && near < 0.98;
  });
}
