import * as THREE from 'three';
import { WEAPONS } from './rules.ts';
import { modelKit } from './model-kit.ts';

// One vertex-colored mesh per weapon. Extra first-person details never multiply
// across the island's pickups or remote players. Forward is negative Z.
function buildWeaponModel(index: number, detail: 'world' | 'held' = 'world') {
  const k = modelKit(WEAPONS[index].short),
    { box, tube } = k;
  const dark = '#263239',
    edge = '#50636b',
    black = '#142026',
    pale = '#e6e1cb';
  const accent = WEAPONS[index].color;
  if (index === 0) {
    box(0.18, 0.19, 0.5, dark, 0, 0, 0.02, 0.035);
    box(0.185, 0.105, 0.32, accent, 0, 0.08, -0.22, 0.025);
    tube(0.029, 0.38, edge, 0, 0.025, -0.55);
    tube(0.044, 0.075, black, 0, 0.025, -0.76);
    box(0.125, 0.27, 0.14, edge, 0, -0.19, -0.09, 0.025).rotation.x = 0.22;
    box(0.13, 0.025, 0.145, accent, 0, -0.33, -0.12);
    box(0.1, 0.22, 0.11, black, 0, -0.16, 0.18).rotation.x = -0.25;
    box(0.145, 0.17, 0.28, dark, 0, -0.015, 0.41, 0.03);
    box(0.16, 0.18, 0.045, black, 0, -0.015, 0.55);
    box(0.008, 0.055, 0.14, black, 0.094, 0.025, 0.06);
    box(0.1, 0.035, 0.38, black, 0, 0.15, -0.12);
    box(0.018, 0.085, 0.05, pale, 0, 0.2, -0.3);
    if (detail === 'held') {
      for (let i = 0; i < 3; i++)
        box(0.008, 0.025, 0.035, black, 0.095, 0.075, -0.29 + i * 0.065);
      box(0.01, 0.055, 0.045, pale, 0.092, -0.035, 0.14);
      box(0.06, 0.015, 0.12, edge, 0, -0.25, 0.11);
      box(0.012, 0.065, 0.018, edge, 0.035, -0.22, 0.055);
    }
  } else if (index === 1) {
    box(0.215, 0.19, 0.35, dark, 0, 0, 0.06, 0.035);
    tube(0.055, 0.7, edge, 0, 0.05, -0.46);
    tube(0.043, 0.54, dark, 0, -0.06, -0.38);
    tube(0.039, 0.012, black, 0, 0.05, -0.817);
    box(0.215, 0.13, 0.23, accent, 0, -0.04, -0.28, 0.025);
    box(0.16, 0.21, 0.39, '#b97745', 0, -0.055, 0.41, 0.035);
    box(0.18, 0.23, 0.045, black, 0, -0.055, 0.61);
    box(0.014, 0.09, 0.14, black, 0.112, 0.02, 0.06);
    box(0.035, 0.045, 0.035, '#fc8461', 0, 0.115, -0.755);
    if (detail === 'held') {
      for (let i = 0; i < 4; i++)
        box(0.226, 0.017, 0.021, dark, 0, 0.032, -0.36 + i * 0.048);
      for (let i = 0; i < 3; i++)
        tube(
          0.026,
          0.105,
          '#da704d',
          -0.125,
          -0.015,
          -0.02 + i * 0.078,
          5,
        ).rotation.x = 0;
      box(0.035, 0.018, 0.018, pale, 0, 0.147, -0.755);
    }
  } else {
    box(0.155, 0.17, 0.57, accent, 0, -0.015, -0.02, 0.035);
    tube(0.027, 0.74, edge, 0, 0.022, -0.63);
    tube(0.047, 0.14, black, 0, 0.022, -1.035);
    box(0.15, 0.21, 0.36, accent, 0, -0.045, 0.42, 0.035);
    box(0.16, 0.22, 0.045, black, 0, -0.045, 0.61);
    box(0.105, 0.18, 0.1, dark, 0, -0.165, 0.13).rotation.x = -0.25;
    box(0.1, 0.08, 0.23, edge, 0, 0.17, -0.065);
    tube(0.062, 0.3, dark, 0, 0.27, -0.06);
    tube(0.087, 0.105, black, 0, 0.27, -0.24);
    tube(0.073, 0.008, '#6fdedc', 0, 0.27, -0.296);
    box(0.025, 0.22, 0.03, edge, -0.09, -0.13, -0.44).rotation.z = -0.38;
    box(0.025, 0.22, 0.03, edge, 0.09, -0.13, -0.44).rotation.z = 0.38;
    if (detail === 'held') {
      tube(0.036, 0.065, edge, 0, 0.34, -0.04).rotation.x = 0;
      box(0.08, 0.02, 0.07, black, 0, 0.376, -0.04);
      box(0.06, 0.025, 0.035, edge, 0.09, 0.04, 0.14);
      tube(0.03, 0.035, black, 0.12, 0.025, 0.14);
      box(0.007, 0.008, 0.045, pale, 0.049, 0.318, -0.27).rotation.z = -0.5;
    }
  }
  const root = k.finish();
  root.userData.detail = detail;
  return root;
}

const templates = new Map<string | number, THREE.Group>();
export function weaponModel(index: number, detail: 'world' | 'held' = 'world') {
  const key = `${index}:${detail}`;
  let template = templates.get(key);
  if (!template) {
    template = buildWeaponModel(index, detail);
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
