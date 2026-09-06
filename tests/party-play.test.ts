import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createMember,
  createRoom,
  addMember,
  applyCommand,
  advance,
  damageMember,
  snapshot,
  parseCommand,
  forViewer,
  roomBounds,
} from '../server/model.ts';
import { isArenaMode, votedMode } from '../lib/game/modes.ts';
import { GUN_COLLIDERS, GUN_SPAWNS } from '../lib/game/gun-arena.ts';
import { gunSpawn, spawnScore } from '../lib/game/gun-game.ts';
import {
  DEFAULT_PREFERENCES,
  cleanPreferences,
  assignSlot,
} from '../lib/game/preferences.ts';
import {
  ActionParticles,
  PARTICLE_LIMIT,
} from '../lib/game/action-particles.ts';
import { practiceRange } from '../lib/game/practice-range.ts';
import { BattleGame } from '../lib/game/engine.ts';
import { WEAPONS } from '../lib/game/rules.ts';
function room(
  mode: 'team-deathmatch' | 'gun-game' = 'team-deathmatch',
  count = 4,
) {
  const r = createRoom(
    'PARTY2',
    createMember('a', 'Alice', 'a-secret', 1000),
    1000,
  );
  for (const id of ['b', 'c', 'd'].slice(0, count - 1))
    addMember(r, createMember(id, id, 'secret-' + id, 1000));
  applyCommand(r, 'a', { type: 'mode', mode }, 1000);
  applyCommand(r, 'a', { type: 'start' }, 1000);
  tick(r, 8000);
  return r;
}
function tick(r: ReturnType<typeof room>, now: number) {
  r.players.forEach((p) => (p.lastSeen = now));
  advance(r, now);
}
void test('Team Deathmatch uses two balanced teams, the courtyard and selected loadouts', () => {
  const r = room();
  assert.deepEqual(
    r.players.map((p) => p.team),
    [0, 1, 0, 1],
  );
  assert.equal(roomBounds(r), GUN_COLLIDERS);
  assert.equal(snapshot(r, 8000).storm, 51);
  assert.equal(r.busDuration, 0);
  assert.deepEqual(r.drops, []);
  assert.ok(r.players.every((p) => p.weapon === 0 && !p.dropping));
  assert.equal(isArenaMode(r.mode), true);
});
void test('Team Deathmatch ignores friendly damage, has no down state and scores exactly once', () => {
  const r = room(),
    [a, b, c] = r.players;
  damageMember(r, c, 999, 8100, a);
  assert.equal(c.health, 100);
  damageMember(r, b, 999, 8100, a);
  assert.equal(b.health, 0);
  assert.equal(b.downed, false);
  assert.equal(b.respawnAt, 11100);
  assert.deepEqual(r.teamScores, [1, 0]);
  damageMember(r, b, 999, 8101, a);
  assert.deepEqual(r.teamScores, [1, 0]);
  assert.equal(a.gunStage, 0);
  assert.equal(r.phase, 'playing');
  tick(r, 11100);
  assert.equal(b.health, 100);
  assert.equal(b.deaths, 1);
  assert.equal(b.weapon, 0);
  assert.equal(b.rank, 0);
});
void test('30 team eliminations finish together and credit every teammate once', () => {
  const r = room(),
    [a, b, c] = r.players;
  r.teamScores = [29, 4];
  damageMember(r, b, 999, 8100, a);
  assert.equal(r.phase, 'finished');
  assert.equal(r.winningTeam, 0);
  assert.equal(a.rank, 1);
  assert.equal(c.rank, 1);
  assert.equal(b.rank, 2);
  assert.equal(r.scores?.find((s) => s.id === 'c')?.wins, 1);
  tick(r, 8200);
  assert.equal(r.scores?.find((s) => s.id === 'a')?.rounds, 1);
});
void test('loadout changes wait until respawn and cannot refill an exposed fighter', () => {
  const r = room(),
    [a, b] = r.players;
  a.ammo[0] = 2;
  applyCommand(r, 'a', { type: 'loadout', weapon: 2 }, 8100);
  assert.equal(a.weapon, 0);
  assert.equal(a.ammo[0], 2);
  damageMember(r, a, 999, 8200, b);
  tick(r, 11200);
  assert.equal(a.weapon, 2);
  assert.equal(a.ammo[2], WEAPONS[2].capacity);
  assert.equal(a.protectedUntil, 13000);
  applyCommand(r, 'a', { type: 'loadout', weapon: 1 }, 11250);
  assert.equal(a.weapon, 1);
  assert.equal(a.protectedUntil, 13000);
});
void test('spawn protection prevents damage and ends immediately on firing', () => {
  const r = room(),
    [a, b] = r.players;
  a.protectedUntil = 10000;
  damageMember(r, a, 999, 8100, b);
  assert.equal(a.health, 100);
  applyCommand(r, 'a', { type: 'shoot', pose: { ...a }, aiming: true }, 8200);
  assert.equal(a.protectedUntil, 0);
  damageMember(r, a, 999, 8300, b);
  assert.equal(a.health, 0);
});
void test('late Team Deathmatch arrivals join the smaller team and receive a protected spawn', () => {
  const r = room('team-deathmatch', 3);
  const d = createMember('late', 'Late', 'late-secret', 8200);
  addMember(r, d);
  assert.equal(d.team, 1);
  assert.equal(d.health, 100);
  assert.equal(d.spectator, false);
  assert.ok((d.protectedUntil ?? 0) > 8200);
  assert.ok(GUN_SPAWNS.some((p) => p.x === d.x && p.z === d.z));
});
void test('voting changes modes, keeps the room and scores, and starts one five-second countdown', () => {
  const r = room();
  r.teamScores = [29, 0];
  damageMember(r, r.players[1], 999, 8100, r.players[0]);
  for (const p of r.players) {
    applyCommand(r, p.id, { type: 'vote', mode: 'gun-game' }, 8200);
    applyCommand(r, p.id, { type: 'ready' }, 8200);
  }
  assert.equal(r.phase, 'countdown');
  assert.equal(r.mode, 'gun-game');
  assert.equal(r.code, 'PARTY2');
  assert.equal(r.round, 2);
  assert.equal(r.startAt, 13200);
  assert.equal(r.scores?.find((s) => s.id === 'a')?.wins, 1);
  assert.deepEqual(r.votes, {});
  assert.ok(r.players.every((p) => p.weapon === 3));
  applyCommand(r, 'a', { type: 'ready' }, 8300);
  assert.equal(r.round, 2);
});
void test('changing a vote cancels that player readiness; offline voters and bots cannot decide', () => {
  const r = room();
  r.teamScores = [29, 0];
  damageMember(r, r.players[1], 999, 8100, r.players[0]);
  applyCommand(r, 'a', { type: 'ready' }, 8200);
  assert.equal(r.players[0].ready, true);
  applyCommand(r, 'a', { type: 'vote', mode: 'solo' }, 8200);
  assert.equal(r.players[0].ready, false);
  const people = [
    { id: 'a', connected: true },
    { id: 'b', connected: true },
    { id: 'c', connected: false },
    { id: 'bot', connected: true, bot: true },
  ];
  assert.equal(
    votedMode(
      people,
      { a: 'duos', b: 'gun-game', c: 'solo', bot: 'solo' },
      'gun-game',
    ),
    'gun-game',
  );
  assert.equal(votedMode(people, {}, 'team-deathmatch'), 'team-deathmatch');
  assert.throws(() =>
    applyCommand(room(), 'a', { type: 'vote', mode: 'solo' }, 8100),
  );
});
void test('voting into Duos from a team mode creates legal duos', () => {
  const r = room();
  r.teamScores = [29, 0];
  damageMember(r, r.players[1], 999, 8100, r.players[0]);
  for (const p of r.players) {
    applyCommand(r, p.id, { type: 'vote', mode: 'duos' }, 8200);
    applyCommand(r, p.id, { type: 'ready' }, 8200);
  }
  assert.equal(r.mode, 'duos');
  assert.equal(r.phase, 'countdown');
  assert.ok(
    r.players.every(
      (p) => r.players.filter((q) => p.team === q.team).length <= 2,
    ),
  );
  assert.ok(r.players.every((p) => p.onBus && p.weapon === -1));
});
void test('Team Deathmatch pings are visible to teammates only', () => {
  const r = room();
  r.marks = [
    {
      id: 'ping-a',
      type: 'mark',
      player: 'a',
      at: 8100,
      end: [0, 0, 0],
      label: 'Enemy',
    },
  ];
  const s = snapshot(r, 8200);
  assert.equal(
    forViewer(s, 'c').events.filter((e) => e.id === 'ping-a').length,
    1,
  );
  assert.equal(
    forViewer(s, 'b').events.filter((e) => e.id === 'ping-a').length,
    0,
  );
});
void test('new commands reject invalid modes and weapon indices', () => {
  assert.deepEqual(parseCommand({ type: 'vote', mode: 'team-deathmatch' }), {
    type: 'vote',
    mode: 'team-deathmatch',
  });
  for (const v of [-1, 8, NaN, 1.5, '2'])
    assert.throws(() => parseCommand({ type: 'loadout', weapon: v }));
  assert.throws(() => parseCommand({ type: 'vote', mode: 'hacked' }));
});
void test('spawn scoring avoids exposed positions, recent deaths and occupied positions', () => {
  const enemy = { x: 0, z: 25, y: 1.7, health: 100 };
  const exposed = { x: 0, z: 28 },
    covered = { x: -32, z: -28 };
  assert.ok(
    spawnScore(covered, [enemy], [], 10000) >
      spawnScore(exposed, [enemy], [], 10000),
  );
  const p = GUN_SPAWNS[0];
  assert.ok(
    spawnScore(p, [], [{ ...p, at: 9500 }], 10000) <
      spawnScore(p, [], [], 10000),
  );
  assert.equal(
    spawnScore(p, [], [{ ...p, at: 0 }], 13000),
    spawnScore(p, [], [], 13000),
  );
  const occupied = GUN_SPAWNS.slice(0, 15).map((p) => ({
    ...p,
    health: 100,
    team: 0,
  }));
  assert.deepEqual(gunSpawn(occupied, 1, [], 1, 0), GUN_SPAWNS[15]);
});
void test('saved preferences validate corrupt input and keep weapon keys a permutation', () => {
  assert.deepEqual(cleanPreferences(null), DEFAULT_PREFERENCES);
  const p = cleanPreferences({
    look: Infinity,
    aim: 99,
    crosshairSize: -1,
    crosshairColor: 'url(x)',
    slots: [0, 0, 0],
    sprint: 'toggle',
  });
  assert.equal(p.look, 1);
  assert.equal(p.aim, 2);
  assert.equal(p.crosshairSize, 0.7);
  assert.equal(p.crosshairColor, '#ffffff');
  assert.deepEqual(p.slots, [0, 1, 2]);
  assert.deepEqual(assignSlot([0, 1, 2], 0, 2), [2, 1, 0]);
});
void test('aim sensitivity works independently of hip fire and wheel follows preferred slots', () => {
  const g = Object.create(BattleGame.prototype) as BattleGame;
  Object.assign(g, {
    state: { weapon: 0, owned: [true, true, true] },
    preferences: {
      ...DEFAULT_PREFERENCES,
      look: 2,
      aim: 0.4,
      slots: [2, 0, 1],
    },
    sensitivity: 2,
    yaw: 0,
    pitch: 0,
    aiming: true,
  });
  g.look(10, 0);
  assert.ok(Math.abs(g.yaw + 0.008) < 1e-10);
  g.aiming = false;
  g.look(10, 0);
  assert.ok(Math.abs(g.yaw + 0.048) < 1e-10);
  assert.equal(g.cycleSlots(1), 1);
  assert.equal(g.cycleSlots(-1), 2);
});
void test('pooled particles never grow and release all visible instances after expiry', () => {
  const fx = new ActionParticles();
  for (let i = 0; i < 500; i++)
    fx.burst({ x: 0, y: 1, z: 0 }, 'elimination', 12);
  assert.equal(fx.particles.length, PARTICLE_LIMIT);
  assert.equal(fx.mesh.count, PARTICLE_LIMIT);
  fx.update(0.1);
  assert.ok(fx.mesh.visible);
  fx.update(2);
  assert.equal(fx.mesh.visible, false);
  const m = new THREE.Matrix4();
  for (let i = 0; i < PARTICLE_LIMIT; i++) {
    fx.mesh.getMatrixAt(i, m);
    assert.equal(m.determinant(), 0);
  }
  fx.mesh.geometry.dispose();
  (fx.mesh.material as THREE.Material).dispose();
});
void test('practice range targets are raycastable at three distances and scenery is batched', () => {
  const r = practiceRange();
  r.root.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(
    new THREE.Vector3(0, 1.7, 30),
    new THREE.Vector3(0, 0, -1),
  );
  const hit = ray.intersectObjects(r.targets, true)[0];
  assert.equal(hit.object.userData.practiceTarget, 1);
  assert.ok(hit.distance > 34 && hit.distance < 36);
  let meshes = 0;
  r.root.traverse((o) => {
    if (o instanceof THREE.Mesh) meshes++;
  });
  assert.equal(meshes, 4);
  BattleGame.prototype.disposeObject(r.root);
});
void test('practice keeps the network session parked and waiting snapshots do not reset the range', async () => {
  const g = Object.create(BattleGame.prototype) as BattleGame;
  const r = room();
  r.phase = 'waiting';
  const session = {
    playerId: 'a',
    send: () => {
      throw new Error('Practice must not send gameplay commands');
    },
  };
  Object.assign(g, {
    network: session,
    networkRoom: snapshot(r, 8000),
    state: {},
    position: new THREE.Vector3(),
    motion: new THREE.Vector2(),
    correction: new THREE.Vector3(),
    scene: new THREE.Scene(),
    gunArena: new THREE.Group(),
    arenaActors: new THREE.Group(),
    storm: new THREE.Mesh(),
    preferences: DEFAULT_PREFERENCES,
    setArena: () => {},
    start: async () => {
      g.state.phase = 'playing';
    },
    notice: () => {},
    lobby: () => {
      g.state.phase = 'lobby';
    },
  });
  await g.startPractice(true);
  assert.equal(g.network, null);
  assert.equal(g.practiceNetwork, session);
  assert.equal(g.state.owned.length, 8);
  g.applyNetworkSnapshot(snapshot(r, 8100));
  assert.equal(g.state.phase, 'playing');
  assert.equal(g.practice, true);
  assert.equal(g.groundHeight(0, 0, 0), 0);
  g.move(g.position, 100, 100);
  assert.deepEqual(g.position.toArray(), [14, 1.7, 43]);
  g.stopPractice();
  assert.equal(g.network, session);
  assert.equal(g.range?.root.visible, false);
  assert.equal(g.state.practice, false);
  g.disposeObject(g.scene);
});
void test('practice uses real gun rays, consumes rounds and reports damage without changing match scores', () => {
  const g = Object.create(BattleGame.prototype) as BattleGame;
  const range = practiceRange();
  Object.assign(g, {
    practice: true,
    range,
    scene: new THREE.Scene(),
    world: new THREE.Group(),
    camera: new THREE.PerspectiveCamera(72, 1, 0.08, 850),
    bots: [],
    loot: [],
    colliders: [],
    solids: [],
    ray: new THREE.Raycaster(),
    tracers: [],
    footsteps: new Map(),
    weaponAmmo: WEAPONS.map((w) => w.capacity),
    reserveAmmo: WEAPONS.map(() => 999),
    yaw: 0,
    pitch: 0,
    time: 1,
    gun: new THREE.Group(),
    keys: new Set(),
    cooldown: 0,
    reloadTimer: 0,
    recoil: 0,
    aiming: true,
    muted: true,
    audio: null,
    flash: new THREE.Mesh(),
    position: new THREE.Vector3(0, 1.7, 30),
    emit: () => {},
    state: {
      phase: 'playing',
      health: 100,
      weapon: 2,
      owned: WEAPONS.map(() => true),
      tiers: WEAPONS.map(() => 0),
      kills: 0,
      dropping: false,
      healing: null,
      damageNumber: 0,
      hit: 0,
    },
  });
  g.scene.add(range.root, g.camera);
  g.camera.position.copy(g.position);
  g.camera.lookAt(0, 1.7, -5);
  g.shoot();
  assert.ok((g.state.practiceHit?.damage ?? 0) > 0);
  assert.equal(g.state.practiceHit?.distance, 35);
  assert.equal(g.weaponAmmo[2], WEAPONS[2].capacity - 1);
  assert.equal(g.state.kills, 0);
  assert.ok(g.tracers.length);
  assert.ok(range.targets[1].userData.hitAt === 1);
  g.disposeObject(g.scene);
});
void test('starting a real match exits practice and restores the authoritative arena and inventory', async () => {
  const r = room();
  r.phase = 'waiting';
  const g = Object.create(BattleGame.prototype) as BattleGame;
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
    networkRoom: snapshot(r, 8000),
    time: 0,
    touch: true,
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
    start: async () => {
      g.state.phase = 'playing';
    },
  });
  const old = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { pointerLockElement: null },
  });
  try {
    await g.startPractice(true);
    r.phase = 'countdown';
    r.startAt = 13000;
    g.applyNetworkSnapshot(snapshot(r, 8100));
    assert.equal(g.practice, false);
    assert.equal(g.range?.root.visible, false);
    assert.equal(g.network?.playerId, 'c');
    assert.equal(g.gunArena?.visible, true);
    assert.equal(g.state.phase, 'paused');
    assert.equal(g.state.weapon, 0);
    assert.equal(g.state.owned.filter(Boolean).length, 1);
    assert.deepEqual(g.position.toArray(), [
      r.players[2].x,
      r.players[2].y,
      r.players[2].z,
    ]);
  } finally {
    if (old) Object.defineProperty(globalThis, 'document', old);
    else Reflect.deleteProperty(globalThis, 'document');
    g.disposeObject(g.scene);
  }
});
void test('keyboard toggle settings ignore held repeats and preferred number keys select the right weapon', () => {
  const g = Object.create(BattleGame.prototype) as BattleGame;
  const documentTarget = new EventTarget(),
    windowTarget = new EventTarget(),
    canvas = new EventTarget();
  const picks: number[] = [];
  Object.assign(g, {
    renderer: { domElement: canvas },
    cleanup: [],
    state: { phase: 'playing' },
    keys: new Set(),
    preferences: {
      ...DEFAULT_PREFERENCES,
      slots: [2, 0, 1],
      sprint: 'toggle',
      crouch: 'toggle',
    },
    crouchToggle: false,
    sprintToggle: false,
    selectWeapon: (i: number) => picks.push(i),
  });
  const oldDoc = Object.getOwnPropertyDescriptor(globalThis, 'document'),
    oldWin = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'document', {
    value: documentTarget,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'window', {
    value: windowTarget,
    configurable: true,
  });
  const key = (code: string, repeat = false, type = 'keydown') => {
    const e = new Event(type, { cancelable: true });
    Object.assign(e, { code, repeat });
    documentTarget.dispatchEvent(e);
  };
  try {
    g.bind();
    key('ShiftLeft');
    assert.equal(g.sprintToggle, true);
    key('ShiftLeft', true);
    assert.equal(g.sprintToggle, true);
    key('ShiftLeft', false, 'keyup');
    assert.equal(g.sprintToggle, true);
    key('ShiftLeft');
    assert.equal(g.sprintToggle, false);
    key('KeyC');
    assert.equal(g.crouchToggle, true);
    key('Digit1');
    assert.deepEqual(picks, [2]);
    g.setPreferences({ ...DEFAULT_PREFERENCES, crouch: 'hold' });
    key('KeyC');
    assert.equal(g.crouchToggle, false);
    assert.equal(g.keys.has('KeyC'), true);
    key('KeyC', false, 'keyup');
    assert.equal(g.keys.has('KeyC'), false);
  } finally {
    g.cleanup.forEach((fn) => fn());
    if (oldDoc) Object.defineProperty(globalThis, 'document', oldDoc);
    else Reflect.deleteProperty(globalThis, 'document');
    if (oldWin) Object.defineProperty(globalThis, 'window', oldWin);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
