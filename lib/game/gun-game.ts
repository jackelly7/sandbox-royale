import { WEAPONS } from './rules.ts';
import { GUN_SPAWNS } from './gun-arena.ts';
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
export function gunSpawn(
  players: { x: number; z: number; health: number }[],
  salt = 0,
) {
  const points = GUN_SPAWNS;
  const alive = players.filter((p) => p.health > 0);
  return [...points].sort((a, b) => {
    const score = (p: { x: number; z: number }) =>
      Math.min(90, ...alive.map((q) => Math.hypot(p.x - q.x, p.z - q.z))) +
      Math.sin(p.x * 7 + p.z + salt) * 3;
    return score(b) - score(a);
  })[0];
}
