import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addMember,
  advance,
  applyCommand,
  createMember,
  createRoom,
  parseCommand,
  snapshot,
  blocked,
} from '../server/model.ts';
import { MAP } from '../lib/game/map-data.ts';
const at = 100000;
function waiting() {
  const room = createRoom(
    'ABC234',
    createMember('host', 'Host', 'secret1', at),
    at,
  );
  addMember(room, createMember('friend', 'Friend', 'secret2', at));
  return room;
}
function started() {
  const room = waiting();
  applyCommand(room, 'host', { type: 'start' }, at);
  advance(room, at + 5001);
  return room;
}
void test('host starts one shared countdown and all players spawn clear of cover', () => {
  const room = waiting();
  assert.throws(
    () => applyCommand(room, 'friend', { type: 'start' }, at),
    /Only the host/,
  );
  applyCommand(room, 'host', { type: 'start' }, at);
  assert.equal(room.phase, 'countdown');
  assert.equal(room.startAt, at + 5000);
  for (const p of room.players) assert.equal(blocked(p.x, p.z), false);
  advance(room, at + 5001);
  assert.equal(room.phase, 'playing');
});
void test('rooms require two players and reject late joins and a ninth player', () => {
  const room = createRoom(
    'ABC234',
    createMember('host', 'Host', 'secret', at),
    at,
  );
  assert.throws(
    () => applyCommand(room, 'host', { type: 'start' }, at),
    /two connected/,
  );
  for (let i = 0; i < 7; i++)
    addMember(room, createMember(String(i), 'Player', 'secret', at));
  assert.throws(
    () => addMember(room, createMember('extra', 'Extra', 'secret', at)),
    /full/,
  );
  applyCommand(room, 'host', { type: 'start' }, at);
  assert.throws(
    () => addMember(room, createMember('late', 'Late', 'secret', at)),
    /already started/,
  );
});
void test('server rejects teleports and malformed movement', () => {
  const room = started(),
    p = room.players[0],
    x = p.x,
    z = p.z;
  applyCommand(
    room,
    p.id,
    { type: 'pose', pose: { ...p, x: x + 40, z: z + 40 } },
    at + 5050,
  );
  assert.equal(p.x, x);
  assert.equal(p.z, z);
  assert.throws(
    () => parseCommand({ type: 'pose', pose: { x: NaN } }),
    /Invalid message/,
  );
});
void test('server enforces weapon cooldown and resolves one winner for everyone', () => {
  const room = started(),
    [p, target] = room.players;
  Object.assign(p, { x: 0, y: 1.7, z: 15, yaw: 0, pitch: 0, weapon: 0 });
  Object.assign(target, { x: 0, y: 1.7, z: 5 });
  const shoot = (t: number) =>
    applyCommand(room, p.id, { type: 'shoot', pose: p, aiming: true }, t);
  shoot(at + 5100);
  assert.equal(p.ammo[0], 29);
  shoot(at + 5101);
  assert.equal(p.ammo[0], 29);
  for (let i = 1; i < 8; i++) shoot(at + 5100 + i * 120);
  assert.equal(target.health, 0);
  assert.equal(target.rank, 2);
  assert.equal(p.kills, 1);
  assert.equal(room.winner, p.id);
  assert.equal(room.phase, 'finished');
  assert.equal(p.rank, 1);
});
void test('server does not allow bullets through island buildings', () => {
  const room = started(),
    [p, target] = room.players;
  Object.assign(p, { x: 18, y: 1.7, z: 0, yaw: 0, pitch: 0, weapon: 2 });
  Object.assign(target, { x: 18, y: 1.7, z: -40 });
  applyCommand(room, p.id, { type: 'shoot', pose: p, aiming: true }, at + 5100);
  assert.equal(target.health, 100);
  assert.equal(target.shield, 50);
});
void test('shared loot can only be collected once', () => {
  const room = started(),
    [p, q] = room.players;
  Object.assign(p, MAP.loot[0]);
  Object.assign(q, MAP.loot[0]);
  applyCommand(room, p.id, { type: 'pickup', index: 0 }, at + 5100);
  applyCommand(room, q.id, { type: 'pickup', index: 0 }, at + 5101);
  assert.equal(room.loot[0], true);
  assert.equal(p.reserve[0], 180);
  assert.equal(q.reserve[0], 120);
});
void test('disconnect grace allows recovery and eventually resolves a match', () => {
  const room = started();
  const [p, q] = room.players;
  applyCommand(room, p.id, { type: 'ping' }, at + 19000);
  applyCommand(room, q.id, { type: 'ping' }, at + 19000);
  assert.equal(room.phase, 'playing');
  applyCommand(room, p.id, { type: 'ping' }, at + 40000);
  assert.equal(room.winner, p.id);
  assert.equal(q.rank, 2);
});
void test('waiting host transfers after disconnection and credentials never enter snapshots', () => {
  const room = waiting();
  applyCommand(room, 'friend', { type: 'ping' }, at + 6000);
  assert.equal(room.host, 'friend');
  const text = JSON.stringify(snapshot(room, at + 6000));
  assert.equal(text.includes('secret'), false);
  assert.equal(text.includes('tokenHash'), false);
});
void test('rematch requires the host and resets ammo, loot, and the round', () => {
  const room = started();
  applyCommand(room, 'friend', { type: 'leave' }, at + 5100);
  assert.equal(room.phase, 'finished');
  applyCommand(room, 'host', { type: 'rematch' }, at + 5200);
  assert.equal(room.phase, 'waiting');
  addMember(room, createMember('next', 'Next', 'secret', at + 5200));
  applyCommand(room, 'host', { type: 'start' }, at + 5300);
  assert.equal(room.round, 2);
  assert.ok(room.loot.every((used) => !used));
  assert.ok(room.players.every((p) => p.health === 100 && p.ammo[0] === 30));
});
