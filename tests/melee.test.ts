import test from 'node:test';
import assert from 'node:assert/strict';
import { MELEE, meleeBody, meleeTarget } from '../lib/game/melee.ts';
import {
  createMember,
  createRoom,
  addMember,
  applyCommand,
  parseCommand,
  snapshot,
} from '../server/model.ts';
import { MAP } from '../lib/game/map-data.ts';
const at = 100000;
function arena() {
  const r = createRoom('MELEE1', createMember('a', 'A', 'secret1', at), at);
  addMember(r, createMember('b', 'B', 'secret2', at));
  r.phase = 'playing';
  r.startAt = at;
  r.tickAt = at;
  for (const [i, p] of r.players.entries())
    Object.assign(p, {
      x: 0,
      y: 1.7,
      z: 40 - i * 2,
      yaw: 0,
      pitch: 0,
      dropping: false,
    });
  return r;
}
void test('melee cone selects one nearby target, rejects distance, rear targets and solid cover', () => {
  const origin = { x: 0, y: 1.7, z: 0 };
  const front = meleeBody('front', 0, 1.7, -2),
    close = meleeBody('close', 0.1, 1.7, -1);
  assert.equal(meleeTarget(origin, 0, 0, [front, close], [])?.id, 'close');
  assert.equal(
    meleeTarget(origin, 0, 0, [meleeBody('rear', 0, 1.7, 1)], []),
    null,
  );
  assert.equal(
    meleeTarget(
      origin,
      0,
      0,
      [meleeBody('far', 0, 1.7, -MELEE.range - 0.1)],
      [],
    ),
    null,
  );
  assert.equal(
    meleeTarget(
      origin,
      0,
      0,
      [front],
      [{ min: [-1, 0, -1.5], max: [1, 3, -1.4] }],
    ),
    null,
  );
  assert.ok(
    meleeTarget(
      origin,
      0,
      -0.5,
      [meleeBody('downed', 0, 1.7, -2, false, true)],
      [],
    ),
  );
});
void test('server accepts unarmed melee, absorbs shield, rate limits punches and cancels recovery/reload', () => {
  const r = arena(),
    [a, b] = r.players;
  a.health = 70;
  a.medkits = 1;
  applyCommand(r, a.id, { type: 'heal', item: 'medkit' }, at + 10);
  a.reloadUntil = at + 2000;
  applyCommand(r, a.id, parseCommand({ type: 'melee', pose: a }), at + 100);
  assert.equal(b.shield, 25);
  assert.equal(b.health, 100);
  assert.equal(a.healing, null);
  assert.equal(a.reloadUntil, 0);
  assert.equal(a.medkits, 1);
  assert.deepEqual(a.ammo, [0, 0, 0]);
  assert.equal(a.weapon, -1);
  applyCommand(r, a.id, { type: 'melee', pose: a }, at + 200);
  assert.equal(b.shield, 25);
  applyCommand(r, a.id, { type: 'melee', pose: a }, at + 751);
  assert.equal(b.shield, 0);
  assert.equal(b.health, 100);
  const events = snapshot(r, at + 751).events;
  assert.equal(events.filter((e) => e.type === 'melee').length, 2);
  assert.ok(events.some((e) => e.type === 'hit' && e.shieldBreak));
  assert.throws(() =>
    parseCommand({ type: 'melee', pose: { ...a, yaw: NaN } }),
  );
});
void test('melee cannot be combined with an immediate gunshot, and armed punches consume no rounds', () => {
  const r = arena(),
    [a, b] = r.players;
  a.owned[0] = true;
  a.weapon = 0;
  a.ammo[0] = 30;
  applyCommand(r, a.id, { type: 'melee', pose: a }, at + 100);
  assert.equal(a.ammo[0], 30);
  applyCommand(r, a.id, { type: 'shoot', pose: a, aiming: true }, at + 101);
  assert.equal(a.ammo[0], 30);
  assert.equal(b.shield, 25);
  applyCommand(r, a.id, { type: 'shoot', pose: a, aiming: true }, at + 751);
  assert.equal(a.ammo[0], 29);
});
void test('server blocks punches through cover and while dropping, downed, spectating or mantling', () => {
  for (const state of [
    { dropping: true, y: 20 },
    { downed: true, bleedOutAt: at + 20000 },
    { health: 0, spectator: true },
    { mantleUntil: at + 1000 },
  ]) {
    const r = arena(),
      [a, b] = r.players;
    Object.assign(a, state);
    applyCommand(r, a.id, { type: 'melee', pose: a }, at + 100);
    assert.equal(b.shield, 50);
  }
  const r = arena(),
    [a, b] = r.players;
  const wall = MAP.colliders.find(
    (w) => w.max[2] - w.min[2] < 1.1 && w.max[1] > 2,
  )!;
  a.x = b.x = (wall.min[0] + wall.max[0]) / 2;
  a.z = wall.max[2] + 0.55;
  b.z = wall.min[2] - 0.55;
  applyCommand(r, a.id, { type: 'melee', pose: a }, at + 100);
  assert.equal(b.shield, 50);
});
void test('melee respects duos and lethal punches retain killer identity and elimination loot', () => {
  const r = arena(),
    [a, b] = r.players;
  r.players.push({
    ...createMember('c', 'C', 'secret3', at),
    team: 1,
    x: 20,
    z: 40,
  });
  r.mode = 'duos';
  a.team = b.team = 0;
  applyCommand(r, a.id, { type: 'melee', pose: a }, at + 100);
  assert.equal(b.shield, 50);
  r.mode = 'solo';
  b.health = 25;
  b.shield = 0;
  b.owned[0] = true;
  b.ammo[0] = 9;
  applyCommand(r, a.id, { type: 'melee', pose: a }, at + 751);
  assert.equal(b.health, 0);
  assert.equal(b.killedBy, a.id);
  assert.equal(a.kills, 1);
  assert.ok(r.drops?.some((d) => d.kind === 0));
});
