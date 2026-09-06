import * as THREE from 'three';
import { modelKit } from './model-kit.ts';
export const SKINS = [
  { suit: '#48a8aa', light: '#8de0cf', skin: '#bc825e' },
  { suit: '#d67a53', light: '#ffd18a', skin: '#efbd8b' },
  { suit: '#727ab8', light: '#c5b9f0', skin: '#7d513c' },
  { suit: '#c1a54e', light: '#efe1a2', skin: '#d7976d' },
  { suit: '#308ecd', light: '#a8e4ff', skin: '#bc825e' },
  { suit: '#e07d60', light: '#ffd1a7', skin: '#7d513c' },
];
export function skinIndex(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 4;
}
function buildCharacterModel(index: number) {
  const root = new THREE.Group();
  root.name = 'Sandbox runner';
  const s = SKINS[index % SKINS.length],
    dark = '#283c46';
  const body = modelKit('Body');
  body.box(0.7, 0.8, 0.39, s.suit, 0, 1.28, 0, 0.08);
  body.box(0.46, 0.4, 0.42, s.skin, 0, 1.97, 0.015, 0.07);
  body.box(
    index % 2 ? 0.56 : 0.53,
    index === 2 ? 0.26 : 0.21,
    0.49,
    index === 3 ? s.suit : dark,
    0,
    2.16,
    0,
    index === 1 ? 0 : 0.045,
  );
  body.box(0.44, 0.13, 0.035, s.light, 0, 2.02, 0.235);
  body.box(0.62, 0.26, 0.045, dark, 0, 1.4, 0.22);
  body.box(0.23, 0.09, 0.055, s.light, 0.17, 1.43, 0.246);
  body.box(0.42, 0.5, 0.18, dark, 0, 1.34, -0.29);
  body.box(0.76, 0.09, 0.43, dark, 0, 0.92, 0);
  // Visor glint, backpack straps and a sandbox badge stay in the body batch.
  body.add(new THREE.PlaneGeometry(0.15, 0.025), '#ecfff5', -0.08, 2.055, 0.27);
  for (const side of [-1, 1]) {
    body.add(
      new THREE.PlaneGeometry(0.065, 0.55),
      dark,
      side * 0.23,
      1.3,
      0.24,
    );
    body.add(
      new THREE.PlaneGeometry(0.12, 0.16),
      s.light,
      side * 0.17,
      1.13,
      0.27,
    );
  }
  body.add(new THREE.PlaneGeometry(0.1, 0.08), '#ffdc86', 0, 1.52, 0.265);
  root.add(body.finish());
  for (const side of [-1, 1]) {
    const leg = modelKit(side < 0 ? 'Left leg' : 'Right leg');
    leg.box(0.25, 0.61, 0.27, dark, 0, -0.3, 0, 0.035);
    leg.box(0.26, 0.15, 0.055, s.suit, 0, -0.28, 0.16);
    leg.box(0.28, 0.19, 0.38, dark, 0, -0.69, 0.04);
    leg.add(new THREE.PlaneGeometry(0.28, 0.035), s.light, 0, -0.77, 0.235);
    const l = leg.finish();
    l.position.set(side * 0.22, 0.84, 0);
    root.add(l);
    const arm = modelKit(side < 0 ? 'Left arm' : 'Right arm');
    arm.box(0.23, 0.43, 0.27, s.suit, 0, -0.13, 0, 0.035);
    arm.box(0.25, 0.11, 0.28, s.light, 0, 0.04, 0);
    arm.box(0.21, 0.21, 0.24, dark, 0, -0.44, 0.025);
    const a = arm.finish();
    a.position.set(side * 0.48, 1.6, 0.055);
    root.add(a);
  }
  root.userData.skin = index;
  return root;
}
const bodyParts = ['Body', 'Left leg', 'Right leg', 'Left arm', 'Right arm'];
export function setCharacterSkin(root: THREE.Group, index: number) {
  if (root.userData.skin === index) return;
  for (let i = root.children.length - 1; i >= 0; i--) {
    const child = root.children[i];
    if (bodyParts.includes(child.name)) {
      root.remove(child);
      child.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
    }
  }
  const next = characterModel(index);
  root.add(...next.children);
  root.userData.skin = index;
  root.userData.rig = undefined;
  // Preserve hit detection after replacing the visual skin.
  root.traverse((o) => {
    o.userData.bot = root.userData.bot;
  });
}
export function animateCharacter(
  root: THREE.Group,
  phase: number,
  amount: number,
) {
  const rig =
    root.userData.rig ??
    (root.userData.rig = bodyParts
      .slice(1)
      .map((name) => root.getObjectByName(name)));
  const body = root.getObjectByName('Body');
  if (body) {
    body.position.y =
      Math.sin(phase * 2) * amount * 0.035 + Math.sin(phase * 0.23) * 0.008;
    body.rotation.z = Math.sin(phase) * amount * 0.025;
  }
  rig.forEach((part: THREE.Object3D | undefined, i: number) => {
    if (part) {
      const step = Math.sin(phase + (i % 2) * Math.PI);
      part.rotation.x = step * amount * (i < 2 ? 1 : 0.55);
      part.position.y =
        (i < 2 ? 0.84 : 1.6) + (i < 2 ? Math.max(0, -step) * amount * 0.07 : 0);
      part.rotation.z = i < 2 ? 0 : Math.sin(phase * 0.23) * 0.015;
    }
  });
}

const templates = new Map<string | number, THREE.Group>();
export function characterModel(index: number) {
  const key = index;
  let template = templates.get(key);
  if (!template) {
    template = buildCharacterModel(index);
    templates.set(key, template);
  }
  const model = template.clone(true);
  model.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry = object.geometry.clone();
      object.material = (object.material as THREE.Material).clone();
    }
  });
  return model;
}
