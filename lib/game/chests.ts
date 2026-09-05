import { ARENA_SCALE } from './arena.ts';
import { MAP } from './map-data.ts';
import { ammoBeside, floorAvailable, type WorldDrop } from './loot.ts';
import type { Bounds, Point } from './movement.ts';
export type ChestState = { active: boolean; openedAt: number };
export const SHELTERS = [
  { x: 30, z: 20, w: 12, d: 10 },
  { x: -35, z: 28, w: 12, d: 10 },
  { x: 2, z: -57, w: 12, d: 9 },
  { x: -18, z: 49, w: 10, d: 8 },
];
export const CHEST_SPOTS = [
  ...[{ x: 18, z: -23 }, { x: -22, z: -16 }, ...SHELTERS].map((p) => ({
    x: p.x * ARENA_SCALE,
    z: p.z * ARENA_SCALE,
  })),
  ...[21, 24, 27, 30, 33, 36, 39, 42, 15, 17, 18, 43, 45, 47, 49, 51, 53, 55].map(
    (i) => ({ x: MAP.loot[i].x, z: MAP.loot[i].z }),
  ),
];
export function floorAmmo(): WorldDrop[] {
  return MAP.loot.flatMap((l, i) =>
    l.kind < 3 && floorAvailable(i) ? [ammoBeside(l)] : [],
  );
}

function hash(seed: string) {
  let n = 2166136261;
  for (const c of seed) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}
export function chestLayout(seed: string): ChestState[] {
  // Every shelter and landing sector has treasure; four inland spots vary.
  const chosen = new Set([
    ...Array.from({ length: 14 }, (_, i) => i),
    ...CHEST_SPOTS.map((_, i) => i)
      .slice(14)
      .sort((a, b) => hash(`${seed}:${a}`) - hash(`${seed}:${b}`))
      .slice(0, 4),
  ]);
  return CHEST_SPOTS.map((_, i) => ({ active: chosen.has(i), openedAt: 0 }));
}
export function chestDrops(seed: string, index: number): WorldDrop[] {
  const spot = CHEST_SPOTS[index],
    roll = hash(`${seed}:loot:${index}`);
  const rarity = roll % 100 < 55 ? 1 : roll % 100 < 90 ? 2 : 3;
  const gun: WorldDrop = {
    x: spot.x - 0.9,
    z: spot.z + 1.8,
    kind: roll % 3,
    rarity,
    ammo: 0,
    used: false,
  };
  return [
    gun,
    ammoBeside(gun),
    {
      x: spot.x - 1.5,
      z: spot.z - 0.8,
      kind: 3 + ((roll >>> 8) % 2),
      rarity: 0,
      used: false,
    },
  ];
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
