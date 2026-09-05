import { MAP } from './map-data.ts';
import { zoneAt } from './zones.ts';
import { ammoBeside, type WorldDrop } from './loot.ts';
import { canReach } from './chests.ts';
import { groundAt, type Point, type Bounds } from './movement.ts';
export const SUPPLY_AT = 75000,
  SUPPLY_FALL = 8000;
export type SupplyDrop = {
  x: number;
  z: number;
  arrivesAt: number;
  opened: boolean;
  weapon: number;
  rarity: number;
};
export type Smoke = Point & {
  id: string;
  from: Point;
  thrownAt: number;
  startsAt: number;
  endsAt: number;
};
export const SMOKE_RADIUS = 6,
  SMOKE_LIMIT = 6;
export function supplyPlan(seed: string): SupplyDrop {
  let hash = 2166136261;
  for (const c of seed) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  hash >>>= 0;
  const zone = zoneAt((SUPPLY_AT + SUPPLY_FALL) / 1000 - 18, seed).next;
  const candidates = MAP.loot.filter(
    (p) => Math.hypot(p.x - zone.x, p.z - zone.z) < zone.radius - 12,
  );
  const p = candidates[hash % candidates.length];
  return {
    x: p.x,
    z: p.z,
    arrivesAt: SUPPLY_AT + SUPPLY_FALL,
    opened: false,
    weapon: hash % 3,
    rarity: hash % 10 < 3 ? 3 : 2,
  };
}
export function supplyLoot(s: SupplyDrop): WorldDrop[] {
  const gun = {
    x: s.x - 1,
    z: s.z + 2,
    kind: s.weapon,
    rarity: s.rarity,
    ammo: 0,
    used: false,
  };
  return [
    gun,
    ammoBeside(gun),
    { x: s.x - 2, z: s.z - 1, kind: 4, rarity: 0, used: false },
    { x: s.x + 2, z: s.z - 1, kind: 3, rarity: 0, used: false },
    { x: s.x, z: s.z - 2, kind: 8, rarity: 0, amount: 2, used: false },
  ];
}
export function smokeLoot(): WorldDrop[] {
  return [1, 6, 9, 13].map((i) => ({
    ...MAP.loot[i],
    x: MAP.loot[i].x + 2,
    kind: 8,
    rarity: 0,
    amount: 1,
    used: false,
  }));
}
export function throwSmoke(
  from: Point,
  yaw: number,
  pitch: number,
  now: number,
  boxes: readonly Bounds[],
  id: string,
): Smoke {
  let p = { x: from.x, y: from.y, z: from.z };
  for (let i = 1; i <= 24; i++) {
    const t = (i / 24) * 1.1;
    const q = {
      x: from.x - Math.sin(yaw) * 16 * t,
      y: from.y + (5 + Math.sin(pitch) * 5) * t - 7 * t * t,
      z: from.z - Math.cos(yaw) * 16 * t,
    };
    if (!canReach(p, q, boxes, 5)) break;
    const floor = groundAt(q.x, q.z, Math.max(0, p.y), boxes) + 0.2;
    p = { ...q, y: Math.max(floor, q.y) };
    if (q.y <= floor) break;
  }
  return {
    ...p,
    id,
    from: { x: from.x, y: from.y, z: from.z },
    thrownAt: now,
    startsAt: now + 1100,
    endsAt: now + 11100,
  };
}
export function smokeBlocks(a: Point, b: Point, smokes: Smoke[], now: number) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    dz = b.z - a.z,
    len = dx * dx + dy * dy + dz * dz;
  return smokes.some((s) => {
    if (now < s.startsAt || now >= s.endsAt) return false;
    const y = s.y + 2.5,
      t = len
        ? Math.max(
            0,
            Math.min(
              1,
              ((s.x - a.x) * dx + (y - a.y) * dy + (s.z - a.z) * dz) / len,
            ),
          )
        : 0;
    return (
      Math.hypot(a.x + dx * t - s.x, a.y + dy * t - y, a.z + dz * t - s.z) <
      SMOKE_RADIUS
    );
  });
}
