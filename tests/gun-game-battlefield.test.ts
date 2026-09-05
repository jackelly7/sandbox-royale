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
  blocked,
  parseCommand,
} from '../server/model.ts';
import { GUN_LADDER, gunLoadout, gunSpawn } from '../lib/game/gun-game.ts';
import { WEAPONS } from '../lib/game/rules.ts';
import {
  supplyPlan,
  supplyLoot,
  smokeLoot,
  throwSmoke,
  smokeBlocks,
  SMOKE_LIMIT,
} from '../lib/game/battlefield.ts';
import { BattlefieldEffects } from '../lib/game/battlefield-models.ts';
import { MAP } from '../lib/game/map-data.ts';
import { canReach } from '../lib/game/chests.ts';
import { zoneAt } from '../lib/game/zones.ts';
import { weaponModel } from '../lib/game/weapon-models.ts';
import { BattleGame } from '../lib/game/engine.ts';

function room(mode: 'solo' | 'gun-game' = 'gun-game', bots = 0) {
  const r = createRoom(
    'GUN234',
    createMember('a', 'Alice', 'private-a', 1000),
    1000,
  );
  addMember(r, createMember('b', 'Bob', 'private-b', 1000));
  applyCommand(r, 'a', { type: 'mode', mode }, 1000);
  applyCommand(r, 'a', { type: 'bots', count: bots }, 1000);
  applyCommand(r, 'a', { type: 'start' }, 1000);
  tick(r, 8000);
  return r;
}
function tick(r: ReturnType<typeof room>, now: number) {
  r.players.forEach((p) => (p.lastSeen = now));
  advance(r, now);
}

void test('Gun Game starts equipped inside clear arena spawns, without bus, storm phases or BR loot', () => {
  const r = room();
  assert.equal(r.phase, 'playing');
  assert.equal(r.busDuration, 0);
  assert.equal(r.drops!.length, 0);
  assert.equal(r.chests!.length, 0);
  assert.ok(r.loot.every(Boolean));
  assert.equal(r.supply, undefined);
  for (const p of r.players) {
    assert.equal(p.weapon, 3);
    assert.equal(p.owned.filter(Boolean).length, 1);
    assert.ok(!p.dropping && !p.onBus && !blocked(p.x, p.z));
    assert.ok(Math.hypot(p.x, p.z) < 80);
  }
  assert.ok(
    Math.hypot(
      r.players[0].x - r.players[1].x,
      r.players[0].z - r.players[1].z,
    ) > 30,
  );
  assert.equal(snapshot(r, 8000).zone!.radius, 80);
  assert.deepEqual(parseCommand({ type: 'mode', mode: 'gun-game' }), {
    type: 'mode',
    mode: 'gun-game',
  });
  const spawn = gunSpawn(r.players, 7);
  assert.ok(!blocked(spawn.x, spawn.z));
});

void test('every elimination advances once; death preserves progress and respawns; final weapon wins', () => {
  const r = room(),
    [a, b] = r.players;
  let now = 8000;
  for (let stage = 0; stage < GUN_LADDER.length; stage++) {
    assert.equal(a.weapon, GUN_LADDER[stage]);
    damageMember(r, b, 999, now, a);
    damageMember(r, b, 999, now, a);
    assert.equal(a.gunStage, stage + 1);
    assert.equal(a.kills, stage + 1);
    assert.equal(b.health, 0);
    assert.equal(b.gunStage, 0);
    if (stage === 7) break;
    assert.equal(
      r.phase,
      'playing',
      'A temporarily last-alive player has not won',
    );
    tick(r, now + 2999);
    assert.equal(b.health, 0);
    tick(r, now + 3000);
    assert.equal(b.health, 100);
    assert.equal(b.shield, 50);
    assert.equal(b.weapon, 3);
    assert.equal(b.rank, 0);
    assert.ok(!blocked(b.x, b.z));
    damageMember(r, b, 999, now + 3001, a);
    assert.equal(b.health, 100, 'Respawn protection');
    now += 5000;
    tick(r, now);
  }
  assert.equal(r.phase, 'finished');
  assert.equal(r.winner, a.id);
  assert.equal(a.rank, 1);
  assert.equal(b.rank, 2);
  assert.equal(r.drops!.length, 0, 'Respawning enemies never create BR loot');
  damageMember(r, a, 999, now, b);
  assert.equal(a.health, 100, 'Finished rounds are frozen');
  applyCommand(r, a.id, { type: 'ready' }, now + 100);
  applyCommand(r, b.id, { type: 'ready' }, now + 100);
  assert.equal(r.phase, 'countdown');
  assert.equal(r.round, 2);
  assert.ok(r.players.every((p) => p.gunStage === 0 && p.weapon === 3));
});

