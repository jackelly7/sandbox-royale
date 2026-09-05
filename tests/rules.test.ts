import test from 'node:test';
import assert from 'node:assert/strict';
import {
  stormRadius,
  takeDamage,
  reloadAmmo,
  WEAPONS,
  HEADSHOT_MULTIPLIER,
  cycleWeapon,
} from '../lib/game/rules.ts';

void test('storm gives players a grace period then closes in phases to the final circle', () => {
  assert.equal(stormRadius(0), 107);
  assert.equal(stormRadius(18), 107);
  assert.ok(stormRadius(100) < stormRadius(50));
  assert.equal(stormRadius(270), 5);
  assert.equal(stormRadius(900), 5);
});
void test('weapon wheel wraps and skips weapons not collected', () => {
  assert.equal(cycleWeapon(-1, [false, false, false], 1), -1);
  assert.equal(cycleWeapon(0, [true, false, true], 1), 2);
  assert.equal(cycleWeapon(2, [true, false, true], 1), 0);
  assert.equal(cycleWeapon(0, [true, false, true], -1), 2);
  assert.equal(cycleWeapon(1, [false, true, false], 1), 1);
});
void test('shield absorbs incoming damage and overflow reduces health', () => {
  assert.deepEqual(takeDamage(100, 50, 24), { health: 100, shield: 26 });
  assert.deepEqual(takeDamage(100, 10, 24), { health: 86, shield: 0 });
  assert.deepEqual(takeDamage(12, 0, 24), { health: 0, shield: 0 });
});
void test('reload conserves rounds when the reserve cannot fill a magazine', () => {
  assert.deepEqual(reloadAmmo(4, 9, 30), { ammo: 13, reserve: 0 });
  assert.deepEqual(reloadAmmo(24, 120, 30), { ammo: 30, reserve: 114 });
  assert.deepEqual(reloadAmmo(30, 120, 30), { ammo: 30, reserve: 120 });
  assert.deepEqual(reloadAmmo(0, 0, 30), { ammo: 0, reserve: 0 });
});
void test('every weapon can finish an unshielded opponent with one magazine', () => {
  for (const weapon of WEAPONS) {
    assert.ok(weapon.damage * weapon.pellets * weapon.capacity >= 100);
    assert.ok(weapon.reload > weapon.interval);
  }
});

void test('fresh players survive any single full blast, including headshots', () => {
  for (const weapon of WEAPONS)
    assert.ok(weapon.damage * weapon.pellets * HEADSHOT_MULTIPLIER < 150);
  assert.ok(Math.ceil(150 / WEAPONS[0].damage) >= 10);
  assert.ok(Math.ceil(150 / (WEAPONS[1].damage * WEAPONS[1].pellets)) >= 3);
  assert.ok(
    WEAPONS[2].damage * HEADSHOT_MULTIPLIER < 100,
    'Sniper headshot cannot one-shot full health',
  );
});
