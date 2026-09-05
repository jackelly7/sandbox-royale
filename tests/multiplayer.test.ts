import {
  ARENA_SCALE,
  ARENA_RADIUS,
  INITIAL_CIRCLE,
} from '../lib/game/arena.ts';
import { floorAvailable } from '../lib/game/loot.ts';
import { zoneAt } from '../lib/game/zones.ts';
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
  room.players.forEach((p) => {
    p.dropping = false;
    p.y = 1.7;
    p.lastSeen = at + 5001;
    p.connected = true;
  });
  return room;
}
void test('players land unarmed and cannot fire or equip an uncollected weapon', () => {
  const room = started(),
    [p, q] = room.players;
  assert.equal(p.weapon, -1);
  assert.deepEqual(p.owned, [false, false, false]);
  assert.deepEqual(p.ammo, [0, 0, 0]);
  applyCommand(
    room,
    p.id,
    { type: 'shoot', pose: { ...p, weapon: 2 }, aiming: true },
    at + 5100,
  );
  applyCommand(room, p.id, { type: 'reload' }, at + 5200);
  assert.equal(p.weapon, -1);
  assert.equal(q.health, 100);
  assert.equal(room.events.length, 0);
});
void test('all three gun drops unlock, equip and load a distinct weapon', () => {
  const room = started(),
    p = room.players[0];
  for (let kind = 0; kind < 3; kind++) {
    const index = MAP.loot.findIndex((l) => l.kind === kind);
    Object.assign(p, { x: MAP.loot[index].x, z: MAP.loot[index].z });
    applyCommand(room, p.id, { type: 'pickup', index }, at + 5100 + kind * 100);
    assert.equal(p.weapon, kind);
    assert.equal(p.owned[kind], true);
    assert.ok(p.ammo[kind] > 0);
    // A movement packet sent before pickup must not unequip the new weapon.
    applyCommand(
      room,
      p.id,
      { type: 'pose', pose: { ...p, weapon: -1 } },
      at + 5150 + kind * 100,
    );
    assert.equal(p.weapon, kind);
  }
});
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
void test('rooms require two players and reject a ninth player in every phase', () => {
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
    /full/,
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
  Object.assign(p, {
    x: 0,
    y: 1.7,
    z: 15,
    yaw: 0,
    pitch: 0,
    weapon: 0,
    owned: [true, false, false],
    ammo: [30, 0, 0],
  });
  Object.assign(target, { x: 0, y: 1.7, z: 5 });
  const shoot = (t: number) =>
    applyCommand(room, p.id, { type: 'shoot', pose: p, aiming: true }, t);
  shoot(at + 5100);
  assert.equal(p.ammo[0], 29);
  shoot(at + 5101);
  assert.equal(p.ammo[0], 29);
  for (let i = 1; i < 12; i++) shoot(at + 5100 + i * 160);
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
  Object.assign(p, {
    x: 18 * ARENA_SCALE,
    y: 1.7,
    z: 0,
    yaw: 0,
    pitch: 0,
    weapon: 2,
    owned: [false, false, true],
    ammo: [0, 0, 5],
  });
  Object.assign(target, { x: 18 * ARENA_SCALE, y: 1.7, z: -40 * ARENA_SCALE });
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
  assert.equal(p.reserve[0], 60);
  assert.equal(p.owned[0], true);
  assert.equal(p.ammo[0], 30);
  assert.equal(p.weapon, 0);
  assert.equal(q.reserve[0], 0);
  assert.equal(q.owned[0], false);
});
void test('disconnect grace allows recovery and eventually resolves a match', () => {
  const room = started();
  const [p, q] = room.players;
  applyCommand(room, p.id, { type: 'ping' }, at + 19000);
  applyCommand(room, q.id, { type: 'ping' }, at + 19000);
  assert.equal(room.phase, 'playing');
  const safe = zoneAt(35, `${room.code}:${room.round}`, room.zonePlayers);
  p.x = safe.x;
  p.z = safe.z;
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
  assert.ok(room.loot.every((used, i) => used === !floorAvailable(i)));
  assert.ok(
    room.players.every(
      (p) =>
        p.health === 100 &&
        p.ammo[0] === 0 &&
        p.weapon === -1 &&
        p.owned.every((has) => !has),
    ),
  );
});

