import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BattleGame, type GameState } from '../lib/game/engine.ts';
import { parachuteModel } from '../lib/game/parachute.ts';
import { batchIsland } from '../lib/game/render-world.ts';
import { completeRecovery } from '../lib/game/rules.ts';
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
    footsteps: new Map(),
    weaponAmmo: [30, 6, 5],
    reserveAmmo: [120, 30, 20],
    yaw: 0,
    pitch: 0,
    time: 0,
    gun: new THREE.Group(),
    keys: new Set(),
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
      aiming: false,
      pickup: '',
      hurt: 0,
      heading: 0,
      x: 0,
      z: 50,
      rank: 16,
      phase: 'playing',
      health: 100,
      medkits: 0,
      cells: 0,
      healing: null,
      healUntil: 0,
      healRemaining: 0,
      dropping: false,
      altitude: 0,
      threat: 0,
      killer: 'The island',
      deathRemaining: 0,
      survived: 0,
      eliminationPulse: 0,
      damageNumber: 0,
      damageShield: false,
      headshot: false,
      shieldBreak: 0,
      damageAngle: null,
      feed: [],
      spectator: null,
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
void test('a scoped finishing headshot eliminates a wounded rival and consumes one round', () => {
  const game = arena();
  game.resetBots();
  game.bots.forEach((b, i) => {
    if (i > 0) {
      b.hp = 0;
      b.mesh.visible = false;
    }
  });
  game.bots[0].shield = 0;
  game.bots[0].hp = 70;
  game.bots[0].mesh.position.set(0, 0, 0);
  game.camera.position.set(0, 1.96, 10);
  game.camera.lookAt(0, 1.96, 0);
  game.aiming = true;
  game.shoot();
  assert.equal(game.weaponAmmo[2], 4);
  assert.equal(game.state.kills, 1);
  assert.ok(
    game.bots[0].dying > 0,
    'Eliminated rival falls before disappearing',
  );
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

void test('solo recovery continues through damage and consumes the item on completion', () => {
  const game = arena();
  game.state.health = 30;
  game.state.medkits = 1;
  game.heal('medkit');
  assert.equal(game.state.healing, 'medkit');
  assert.equal(game.state.healRemaining, 4);
  game.damage(5, new THREE.Vector3(10, 1.7, 50));
  assert.equal(game.state.healing, 'medkit');
  assert.equal(game.state.healUntil, 4000);
  assert.equal(game.state.medkits, 1);
  assert.equal(game.state.damageAngle, 90);
  assert.ok(completeRecovery(game.state, 4000));
  assert.equal(game.state.health, 100);
  assert.equal(game.state.medkits, 0);
});
void test('spectators cycle only living players and cannot heal or claim supplies', () => {
  const game = arena();
  Object.assign(game, {
    gun: new THREE.Group(),
    network: {
      playerId: 'me',
      send: () => assert.fail('Spectators cannot send game actions'),
    },
    networkRoom: {
      phase: 'playing',
      players: [
        { id: 'me', name: 'Me', health: 0 },
        { id: 'one', name: 'First', health: 50, shield: 10, kills: 2 },
        { id: 'dead', name: 'Eliminated', health: 0 },
        { id: 'two', name: 'Second', health: 90, shield: 50, kills: 0 },
      ],
    },
  });
  game.state.health = 0;
  game.state.phase = 'lost';
  game.state.medkits = 1;
  game.spectate();
  assert.equal(game.state.phase, 'spectating');
  assert.equal(game.state.spectator?.id, 'one');
  game.spectate();
  assert.equal(game.state.spectator?.id, 'two');
  game.spectate(-1);
  assert.equal(game.state.spectator?.id, 'one');
  game.heal('medkit');
  game.pickup();
  assert.equal(game.state.healing, null);
  game.stopSpectating();
  assert.equal(game.state.phase, 'lost');
});
void test('recovery models are distinct, accessible, and each use one model draw', () => {
  const game = arena();
  game.buildWorld();
  const medical = game.loot.filter((l) => l.kind >= 3);
  assert.ok(medical.length >= 25);
  for (const item of medical) {
    assert.equal(item.mesh.children[0].children.length, 1);
    assert.equal(
      game.blocked(item.mesh.position.x, item.mesh.position.z),
      false,
    );
  }
  game.disposeObject(game.world);
});

void test('the death sequence automatically follows the killer, including the final winner', () => {
  const game = arena();
  Object.assign(game, {
    killerId: 'killer',
    network: { playerId: 'me', send: () => {} },
    networkRoom: {
      phase: 'finished',
      players: [
        { id: 'me', health: 0 },
        { id: 'other', name: 'Other survivor', health: 50 },
        { id: 'killer', name: 'The killer', health: 75, shield: 30, kills: 1 },
      ],
    },
  });
  game.state.phase = 'dying';
  game.state.health = 0;
  game.completeDeath();
  assert.equal(game.state.phase, 'spectating');
  assert.equal(game.state.spectator?.id, 'killer');
  game.networkRoom!.players[2].health = 0;
  game.spectate();
  assert.equal(game.state.spectator?.id, 'other');
});

void test('the parachute uses one draw and never absorbs bullets', () => {
  const model = parachuteModel();
  assert.equal(model.children.length, 1);
  model.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(
    new THREE.Vector3(0, 10, 0),
    new THREE.Vector3(0, -1, 0),
  );
  assert.equal(ray.intersectObject(model, true).length, 0);
  model.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      o.material.dispose();
    }
  });
});

