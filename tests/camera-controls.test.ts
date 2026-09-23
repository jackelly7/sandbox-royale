import test from 'node:test';
import assert from 'node:assert/strict';
import { PositionHistory } from '../lib/game/position-history.ts';
import { BattleGame } from '../lib/game/engine.ts';

void test('delayed poses subtract corrections already applied without losing new movement', () => {
  const history = new PositionHistory();
  const pose = (x: number) =>
    history.record({ x, y: 1.7, z: 0, yaw: 0, pitch: 0, weapon: 0 });
  const first = pose(10),
    second = pose(11);
  assert.deepEqual(history.error({ x: 8, z: 0 }, first), { x: -2, z: 0 });
  history.applied(-1, 0);
  assert.deepEqual(history.error({ x: 8, z: 0 }, second), { x: -2, z: 0 });
  history.applied(-2, 0);
  assert.deepEqual(history.error({ x: 8, z: 0 }, second), { x: 0, z: 0 });
  const corrected = pose(8);
  assert.deepEqual(history.error({ x: 8, z: 0 }, corrected), { x: 0, z: 0 });
  history.reset();
  assert.equal(history.error({ x: -30, z: 50 }, second), undefined);
});

void test('right Command holds ADS, cooperates with mouse aim, and clears on map/pause/blur', (t) => {
  const doc = new EventTarget();
  const win = new EventTarget();
  const canvas = new EventTarget();
  for (const [key, value] of [
    ['document', doc],
    ['window', win],
  ] as const) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, key, original);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
  const game = Object.create(BattleGame.prototype) as BattleGame;
  Object.assign(game, {
    state: { phase: 'playing', weapon: 0, mapOpen: false },
    preferences: {},
    keys: new Set(),
    cleanup: [],
    renderer: { domElement: canvas },
    mouseAimHeld: false,
    menuOpen: false,
    touch: false,
    isPunching: () => false,
    canUseWeapon: () => true,
    isDowned: () => false,
    showWeapon: () => {},
    emit: () => {},
  });
  game.bind();
  t.after(() => game.cleanup.forEach((fn) => fn()));
  const key = (code: string, type = 'keydown', repeat = false) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { code, repeat });
    doc.dispatchEvent(event);
    return event;
  };
  const mouse = (type: string) => {
    const event = new Event(type);
    Object.assign(event, { button: 2 });
    (type === 'mousedown' ? canvas : doc).dispatchEvent(event);
  };
  key('MetaLeft');
  assert.ok(!game.aiming, 'Left Command retains its normal behavior');
  assert.equal(key('MetaRight').defaultPrevented, true);
  assert.equal(game.aiming, true);
  key('MetaRight', 'keydown', true);
  assert.equal(game.aiming, true);
  mouse('mousedown');
  key('MetaRight', 'keyup');
  assert.equal(game.aiming, true, 'Mouse still holds aim');
  mouse('mouseup');
  assert.equal(game.aiming, false);
  key('MetaRight');
  mouse('mousedown');
  mouse('mouseup');
  assert.equal(game.aiming, true, 'Command still holds aim');
  assert.equal(
    key('KeyW').defaultPrevented,
    true,
    'Command+W must not close the game',
  );
  key('MetaRight', 'keyup');
  assert.equal(game.aiming, false);
  assert.equal(
    game.keys.size,
    0,
    'Do not leave movement stuck after suppressed macOS keyups',
  );
  key('MetaRight');
  game.toggleMap();
  assert.equal(game.aiming, false);
  key('MetaRight');
  assert.equal(game.aiming, false, 'No aim while map is open');
  game.toggleMap();
  key('MetaRight');
  win.dispatchEvent(new Event('blur'));
  assert.equal(game.aiming, false);
  assert.equal(game.state.phase, 'paused');
  assert.equal(game.keys.size, 0);
  key('MetaRight');
  assert.equal(game.aiming, false, 'No aim while paused');
});
