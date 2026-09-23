import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { playerBodyVisible } from '../lib/game/player-card.ts';

void test('cards require a visible body inside the field of view', () => {
  const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 200);
  camera.position.set(0, 1.7, 0);
  const body = new THREE.Group();
  body.position.set(0, 0, -10);
  const visible = () => playerBodyVisible(camera, body, [], [], 1000);
  assert.equal(visible(), true);
  body.position.z = 10;
  assert.equal(visible(), false, 'Behind the camera');
  body.position.set(10, 0, -10);
  assert.equal(visible(), false, 'Outside the field of view');
  body.position.set(0, 0, -10);
  const wall = [{ min: [-4, 0, -6], max: [4, 2.4, -5] }];
  assert.equal(
    playerBodyVisible(camera, body, wall, [], 1000),
    false,
    'Body hidden even when an overhead card would clear the wall',
  );
  wall[0].max[1] = 1.5;
  assert.equal(
    playerBodyVisible(camera, body, wall, [], 1000),
    true,
    'Visible head over low cover',
  );
  body.scale.y = 0.5;
  assert.equal(
    playerBodyVisible(camera, body, wall, [], 1000),
    false,
    'Crouched body hidden',
  );
  body.visible = false;
  assert.equal(visible(), false);
});
