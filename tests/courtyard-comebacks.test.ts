import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createRoom,
  createMember,
  addMember,
  applyCommand,
  advance,
  damageMember,
  snapshot,
  forViewer,
  roomBounds,
} from '../server/model.ts';
import { GUN_COLLIDERS, GUN_SPAWNS, arenaStep } from '../lib/game/gun-arena.ts';
import { gunArenaModel } from '../lib/game/gun-arena-model.ts';
import { gunSpawn } from '../lib/game/gun-game.ts';
import { botPath } from '../server/bots.ts';
import { blocksBody, groundAt } from '../lib/game/movement.ts';
import { REBOOT_STATIONS } from '../lib/game/comeback.ts';
import { MAP } from '../lib/game/map-data.ts';
import { canReach } from '../lib/game/chests.ts';
import { ZONE_PHASES } from '../lib/game/zones.ts';
import { BattleGame } from '../lib/game/engine.ts';
function game(mode: 'duos' | 'gun-game' | 'solo' = 'gun-game') {
  const r = createRoom(
    'COURT2',
    createMember('a', 'Alice', 'secret-a', 1000),
    1000,
  );
  for (const id of ['b', 'c', 'd'])
    addMember(r, createMember(id, id.toUpperCase(), 'private-' + id, 1000));
  applyCommand(r, 'a', { type: 'mode', mode }, 1000);
  applyCommand(r, 'a', { type: 'start' }, 1000);
  tick(r, 8000);
  if (mode !== 'gun-game')
    r.players.forEach((p, i) =>
      Object.assign(p, {
        x: i * 4,
        z: 50,
        y: 1.7,
        onBus: false,
        dropping: false,
      }),
    );
  return r;
}
function tick(r: ReturnType<typeof game>, now: number) {
  r.players.forEach((p) => (p.lastSeen = now));
  advance(r, now);
}
function kill(
  r: ReturnType<typeof game>,
  victim: string,
  killer: string,
  now: number,
) {
  const v = r.players.find((p) => p.id === victim)!,
    k = r.players.find((p) => p.id === killer)!;
  damageMember(r, v, 999, now, k);
  if (v.downed) damageMember(r, v, 999, now, k);
}
void test('courtyard has sixteen clear spawn positions and reachable alternate ground routes', () => {
  assert.equal(GUN_SPAWNS.length, 16);
  for (const p of GUN_SPAWNS) {
    assert.ok(!blocksBody(p.x, p.z, 0, GUN_COLLIDERS));
    assert.ok(botPath(p, { x: 0, z: 24 }, true).length, JSON.stringify(p));
  }
  assert.equal(
    blocksBody(23, 0, 0, GUN_COLLIDERS),
    false,
    'Tunnel is enterable',
  );
  assert.equal(
    groundAt(23, 0, 3.5, GUN_COLLIDERS),
    3.5,
    'Tunnel roof is walkable',
  );
  assert.equal(
    canReach(
      { x: 16, y: 1.7, z: 0 },
      { x: 30, y: 1.7, z: 0 },
      GUN_COLLIDERS,
      20,
    ),
    true,
  );
  assert.equal(
    canReach(
      { x: 7, y: 1.7, z: 15 },
      { x: 7, y: 1.7, z: 0 },
      GUN_COLLIDERS,
      30,
    ),
    false,
    'Castle walls stop shots',
  );
  const occupied = GUN_SPAWNS.slice(0, 15).map((p) => ({ ...p, health: 100 }));
  assert.deepEqual(gunSpawn(occupied, 0), GUN_SPAWNS[15]);
});
void test('running climbs both ramps with matching client and server height and cannot cross fort walls', () => {
  const r = game(),
    a = r.players[0];
  const g = Object.create(BattleGame.prototype) as BattleGame;
  Object.assign(g, {
    networkRoom: { mode: 'gun-game' },
    position: new THREE.Vector3(23, 1.7, 18),
  });
  Object.assign(a, { x: 23, y: 1.7, z: 18 });
  let feet = 0;
  for (let i = 1; i <= 52; i++) {
    const z = 18 - i * 0.25,
      next = arenaStep(23, z, feet);
    assert.notEqual(next, null);
    feet = next!;
    g.move(g.position, 0, -0.25, g.position.y - 1.7);
    applyCommand(r, a.id, { type: 'pose', pose: { ...a, z } }, 8000 + i * 30);
    assert.ok(Math.abs(g.position.y - a.y) < 1e-6, `${g.position.y} vs ${a.y}`);
  }
  assert.ok(a.y >= 5.2 - 1e-6);
  assert.equal(a.z, 5);
  const before = a.x;
  applyCommand(r, a.id, { type: 'pose', pose: { ...a, x: 40 } }, 10000);
  assert.equal(a.x, before);
  assert.equal(roomBounds(r), GUN_COLLIDERS);
  assert.equal(roomBounds({ mode: 'solo' }), MAP.colliders);
});
void test('courtyard renders in one batch and switching modes restores the original world and collision map', () => {
  const arena = gunArenaModel();
  let meshes = 0,
    triangles = 0;
  arena.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      meshes++;
      triangles +=
        (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
    }
  });
  assert.equal(meshes, 1);
  assert.ok(triangles < 3000, `Courtyard triangles ${triangles}`);
  const g = Object.create(BattleGame.prototype) as BattleGame,
    old = [new THREE.Box3()];
  Object.assign(g, {
    scene: new THREE.Scene(),
    world: new THREE.Group(),
    colliders: old,
    solids: [],
    bots: [],
    state: {},
  });
  g.setArena(true);
  assert.equal(g.world.visible, false);
  assert.equal(g.colliders.length, GUN_COLLIDERS.length);
  g.setArena(false);
  assert.equal(g.world.visible, true);
  assert.equal(g.colliders, old);
  assert.equal(g.gunArena!.visible, false);
  g.disposeObject(arena);
  g.disposeObject(g.scene);
  g.gunSolids?.forEach((s) => g.disposeObject(s));
});
void test('Gun Game health regenerates only after five damage-free seconds, with precise tick timing and no shield regeneration', () => {
  const r = game(),
    [a, b] = r.players;
  a.shield = 0;
  damageMember(r, a, 60, 8000, b);
  tick(r, 12999);
  assert.equal(a.health, 40);
  tick(r, 13500);
  assert.equal(a.health, 50);
  assert.equal(a.shield, 0);
  assert.equal(a.regenerating, true);
  damageMember(r, a, 10, 13500, b);
  tick(r, 18499);
  assert.equal(a.health, 40);
  tick(r, 19000);
  assert.equal(a.health, 50);
  tick(r, 22000);
  assert.equal(a.health, 100);
  assert.equal(a.shield, 0);
  const br = game('solo'),
    [c, d] = br.players;
  c.shield = 0;
  damageMember(br, c, 60, 8000, d);
  tick(br, 18000);
  assert.equal(c.health, 40);
});
void test('round wins and totals are recorded once and survive ready-up, mode changes and late arrivals', () => {
  const r = game(),
    [a, b] = r.players;
  let now = 8000;
  for (let i = 0; i < 8; i++) {
    kill(r, b.id, a.id, now);
    if (i < 7) {
      tick(r, now + 3000);
      now += 5000;
      tick(r, now);
    }
  }
  assert.equal(r.scores?.find((s) => s.id === a.id)?.wins, 1);
  assert.equal(r.scores?.find((s) => s.id === b.id)?.deaths, 8);
  tick(r, now + 100);
  tick(r, now + 200);
  assert.equal(r.scores?.find((s) => s.id === a.id)?.wins, 1);
  assert.equal(r.events.filter((e) => e.type === 'finalWeapon').length, 1);
  for (const p of r.players)
    applyCommand(r, p.id, { type: 'ready' }, now + 300);
  assert.equal(r.phase, 'countdown');
  assert.equal(r.players[1].deaths, 0);
  assert.equal(r.scores?.find((s) => s.id === a.id)?.kills, 8);
  addMember(r, createMember('late', 'Late', 'private-late', now + 400));
  assert.equal(
    r.scores?.find((s) => s.id === 'late'),
    undefined,
  );
  assert.equal(
    snapshot(r, now + 400).scores?.find((s) => s.id === a.id)?.wins,
    1,
  );
});
void test('a duo retrieves its teammate token, channels at a station, and gets one unarmed comeback', () => {
  const r = game('duos'),
    a = r.players[0],
    c = r.players[2],
    b = r.players[1],
    station = REBOOT_STATIONS[0];
  kill(r, c.id, b.id, 8000);
  assert.equal(c.health, 0);
  assert.equal(c.deaths, 1);
  assert.equal(r.tokens?.length, 1);
  Object.assign(b, { x: c.x, z: c.z });
  tick(r, 8100);
  assert.equal(r.tokens![0].carriedBy, null, 'Enemies cannot collect it');
  Object.assign(a, { x: c.x, z: c.z });
  tick(r, 8200);
  assert.equal(r.tokens![0].carriedBy, a.id);
  Object.assign(a, { x: station.x, z: station.z + 2 });
  applyCommand(r, a.id, { type: 'reboot', station: 0 }, 8300);
  assert.equal(a.rebooting, c.id);
  applyCommand(r, a.id, { type: 'reboot', station: 0 }, 8400);
  assert.equal(a.rebootUntil, 13300, 'Repeated E does not restart channel');
  tick(r, 13299);
  assert.equal(c.health, 0);
  tick(r, 13300);
  assert.equal(c.health, 100);
  assert.equal(c.shield, 0);
  assert.equal(c.weapon, -1);
  assert.ok(c.owned.every((v) => !v));
  assert.equal(c.comebackUsed, true);
  assert.equal(c.rank, 0);
  assert.equal(c.deaths, 1);
  assert.equal(r.tokens!.length, 0);
  kill(r, c.id, b.id, 16000);
  assert.equal(c.health, 0);
  assert.equal(c.deaths, 2);
  assert.equal(r.tokens!.length, 0, 'No second comeback');
  assert.ok(r.events.some((e) => e.type === 'reboot' && e.target === c.id));
});
void test('reboot channels reject missing tokens, stop on damage, movement, cancellation and circle four', () => {
  const r = game('duos'),
    a = r.players[0],
    c = r.players[2],
    b = r.players[1],
    station = REBOOT_STATIONS[0];
  Object.assign(a, { x: station.x, z: station.z + 2 });
  applyCommand(r, a.id, { type: 'reboot', station: 0 }, 8000);
  assert.equal(a.rebooting, null);
  kill(r, c.id, b.id, 8100);
  r.tokens![0].carriedBy = a.id;
  applyCommand(r, a.id, { type: 'reboot', station: 0 }, 8200);
  damageMember(r, a, 1, 8300, b);
  assert.equal(a.rebooting, null);
  applyCommand(r, a.id, { type: 'reboot', station: 0 }, 8400);
  a.x += 8;
  tick(r, 8500);
  assert.equal(a.rebooting, null);
  a.x = station.x;
  applyCommand(r, a.id, { type: 'reboot', station: 0 }, 8600);
  applyCommand(r, a.id, { type: 'cancelReboot' }, 8700);
  assert.equal(a.rebooting, null);
  applyCommand(r, a.id, { type: 'reboot', station: 0 }, 8800);
  applyCommand(r, a.id, { type: 'melee', pose: { ...a } }, 8900);
  assert.equal(a.rebooting, null);
  const cutoff =
    r.startAt +
    (18 +
      ZONE_PHASES.slice(0, 3).reduce((sum, p) => sum + p.wait + p.close, 0)) *
      1000;
  tick(r, cutoff);
  assert.equal(snapshot(r, cutoff).comebacksOpen, false);
  assert.equal(r.tokens!.length, 0);
  applyCommand(r, a.id, { type: 'reboot', station: 0 }, cutoff);
  assert.equal(a.rebooting, null);
});
void test('tokens are team-private and a fallen carrier drops the token rather than losing it', () => {
  const r = game('duos'),
    [a, b, c] = r.players;
  kill(r, c.id, b.id, 8000);
  r.tokens![0].carriedBy = a.id;
  assert.equal(forViewer(snapshot(r, 8000), b.id).tokens!.length, 0);
  assert.equal(forViewer(snapshot(r, 8000), a.id).tokens!.length, 1);
  kill(r, a.id, b.id, 8100);
  const token = r.tokens!.find((t) => t.player === c.id)!;
  assert.equal(token.carriedBy, null);
  assert.ok(Math.hypot(token.x - a.x, token.z - a.z) < 3);
  tick(r, 8200);
  assert.equal(r.phase, 'finished');
  assert.equal(r.scores?.find((s) => s.id === b.id)?.wins, 1);
  assert.equal(r.scores?.find((s) => s.id === 'd')?.wins, 1);
});
void test('scoreboard is non-pausing and explicit close leaves gameplay controls unchanged', () => {
  const g = Object.create(BattleGame.prototype) as BattleGame;
  Object.assign(g, {
    state: { phase: 'playing' },
    emit: () => {},
    keys: new Set(['KeyW']),
  });
  g.showScoreboard(true);
  assert.equal(g.state.scoreboardOpen, true);
  assert.equal(g.state.phase, 'playing');
  assert.equal(g.keys.has('KeyW'), true);
  g.showScoreboard(false);
  assert.equal(g.state.scoreboardOpen, false);
});