void test('aiming a sniper clears its physical scope from the camera and restores it on release', () => {
  const game = arena();
  game.setAiming(true);
  assert.equal(game.aiming, true);
  assert.equal(game.state.aiming, true);
  assert.equal(game.gun.visible, false);
  game.setAiming(false);
  assert.equal(game.gun.visible, true);
  game.state.weapon = 0;
  game.setAiming(true);
  assert.equal(game.gun.visible, true);
});

void test('solo bots target and shoot nearby rivals, with no preference for the human', (t) => {
  const game = arena();
  game.resetBots();
  game.bots.forEach((b, i) => {
    b.hp = i < 2 ? 100 : 0;
    b.armed = true;
    b.cooldown = 0;
  });
  game.bots[0].mesh.position.set(0, 0, 0);
  game.bots[1].mesh.position.set(0, 0, 10);
  game.position.set(0, 1.7, 30);
  assert.equal(game.chooseBotTarget(game.bots[0]), 1);
  const shield = game.bots[1].shield;
  t.mock.method(Math, 'random', () => 0);
  game.time = 1;
  game.updateBots(0.016);
  assert.ok(game.bots[1].shield < shield);
  assert.equal(
    game.state.shield,
    50,
    'Bots choose each other over a farther human',
  );
  game.position.set(0, 1.7, 2);
  assert.equal(game.chooseBotTarget(game.bots[0]), -1);
  game.bots[1].hp = 0;
  game.position.set(0, 1.7, 30);
  const cover = game.box(8, 3, 1, '#999', 0, 1.5, 15);
  game.solid(cover);
  game.scene.updateMatrixWorld(true);
  assert.equal(
    game.chooseBotTarget(game.bots[0]),
    null,
    'Solid cover hides the human',
  );
  game.disposeObject(game.scene);
});
void test('new sand cover blocks bullets and movement while leaving loot accessible', () => {
  const game = arena();
  game.buildWorld();
  const walls = game.world.children.filter((o) => o.name === 'Sand cover');
  assert.equal(walls.length, 40);
  for (const wall of walls) {
    const b = new THREE.Box3().setFromObject(wall);
    const p = wall.position;
    assert.ok(game.blocked(p.x, p.z));
    const wide = b.max.x - b.min.x > b.max.z - b.min.z;
    const from = new THREE.Vector3(
      p.x + (wide ? 0 : 4),
      1.7,
      p.z + (wide ? 4 : 0),
    );
    const to = new THREE.Vector3(
      p.x - (wide ? 0 : 4),
      1.7,
      p.z - (wide ? 4 : 0),
    );
    assert.equal(game.visible(from, to), false);
  }
  game.disposeObject(game.scene);
});

void test('solo shotgun hits up close and cannot damage a distant rival', () => {
  for (const distance of [7, 35]) {
    const game = arena();
    game.resetBots();
    game.bots.forEach((b, i) => {
      b.hp = i === 0 ? 100 : 0;
    });
    game.bots[0].mesh.position.set(0, 0, 0);
    game.camera.position.set(0, 1.3, distance);
    game.camera.lookAt(0, 1.3, 0);
    game.state.weapon = 1;
    game.aiming = true;
    game.shoot();
    assert.equal(game.bots[0].shield < 50, distance === 7);
    game.disposeObject(game.scene);
  }
});

void test('solo elimination drops a bot weapon with its rarity even after damage sets health to zero', () => {
  const game = arena();
  game.buildWorld();
  game.resetBots();
  const b = game.bots[0];
  b.armed = true;
  b.rarity = 3;
  b.ammunition = 17;
  b.hp = 0;
  const before = game.loot.length;
  game.killBot(b, true);
  assert.equal(game.loot.length, before + 1);
  assert.equal(game.loot[before].rarity, 3);
  assert.equal(game.loot[before].ammo, 17);
  game.killBot(b);
  assert.equal(game.loot.length, before + 1);
  game.disposeObject(game.scene);
});

