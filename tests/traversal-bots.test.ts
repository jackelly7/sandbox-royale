import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRoom,
  createMember,
  addMember,
  applyCommand,
  advance,
  snapshot,
  damageMember,
  blocked,
  parseCommand,
} from '../server/model.ts';
import { activeRoom } from '../server/directory.ts';
import { botPath } from '../server/bots.ts';
import {
  BUS_SECONDS,
  busPosition,
  LAUNCH_PADS,
  glideHeight,
  LIFT_SECONDS,
} from '../lib/game/traversal.ts';
import { MAP } from '../lib/game/map-data.ts';
import { CHEST_SPOTS, canReach } from '../lib/game/chests.ts';
import { BattleGame } from '../lib/game/engine.ts';
import * as THREE from 'three';
const at = 100000;
function room(count = 0) {
  const r = createRoom('BUS234', createMember('a', 'Alice', 'secret', at), at);
  addMember(r, createMember('b', 'Bob', 'secret', at));
  applyCommand(r, 'a', { type: 'bots', count }, at);
  applyCommand(r, 'a', { type: 'start' }, at);
  return r;
}
function tick(r: ReturnType<typeof room>, now: number) {
  for (const p of r.players) if (!p.bot) p.lastSeen = now;
  advance(r, now);
}
void test('bus riders share the route, choose separate jumps, cannot teleport or shoot, and auto-drop', () => {
  const r = room(),
    [a, b] = r.players;
  tick(r, at + 7000);
  assert.deepEqual({ x: a.x, y: a.y, z: a.z }, busPosition(2));
  assert.equal(a.onBus, true);
  applyCommand(
    r,
    a.id,
    { type: 'pose', pose: { ...a, x: 0, y: 1.7, z: 0 } },
    at + 7000,
  );
  assert.equal(a.x, busPosition(2).x);
  damageMember(r, a, 999, at + 7000, b);
  assert.equal(a.health, 100);
  applyCommand(r, a.id, { type: 'jumpBus' }, at + 7000);
  assert.equal(a.onBus, false);
  assert.equal(b.onBus, true);
  tick(r, at + 8000);
  assert.equal(a.y, 59);
  assert.equal(b.y, 65);
  applyCommand(r, a.id, { type: 'jumpBus' }, at + 8000);
  assert.equal(a.y, 59);
  tick(r, at + 5000 + BUS_SECONDS * 1000);
  assert.equal(b.onBus, false);
  assert.equal(b.y, 65);
  assert.equal(snapshot(r, at + 23000).zone!.remaining, 40);
  tick(r, at + 34000);
  assert.equal(b.dropping, false);
  assert.equal(b.y, 1.7);
  assert.ok(!blocked(b.x, b.z));
});
void test('all launch pads have clear approaches; launch lift and glide are authoritative and frame independent', () => {
  for (const p of LAUNCH_PADS) {
    assert.ok(!blocked(p.x, p.z));
    for (let i = 0; i < 8; i++)
      assert.ok(
        !blocked(
          p.x + Math.cos((i * Math.PI) / 4) * 2,
          p.z + Math.sin((i * Math.PI) / 4) * 2,
        ),
      );
  }
  const r = room(),
    a = r.players[0];
  Object.assign(a, {
    ...LAUNCH_PADS[0],
    onBus: false,
    dropping: false,
    y: 1.7,
  });
  tick(r, at + 6000);
  assert.equal(a.dropping, true);
  assert.equal(a.launchAt, at + 6000);
  tick(r, at + 6500);
  assert.ok(Math.abs(a.y - 18.7) < 0.01);
  applyCommand(r, a.id, { type: 'pose', pose: { ...a, y: 99 } }, at + 6500);
  assert.ok(a.y < 20);
  tick(r, at + 6850);
  assert.ok(Math.abs(a.y - 30.6) < 0.01);
  a.x += 4;
  tick(r, at + 13000);
  assert.equal(a.dropping, false);
  let y = 1.7;
  for (let i = 0; i < 20; i++)
    y = glideHeight(y, 0.1, Math.max(0, LIFT_SECONDS - i * 0.1));
  assert.ok(Math.abs(y - glideHeight(1.7, 2, LIFT_SECONDS)) < 1e-8);
});
void test('host bot setting is bounded, preserves human seats, and never makes a bot host or a ready-up voter', () => {
  const r = room(8);
  assert.equal(r.players.filter((p) => p.bot).length, 8);
  assert.throws(
    () => applyCommand(r, 'b', { type: 'bots', count: 4 }, at + 1),
    /host/,
  );
  assert.throws(() => parseCommand({ type: 'bots', count: 100 }), /Invalid/);
  for (let i = 0; i < 6; i++)
    addMember(r, createMember('extra' + i, 'Guest', 'secret', at));
  assert.equal(r.players.length, 16);
  assert.throws(
    () => addMember(r, createMember('overflow', 'Guest', 'secret', at)),
    /full/,
  );
  assert.equal(activeRoom(r, at)?.players, 8);
  const publicState = JSON.stringify(snapshot(r, at));
  assert.ok(
    !publicState.includes('thinkAt') && !publicState.includes('secret'),
  );
  r.phase = 'finished';
  for (const p of r.players) if (!p.bot) p.ready = true;
  tick(r, at + 1000);
  assert.equal(r.round, 2);
  assert.equal(r.players.filter((p) => p.bot).length, 8);
  assert.ok(r.players.every((p) => p.onBus));
  assert.ok(!r.players.find((p) => p.id === r.host)?.bot);
  for (const p of r.players) if (!p.bot) p.lastSeen = 0;
  assert.equal(activeRoom(r, at + 20000), null);
});
void test('bots can loot a chest, collect ammunition, and damage another bot without preferring the human', () => {
  const r = room(4);
  tick(r, at + 5000);
  const bots = r.players.filter((p) => p.bot),
    [a, b] = bots;
  for (const p of r.players)
    Object.assign(p, { onBus: false, dropping: false, y: 1.7, x: 140, z: 0 });
  Object.assign(a, { ...CHEST_SPOTS[0], ai: { thinkAt: 0, jumpAt: 0 } });
  tick(r, at + 5100);
  assert.ok(r.chests![0].openedAt);
  for (let i = 0; i < 100; i++) tick(r, at + 5200 + i * 100);
  assert.ok(a.owned.some(Boolean), 'bot collected a weapon');
  r.players[0].health = 100;
  r.players[0].shield = 50;
  // An unobstructed duel isolates target selection and server hit resolution.
  for (const p of bots) Object.assign(p, { x: 120, z: 100 });
  Object.assign(a, {
    x: 0,
    z: 130,
    y: 1.7,
    health: 100,
    shield: 50,
    owned: [true, false, false],
    weapon: 0,
    ammo: [30, 0, 0],
    reserve: [90, 0, 0],
    medkits: 0,
    cells: 0,
    ai: { thinkAt: 0, jumpAt: 0 },
  });
  Object.assign(b, {
    x: 0,
    z: 125,
    y: 1.7,
    health: 100,
    shield: 50,
    ai: { thinkAt: Infinity, jumpAt: 0 },
  });
  for (let i = 0; i < 30; i++) tick(r, at + 16000 + i * 100);
  assert.ok(b.health + b.shield < 150, 'bot shoots its nearby bot opponent');
  assert.equal(
    r.players[0].health,
    100,
    'distant human is not the preferred target',
  );
});
void test('bot navigation finds a wall-safe route through a castle entrance', () => {
  const target = CHEST_SPOTS[0],
    from = { x: target.x, z: target.z + 22 };
  const path = botPath(from, target);
  assert.ok(path.length > 0);
  let previous = from;
  for (const next of path) {
    assert.ok(
      canReach({ ...previous, y: 1 }, { ...next, y: 1 }, MAP.colliders, 400),
    );
    previous = next;
  }
});
void test('M map clears firing and movement without pausing the match', () => {
  const g = Object.create(BattleGame.prototype) as BattleGame;
  Object.assign(g, {
    state: { phase: 'playing', mapOpen: false },
    shooting: true,
    triggerHeld: true,
    keys: new Set(['KeyW']),
    touchMove: { x: 1, y: 1 },
    setAiming: () => {},
    emit: () => {},
  });
  g.toggleMap();
  assert.equal(g.state.phase, 'playing');
  assert.equal(g.state.mapOpen, true);
  assert.equal(g.shooting, false);
  assert.equal(g.keys.size, 0);
  g.toggleMap();
  assert.equal(g.state.mapOpen, false);
});
void test('solo jump leaves the bus and preserves the selected position and empty inventory', () => {
  const g = Object.create(BattleGame.prototype) as BattleGame;
  Object.assign(g, {
    state: {
      phase: 'playing',
      onBus: true,
      dropping: true,
      owned: [false, false, false],
    },
    position: new THREE.Vector3(10, 65, 20),
    notice: () => {},
  });
  g.jump();
  assert.equal(g.state.onBus, false);
  assert.deepEqual(g.position.toArray(), [10, 65, 20]);
  assert.equal(g.state.dropping, true);
  assert.ok(!g.state.owned.some(Boolean));
});
