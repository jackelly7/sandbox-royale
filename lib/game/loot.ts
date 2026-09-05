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
export function floorAvailable(index: number) {
  if (index < 19 || index >= 59) return true;
  if (index < 43) {
    const sector = Math.floor((index - 19) / 3),
      slot = (index - 19) % 3;
    return (
      slot === sector % 3 || (sector % 2 === 0 && slot === (sector + 1) % 3)
    );
  }
  const sector = Math.floor((index - 43) / 2);
  return sector % 2 === 0 || (index - 43) % 2 === sector % 2;
}
export function floorRarity(index: number) {
  if (index === 12) return 3;
  const roll = (Math.imul(index + 7, 2654435761) >>> 0) % 100;
  return roll < 60 ? 0 : roll < 85 ? 1 : roll < 97 ? 2 : 3;
}
export function lootColor(kind: number, rarity = 0) {
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
    if (has)
      drops.push({
        x,
        z,
        kind,
        rarity: inv.tiers?.[kind] ?? 0,
        ammo: inv.ammo[kind] + inv.reserve[kind],
        used: false,
      });
  });
  if (inv.cells)
    drops.push({ x, z, kind: 3, rarity: 0, amount: inv.cells, used: false });
  if (inv.medkits)
    drops.push({ x, z, kind: 4, rarity: 0, amount: inv.medkits, used: false });
  return drops.map((d, i) => ({
    ...d,
    x: x + Math.cos(i * 2.4) * 1.3,
    z: z + Math.sin(i * 2.4) * 1.3,
  }));
}
export function collectGun(
  inv: Inventory,
  drop: Pick<WorldDrop, 'kind' | 'rarity' | 'ammo'>,
) {
  const k = drop.kind,
    first = !inv.owned[k];
  inv.tiers ??= [0, 0, 0];
  const upgrade = !first && drop.rarity > inv.tiers[k];
  inv.tiers[k] = first ? drop.rarity : Math.max(inv.tiers[k], drop.rarity);
  inv.owned[k] = true;
  let ammo = drop.ammo ?? WEAPONS[k].capacity * 3;
  if (first) {
    inv.ammo[k] = Math.min(ammo, WEAPONS[k].capacity);
    ammo -= inv.ammo[k];
  }
  inv.reserve[k] = Math.min(WEAPONS[k].capacity * 8, inv.reserve[k] + ammo);
  if (first || upgrade) inv.weapon = k;
  return { first, upgrade };
}