void test('recovery drops are stored at full health, capped, and cannot be claimed twice', () => {
  const room = started(),
    [p, q] = room.players;
  for (const kind of [3, 4]) {
    const indices = MAP.loot.flatMap((l, i) =>
      l.kind === kind && floorAvailable(i) ? [i] : [],
    );
    const slot = kind === 3 ? 'cells' : 'medkits';
    for (const index of indices.slice(0, 4)) {
      Object.assign(p, MAP.loot[index]);
      Object.assign(q, MAP.loot[index]);
      applyCommand(room, p.id, { type: 'pickup', index }, at + 5100);
      if (p[slot] < 3) {
        applyCommand(room, q.id, { type: 'pickup', index }, at + 5100);
        assert.equal(q[slot], 0);
      }
    }
    assert.equal(p[slot], 3);
    assert.equal(
      room.loot[indices[3]],
      false,
      'A full inventory leaves the fourth item for others',
    );
  }
  assert.equal(p.health, 100);
  assert.equal(p.shield, 50);
});
void test('healing takes time, caps at 100, consumes once, and rejects empty or full use', () => {
  const room = started(),
    p = room.players[0];
  Object.assign(p, { health: 30, shield: 80, medkits: 1, cells: 1 });
  applyCommand(room, p.id, { type: 'heal', item: 'medkit' }, at + 5100);
  assert.equal(p.healing, 'medkit');
  applyCommand(room, p.id, { type: 'heal', item: 'shield' }, at + 5200);
  assert.equal(p.healing, 'medkit', 'Cannot stack recovery timers');
  advance(room, at + 9099);
  assert.equal(p.health, 30);
  assert.equal(p.medkits, 1);
  advance(room, at + 9100);
  assert.equal(p.health, 100);
  assert.equal(p.medkits, 0);
  advance(room, at + 9101);
  assert.equal(p.medkits, 0);
  applyCommand(room, p.id, { type: 'heal', item: 'shield' }, at + 9200);
  advance(room, at + 11700);
  assert.equal(p.shield, 100);
  assert.equal(p.cells, 0);
  p.medkits = 1;
  applyCommand(room, p.id, { type: 'heal', item: 'medkit' }, at + 11800);
  assert.equal(p.healing, null);
  assert.equal(p.medkits, 1);
  p.health = 50;
  p.medkits = 0;
  applyCommand(room, p.id, { type: 'heal', item: 'medkit' }, at + 11900);
  assert.equal(p.healing, null);
});
void test('incoming damage preserves recovery and reports aggregated shield damage', () => {
  const room = started(),
    [p, target] = room.players;
  Object.assign(p, {
    x: 0,
    z: 15,
    y: 1.7,
    yaw: 0,
    pitch: -0.04,
    weapon: 1,
    owned: [false, true, false],
    ammo: [0, 6, 0],
  });
  Object.assign(target, {
    x: 0,
    z: 5,
    y: 1.7,
    health: 80,
    shield: 20,
    medkits: 1,
  });
  applyCommand(room, target.id, { type: 'heal', item: 'medkit' }, at + 5100);
  applyCommand(room, p.id, { type: 'shoot', pose: p, aiming: true }, at + 5200);
  assert.equal(target.healing, 'medkit');
  assert.equal(target.healUntil, at + 9100);
  assert.equal(target.medkits, 1);
  const hits = room.events.filter((e) => e.type === 'hit');
  assert.equal(
    hits.length,
    1,
    'One compact damage event per target, even with shotgun pellets',
  );
  assert.equal(hits[0].shieldDamage, 20);
  assert.equal(hits[0].shieldBreak, true);
  assert.equal(hits[0].amount, 70);
  assert.equal(
    target.health,
    30,
    'One shotgun blast no longer instantly finishes this target',
  );
  advance(room, at + 9100);
  assert.equal(target.health, 100);
  assert.equal(target.medkits, 0);
  assert.equal(target.healing, null);
});
void test('cancel, firing, reload, switching and death preserve unused recovery items', () => {
  for (const action of ['cancel', 'shoot', 'reload', 'switch', 'leave']) {
    const room = started(),
      p = room.players[0];
    Object.assign(p, {
      health: 40,
      medkits: 1,
      weapon: 0,
      owned: [true, true, false],
      ammo: [10, 6, 0],
      reserve: [30, 0, 0],
    });
    applyCommand(room, p.id, { type: 'heal', item: 'medkit' }, at + 5100);
    if (action === 'cancel')
      applyCommand(room, p.id, { type: 'cancelHeal' }, at + 5200);
    if (action === 'shoot')
      applyCommand(
        room,
        p.id,
        { type: 'shoot', pose: p, aiming: false },
        at + 5200,
      );
    if (action === 'reload')
      applyCommand(room, p.id, { type: 'reload' }, at + 5200);
    if (action === 'switch')
      applyCommand(
        room,
        p.id,
        { type: 'pose', pose: { ...p, weapon: 1 } },
        at + 5200,
      );
    if (action === 'leave')
      applyCommand(room, p.id, { type: 'leave' }, at + 5200);
    assert.equal(p.healing, null, action);
    assert.equal(p.medkits, 1, action);
  }
});
void test('eliminated players cannot heal or collect items and rematch clears recovery state', () => {
  const room = started(),
    [p, q] = room.players;
  Object.assign(q, { health: 0, medkits: 2, rank: 2 });
  applyCommand(room, q.id, { type: 'heal', item: 'medkit' }, at + 5100);
  assert.equal(q.healing, null);
  Object.assign(q, MAP.loot[4]);
  applyCommand(room, q.id, { type: 'pickup', index: 4 }, at + 5100);
  assert.equal(room.loot[4], false);
  applyCommand(room, p.id, { type: 'rematch' }, at + 5200);
  applyCommand(room, p.id, { type: 'start' }, at + 5300);
  assert.ok(
    room.players.every(
      (p) =>
        p.medkits === 0 &&
        p.cells === 0 &&
        p.healing === null &&
        p.health === 100,
    ),
  );
  assert.throws(() => parseCommand({ type: 'heal', item: 'magic' }), /Invalid/);
  assert.deepEqual(parseCommand({ type: 'heal', item: 'shield' }), {
    type: 'heal',
    item: 'shield',
  });
});

