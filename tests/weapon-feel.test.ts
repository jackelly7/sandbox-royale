import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { shoulderCamera, convergedAim } from '../lib/game/camera-rig.ts';
import { animateWeapon, reloadMotion } from '../lib/game/weapon-feel.ts';
import { weaponModel } from '../lib/game/weapon-models.ts';
import { WeaponAudio } from '../lib/game/weapon-audio.ts';

void test('shoulder camera stays in front of rear walls, outside corners and above sand', () => {
  const eye = new THREE.Vector3(0, 1.7, 0);
  const clear = shoulderCamera(eye, 0, 0, false, []);
  assert.ok(clear.distance > 4);
  const wall = new THREE.Box3(
    new THREE.Vector3(-2, 0, 1),
    new THREE.Vector3(2, 4, 1.1),
  );
  const clipped = shoulderCamera(eye, 0, 0, false, [wall]);
  assert.ok(clipped.position.z < 0.8);
  assert.ok(clipped.distance < clear.distance);
  const corner = new THREE.Box3(
    new THREE.Vector3(0.15, 0, 0.9),
    new THREE.Vector3(2, 4, 3),
  );
  assert.ok(
    shoulderCamera(eye, 0, 0, false, [corner]).distance < clear.distance,
  );
  assert.ok(shoulderCamera(eye, 0, 1.35, false, []).position.y >= 0.249);
  assert.equal(
    shoulderCamera(eye, 0, 0, false, [
      new THREE.Box3(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 3, 1)),
    ]).distance,
    0,
  );
});
void test('converged body aim points at the camera target at close and far range', () => {
  const eye = new THREE.Vector3(0, 1.7, 0);
  for (const target of [
    new THREE.Vector3(0.6, 1.3, -2),
    new THREE.Vector3(-12, 5, -70),
  ]) {
    const aim = convergedAim(eye, target);
    const direction = new THREE.Vector3(
      -Math.sin(aim.yaw) * Math.cos(aim.pitch),
      Math.sin(aim.pitch),
      -Math.cos(aim.yaw) * Math.cos(aim.pitch),
    );
    assert.ok(
      direction.distanceTo(target.clone().sub(eye).normalize()) < 1e-10,
    );
  }
});
void test('reloads animate individual parts, reset on cancellation, and leave shared world guns unchanged', () => {
  for (let i = 0; i < 3; i++) {
    const held = weaponModel(i, 'held'),
      world = weaponModel(i, 'world');
    assert.equal(world.children.length, 1);
    assert.equal(world.getObjectByName('Action'), undefined);
    animateWeapon(held, i, 0.45, 10);
    if (i === 1)
      assert.equal(held.getObjectByName('Reload shell')?.visible, true);
    else assert.ok(held.getObjectByName('Action')!.position.length() > 0.1);
    animateWeapon(held, i, null, 10);
    assert.equal(held.getObjectByName('Action')!.position.length(), 0);
    if (i === 1)
      assert.equal(held.getObjectByName('Reload shell')?.visible, false);
    const end = reloadMotion(i, 1);
    assert.ok(
      Math.abs(end.x) + Math.abs(end.y) + Math.abs(end.rx) + Math.abs(end.rz) <
        1e-10,
    );
  }
  const shotgun = weaponModel(1, 'held'),
    sniper = weaponModel(2, 'held');
  animateWeapon(shotgun, 1, null, 0.4);
  animateWeapon(sniper, 2, null, 0.6);
  assert.ok(shotgun.getObjectByName('Action')!.position.z > 0.1);
  assert.ok(sniper.getObjectByName('Action')!.position.z > 0.1);
});
void test('weapon audio caps simultaneous voices, skips distant fire and releases sound nodes', () => {
  const sources: { onended?: () => void }[] = [];
  let disconnected = 0;
  const param = () => ({
    value: 0,
    setValueAtTime() {},
    exponentialRampToValueAtTime() {},
  });
  const node = () => ({
    connect() {},
    disconnect() {
      disconnected++;
    },
    start() {},
    stop() {},
  });
  const context = {
    state: 'running',
    sampleRate: 8000,
    currentTime: 0,
    destination: {},
    createBuffer: () => ({ getChannelData: () => new Float32Array(8000) }),
    createBufferSource: () => {
      const n = { ...node(), onended: undefined };
      sources.push(n);
      return n;
    },
    createBiquadFilter: () => ({ ...node(), frequency: param() }),
    createGain: () => ({ ...node(), gain: param() }),
    createStereoPanner: () => ({ ...node(), pan: param() }),
    createOscillator: () => ({ ...node(), frequency: param() }),
  } as unknown as AudioContext;
  const audio = new WeaponAudio(context);
  audio.shot(0, 100);
  assert.equal(sources.length, 0);
  for (let i = 0; i < 100; i++) audio.shot(i % 3);
  assert.equal(audio.active, 32);
  for (const source of sources) source.onended?.();
  assert.equal(audio.active, 0);
  assert.equal(disconnected, 32 * 6);
  audio.mechanical(1, 2);
  assert.equal(audio.active, 1);
});