void test('Gun Game uses authoritative shots, reports the fired weapon across promotion, and supports late joins', () => {
  const r = room(),
    [a, b] = r.players;
  Object.assign(a, {
    x: 0,
    y: 1.7,
    z: 55,
    yaw: 0,
    pitch: 0,
    protectedUntil: 0,
  });
  Object.assign(b, {
    x: 0,
    y: 1.7,
    z: 50,
    health: 10,
    shield: 0,
    protectedUntil: 0,
  });
  assert.ok(canReach(a, b, MAP.colliders, 10));
  applyCommand(r, a.id, { type: 'shoot', pose: { ...a }, aiming: true }, 8000);
  assert.equal(a.weapon, 4);
  assert.equal(a.ammo[4], WEAPONS[4].capacity);
  assert.equal(a.protectedUntil, 0);
  assert.equal(r.events.findLast((e) => e.type === 'shot')!.weapon, 3);
  addMember(r, createMember('c', 'C', 'private-c', 8100));
  assert.equal(r.players[2].spectator, false);
  assert.equal(r.players[2].weapon, 3);
  r.players[2].health = 0;
  r.players[2].respawnAt = 11000;
  r.players[2].gunStage = 4;
  tick(r, 11000);
  assert.equal(r.players[2].weapon, GUN_LADDER[4]);
  const reserve = a.reserve[4];
  applyCommand(r, a.id, { type: 'pickup', index: 0 }, 11000);
  assert.equal(a.reserve[4], reserve);
});

void test('bots fight each other, advance guns, and respawn in Gun Game', () => {
  const r = room('gun-game', 4);
  for (let now = 8050; now < 98000 && r.phase === 'playing'; now += 50)
    tick(r, now);
  const bots = r.players.filter((p) => p.bot);
  assert.ok(
    bots.some((p) => (p.gunStage ?? 0) > 0),
    'Bots earned weapon progression',
  );
  assert.ok(
    bots.some((p) => (p.spawnedAt ?? 0) > 6000),
    'Bots respawned',
  );
  assert.ok(
    r.events.some(
      (e) =>
        e.type === 'elimination' &&
        e.player.startsWith('bot-') &&
        e.target?.startsWith('bot-'),
    ),
    'Bots eliminate other bots',
  );
});

void test('supply drops vary predictably, land in the upcoming circle, and can only be opened once at close range', () => {
  for (let i = 0; i < 100; i++) {
    const s = supplyPlan(String(i));
    assert.deepEqual(s, supplyPlan(String(i)));
    assert.ok(!blocked(s.x, s.z));
    const next = zoneAt(65, String(i)).next;
    assert.ok(Math.hypot(s.x - next.x, s.z - next.z) < next.radius);
    assert.ok(s.rarity >= 2);
    assert.ok(s.weapon < 3);
  }
  const r = room('solo'),
    [a, b] = r.players,
    s = r.supply!;
  tick(r, r.startAt + s.arrivesAt - 1);
  Object.assign(a, {
    x: s.x,
    y: 1.7,
    z: s.z + 2,
    onBus: false,
    dropping: false,
  });
  Object.assign(b, {
    x: s.x,
    y: 1.7,
    z: s.z + 2,
    onBus: false,
    dropping: false,
  });
  const before = r.drops!.length;
  applyCommand(r, a.id, { type: 'supply' }, r.startAt + s.arrivesAt - 1);
  assert.equal(s.opened, false);
  tick(r, r.startAt + s.arrivesAt);
  applyCommand(r, a.id, { type: 'supply' }, r.startAt + s.arrivesAt);
  applyCommand(r, b.id, { type: 'supply' }, r.startAt + s.arrivesAt);
  assert.equal(s.opened, true);
  assert.equal(r.drops!.length, before + 5);
  const drops = r.drops!.slice(before);
  assert.equal(drops[0].rarity, s.rarity);
  assert.equal(drops[1].kind, drops[0].kind + 5);
  assert.equal(drops[4].kind, 8);
  assert.ok(drops.every((d) => !blocked(d.x, d.z)));
  assert.equal(supplyLoot(s).length, 5);
});

