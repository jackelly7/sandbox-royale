import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectAmmo,
  collectGun,
  eliminationDrops,
  ammoBeside,
} from '../lib/game/loot.ts';
import {
  WEAPONS,
  weaponDamage,
  shotDirection,
  HEADSHOT_MULTIPLIER,
  RARITIES,
} from '../lib/game/rules.ts';
import {
  createRoom,
  createMember,
  addMember,
  applyCommand,
  advance,
  autoAmmo,
} from '../server/model.ts';
import { MAP } from '../lib/game/map-data.ts';
import { SHELTERS, CHEST_SPOTS, floorAmmo } from '../lib/game/chests.ts';
import { blocksBody } from '../lib/game/movement.ts';
import { ARENA_SCALE as S } from '../lib/game/arena.ts';
function setup() {
  const r = createRoom('AMMO22', createMember('a', 'A', 'secret', 1000), 1000);
  addMember(r, createMember('b', 'B', 'secret', 1000));
  r.phase = 'playing';
  r.startAt = 1000;
  r.drops = [];
  return r;
}
void test('walking over typed ammo collects it once without E and never claims the gun', () => {
  const r = setup(),
    [a, b] = r.players;
  Object.assign(a, { x: 0, z: 0 });
  Object.assign(b, { x: 0, z: 0 });
  for (let k = 0; k < 3; k++)
    r.drops!.push({
      x: 0,
      z: 0,
      kind: k + 5,
      rarity: 0,
      amount: 12,
      used: false,
    });
  advance(r, 1100);
  assert.deepEqual(a.reserve, [12, 12, 12]);
  assert.deepEqual(b.reserve, [0, 0, 0]);
  assert.equal(a.weapon, -1);
  assert.ok(r.drops!.every((d) => d.used));
  advance(r, 1200);
  assert.deepEqual(a.reserve, [12, 12, 12]);
  r.drops!.push({ x: 0, z: 0, kind: 0, rarity: 1, used: false });
  advance(r, 1300);
  assert.equal(a.owned[0], false);
  applyCommand(r, a.id, { type: 'pickup', index: MAP.loot.length + 3 }, 1400);
  assert.equal(a.owned[0], true);
  assert.equal(a.ammo[0], 12);
  assert.equal(a.reserve[0], 0);
});
void test('ammo is unavailable through cover and while dropping, downed or spectating', () => {
  const r = setup(),
    p = r.players[0];
  r.drops = [{ x: 0, z: 0, kind: 5, rarity: 0, amount: 30, used: false }];
  Object.assign(p, { x: 0, z: 0 });
  for (const field of ['dropping', 'downed', 'spectator'] as const) {
    p[field] = true;
    autoAmmo(r, p, 1100);
    assert.equal(p.reserve[0], 0);
    p[field] = false;
  }
  p.y = 8;
  autoAmmo(r, p, 1100);
  assert.equal(p.reserve[0], 0);
  p.y = 1.7;
  const wall = MAP.colliders.find(
    (b) => Math.abs(b.max[1] - 2.6) < 0.01 && b.max[2] - b.min[2] < 2,
  )!;
  p.x = (wall.min[0] + wall.max[0]) / 2;
  p.z = wall.min[2] - 0.5;
  r.drops[0].x = p.x;
  r.drops[0].z = wall.max[2] + 0.5;
  autoAmmo(r, p, 1100);
  assert.equal(p.reserve[0], 0);
});
void test('full ammo reserves leave a partial stack for friends and do not interrupt reloading', () => {
  const inv = {
    owned: [true, false, false],
    ammo: [0, 0, 0],
    reserve: [235, 0, 0],
  };
  const drop = { x: 0, z: 0, kind: 5, rarity: 0, amount: 20, used: false };
  assert.equal(collectAmmo(inv, drop, false), 5);
  assert.equal(drop.amount, 15);
  assert.equal(drop.used, false);
  assert.equal(inv.ammo[0], 0);
  assert.equal(collectAmmo(inv, drop, false), 0);
  assert.equal(drop.amount, 15);
});
void test('pressing E swaps to a lower rarity, drops the previous gun and conserves ammunition', () => {
  const r = setup(),
    p = r.players[0];
  Object.assign(p, {
    x: 0,
    z: 0,
    weapon: 0,
    owned: [true, false, false],
    tiers: [3, 0, 0],
    ammo: [7, 0, 0],
    reserve: [22, 0, 0],
  });
  r.drops = [{ x: 0, z: 0, kind: 0, rarity: 0, ammo: 999, used: false }];
  applyCommand(r, p.id, { type: 'pickup', index: 63 }, 1100);
  assert.equal(p.tiers![0], 0);
  assert.equal(r.drops.length, 1);
  assert.equal(r.drops[0].rarity, 3);
  assert.equal(r.drops[0].ammo, 0);
  assert.deepEqual([p.ammo[0], p.reserve[0]], [7, 22]);
  applyCommand(r, p.id, { type: 'pickup', index: 63 }, 1200);
  assert.equal(p.tiers![0], 3);
  assert.deepEqual([p.ammo[0], p.reserve[0]], [7, 22]);
});
void test('all floor guns have nearby matching ammo and elimination ammo stays separate', () => {
  for (const drop of floorAmmo())
    assert.ok(
      MAP.loot.some(
        (l) =>
          l.kind === drop.kind - 5 &&
          Math.hypot(l.x - drop.x, l.z - drop.z) < 1.5,
      ),
    );
  const inv = {
    owned: [true, false, false],
    tiers: [2, 0, 0],
    ammo: [5, 0, 0],
    reserve: [10, 3, 0],
    weapon: 0,
    cells: 0,
    medkits: 0,
  };
  const drops = eliminationDrops(inv, 0, 0);
  assert.equal(drops[0].ammo, 0);
  assert.equal(drops.find((d) => d.kind === 5)!.amount, 15);
  assert.equal(drops.find((d) => d.kind === 6)!.amount, 3);
  assert.equal(collectGun(inv, { kind: 0, rarity: 0, ammo: 100 }).swapped, 2);
  assert.equal(ammoBeside({ x: 0, z: 0, kind: 2 }).kind, 7);
});
void test('four additional shelters have clear front and back entrances and interior chest space', () => {
  assert.equal(SHELTERS.length, 4);
  for (const h of SHELTERS) {
    for (let dz = -h.d / 2 - 1; dz <= h.d / 2 + 1; dz += 0.2)
      assert.equal(
        blocksBody(h.x * S, (h.z + dz) * S, 0, MAP.colliders),
        false,
      );
    assert.ok(CHEST_SPOTS.some((p) => p.x === h.x * S && p.z === h.z * S));
    assert.ok(blocksBody((h.x + h.w / 2) * S, h.z * S, 0, MAP.colliders));
  }
});
void test('shotgun wins close, AR remains competitive midrange, sniper wins far at every equal rarity', () => {
  for (let r = 0; r < 4; r++) {
    const dps = (k: number, d: number) =>
      (weaponDamage(k, d, r) * WEAPONS[k].pellets) / WEAPONS[k].interval;
    assert.ok(dps(1, 6) > dps(0, 6));
    assert.ok(dps(1, 6) > dps(2, 6));
    assert.ok(dps(0, 35) > dps(1, 35));
    assert.ok(dps(0, 35) > dps(2, 35) * 0.9);
    assert.ok(dps(2, 100) > dps(0, 100) * 2);
    assert.equal(weaponDamage(1, 24, r), 0);
    assert.equal(weaponDamage(0, 115, r), 0);
    assert.ok(weaponDamage(2, 160, r) > 0);
    assert.ok(
      WEAPONS[1].damage * 7 * HEADSHOT_MULTIPLIER * RARITIES[r].power < 150,
    );
  }
  assert.ok(WEAPONS[0].interval >= 0.2);
});
void test('AR hip fire visibly spreads while ADS remains useful at medium range', (t) => {
  t.mock.method(Math, 'random', () => 0.5);
  const hip = shotDirection(0, 0, 0, false),
    ads = shotDirection(0, 0, 0, true);
  assert.ok(Math.hypot(hip[0], hip[1]) * 40 > 0.8);
  assert.ok(Math.hypot(ads[0], ads[1]) * 40 < 0.08);
});
