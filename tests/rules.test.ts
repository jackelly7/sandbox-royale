import test from 'node:test';
import assert from 'node:assert/strict';
import {
  stormRadius,
  takeDamage,
  reloadAmmo,
  WEAPONS,
} from '../lib/game/rules.ts';

void test('storm gives players a grace period then closes continuously to the final circle', () => {
  assert.equal(stormRadius(0), 107);
  assert.equal(stormRadius(35), 107);
  assert.ok(stormRadius(100) < stormRadius(50));
  assert.equal(stormRadius(270), 5);
  assert.equal(stormRadius(900), 5);
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
