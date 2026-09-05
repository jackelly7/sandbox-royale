import test from 'node:test';
import assert from 'node:assert/strict';
import {
  zoneAt,
  zonePlan,
  outsideZone,
  ZONE_PHASES,
} from '../lib/game/zones.ts';
import { MAP } from '../lib/game/map-data.ts';
import {
  createRoom,
  createMember,
  advance,
  snapshot,
} from '../server/model.ts';
void test('seeded off-center circles are nested and finish in playable space', () => {
  for (let seed = 0; seed < 50; seed++) {
    const circles = zonePlan(String(seed));
    for (let i = 1; i < circles.length; i++) {
      const a = circles[i - 1],
        b = circles[i];
      const shift = Math.hypot(a.x - b.x, a.z - b.z);
      assert.ok(shift > 0);
      assert.ok(shift + b.radius <= a.radius);
      assert.ok(
        !MAP.colliders.some(
          (c) =>
            b.x > c.min[0] - 1 &&
            b.x < c.max[0] + 1 &&
            b.z > c.min[2] - 1 &&
            b.z < c.max[2] + 1,
        ),
      );
    }
  }
  assert.deepEqual(zoneAt(123, 'duo:1'), zoneAt(123, 'duo:1'));
  assert.notDeepEqual(zonePlan('duo:1'), zonePlan('duo:2'));
});
void test('zone holds, closes continuously, and announces the exact next destination', () => {
  let at = 0;
  for (const { wait, close } of ZONE_PHASES) {
    const hold = zoneAt(at);
    assert.equal(hold.stage, 'waiting');
    assert.equal(zoneAt(at + wait - 0.001).radius, hold.radius);
    const middle = zoneAt(at + wait + close / 2);
    assert.equal(middle.stage, 'closing');
    assert.equal(middle.radius, (hold.radius + hold.next.radius) / 2);
    assert.ok(Math.abs(middle.x - (hold.x + hold.next.x) / 2) < 1e-10);
    at += wait + close;
    const end = zoneAt(at);
    assert.equal(end.radius, hold.next.radius);
    assert.equal(end.x, hold.next.x);
    assert.equal(end.z, hold.next.z);
  }
  assert.equal(at, 152);
  assert.equal(zoneAt(900).stage, 'final');
  assert.equal(zoneAt(900).radius, 5);
});
void test('multiplayer damage and snapshots use the same moving center', () => {
  const room = createRoom('ZONES1', createMember('a', 'A', 'secret', 0), 0);
  room.players.push(createMember('b', 'B', 'secret', 0));
  room.phase = 'playing';
  room.startAt = 0;
  room.round = 1;
  const now = 269000,
    zone = zoneAt(now / 1000, `${room.code}:${room.round}`);
  room.tickAt = now - 100;
  const [safe, exposed] = room.players;
  Object.assign(safe, { x: zone.x, z: zone.z, lastSeen: now });
  Object.assign(exposed, { x: 0, z: 0, lastSeen: now });
  assert.ok(outsideZone(0, 0, zone));
  advance(room, now);
  assert.equal(safe.health, 100);
  assert.ok(exposed.health < 100);
  assert.deepEqual(snapshot(room, now).zone, zone);
});

void test('small rooms start tighter and reach meaningful circles earlier without jumping when players die', () => {
  assert.equal(zoneAt(0, 'small', 2).radius, 78);
  assert.equal(zoneAt(0, 'large', 16).radius, 107);
  assert.equal(zoneAt(32, 'small', 2).radius, 48);
  assert.ok(zoneAt(60, 'small', 2).radius <= 30);
  assert.equal(zoneAt(122, 'small', 2).stage, 'final');
});
