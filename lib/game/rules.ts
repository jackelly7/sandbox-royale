import { zoneAt } from './zones.ts';
export const RARITIES = [
  { name: 'Common', color: '#c9d0d5', power: 1 },
  { name: 'Rare', color: '#59adff', power: 1.1 },
  { name: 'Epic', color: '#bb85ff', power: 1.2 },
  { name: 'Legendary', color: '#ffc34d', power: 1.3 },
];
export const WEAPONS = [
  {
    name: 'Ranger AR',
    short: 'ASSAULT RIFLE',
    capacity: 30,
    damage: 14,
    interval: 0.14,
    reload: 1.65,
    spread: 0.007,
    aimedSpread: 0.0021,
    range: 150,
    pellets: 1,
    color: '#8ee8c8',
  },
  {
    name: 'Breach Shotgun',
    short: 'SHOTGUN',
    capacity: 6,
    damage: 10,
    interval: 0.8,
    reload: 2.1,
    spread: 0.11,
    aimedSpread: 0.09,
    range: 28,
    pellets: 7,
    color: '#ffc06a',
  },
  {
    name: 'Longshot Sniper',
    short: 'SNIPER',
    capacity: 5,
    damage: 50,
    interval: 1.2,
    reload: 2.3,
    spread: 0.1,
    aimedSpread: 0.0003,
    range: 150,
    pellets: 1,
    color: '#dcadff',
  },
];
export function cycleWeapon(
  current: number,
  owned: boolean[],
  direction: number,
) {
  const available = owned.flatMap((has, i) => (has ? [i] : []));
  if (!available.length) return -1;
  const index = available.indexOf(current);
  if (index < 0) return available[0];
  return available[
    (index + (direction > 0 ? 1 : -1) + available.length) % available.length
  ];
}
export const MATCH_LENGTH = 152;
export const BOT_COUNT = 15;
export function stormRadius(elapsed: number) {
  return zoneAt(elapsed).radius;
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

export type SupplyKind = 'medkit' | 'shield';
export type RecoveryState = {
  health: number;
  shield: number;
  medkits: number;
  cells: number;
  healing: SupplyKind | null;
  healUntil: number;
};
export const SUPPLIES = {
  medkit: {
    name: 'Medkit',
    amount: 75,
    seconds: 4,
    slot: 'medkits',
    stat: 'health',
  },
  shield: {
    name: 'Shield cell',
    amount: 50,
    seconds: 2.5,
    slot: 'cells',
    stat: 'shield',
  },
} as const;
export const SUPPLY_LIMIT = 3;
export function beginRecovery(
  state: RecoveryState,
  item: SupplyKind,
  now: number,
) {
  const supply = SUPPLIES[item];
  if (
    state.healing ||
    state.health <= 0 ||
    state[supply.stat] >= 100 ||
    state[supply.slot] <= 0
  )
    return false;
  state.healing = item;
  state.healUntil = now + supply.seconds * 1000;
  return true;
}
export function cancelRecovery(state: RecoveryState) {
  state.healing = null;
  state.healUntil = 0;
}
export function completeRecovery(state: RecoveryState, now: number) {
  if (!state.healing || now < state.healUntil || state.health <= 0)
    return false;
  const supply = SUPPLIES[state.healing];
  if (state[supply.slot] <= 0) {
    cancelRecovery(state);
    return false;
  }
  state[supply.slot]--;
  state[supply.stat] = Math.min(100, state[supply.stat] + supply.amount);
  cancelRecovery(state);
  return true;
}

export const DROP_HEIGHT = 42;
export const DROP_SPEED = 6;

export const HEADSHOT_MULTIPLIER = 1.5;

// Angular spread is identical in solo and on the authoritative multiplayer server.
export function shotDirection(
  yaw: number,
  pitch: number,
  weapon: number,
  aiming: boolean,
  pellet = 0,
): [number, number, number] {
  const w = WEAPONS[weapon];
  const spread = aiming ? w.aimedSpread : w.spread;
  const angle =
    w.pellets > 1 ? ((pellet - 1) * Math.PI) / 3 : Math.random() * Math.PI * 2;
  const radius =
    w.pellets > 1
      ? pellet === 0
        ? 0
        : spread / 2
      : (Math.sqrt(Math.random()) * spread) / 2;
  const y = yaw + Math.cos(angle) * radius;
  const p = pitch + Math.sin(angle) * radius;
  return [-Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p)];
}
export function weaponDamage(weapon: number, distance: number, rarity = 0) {
  const w = WEAPONS[weapon];
  if (distance >= w.range) return 0;
  const falloff =
    weapon === 1 ? Math.max(0, 1 - Math.max(0, distance - 10) / 18) : 1;
  return w.damage * falloff * (RARITIES[rarity]?.power ?? 1);
}
