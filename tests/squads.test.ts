import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMember,
  createRoom,
  addMember,
  applyCommand,
  advance,
  damageMember,
  snapshot,
  forViewer,
  parseCommand,
} from '../server/model.ts';
import { activeRoom } from '../server/directory.ts';
import { footstepDirection } from '../lib/game/sound-cues.ts';
const at = 100000;
function squad() {
  const r = createRoom(
    'ABC234',
    createMember('a', 'Alpha', 'secret-a', at),
    at,
  );
  for (const id of ['b', 'c', 'd'])
    addMember(r, createMember(id, id, 'secret-' + id, at));
  applyCommand(r, 'a', { type: 'mode', mode: 'duos' }, at);
  applyCommand(r, 'a', { type: 'start' }, at);
  advance(r, at + 5000);
  r.players.forEach((p, i) =>
    Object.assign(p, {
      dropping: false,
      x: i % 2 ? 20 : 0,
      z: 50,
      y: 1.7,
      lastSeen: at + 5000,
    }),
  );
  return r;
}
void test('directory exposes only public summaries and omits abandoned rooms', () => {
  const r = squad();
  const row = activeRoom(r, at + 5000)!;
  assert.equal(row.mode, 'duos');
  assert.equal(row.players, 4);
  assert.equal(row.alive, 4);
  assert.equal(row.joinable, true);
  assert.ok(!JSON.stringify(row).includes('secret'));
  assert.deepEqual(
    Object.keys(row).sort(),
    [
      'code',
      'hostName',
      'phase',
      'players',
      'capacity',
      'alive',
      'joinable',
      'mode',
    ].sort(),
  );
  assert.equal(activeRoom(r, at + 20001), null);
  for (let i = 0; i < 4; i++)
    addMember(r, createMember('extra' + i, 'Extra', 'secret', at + 5000));
  assert.equal(activeRoom(r, at + 5000)?.joinable, false);
});
void test('late arrivals spectate, do not change the winner, and play the rematch', () => {
  const r = squad();
  const late = createMember('late', 'Visitor', 'secret', at + 6000);
  addMember(r, late);
  assert.equal(late.spectator, true);
  assert.equal(late.health, 0);
  const [a, b, c, d] = r.players;
  damageMember(r, b, 999, at + 6100, a);
  damageMember(r, d, 999, at + 6100, c);
  advance(r, at + 6100);
  assert.equal(r.phase, 'finished');
  assert.equal(r.winningTeam, a.team);
  assert.equal(late.rank, 0);
  applyCommand(r, 'a', { type: 'rematch' }, at + 6200);
  applyCommand(r, 'a', { type: 'start' }, at + 6300);
  assert.equal(late.spectator, false);
  assert.equal(late.health, 100);
  assert.equal(late.dropping, true);
});
void test('duos prevent friendly damage and a four-second revive restores a downed teammate', () => {
  const r = squad(),
    [a, b, c] = r.players;
  damageMember(r, a, 999, at + 5100, c);
  assert.equal(a.health, 100);
  assert.equal(a.shield, 50);
  damageMember(r, a, 999, at + 5200, b);
  assert.equal(a.downed, true);
  assert.equal(a.rank, 0);
  assert.equal(b.kills, 0);
  assert.throws(
    () => applyCommand(r, b.id, { type: 'revive', target: a.id }, at + 5300),
    /teammate/,
  );
  applyCommand(r, c.id, { type: 'revive', target: a.id }, at + 5400);
  advance(r, at + 9399);
  assert.equal(a.downed, true);
  advance(r, at + 9400);
  assert.equal(a.downed, false);
  assert.equal(a.health, 50);
  assert.equal(a.shield, 0);
  assert.equal(c.reviving, null);
});
void test('damage, range and explicit cancellation interrupt a revive', () => {
  const r = squad(),
    [a, b, c] = r.players;
  damageMember(r, a, 999, at + 5100, b);
  applyCommand(r, c.id, { type: 'revive', target: a.id }, at + 5200);
  damageMember(r, c, 1, at + 5300, b);
  assert.equal(c.reviving, null);
  applyCommand(r, c.id, { type: 'revive', target: a.id }, at + 5400);
  damageMember(r, a, 1, at + 5500, b);
  assert.equal(c.reviving, null);
  applyCommand(r, c.id, { type: 'revive', target: a.id }, at + 5600);
  c.x += 4;
  advance(r, at + 5700);
  assert.equal(c.reviving, null);
  c.x = a.x;
  applyCommand(r, c.id, { type: 'revive', target: a.id }, at + 5800);
  applyCommand(r, c.id, { type: 'cancelRevive' }, at + 5900);
  assert.equal(c.reviving, null);
});
void test('team wipe and bleed out eliminate downed players without awarding duplicate kills', () => {
  const r = squad(),
    [a, b, c] = r.players;
  damageMember(r, a, 999, at + 5100, b);
  damageMember(r, c, 999, at + 5200, b);
  advance(r, at + 5200);
  assert.equal(a.health, 0);
  assert.equal(c.health, 0);
  assert.equal(b.kills, 2);
  assert.equal(r.phase, 'finished');
  advance(r, at + 5300);
  assert.equal(b.kills, 2);
  const r2 = squad(),
    [a2, b2] = r2.players;
  damageMember(r2, a2, 999, at + 5100, b2);
  r2.players.forEach((p) => (p.lastSeen = at + 25100));
  advance(r2, at + 25100);
  assert.equal(a2.health, 0);
  assert.equal(b2.kills, 1);
});
void test('team selection enforces host controls and two players per duo', () => {
  const r = squad();
  r.phase = 'waiting';
  assert.throws(
    () => applyCommand(r, 'b', { type: 'mode', mode: 'solo' }, at + 5100),
    /Only the host/,
  );
  assert.throws(
    () => applyCommand(r, 'b', { type: 'team', team: 0 }, at + 5100),
    /full/,
  );
  applyCommand(r, 'b', { type: 'team', team: 2 }, at + 5200);
  assert.equal(r.players[1].team, 2);
  assert.throws(() => parseCommand({ type: 'team', team: 50 }), /Invalid/);
});
void test('pings reach only your duo, survive gun events and expire after eight seconds', () => {
  const r = squad(),
    [a, b, c] = r.players;
  applyCommand(
    r,
    a.id,
    { type: 'mark', point: [0, 1, 40], label: 'Enemy' },
    at + 5100,
  );
  assert.equal(
    forViewer(snapshot(r, at + 5200), c.id).events.filter(
      (e) => e.type === 'mark',
    ).length,
    1,
  );
  assert.equal(
    forViewer(snapshot(r, at + 5200), b.id).events.filter(
      (e) => e.type === 'mark',
    ).length,
    0,
  );
  applyCommand(
    r,
    a.id,
    { type: 'mark', point: [1, 1, 40], label: 'Loot' },
    at + 5200,
  );
  assert.equal(r.marks?.length, 1);
  assert.equal(r.marks?.[0].label, 'Enemy');
  r.events = [];
  assert.equal(snapshot(r, at + 12000).events.length, 1);
  assert.equal(snapshot(r, at + 13100).events.length, 0);
  assert.throws(
    () =>
      parseCommand({ type: 'mark', point: [Infinity, 0, 0], label: 'Enemy' }),
    /Invalid/,
  );
});
void test('footstep cues point forward, right and behind, rotate with view, and fade with distance', () => {
  const me = { x: 0, z: 0, yaw: 0 };
  assert.equal(footstepDirection(me, { x: 0, z: -10 })?.angle, 0);
  assert.equal(footstepDirection(me, { x: 10, z: 0 })?.angle, 90);
  assert.equal(footstepDirection(me, { x: 0, z: 10 })?.angle, 180);
  assert.equal(
    footstepDirection({ ...me, yaw: Math.PI / 2 }, { x: -10, z: 0 })?.angle,
    0,
  );
  assert.ok(
    footstepDirection(me, { x: 1, z: 0 })!.strength >
      footstepDirection(me, { x: 20, z: 0 })!.strength,
  );
  assert.equal(footstepDirection(me, { x: 29, z: 0 }), null);
});
