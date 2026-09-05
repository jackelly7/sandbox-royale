import test from 'node:test';
import assert from 'node:assert/strict';
import { shotDirection, weaponDamage, WEAPONS } from '../lib/game/rules.ts';
void test('sniper hip fire spreads while scoped fire remains precise', (t) => {
  t.mock.method(Math, 'random', () => 0.5);
  const hip = shotDirection(0, 0, 2, false),
    scope = shotDirection(0, 0, 2, true);
  const offset = (d: number[]) => Math.hypot(d[0], d[1]);
  assert.ok(offset(hip) > 0.03);
  assert.ok(offset(scope) < 0.0002);
  assert.ok(Math.abs(Math.hypot(...hip) - 1) < 1e-10);
});
void test('shotgun fires seven separated buckshot pellets even while aiming', () => {
  const pellets = Array.from({ length: 7 }, (_, i) =>
    shotDirection(0, 0, 1, true, i),
  );
  assert.equal(new Set(pellets.map((p) => p.join(','))).size, 7);
  assert.equal(Math.hypot(pellets[0][0], pellets[0][1]), 0);
  for (const p of pellets.slice(1)) assert.ok(Math.hypot(p[0], p[1]) > 0.04);
  assert.equal(weaponDamage(1, 8), WEAPONS[1].damage);
  assert.ok(weaponDamage(1, 20) < WEAPONS[1].damage / 2);
  assert.equal(weaponDamage(1, 28), 0);
  assert.equal(weaponDamage(1, 100), 0);
  assert.equal(weaponDamage(2, 100), WEAPONS[2].damage);
});
