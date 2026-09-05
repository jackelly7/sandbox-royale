import { WEAPONS, RARITIES } from './rules.ts';
export type WorldDrop = {
  x: number;
  z: number;
  kind: number;
  rarity: number;
  ammo?: number;
  amount?: number;
  used: boolean;
};
export const AMMO_TYPES = [
  { name: 'Rifle ammo', color: '#e7cb72' },
  { name: 'Shotgun shells', color: '#f07d64' },
  { name: 'Sniper ammo', color: '#8fd6df' },
];
export const isAmmo = (kind: number) => kind >= 5 && kind <= 7;
export function floorAvailable(index: number) {
  return index < 15 || index === 16;
}
export function ammoBeside(
  gun: { x: number; z: number; kind: number },
  amount = WEAPONS[gun.kind].capacity * 3,
): WorldDrop {
  return {
    x: gun.x + 1.3,
    z: gun.z,
    kind: gun.kind + 5,
    rarity: 0,
    amount,
    used: false,
  };
}
export function floorRarity(index: number) {
  if (index === 12) return 3;
  const roll = (Math.imul(index + 7, 2654435761) >>> 0) % 100;
  return roll < 60 ? 0 : roll < 85 ? 1 : roll < 97 ? 2 : 3;
}
export function lootColor(kind: number, rarity = 0) {
  if (isAmmo(kind)) return AMMO_TYPES[kind - 5].color;
  return kind < 3 ? RARITIES[rarity].color : kind === 3 ? '#78dfee' : '#ff7474';
}
type Inventory = {
  owned: boolean[];
  tiers?: number[];
  ammo: number[];
  reserve: number[];
  weapon: number;
  medkits: number;
  cells: number;
};
export function eliminationDrops(
  inv: Inventory,
  x: number,
  z: number,
): WorldDrop[] {
  const drops: WorldDrop[] = [];
  inv.owned.forEach((has, kind) => {
    const p = {
      x: x + Math.cos(kind * 2.4) * 1.4,
      z: z + Math.sin(kind * 2.4) * 1.4,
      kind,
    };
    if (has)
      drops.push({
        ...p,
        rarity: inv.tiers?.[kind] ?? 0,
        ammo: 0,
        used: false,
      });
    const amount = inv.ammo[kind] + inv.reserve[kind];
    if (amount > 0) drops.push(ammoBeside(p, amount));
  });
  if (inv.cells)
    drops.push({
      x: x - 1.5,
      z: z + 2,
      kind: 3,
      rarity: 0,
      amount: inv.cells,
      used: false,
    });
  if (inv.medkits)
    drops.push({
      x: x + 1.5,
      z: z + 2,
      kind: 4,
      rarity: 0,
      amount: inv.medkits,
      used: false,
    });
  return drops;
}

export function collectGun(
  inv: Inventory,
  drop: Pick<WorldDrop, 'kind' | 'rarity' | 'ammo'>,
) {
  const k = drop.kind,
    first = !inv.owned[k];
  inv.tiers ??= [0, 0, 0];
  const swapped = first ? null : inv.tiers[k];
  const upgrade = !first && drop.rarity > inv.tiers[k];
  inv.tiers[k] = drop.rarity;
  inv.owned[k] = true;
  inv.weapon = k;
  // Ammo belongs to the player, never to the picked-up weapon.
  if (first && inv.ammo[k] === 0) {
    const loaded = Math.min(WEAPONS[k].capacity, inv.reserve[k]);
    inv.ammo[k] = loaded;
    inv.reserve[k] -= loaded;
  }
  return { first, upgrade, swapped };
}
export function collectAmmo(
  inv: Pick<Inventory, 'owned' | 'ammo' | 'reserve'>,
  drop: WorldDrop,
  loadEmpty = true,
) {
  if (!isAmmo(drop.kind) || drop.used) return 0;
  const k = drop.kind - 5,
    capacity = WEAPONS[k].capacity;
  const taken = Math.min(
    drop.amount ?? 0,
    Math.max(0, capacity * 8 - inv.reserve[k]),
  );
  inv.reserve[k] += taken;
  drop.amount = (drop.amount ?? 0) - taken;
  drop.used = drop.amount <= 0;
  if (taken && loadEmpty && inv.owned[k] && inv.ammo[k] === 0) {
    const loaded = Math.min(capacity, inv.reserve[k]);
    inv.ammo[k] = loaded;
    inv.reserve[k] -= loaded;
  }
  return taken;
}