void test('smoke pickups conserve stacks, never grant medkits, and throw only one sanitized synchronized grenade', () => {
  const r = room('solo'),
    [a, b] = r.players;
  tick(r, 40000);
  Object.assign(a, { onBus: false, dropping: false, y: 1.7 });
  Object.assign(b, { onBus: false, dropping: false, y: 1.7 });
  const index = r.drops!.findIndex((d) => d.kind === 8),
    d = r.drops![index];
  Object.assign(a, { x: d.x, z: d.z, smokes: 1 });
  d.amount = 2;
  applyCommand(
    r,
    a.id,
    { type: 'pickup', index: MAP.loot.length + index },
    40000,
  );
  assert.equal(a.smokes, 2);
  assert.equal(a.medkits, 0);
  assert.equal(d.amount, 1);
  assert.equal(d.used, false);
  Object.assign(b, { x: d.x, z: d.z });
  applyCommand(
    r,
    b.id,
    { type: 'pickup', index: MAP.loot.length + index },
    40000,
  );
  assert.equal(b.smokes, 1);
  assert.equal(b.medkits, 0);
  assert.equal(d.used, true);
  Object.assign(a, { x: 0, z: 55, yaw: 0, pitch: 0 });
  applyCommand(r, a.id, { type: 'smoke', pose: { ...a } }, 40000);
  assert.equal(a.smokes, 1);
  assert.equal(r.smokes!.length, 1);
  assert.deepEqual(Object.keys(r.smokes![0].from).sort(), ['x', 'y', 'z']);
  assert.ok(!JSON.stringify(snapshot(r, 40000).smokes).includes('private'));
  const cloud = r.smokes![0];
  assert.equal(cloud.endsAt - cloud.startsAt, 10000);
  tick(r, 40000 + 11100);
  assert.equal(r.smokes!.length, 0);
});

void test('smoke blocks sight, not bullets; walls stop throws; active cloud count is bounded', () => {
  const s = throwSmoke({ x: 0, y: 1.7, z: 55 }, 0, 0, 0, [], 's');
  assert.equal(
    smokeBlocks(
      { x: s.x, y: 1.7, z: s.z + 10 },
      { x: s.x, y: 1.7, z: s.z - 10 },
      [s],
      1000,
    ),
    false,
  );
  assert.equal(
    smokeBlocks(
      { x: s.x, y: 1.7, z: s.z + 10 },
      { x: s.x, y: 1.7, z: s.z - 10 },
      [s],
      2000,
    ),
    true,
  );
  assert.equal(
    smokeBlocks(
      { x: s.x, y: 1.7, z: s.z + 10 },
      { x: s.x, y: 1.7, z: s.z - 10 },
      [s],
      12000,
    ),
    false,
  );
  const wall = { min: [-2, 0, 50], max: [2, 8, 51] };
  assert.ok(throwSmoke({ x: 0, y: 1.7, z: 55 }, 0, 0, 0, [wall], 'w').z > 51);
  const r = room('solo'),
    [a, b] = r.players;
  Object.assign(a, {
    x: 0,
    y: 1.7,
    z: 55,
    yaw: 0,
    pitch: 0,
    onBus: false,
    dropping: false,
    ...gunLoadout(0),
    smokes: 2,
  });
  Object.assign(b, {
    x: 0,
    y: 1.7,
    z: 50,
    health: 100,
    shield: 0,
    onBus: false,
    dropping: false,
  });
  r.smokes = [{ ...s, x: 0, z: 52, startsAt: 0, endsAt: 20000 }];
  applyCommand(r, a.id, { type: 'shoot', pose: { ...a }, aiming: true }, 8000);
  assert.ok(b.health < 100);
  r.smokes = Array.from({ length: SMOKE_LIMIT }, (_, i) => ({
    ...r.smokes![0],
    id: String(i),
  }));
  applyCommand(r, a.id, { type: 'smoke', pose: { ...a } }, 8000);
  assert.equal(a.smokes, 2);
  assert.equal(r.smokes.length, SMOKE_LIMIT);
});

