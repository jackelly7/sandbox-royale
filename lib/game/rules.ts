export const WEAPONS = [
  {
    name: 'Ranger AR',
    short: 'ASSAULT RIFLE',
    capacity: 30,
    damage: 24,
    interval: 0.115,
    reload: 1.65,
    spread: 0.007,
    pellets: 1,
    color: '#8ee8c8',
  },
  {
    name: 'Breach 12',
    short: 'SHOTGUN',
    capacity: 6,
    damage: 17,
    interval: 0.8,
    reload: 2.1,
    spread: 0.052,
    pellets: 7,
    color: '#9cb8ff',
  },
  {
    name: 'Longshot',
    short: 'MARKSMAN',
    capacity: 5,
    damage: 78,
    interval: 1.05,
    reload: 2.3,
    spread: 0.001,
    pellets: 1,
    color: '#dcadff',
  },
];
export const MATCH_LENGTH = 270;
export const BOT_COUNT = 15;
export function stormRadius(elapsed: number) {
  return Math.max(5, 107 - Math.max(0, elapsed - 35) * 0.44);
}
export function takeDamage(health: number, shield: number, amount: number) {
  const absorbed = Math.min(shield, amount);
  return {
    health: Math.max(0, health - (amount - absorbed)),
    shield: shield - absorbed,
  };
}
export function reloadAmmo(ammo: number, reserve: number, capacity: number) {
  const loaded = Math.min(Math.max(0, capacity - ammo), reserve);
  return { ammo: ammo + loaded, reserve: reserve - loaded };
}
