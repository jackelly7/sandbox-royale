import { AMMO_TYPES } from './loot.ts';
import * as THREE from 'three';
import { modelKit } from './model-kit.ts';
function buildSupplyModel(kind: number) {
  const k = modelKit(kind === 3 ? 'Shield cell' : 'Medkit'),
    { box, tube } = k;
  if (kind === 8) {
    box(0.3, 0.48, 0.3, '#597e81');
    box(0.32, 0.08, 0.32, '#c8edf0', 0, 0.1, 0);
    box(0.15, 0.12, 0.12, '#25383b', 0, 0.3, 0);
    box(0.06, 0.12, 0.25, '#d4d6bb', 0.1, 0.33, 0.05);
  } else if (kind >= 5) {
    const t = kind - 5,
      color = AMMO_TYPES[t].color;
    box(0.55, 0.23, 0.4, '#38434b', 0, 0, 0);
    box(0.57, 0.05, 0.42, color, 0, -0.1, 0);
    // Different cartridge lengths and shell colors identify the three ammo types.
    for (const x of [-0.13, 0.13]) {
      const h = t === 1 ? 0.2 : t === 2 ? 0.42 : 0.3;
      box(0.09, h, 0.12, color, x, h / 2 + 0.08, 0);
    }
  } else if (kind === 3) {
    const shell = k.add(
      new THREE.CylinderGeometry(0.25, 0.3, 0.62, 8),
      '#549bad',
      0,
      -0.02,
      0,
    );
    shell.rotation.y = Math.PI / 8;
    tube(0.23, 0.1, '#d9e7df', 0, 0.34, 0, 8).rotation.x = 0;
    box(0.23, 0.1, 0.13, '#233f50', 0, 0.38, 0);
    box(0.35, 0.27, 0.026, '#beffff', 0, -0.02, 0.28, 0.03);
    box(0.07, 0.16, 0.031, '#438caa', 0, -0.02, 0.3);
    box(0.18, 0.05, 0.032, '#438caa', 0, -0.02, 0.3);
  } else {
    box(0.73, 0.56, 0.45, '#cd6356', 0, 0, 0, 0.065);
    box(0.76, 0.095, 0.48, '#364751', 0, -0.15, 0);
    box(0.54, 0.035, 0.025, '#f0c1a0', 0, 0.2, 0.245);
    box(0.34, 0.09, 0.03, '#fff5dd', 0, 0.04, 0.25);
    box(0.09, 0.3, 0.03, '#fff5dd', 0, 0.04, 0.25);
    box(0.1, 0.16, 0.09, '#364751', -0.18, 0.34, 0);
    box(0.1, 0.16, 0.09, '#364751', 0.18, 0.34, 0);
    box(0.4, 0.07, 0.09, '#364751', 0, 0.43, 0);
  }
  return k.finish();
}

const templates = new Map<string | number, THREE.Group>();
export function supplyModel(kind: number) {
  const key = kind;
  let template = templates.get(key);
  if (!template) {
    template = buildSupplyModel(kind);
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
