import { floorAvailable } from '../lib/game/loot.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BattleGame } from '../lib/game/engine.ts';
import { batchIsland } from '../lib/game/render-world.ts';
import { weaponModel } from '../lib/game/weapon-models.ts';
import {
  characterModel,
  setCharacterSkin,
  skinIndex,
  animateCharacter,
} from '../lib/game/character-models.ts';
import { MAP } from '../lib/game/map-data.ts';
function world() {
  const game = Object.create(BattleGame.prototype) as BattleGame;
  Object.assign(game, {
    scene: new THREE.Scene(),
    world: new THREE.Group(),
    colliders: [],
    solids: [],
    loot: [],
    bots: [],
  });
  game.buildWorld();
  batchIsland(
    game.world,
    game.loot.map((l) => l.mesh),
  );
  return game;
}
function stats(root: THREE.Object3D) {
  let calls = 0,
    triangles = 0;
  root.traverseVisible((o) => {
    if (o instanceof THREE.Mesh) {
      calls++;
      triangles +=
        ((o.geometry.index?.count ?? o.geometry.attributes.position.count) /
          3) *
        (o instanceof THREE.InstancedMesh ? o.count : 1);
    }
  });
  return { calls, triangles };
}
void test('detailed assets and added cover stay within full-match rendering budgets', () => {
  const game = world();
  game.resetBots();
  const empty = stats(game.world);
  assert.ok(
    empty.calls <= 185,
    `Draw submissions must fall at least 50% from 369: ${JSON.stringify(empty)}`,
  );
  assert.ok(
    empty.triangles <= 28898,
    `Unarmed baseline: ${JSON.stringify(empty)}`,
  );
  for (const b of game.bots) {
    b.mesh.getObjectByName('Bot weapon')!.visible = true;
    b.mesh.getObjectByName('Parachute')!.visible = true;
  }
  const held = weaponModel(0, 'held');
  game.world.add(held);
  const equipped = stats(game.world);
  const priorEquippedTriangles = 28898 + 5 * (104 + 160 + 232) + 15 * 172 + 104;
  assert.ok(
    equipped.triangles <= 35000,
    `Equipped limit 35000 with added cover (original ${priorEquippedTriangles}): ${JSON.stringify(equipped)}`,
  );
  assert.ok(equipped.calls < 200, JSON.stringify(equipped));
  // Third person replaces the held gun with a five-part avatar and one world gun.
  held.removeFromParent();
  const avatar = characterModel(0);
  avatar.add(weaponModel(0, 'world'));
  game.world.add(avatar);
  const thirdPerson = stats(game.world);
  assert.ok(thirdPerson.calls < 200, JSON.stringify(thirdPerson));
  assert.ok(thirdPerson.triangles < 35000, JSON.stringify(thirdPerson));
  console.log(
    'Asset budgets:',
    JSON.stringify({ empty, equipped, priorEquippedTriangles }),
  );
  game.disposeObject(game.world);
});
void test('instanced pickups disappear completely and reset across rematches', () => {
  const game = world();
  const item = game.loot[0];
  const renderer = game.lootInstances!;
  renderer.update(1);
  item.used = true;
  renderer.update(2);
  let parts = 0;
  const m = new THREE.Matrix4();
  for (const b of renderer.batches) {
    const i = b.drops.indexOf(item);
    if (i < 0) continue;
    parts++;
    b.mesh.getMatrixAt(i, m);
    assert.equal(m.determinant(), 0);
  }
  assert.equal(parts, 3, 'Model, ring, and beacon must all disappear');
  item.used = false;
  renderer.update(3);
  for (const b of renderer.batches) {
    const i = b.drops.indexOf(item);
    if (i >= 0) {
      b.mesh.getMatrixAt(i, m);
      assert.ok(m.determinant() > 0.9);
    }
  }
  game.spawnLoot();
  assert.equal(
    game.world.children.filter((o) => o.name === 'Instanced supplies').length,
    1,
  );
  assert.ok(game.loot.length > 63);
  assert.ok(
    game.loot.slice(0, 63).every((l, i) => l.used === !floorAvailable(i)),
  );
  game.disposeObject(game.world);
});
void test('character skins are stable, keep hit targets, and animate from limb pivots', () => {
  const targetSkin = skinIndex('SandRunner');
  const character = characterModel((targetSkin + 1) % 4);
  character.userData.bot = 4;
  character.add(Object.assign(new THREE.Group(), { name: 'Bot weapon' }));
  setCharacterSkin(character, targetSkin);
  assert.equal(character.children.filter((o) => o.name === 'Body').length, 1);
  assert.ok(character.getObjectByName('Bot weapon'));
  let meshes = 0;
  character.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      meshes++;
      assert.equal(o.userData.bot, 4);
    }
  });
  assert.equal(meshes, 5);
  animateCharacter(character, Math.PI / 2, 0.3);
  assert.ok(character.getObjectByName('Left leg')!.rotation.x > 0);
  assert.ok(character.getObjectByName('Right leg')!.rotation.x < 0);
  assert.equal(skinIndex('SandRunner'), skinIndex('SandRunner'));
});
void test('asset refresh preserves the authoritative collision and loot layout', () => {
  const game = world();
  assert.equal(game.colliders.length, MAP.colliders.length);
  // Trigonometry can differ in its last bits between CPU/Node platforms.
  // Keep the exported collision layout check well below gameplay precision.
  game.colliders.forEach((box, index) => {
    for (const bound of ['min', 'max'] as const) {
      box[bound].toArray().forEach((coordinate, axis) => {
        assert.ok(
          Math.abs(coordinate - MAP.colliders[index][bound][axis]) < 1e-10,
          `Collider ${index} ${bound}[${axis}] differs from the exported map`,
        );
      });
    }
  });
  assert.deepEqual(
    game.loot.map((l) => ({
      x: l.mesh.position.x,
      z: l.mesh.position.z,
      kind: l.kind,
    })),
    MAP.loot,
  );
  game.disposeObject(game.world);
});

void test('Gun Game preserves fifteen remote models when players join, leave, or reorder', () => {
  const game = world();
  game.networkRoom = { mode: 'gun-game' } as NonNullable<
    BattleGame['networkRoom']
  >;
  const remotes = Array.from({ length: 15 }, (_, i) => ({
    id: `p${i}`,
    x: i,
    y: 1.7,
    z: 25,
  })) as NonNullable<BattleGame['networkRoom']>['players'];
  game.syncRemotePlayers(remotes);
  const models = new Map(game.bots.map((b) => [b.remoteId, b.mesh]));
  const survivor = game.bots[1];
  survivor.mesh.position.z = 24.7;
  let disposed = 0;
  models.get('p0')!.traverse((o) => {
    if (o instanceof THREE.Mesh)
      o.geometry.addEventListener('dispose', () => disposed++);
  });
  const next = remotes.slice(1).reverse();
  next.push({ ...remotes[0], id: 'late-join' });
  game.syncRemotePlayers(next);
  assert.ok(disposed > 0, 'The departing player releases GPU resources');
  assert.equal(
    survivor.mesh.position.z,
    24.7,
    'Joining must not snap existing interpolated positions',
  );
  game.bots.forEach((b, i) => {
    assert.equal(b.remoteId, next[i].id);
    if (models.has(b.remoteId!)) assert.equal(b.mesh, models.get(b.remoteId!));
    b.mesh.traverse((o) =>
      assert.equal(
        o.userData.bot,
        i,
        'Hit detection keeps the correct player index',
      ),
    );
  });
  game.disposeObject(game.world);
});
