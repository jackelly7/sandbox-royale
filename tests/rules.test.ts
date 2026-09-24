import { INITIAL_CIRCLE } from '../lib/game/arena.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  stormRadius,
  takeDamage,
  reloadAmmo,
  WEAPONS,
  HEADSHOT_MULTIPLIER,
  headshotMultiplier,
  weaponDamage,
  automaticWeapon,
  cycleWeapon,
} from '../lib/game/rules.ts';

void test('storm gives players a grace period then closes in phases to the final circle', () => {
  assert.equal(stormRadius(0), INITIAL_CIRCLE);
  assert.equal(stormRadius(39), INITIAL_CIRCLE);
  assert.ok(stormRadius(100) < stormRadius(50));
  assert.equal(stormRadius(285), 5);
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
  assert.ok(Math.ceil(150 / (WEAPONS[1].damage * WEAPONS[1].pellets)) >= 2);
  assert.ok(
    WEAPONS[2].damage * HEADSHOT_MULTIPLIER < 150,
    'Common sniper headshot does not one-shot full health and starting shields',
  );
});

void test('Epic and Legendary sniper headshots eliminate full health and shields', () => {
  for (const rarity of [2, 3]) {
    const body = weaponDamage(2, 100, rarity);
    assert.ok(body < 200);
    assert.deepEqual(
      takeDamage(100, 100, body * headshotMultiplier(2, rarity)),
      { health: 0, shield: 0 },
    );
  }
  assert.ok(weaponDamage(2, 100, 1) * headshotMultiplier(2, 1) < 200);
});
void test('Gun Game opening and precision stages are more forgiving', () => {
  assert.equal(weaponDamage(3, 10, 0, 'gun-game'), 34);
  assert.equal(Math.ceil(150 / weaponDamage(3, 10, 0, 'gun-game')), 5);
  assert.equal(weaponDamage(6, 10, 0, 'gun-game'), 46);
  assert.equal(weaponDamage(7, 10, 0, 'gun-game'), 60);
  for (const weapon of [1, 2, 3, 6, 7]) {
    assert.equal(automaticWeapon(weapon, 'gun-game'), true);
    assert.equal(automaticWeapon(weapon), false);
  }
});
