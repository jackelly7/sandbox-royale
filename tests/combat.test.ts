import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BattleGame, type GameState } from '../lib/game/engine.ts';
import { batchIsland } from '../lib/game/render-world.ts';
import { weaponModel } from '../lib/game/weapon-models.ts';

// Exercise Three.js geometry, raycasting, and match logic without a GPU or browser.
function arena() {
  const game = Object.create(BattleGame.prototype) as BattleGame;
  Object.assign(game, {
    scene: new THREE.Scene(),
    world: new THREE.Group(),
    camera: new THREE.PerspectiveCamera(72, 1, 0.08, 850),
    bots: [],
    loot: [],
    colliders: [],
    solids: [],
    ray: new THREE.Raycaster(),
    tracers: [],
    weaponAmmo: [30, 6, 5],
    reserveAmmo: [120, 30, 20],
    cooldown: 0,
    reloadTimer: 0,
    recoil: 0,
    aiming: false,
    muted: true,
    audio: null,
    flash: new THREE.Mesh(),
    onState: () => {},
    position: new THREE.Vector3(0, 1.7, 50),
    state: {
      ammo: 5,
      reserve: 20,
      elapsed: 0,
      storm: 107,
      outside: false,
      reloading: false,
      pickup: '',
      hurt: 0,
      heading: 0,
      x: 0,
      z: 50,
      rank: 16,
      phase: 'playing',
      health: 100,
      shield: 50,
      alive: 16,
      kills: 0,
      weapon: 2,
      owned: [true, true, true],
      notice: '',
      hit: 0,
      bots: [],
    } satisfies GameState,
  });
  game.scene.add(game.world, game.camera);
  return game;
}
void test('a scoped headshot eliminates a rival and consumes exactly one round', () => {
  const game = arena();
  game.resetBots();
  game.bots.forEach((b, i) => {
    if (i > 0) {
      b.hp = 0;
      b.mesh.visible = false;
    }
  });
  game.bots[0].mesh.position.set(0, 0, 0);
  game.camera.position.set(0, 1.96, 10);
  game.camera.lookAt(0, 1.96, 0);
  game.aiming = true;
  game.shoot();
  assert.equal(game.weaponAmmo[2], 4);
  assert.equal(game.state.kills, 1);
  assert.equal(game.bots[0].mesh.visible, false);
  assert.equal(game.state.alive, 1);
  assert.ok(game.state.hit > 0);
  game.disposeObject(game.scene);
});
void test('solid cover blocks a shot before it reaches an opponent', () => {
  const game = arena();
  game.resetBots();
  game.bots[0].mesh.position.set(0, 0, 0);
  const wall = game.box(8, 6, 1, '#999999', 0, 3, 5);
  game.solid(wall);
  game.camera.position.set(0, 1.96, 10);
  game.camera.lookAt(0, 1.96, 0);
  game.aiming = true;
  game.shoot();
  assert.equal(game.bots[0].hp, 100);
  assert.equal(game.state.kills, 0);
  assert.equal(
    game.visible(new THREE.Vector3(0, 2, 10), new THREE.Vector3(0, 2, 0)),
    false,
  );
  game.disposeObject(game.scene);
});
void test('island spawn and supplies are accessible outside solid buildings', () => {
  const game = arena();
  game.buildWorld();
  game.resetBots();
  assert.equal(game.blocked(0, 50), false);
  for (const supply of game.loot)
    assert.equal(
      game.blocked(supply.mesh.position.x, supply.mesh.position.z),
      false,
      `Blocked pickup at ${supply.mesh.position.x}, ${supply.mesh.position.z}`,
    );
  assert.equal(game.bots.length, 15);
  for (const bot of game.bots)
    assert.equal(game.blocked(bot.mesh.position.x, bot.mesh.position.z), false);
  assert.ok(game.colliders.length > 25);
  game.disposeObject(game.scene);
});
void test('island batching removes most draw submissions without losing collision raycasts', () => {
  const game = arena();
  game.buildWorld();
  const before = game.visible(
    new THREE.Vector3(18, 2, 0),
    new THREE.Vector3(18, 2, -40),
  );
  const stats = batchIsland(
    game.world,
    game.loot.map((l) => l.mesh),
  );
  assert.ok(stats.after < stats.before / 5, JSON.stringify(stats));
  assert.equal(
    game.visible(new THREE.Vector3(18, 2, 0), new THREE.Vector3(18, 2, -40)),
    before,
  );
  assert.equal(before, false);
  console.log(`Island static draw batches: ${stats.before} → ${stats.after}`);
  game.disposeObject(game.world);
});
void test('AR, shotgun and sniper silhouettes differ and each uses one draw call', () => {
  const sizes = [0, 1, 2].map((i) => {
    const gun = weaponModel(i),
      box = new THREE.Box3().setFromObject(gun);
    assert.equal(gun.children.length, 1);
    const size = box.getSize(new THREE.Vector3());
    gun.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    return size;
  });
  assert.ok(sizes[1].x > sizes[0].x, 'Shotgun has a wider pump and body');
  assert.ok(sizes[2].z > sizes[1].z, 'Sniper has a longer barrel');
  assert.ok(
    sizes[2].y > sizes[0].y,
    'Sniper scope gives it a taller silhouette',
  );
});

void test('room forms stop GPU rendering while the animation loop stays resumable', (t) => {
  const originalDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    'document',
  );
  const originalFrame = Object.getOwnPropertyDescriptor(
    globalThis,
    'requestAnimationFrame',
  );
  let hidden = false;
  let renders = 0;
  let scheduled: FrameRequestCallback | undefined;
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      get hidden() {
        return hidden;
      },
    },
  });
  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    value: (callback: FrameRequestCallback) => {
      scheduled = callback;
      return 1;
    },
  });
  t.after(() => {
    if (originalDocument)
      Object.defineProperty(globalThis, 'document', originalDocument);
    else Reflect.deleteProperty(globalThis, 'document');
    if (originalFrame)
      Object.defineProperty(globalThis, 'requestAnimationFrame', originalFrame);
    else Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  });
  const game = arena();
  Object.assign(game, {
    renderer: {
      render: () => {
        renders++;
      },
    },
    previous: 0,
    time: 0,
    uiTime: 0,
  });
  game.tick = (now) => game.updateFrame(now);
  game.state.phase = 'paused';
  game.setMenuOpen(true);
  for (let frame = 1; frame <= 120; frame++) game.tick(frame * 17);
  assert.equal(renders, 0, 'Typing in a room must not submit any GPU frames');
  assert.equal(scheduled, game.tick, 'The loop remains scheduled for resuming');
  game.setMenuOpen(false);
  game.tick(2100);
  assert.equal(renders, 1, 'Closing the form resumes graphics');
  hidden = true;
  game.tick(2200);
  assert.equal(renders, 1, 'Background tabs must not render');
});
