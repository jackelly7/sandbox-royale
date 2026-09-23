import type { GameMode } from './modes.ts';
import { zoneAt } from './zones.ts';
export const RARITIES = [
  { name: 'Common', color: '#c9d0d5', power: 1 },
  { name: 'Rare', color: '#258dff', power: 1.1 },
  { name: 'Epic', color: '#b349ff', power: 1.2 },
  { name: 'Legendary', color: '#ffb51b', power: 1.3 },
];
export const WEAPONS = [
  {
    name: 'Ranger AR',
    short: 'ASSAULT RIFLE',
    capacity: 30,
    damage: 14,
    interval: 0.2,
    reload: 1.65,
    spread: 0.065,
    aimedSpread: 0.004,
    range: 115,
    pellets: 1,
    color: '#8ee8c8',
  },
  {
    name: 'Breach Shotgun',
    short: 'SHOTGUN',
    capacity: 6,
    damage: 10.8,
    interval: 0.8,
    reload: 2.1,
    spread: 0.11,
    aimedSpread: 0.09,
    range: 24,
    pellets: 7,
    color: '#ffc06a',
  },
  {
    name: 'Longshot Sniper',
    short: 'SNIPER',
    capacity: 5,
    damage: 90,
    interval: 1.2,
    reload: 2.3,
    spread: 0.1,
    aimedSpread: 0.0003,
    range: 180,
    pellets: 1,
    color: '#dcadff',
  },
  {
    name: 'Pocket Pistol',
    short: 'PISTOL',
    capacity: 12,
    damage: 24,
    interval: 0.26,
    reload: 1.2,
    spread: 0.035,
    aimedSpread: 0.004,
    range: 65,
    pellets: 1,
    color: '#ffe18b',
  },
  {
    name: 'Zip SMG',
    short: 'SMG',
    capacity: 32,
    damage: 11,
    interval: 0.09,
    reload: 1.45,
    spread: 0.075,
    aimedSpread: 0.018,
    range: 55,
    pellets: 1,
    color: '#93e9ff',
  },
  {
    name: 'Bulwark LMG',
    short: 'LMG',
    capacity: 60,
    damage: 17,
    interval: 0.16,
    reload: 2.7,
    spread: 0.085,
    aimedSpread: 0.012,
    range: 95,
    pellets: 1,
    color: '#f4b882',
  },
  {
    name: 'Scout Marksman',
    short: 'MARKSMAN',
    capacity: 10,
    damage: 38,
    interval: 0.48,
    reload: 1.9,
    spread: 0.06,
    aimedSpread: 0.0015,
    range: 145,
    pellets: 1,
    color: '#a9e69b',
  },
  {
    name: 'Dust Devil',
    short: 'REVOLVER',
    capacity: 6,
    damage: 45,
    interval: 0.55,
    reload: 2.1,
    spread: 0.05,
    aimedSpread: 0.002,
    range: 75,
    pellets: 1,
    color: '#ffa0b7',
  },
];
export const automaticWeapon = (index: number, mode?: GameMode) =>
  mode === 'gun-game' || [0, 4, 5].includes(index);
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
export const MATCH_LENGTH = 285;
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
export function headshotMultiplier(weapon: number, rarity = 0) {
  return weapon === 2 && rarity >= 2 ? 2 : HEADSHOT_MULTIPLIER;
}

// Angular spread is identical in solo and on the authoritative multiplayer server.
export function shotDirection(
  yaw: number,
  pitch: number,
  weapon: number,
  aiming: boolean,
  pellet = 0,
  mode?: GameMode,
): [number, number, number] {
  const w = WEAPONS[weapon];
  const spread =
    (aiming ? w.aimedSpread : w.spread) *
    (mode === 'gun-game' && [3, 6, 7].includes(weapon) ? 0.6 : 1);
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
export function weaponDamage(
  weapon: number,
  distance: number,
  rarity = 0,
  mode?: GameMode,
) {
  const w = WEAPONS[weapon];
  if (distance >= w.range) return 0;
  const falloff =
    weapon === 1
      ? Math.max(0, 1 - Math.max(0, distance - 8) / 16)
      : weapon === 0
        ? Math.max(0.2, 1 - Math.max(0, distance - 35) / 75)
        : weapon === 4
          ? Math.max(0.3, 1 - Math.max(0, distance - 16) / 45)
          : weapon === 3 || weapon === 7
            ? Math.max(0.45, 1 - Math.max(0, distance - 25) / 60)
            : 1;
  const damage =
    mode === 'gun-game'
      ? ({ 3: 34, 6: 46, 7: 60 }[weapon] ?? w.damage)
      : w.damage;
  return damage * falloff * (RARITIES[rarity]?.power ?? 1);
}