void test('a revived duos client leaves spectating and offers entry at the station with empty inventory', () => {
  const r = game('duos'),
    g = Object.create(BattleGame.prototype) as BattleGame;
  Object.assign(g, {
    scene: new THREE.Scene(),
    world: new THREE.Group(),
    camera: new THREE.PerspectiveCamera(),
    storm: new THREE.Mesh(),
    gun: new THREE.Group(),
    flash: new THREE.Mesh(),
    position: new THREE.Vector3(),
    correction: new THREE.Vector3(),
    motion: new THREE.Vector2(),
    colliders: [],
    solids: [],
    loot: [],
    bots: [],
    keys: new Set(),
    footsteps: new Map(),
    networkEvents: new Set(),
    networkRound: 0,
    network: { playerId: 'c', send: () => {} },
    time: 0,
    touch: false,
    state: {
      phase: 'lobby',
      health: 100,
      owned: [false, false, false],
      tiers: [0, 0, 0],
      feed: [],
    },
    nameTag: () => undefined,
    emit: () => {},
    sound: () => {},
  });
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { pointerLockElement: null },
  });
  try {
    g.applyNetworkSnapshot(structuredClone(snapshot(r, 8000)));
    g.state.phase = 'playing';
    kill(r, 'c', 'b', 8000);
    g.applyNetworkSnapshot(structuredClone(snapshot(r, 8000)));
    g.completeDeath();
    assert.equal(g.state.phase, 'spectating');
    r.tokens![0].carriedBy = 'a';
    Object.assign(r.players[0], {
      x: REBOOT_STATIONS[0].x,
      z: REBOOT_STATIONS[0].z + 2,
    });
    applyCommand(r, 'a', { type: 'reboot', station: 0 }, 8200);
    tick(r, 13200);
    g.applyNetworkSnapshot(structuredClone(snapshot(r, 13200)));
    assert.equal(g.state.phase, 'paused');
    assert.equal(g.state.health, 100);
    assert.equal(g.state.weapon, -1);
    assert.equal(g.state.spectator, null);
    assert.equal(g.world.visible, true);
    assert.deepEqual(g.position.toArray(), [
      r.players[2].x,
      1.7,
      r.players[2].z,
    ]);
  } finally {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else Reflect.deleteProperty(globalThis, 'document');
    g.disposeObject(g.world);
  }
});
