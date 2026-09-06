import { WEAPONS } from './rules.ts';
import { canReach } from './chests.ts';
import { GUN_COLLIDERS, GUN_SPAWNS } from './gun-arena.ts';
export { GUN_RADIUS } from './gun-arena.ts';
export const GUN_LADDER = [3, 4, 1, 0, 5, 6, 2, 7];
export const GUN_RESPAWN_MS = 3000;
export const REGEN_DELAY = 5000,
  REGEN_PER_SECOND = 20;
export function gunLoadout(stage: number) {
  const weapon = GUN_LADDER[Math.min(stage, GUN_LADDER.length - 1)];
  return {
    weapon,
    owned: WEAPONS.map((_, i) => i === weapon),
    tiers: WEAPONS.map(() => 0),
    ammo: WEAPONS.map((w, i) => (i === weapon ? w.capacity : 0)),
    reserve: WEAPONS.map((_, i) => (i === weapon ? 999 : 0)),
    reloadUntil: 0,
  };
}
export function arenaLoadout(weapon = 0) {
  return {
    weapon,
    owned: WEAPONS.map((_, i) => i === weapon),
    tiers: WEAPONS.map(() => 0),
    ammo: WEAPONS.map((w, i) => (i === weapon ? w.capacity : 0)),
    reserve: WEAPONS.map((_, i) => (i === weapon ? 999 : 0)),
    reloadUntil: 0,
  };
}
export type SpawnActor = {
  x: number;
  z: number;
  y?: number;
  health: number;
  connected?: boolean;
  spectator?: boolean;
  team?: number;
};
export type DeathSpot = { x: number; z: number; at: number };
export function spawnScore(
  p: { x: number; z: number },
  enemies: SpawnActor[],
  deaths: DeathSpot[],
  now: number,
) {
  const distance = Math.min(
    90,
    ...enemies.map((q) => Math.hypot(p.x - q.x, p.z - q.z)),
  );
  const exposed = enemies.filter((q) =>
    canReach({ ...q, y: q.y ?? 1.7 }, { ...p, y: 1.7 }, GUN_COLLIDERS, 65),
  ).length;
  const danger = deaths.reduce(
    (n, q) =>
      n +
      Math.max(0, 1 - (now - q.at) / 12000) *
        Math.max(0, 1 - Math.hypot(p.x - q.x, p.z - q.z) / 14) *
        24,
    0,
  );
  return distance - exposed * 32 - danger;
}
export function gunSpawn(
  players: SpawnActor[],
  salt = 0,
  deaths: DeathSpot[] = [],
  now = salt,
  team?: number,
) {
  const alive = players.filter(
    (p) => p.health > 0 && p.connected !== false && !p.spectator,
  );
  const enemies = alive.filter((p) => team === undefined || p.team !== team);
  const scores = GUN_SPAWNS.map((p) => ({
    p,
    score:
      spawnScore(p, enemies, deaths, now) +
      Math.sin(p.x * 7 + p.z + salt) * 3 -
      (alive.some((q) => Math.hypot(p.x - q.x, p.z - q.z) < 3) ? 1000 : 0),
  }));
  scores.sort((a, b) => b.score - a.score);
  return scores[0].p;
}
