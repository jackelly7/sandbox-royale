import test from 'node:test';
import assert from 'node:assert/strict';
import {
  floorAvailable,
  floorRarity,
  collectGun,
  eliminationDrops,
} from '../lib/game/loot.ts';
import { weaponDamage, RARITIES } from '../lib/game/rules.ts';
import {
  MOVE,
  mantleTarget,
  mantlePoint,
  blocksBody,
  groundAt,
  smoothVelocity,
} from '../lib/game/movement.ts';
import {
  createRoom,
  createMember,
  applyCommand,
  damageMember,
  advance,
  snapshot,
} from '../server/model.ts';
import { MAP } from '../lib/game/map-data.ts';
const setup = () => {
  const r = createRoom('LOOT12', createMember('a', 'A', 'secret', 1000), 1000);
  r.players.push(
    createMember('b', 'B', 'secret', 1000),
    createMember('c', 'C', 'secret', 1000),
  );
  r.phase = 'playing';
  r.startAt = 1000;
  r.tickAt = 1000;
  return r;
};
void test('chests replace sixteen floor pickups while retaining a weapon per landing sector', () => {
  assert.equal(MAP.loot.filter((_, i) => floorAvailable(i)).length, 31);
  for (let i = 0; i < 8; i++)
    assert.equal(
      [0, 1, 2].filter((k) => floorAvailable(19 + i * 3 + k)).length,
      1,
    );
  const rarities = new Set(
    MAP.loot.flatMap((l, i) =>
      l.kind < 3 && floorAvailable(i) ? [floorRarity(i)] : [],
    ),
  );
  assert.equal(rarities.size, 4);
});
void test('rarities increase power, upgrade without downgrades, and transfer finite ammunition', () => {
  const inv = {
    owned: [false, false, false],
    tiers: [0, 0, 0],
    ammo: [0, 0, 0],
    reserve: [0, 0, 0],
    weapon: -1,
    medkits: 2,
    cells: 1,
  };
  collectGun(inv, { kind: 0, rarity: 1, ammo: 42 });
  assert.deepEqual([inv.ammo[0], inv.reserve[0], inv.tiers[0]], [30, 12, 1]);
  assert.ok(collectGun(inv, { kind: 0, rarity: 3, ammo: 8 }).upgrade);
  collectGun(inv, { kind: 0, rarity: 0, ammo: 3 });
  assert.equal(inv.tiers[0], 3);
  assert.equal(inv.reserve[0], 23);
  const drops = eliminationDrops(inv, 10, 10);
  assert.equal(drops.length, 3);
  assert.equal(drops[0].ammo, 53);
  assert.equal(drops[0].rarity, 3);
  for (let r = 1; r < RARITIES.length; r++)
    assert.ok(weaponDamage(0, 10, r) > weaponDamage(0, 10, r - 1));
  assert.ok(
    weaponDamage(2, 10, 3) * 1.5 < 150,
    'A full health and starting shield player survives a legendary sniper headshot',
  );
});
void test('eliminations drop equipment once and one player can claim each stack', () => {
  const room = setup(),
    [a, b, c] = room.players;
  Object.assign(b, {
    x: 5,
    z: 5,
    health: 1,
    shield: 0,
    owned: [true, false, false],
    tiers: [2, 0, 0],
    ammo: [8, 0, 0],
    reserve: [11, 0, 0],
    medkits: 2,
  });
  damageMember(room, b, 10, 1100, a);
  assert.equal(room.drops?.length, 2);
  damageMember(room, b, 10, 1200, a);
  assert.equal(room.drops?.length, 2);
  const gun = room.drops![0];
  Object.assign(a, { x: gun.x, z: gun.z });
  Object.assign(c, { x: gun.x, z: gun.z });
  applyCommand(room, a.id, { type: 'pickup', index: MAP.loot.length }, 1200);
  applyCommand(room, c.id, { type: 'pickup', index: MAP.loot.length }, 1200);
  assert.equal(a.tiers?.[0], 2);
  assert.equal(a.ammo[0], 19);
  assert.equal(c.owned[0], false);
  const med = room.drops![1];
  Object.assign(a, { x: med.x, z: med.z, medkits: 2 });
  applyCommand(
    room,
    a.id,
    { type: 'pickup', index: MAP.loot.length + 1 },
    1300,
  );
  assert.equal(med.amount, 1);
  assert.equal(med.used, false);
  Object.assign(c, { x: med.x, z: med.z });
  applyCommand(
    room,
    c.id,
    { type: 'pickup', index: MAP.loot.length + 1 },
    1300,
  );
  assert.equal(c.medkits, 1);
  assert.equal(med.used, true);
  room.phase = 'finished';
  applyCommand(room, a.id, { type: 'rematch' }, 1400);
  applyCommand(room, a.id, { type: 'start' }, 1500);
  assert.equal(room.drops?.length, 0);
  assert.ok(room.players.every((p) => p.tiers?.every((tier) => tier === 0)));
});
void test('mantling climbs reachable cover and supports movement on top while rejecting high or distant walls', () => {
  const box = { min: [-3, 0, -1], max: [3, 2.6, 0] };
  const from = { x: 0, y: 1.7, z: 1 };
  const to = mantleTarget(from, 0, [box]);
  assert.ok(to);
  assert.equal(to.y, 4.3);
  assert.equal(groundAt(to.x, to.z, 2.6, [box]), 2.6);
  assert.equal(blocksBody(to.x, to.z, 2.6, [box]), false);
  assert.equal(blocksBody(to.x, to.z, 0, [box]), true);
  assert.deepEqual(mantlePoint(from, to, 1), to);
  assert.deepEqual(mantlePoint(from, to, 0), from);
  assert.equal(mantleTarget({ ...from, z: 4 }, 0, [box]), null);
  assert.equal(mantleTarget(from, 0, [{ ...box, max: [3, 6, 0] }]), null);
});
void test('movement acceleration is smooth and independent of frame rate', () => {
  const run = (hz: number) => {
    let v = 0;
    for (let i = 0; i < hz; i++) v = smoothVelocity(v, MOVE.sprint, 1 / hz);
    return v;
  };
  assert.ok(Math.abs(run(30) - run(144)) < 0.0001);
  assert.ok(smoothVelocity(0, MOVE.sprint, 1 / 60) > 0);
  assert.ok(smoothVelocity(0, MOVE.sprint, 1 / 60) < MOVE.sprint / 2);
  assert.ok(smoothVelocity(MOVE.sprint, 0, 1 / 60) > 0);
});
void test('the server authorizes mantling and refuses a forged climb through a tall castle', () => {
  const room = setup(),
    p = room.players[0];
  const wall = MAP.colliders.find(
    (b) => Math.abs(b.max[1] - 2.6) < 0.01 && b.max[0] - b.min[0] > 5,
  )!;
  Object.assign(p, {
    x: (wall.min[0] + wall.max[0]) / 2,
    z: wall.max[2] + 1,
    y: 1.7,
    yaw: 0,
  });
  applyCommand(room, p.id, { type: 'mantle', pose: p }, 1100);
  assert.ok(p.mantleUntil! > 1100);
  const to = { ...p.mantleTo! };
  advance(room, 1600);
  assert.equal(p.mantleUntil, 0);
  assert.deepEqual({ x: p.x, y: p.y, z: p.z }, to);
  assert.equal(snapshot(room, 1600).players[0].y, to.y);
  Object.assign(p, { x: 18, z: -16, y: 1.7, yaw: 0, mantleUntil: 0 });
  applyCommand(room, p.id, { type: 'mantle', pose: p }, 1700);
  assert.equal(p.mantleUntil, 0);
});