void test('new weapon silhouettes stay batched and all six smoke clouds share one draw call', () => {
  const bounds = [];
  for (let i = 3; i < 8; i++) {
    const gun = weaponModel(i, 'world');
    let meshes = 0;
    gun.traverse((o) => {
      if (o instanceof THREE.Mesh) meshes++;
    });
    assert.equal(meshes, 1);
    bounds.push(
      new THREE.Box3()
        .setFromObject(gun)
        .getSize(new THREE.Vector3())
        .toArray()
        .join(','),
    );
    const held = weaponModel(i, 'held');
    assert.ok(held.getObjectByName('Action'));
  }
  assert.equal(new Set(bounds).size, 5);
  const fx = new BattlefieldEffects(),
    smokes = Array.from({ length: 6 }, (_, i) =>
      throwSmoke({ x: i * 12, y: 1.7, z: 0 }, 0, 0, 0, [], String(i)),
    );
  fx.update(smokes, undefined, 2000);
  assert.equal(fx.smoke.count, 30);
  assert.equal(
    fx.smoke.geometry.index?.count ??
      fx.smoke.geometry.attributes.position.count,
    60,
  );
  fx.update(smokes, undefined, 12000);
  assert.equal(fx.smoke.count, 0);
  assert.equal(smokeLoot().length, 4);
});

void test('client smoke blocks bot sight without requiring raycasting through the cloud', () => {
  const g = Object.create(BattleGame.prototype) as BattleGame;
  const s = throwSmoke({ x: 0, y: 1.7, z: 55 }, 0, 0, 0, [], 's');
  Object.assign(g, {
    state: { elapsed: 2 },
    localSmokes: [s],
    ray: new THREE.Raycaster(),
    solids: [],
  });
  assert.equal(
    g.visible(
      new THREE.Vector3(s.x, 1.7, s.z + 10),
      new THREE.Vector3(s.x, 1.7, s.z - 10),
    ),
    false,
  );
  g.state.elapsed = 12;
  assert.equal(
    g.visible(
      new THREE.Vector3(s.x, 1.7, s.z + 10),
      new THREE.Vector3(s.x, 1.7, s.z - 10),
    ),
    true,
  );
});

void test('client death, spectator camera, respawn and new loadout remain in the same Gun Game round', () => {
  const r = room(),
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
    network: { playerId: 'a', send: () => {} },
    time: 0,
    touch: false,
    state: {
      phase: 'lobby',
      health: 100,
      owned: [false, false, false],
      tiers: [0, 0, 0],
      feed: [],
    },
    spawnLoot: () => {},
    nameTag: () => undefined,
    emit: () => {},
    sound: () => {},
  });
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  let exits = 0;
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      pointerLockElement: {},
      exitPointerLock: () => {
        exits++;
      },
    },
  });
  try {
    g.applyNetworkSnapshot(structuredClone(snapshot(r, 8000)));
    assert.equal(g.state.weapon, 3);
    assert.equal(g.state.phase, 'paused');
    assert.equal(g.chestRenderer, undefined);
    g.state.phase = 'playing';
    damageMember(r, r.players[0], 999, 8000, r.players[1]);
    g.applyNetworkSnapshot(structuredClone(snapshot(r, 8000)));
    assert.equal(g.state.phase, 'dying');
    assert.equal(exits, 0);
    assert.equal(g.state.respawnRemaining, 3);
    g.completeDeath();
    assert.equal(g.state.phase, 'spectating');
    assert.equal(g.state.spectator?.id, 'b');
    tick(r, 11000);
    g.applyNetworkSnapshot(structuredClone(snapshot(r, 11000)), {
      x: 0,
      y: 1.7,
      z: 0,
      yaw: 0,
      pitch: 0,
      weapon: 3,
    });
    assert.equal(g.state.phase, 'playing');
    assert.equal(g.state.health, 100);
    assert.equal(g.state.weapon, 3);
    assert.deepEqual(g.position.toArray(), [
      r.players[0].x,
      r.players[0].y,
      r.players[0].z,
    ]);
    assert.equal(g.state.spectator, null);
    assert.equal(g.camera.rotation.z, 0);
    assert.equal(g.networkRound, 1);
    tick(r, 13000);
    damageMember(r, r.players[1], 999, 13000, r.players[0]);
    g.applyNetworkSnapshot(structuredClone(snapshot(r, 13000)));
    assert.equal(g.state.weapon, 4);
    assert.equal(g.weaponAmmo[4], 32);
    assert.equal(g.state.gunStage, 1);
    g.bots[0].mesh.rotation.z = 1.45;
    tick(r, 16000);
    g.applyNetworkSnapshot(structuredClone(snapshot(r, 16000)));
    assert.equal(g.bots[0].mesh.rotation.z, 0);
    assert.equal(g.bots[0].dying, 0);
  } finally {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else Reflect.deleteProperty(globalThis, 'document');
    g.disposeObject(g.world);
  }
});
