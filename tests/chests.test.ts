import { smokeLoot } from '../lib/game/battlefield.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  CHEST_SPOTS,
  floorAmmo,
  chestLayout,
  chestDrops,
  canReach,
} from '../lib/game/chests.ts';
import { ARENA_SCALE as S } from '../lib/game/arena.ts';
import { MAP } from '../lib/game/map-data.ts';
import { blocksBody, mantleTarget, groundAt } from '../lib/game/movement.ts';
import { weaponModel } from '../lib/game/weapon-models.ts';
import { BattleGame } from '../lib/game/engine.ts';
import { batchIsland } from '../lib/game/render-world.ts';
import {
  createMember,
  createRoom,
  addMember,
  applyCommand,
  advance,
  snapshot,
  parseCommand,
} from '../server/model.ts';
function room() {
  const r = createRoom('CHEST2', createMember('a', 'A', 'private', 1000), 1000);
  addMember(r, createMember('b', 'B', 'private', 1000));
  applyCommand(r, 'a', { type: 'start' }, 1000);
  advance(r, 6000);
  for (const p of r.players)
    Object.assign(p, { dropping: false, onBus: false, y: 1.7, lastSeen: 6000 });
  return r;
}
void test('eighteen chests vary by round and always include both accessible castle halls', () => {
  assert.deepEqual(chestLayout('one'), chestLayout('one'));
  assert.notDeepEqual(chestLayout('one'), chestLayout('two'));
  for (let round = 0; round < 30; round++) {
    const layout = chestLayout(String(round));
    assert.equal(layout.filter((c) => c.active).length, 18);
    assert.ok(layout[0].active && layout[1].active);
    for (let i = 0; i < CHEST_SPOTS.length; i++) {
      const p = CHEST_SPOTS[i];
      assert.ok(
        !blocksBody(p.x, p.z, 0, MAP.colliders),
        `Chest ${i} is accessible`,
      );
      const drops = chestDrops(String(round), i);
      assert.equal(drops.length, 3);
      assert.ok(drops[0].kind < 3 && drops[0].rarity >= 1);
      assert.ok(drops[2].kind === 3 || drops[2].kind === 4);
    }
  }
});
void test('opening a chest is authoritative, happens once, and produces shared claimable loot', () => {
  const r = room(),
    [a, b] = r.players,
    p = CHEST_SPOTS[0];
  applyCommand(r, a.id, { type: 'chest', index: 0 }, 6100);
  assert.equal(
    r.drops?.length,
    floorAmmo().length + smokeLoot().length,
    'Distant players cannot open it',
  );
  Object.assign(a, { ...p, z: p.z + 2 });
  Object.assign(b, { ...p, z: p.z + 2 });
  a.dropping = true;
  a.y = 20;
  applyCommand(r, a.id, { type: 'chest', index: 0 }, 6200);
  assert.equal(r.chests![0].openedAt, 0);
  a.dropping = false;
  a.y = 1.7;
  applyCommand(r, a.id, { type: 'chest', index: 0 }, 6300);
  applyCommand(r, b.id, { type: 'chest', index: 0 }, 6300);
  assert.equal(r.drops!.length, floorAmmo().length + smokeLoot().length + 3);
  assert.equal(snapshot(r, 6300).chests![0].openedAt, 6300);
  const index = MAP.loot.length + (floorAmmo().length + smokeLoot().length);
  const drop = r.drops![floorAmmo().length + smokeLoot().length];
  Object.assign(a, { x: drop.x, z: drop.z });
  Object.assign(b, { x: drop.x, z: drop.z });
  applyCommand(r, a.id, { type: 'pickup', index }, 6400);
  applyCommand(r, b.id, { type: 'pickup', index }, 6400);
  assert.equal(a.owned[drop.kind], true);
  assert.equal(b.owned[drop.kind], false);
  assert.equal(a.tiers![drop.kind], drop.rarity);
  assert.throws(() => parseCommand({ type: 'chest', index: -1 }), /Invalid/);
});
void test('castle doors admit players, walls stop shots, and exterior ledges lead to the roof', () => {
  for (const [x, z] of [
    [18, -23],
    [-22, -16],
  ]) {
    for (let dz = -8; dz <= 8; dz += 0.2)
      assert.equal(
        blocksBody(x * S, (z + dz) * S, 0, MAP.colliders),
        false,
        'Straight route through both doorways',
      );
    for (let dx = -10; dx <= 10; dx += 0.15)
      assert.equal(
        blocksBody((x + dx) * S, z * S, 0, MAP.colliders),
        false,
        'Both side exits remain clear',
      );
    assert.equal(
      canReach(
        { x: x * S, y: 1.7, z: (z + 6.8) * S },
        { x: x * S, y: 0.85, z: (z + 5.4) * S },
        MAP.colliders,
      ),
      true,
    );
    assert.equal(
      canReach(
        { x: (x + 3) * S, y: 1.7, z: (z + 6.8) * S },
        { x: (x + 3) * S, y: 0.85, z: (z + 5.4) * S },
        MAP.colliders,
      ),
      false,
      'Wall blocks interaction',
    );
    assert.equal(
      canReach(
        { x: x * S, y: 8, z: z * S },
        { x: x * S, y: 0.8, z: z * S },
        MAP.colliders,
        10,
      ),
      false,
      'Roof blocks interaction',
    );
    let p = { x: (x + 8.7) * S, y: 1.7, z: (z + 9.5) * S + 1 };
    for (let i = 0; i < 3; i++) {
      p.z = (z + 9.5 - i * 3) * S + 1;
      const to = mantleTarget(p, 0, MAP.colliders);
      assert.ok(to, `Ledge ${i + 1} reachable`);
      assert.equal(to.y, (i + 1) * 2 + 1.7);
      p = to;
    }
    assert.ok(groundAt(x * S, z * S, 6.4, MAP.colliders) > 6);
  }
});
void test('ready up preserves the room and starts exactly one fresh round when everyone is ready', () => {
  const r = room();
  r.phase = 'finished';
  r.winner = 'a';
  r.chests![0].openedAt = 6500;
  r.drops = chestDrops('x', 0);
  applyCommand(r, 'b', { type: 'ready' }, 7000);
  assert.equal(r.phase, 'finished');
  assert.equal(r.players[1].ready, true);
  applyCommand(r, 'b', { type: 'ready' }, 7100);
  assert.equal(r.players[1].ready, false);
  applyCommand(r, 'b', { type: 'ready' }, 7200);
  applyCommand(r, 'a', { type: 'ready' }, 7300);
  assert.equal(r.phase, 'countdown');
  assert.equal(r.round, 2);
  assert.equal(r.startAt, 12300);
  assert.ok(
    r.players.every(
      (p) =>
        !p.ready && p.dropping && p.health === 100 && !p.owned.some(Boolean),
    ),
  );
  assert.ok(r.chests!.every((c) => !c.openedAt));
  assert.equal(r.drops!.length, floorAmmo().length + smokeLoot().length);
  applyCommand(r, 'b', { type: 'ready' }, 7400);
  assert.equal(r.round, 2);
});
void test('all chests opened with every drop visible stay within the existing geometry budget', () => {
  const g = Object.create(BattleGame.prototype) as BattleGame;
  Object.assign(g, {
    scene: new THREE.Scene(),
    world: new THREE.Group(),
    colliders: [],
    solids: [],
    loot: [],
    bots: [],
    time: 1,
    muted: true,
  });
  g.buildWorld();
  batchIsland(
    g.world,
    g.loot.map((l) => l.mesh),
  );
  for (const d of floorAmmo()) g.addLoot(d);
  for (let i = 0; i < g.chests.length; i++)
    if (g.chests[i].active) g.openChest(i);
  g.chestRenderer!.update(g.chests, 1);
  g.resetBots();
  for (const b of g.bots) {
    b.mesh.getObjectByName('Bot weapon')!.visible = true;
    b.mesh.getObjectByName('Parachute')!.visible = true;
  }
  g.world.add(weaponModel(0, 'held'));
  let calls = 0,
    triangles = 0;
  g.world.traverseVisible((o) => {
    if (o instanceof THREE.Mesh) {
      calls++;
      triangles +=
        ((o.geometry.index?.count ?? o.geometry.attributes.position.count) /
          3) *
        (o instanceof THREE.InstancedMesh ? o.count : 1);
    }
  });
  console.log('Opened chest budget', JSON.stringify({ calls, triangles }));
  assert.ok(calls < 200, `${calls} draw calls`);
  assert.ok(triangles < 35000, `${triangles} triangles`);
  g.disposeObject(g.world);
});