void test('third-person fire converges from the body and cannot shoot past cover seen around by the camera', () => {
  const game = arena();
  game.resetBots();
  game.bots.forEach((b, i) => {
    if (i > 0) {
      b.hp = 0;
      b.mesh.visible = false;
    }
  });
  const target = game.bots[0];
  target.mesh.position.set(0, 0, 0);
  game.perspective = 'third';
  game.state.weapon = 0;
  game.position.set(0, 1.7, 10);
  game.camera.position.set(3, 2.2, 14);
  game.camera.lookAt(0, 1.4, 0);
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 3, 0.4),
    new THREE.MeshBasicMaterial(),
  );
  wall.position.set(0, 1.5, 9);
  game.world.add(wall);
  game.solids.push(wall);
  const before = target.hp + target.shield;
  game.shoot();
  assert.equal(
    target.hp + target.shield,
    before,
    'The shoulder camera sees the rival but the body shot hits cover',
  );
  assert.ok(game.tracers[0].mesh.geometry.attributes.position.getZ(1) > 8);
  game.solids = [];
  wall.removeFromParent();
  game.cooldown = 0;
  game.shoot();
  assert.ok(
    target.hp + target.shield < before,
    'Removing cover allows the converged shot to hit',
  );
});
void test('AR repeats while held; shotgun and sniper require releasing the trigger', () => {
  for (let i = 0; i < 3; i++) {
    const game = arena();
    game.state.weapon = i;
    const before = game.weaponAmmo[i];
    game.shoot();
    game.cooldown = 0;
    game.shoot();
    assert.equal(game.weaponAmmo[i], before - (i === 0 ? 2 : 1));
    game.triggerHeld = false;
    game.cooldown = 0;
    game.shoot();
    assert.equal(game.weaponAmmo[i], before - (i === 0 ? 3 : 2));
  }
});
void test('third person hides the first-person gun and scopes return to the chosen view', () => {
  const game = arena();
  game.motion = new THREE.Vector2();
  game.crouchOffset = 0;
  game.setPerspective('third');
  assert.equal(game.gun.visible, false);
  game.updatePlayerCamera();
  assert.equal(game.avatar?.visible, true);
  game.setAiming(true);
  game.updatePlayerCamera();
  assert.equal(game.thirdPerson(), false);
  assert.equal(game.avatar?.visible, false);
  assert.ok(game.camera.position.distanceTo(game.position) < 1e-10);
  game.setAiming(false);
  game.updatePlayerCamera();
  assert.equal(game.thirdPerson(), true);
  assert.equal(game.avatar?.visible, true);
  game.setPerspective('first');
  game.updatePlayerCamera();
  assert.equal(game.avatar?.visible, false);
  assert.equal(game.gun.visible, true);
});

void test('multiplayer shoulder shots send physical player coordinates and converged aim', () => {
  const game = arena();
  game.perspective = 'third';
  game.state.weapon = 0;
  game.state.crouching = true;
  game.position.set(0, 1.7, 10);
  game.camera.position.set(0.8, 1.5, 14);
  game.camera.lookAt(0, 1, 0);
  const target = new THREE.Mesh(
    new THREE.BoxGeometry(1, 2, 1),
    new THREE.MeshBasicMaterial(),
  );
  target.position.set(0, 1, 0);
  game.world.add(target);
  game.solids.push(target);
  const sent: import('../lib/game/multiplayer.ts').Command[] = [];
  game.network = { playerId: 'local', send: (c) => sent.push(c) };
  game.networkRoom = {
    phase: 'playing',
    players: [],
    events: [],
  } as unknown as import('../lib/game/multiplayer.ts').RoomSnapshot;
  game.shoot();
  const command = sent.find((c) => c.type === 'shoot');
  assert.equal(command?.type, 'shoot');
  if (command?.type !== 'shoot') return;
  assert.equal(command.pose.x, game.position.x);
  assert.equal(command.pose.z, game.position.z);
  assert.equal(command.pose.y, game.position.y);
  assert.equal(command.pose.crouching, true);
  const direction = new THREE.Vector3(
    -Math.sin(command.pose.yaw) * Math.cos(command.pose.pitch),
    Math.sin(command.pose.pitch),
    -Math.cos(command.pose.yaw) * Math.cos(command.pose.pitch),
  );
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 1.05, 10), direction);
  assert.ok(
    ray.intersectObject(target).length > 0,
    'Server aim starts at crouched eye and intersects the target',
  );
});