void test('the opening drop is server controlled, steerable, and ends outside buildings', () => {
  const room = waiting();
  applyCommand(room, 'host', { type: 'start' }, at);
  const p = room.players[0];
  assert.equal(p.y, 42);
  assert.equal(p.dropping, true);
  advance(room, at + 4000);
  assert.equal(p.y, 42, 'Countdown holds altitude');
  advance(room, at + 6000);
  assert.equal(p.y, 36);
  const oldX = p.x;
  applyCommand(
    room,
    p.id,
    { type: 'pose', pose: { ...p, x: oldX + 2, y: 1.7 } },
    at + 6100,
  );
  assert.equal(p.x, oldX + 2, 'The canopy can be steered');
  assert.ok(p.y > 30, 'A client cannot instantly land');
  Object.assign(p, { x: MAP.loot[19].x, z: MAP.loot[19].z });
  applyCommand(room, p.id, { type: 'pickup', index: 19 }, at + 6200);
  assert.equal(room.loot[19], false, 'Cannot claim ground loot from the sky');
  p.x = 18;
  p.z = -23;
  advance(room, at + 12000);
  assert.equal(p.dropping, false);
  assert.equal(p.y, 1.7);
  assert.equal(
    blocked(p.x, p.z),
    false,
    'Landing over a roof resolves to clear ground nearby',
  );
  applyCommand(room, p.id, { type: 'pose', pose: { ...p, y: 42 } }, at + 12100);
  assert.equal(p.y, 3.8, 'A landed player cannot start flying again');
});
void test('killer identity remains available after transient elimination events expire', () => {
  const room = started(),
    [p, target] = room.players;
  Object.assign(p, {
    x: 0,
    z: 15,
    y: 1.7,
    yaw: 0,
    pitch: 0,
    weapon: 2,
    owned: [false, false, true],
    ammo: [0, 0, 5],
  });
  Object.assign(target, { x: 0, z: 5, y: 1.7, health: 20, shield: 0 });
  applyCommand(room, p.id, { type: 'shoot', pose: p, aiming: true }, at + 5100);
  const later = snapshot(room, at + 7100);
  assert.equal(later.events.length, 0);
  assert.equal(later.players[1].killedBy, p.id);
  assert.equal(later.players[1].diedAt, at + 5100);
});

void test('storm damage allows healing to complete while lethal damage cancels it', () => {
  const room = started(),
    p = room.players[0];
  Object.assign(p, {
    x: ARENA_RADIUS - 1,
    z: 0,
    health: 50,
    shield: 0,
    medkits: 2,
  });
  applyCommand(room, p.id, { type: 'heal', item: 'medkit' }, at + 5100);
  advance(room, at + 5200);
  assert.equal(p.healing, 'medkit');
  advance(room, at + 9100);
  assert.ok(p.health > 90);
  assert.equal(p.medkits, 1);
  p.health = 1;
  applyCommand(room, p.id, { type: 'heal', item: 'medkit' }, at + 9200);
  advance(room, at + 9600);
  assert.equal(p.health, 0);
  assert.equal(p.healing, null);
  assert.equal(p.medkits, 1);
});

void test('server shotgun range is short while the same sightline permits rifle hits', () => {
  for (const [weapon, distance, shouldHit] of [
    [1, 7, true],
    [1, 35, false],
    [0, 35, true],
  ] as const) {
    const room = started(),
      [p, target] = room.players;
    Object.assign(p, {
      x: 0,
      z: 5,
      y: 1.3,
      yaw: -Math.PI / 2,
      pitch: 0,
      weapon,
      owned: [true, true, false],
      ammo: [30, 6, 0],
    });
    Object.assign(target, {
      x: distance,
      z: 5,
      y: 1.7,
      health: 100,
      shield: 50,
    });
    applyCommand(
      room,
      p.id,
      { type: 'shoot', pose: p, aiming: true },
      at + 5100,
    );
    assert.equal(
      target.shield < 50,
      shouldHit,
      `weapon ${weapon}, range ${distance}`,
    );
  }
});

void test('server accepts the expanded map while still rejecting travel beyond its rim', () => {
  const room = started(),
    p = room.players[0];
  Object.assign(p, { x: 0, z: 170, y: 1.7 });
  applyCommand(room, p.id, { type: 'pose', pose: { ...p, z: 172 } }, at + 6000);
  assert.equal(p.z, 172);
  Object.assign(p, { x: 0, z: ARENA_RADIUS - 1 });
  applyCommand(
    room,
    p.id,
    { type: 'pose', pose: { ...p, z: ARENA_RADIUS + 1 } },
    at + 7000,
  );
  assert.equal(p.z, ARENA_RADIUS - 1);
  assert.equal(snapshot(room, at + 7000).zone?.radius, INITIAL_CIRCLE);
});
