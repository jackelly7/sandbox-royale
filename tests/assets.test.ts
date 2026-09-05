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
  console.log(
    'Asset budgets:',
    JSON.stringify({ empty, equipped, priorEquippedTriangles }),
  );
  game.disposeObject(game.world);
});
void test('instanced pickups disappear completely and reset across rematches', () => {
  const game = world();
  const item = game.loot[19];
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
  assert.equal(game.loot.length, 63);
  assert.ok(game.loot.every((l, i) => l.used === !floorAvailable(i)));
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
  assert.deepEqual(
    game.colliders.map((b) => ({ min: b.min.toArray(), max: b.max.toArray() })),
    MAP.colliders,
  );
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
