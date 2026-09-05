import * as THREE from 'three';
export const FEEL = [
  { kick: 0.065, view: 0.009, cycle: 0.14 },
  { kick: 0.14, view: 0.025, cycle: 0.8 },
  { kick: 0.11, view: 0.018, cycle: 1.2 },
];
export function reloadMotion(index: number, progress: number) {
  const p = Math.max(0, Math.min(1, progress));
  const lift = Math.sin(Math.PI * p);
  const work = Math.sin(Math.PI * Math.max(0, Math.min(1, (p - 0.12) / 0.75)));
  return {
    x: index === 1 ? -0.08 * lift : -0.1 * lift,
    y: -0.12 * lift,
    z: 0.1 * lift,
    rx: index === 1 ? 0.25 * lift : -0.4 * lift,
    rz: (index === 1 ? 0.6 : -0.45) * lift,
    work,
  };
}
export function animateWeapon(
  model: THREE.Group,
  index: number,
  progress: number | null,
  sinceShot: number,
) {
  const part = model.getObjectByName('Action');
  if (part) {
    part.position.set(0, 0, 0);
    part.rotation.set(0, 0, 0);
    part.visible = true;
    if (index === 0 && progress !== null) {
      const out = Math.sin(
        Math.PI * Math.max(0, Math.min(1, (progress - 0.12) / 0.7)),
      );
      part.position.set(-out * 0.09, -out * 0.42, out * 0.05);
      part.rotation.z = out * 0.18;
    }
    if (index === 1 && progress === null && sinceShot < 0.72)
      part.position.z =
        Math.sin(Math.PI * Math.max(0, (sinceShot - 0.18) / 0.54)) * 0.13;
    if (index === 2) {
      const t =
        progress !== null
          ? Math.sin(Math.PI * progress)
          : sinceShot > 0.2 && sinceShot < 1
            ? Math.sin((Math.PI * (sinceShot - 0.2)) / 0.8)
            : 0;
      part.position.z = Math.max(0, t) * 0.16;
      part.rotation.z = -Math.max(0, t) * 0.2;
    }
  }
  const shell = model.getObjectByName('Reload shell');
  if (shell) {
    shell.visible =
      index === 1 && progress !== null && progress > 0.12 && progress < 0.85;
    if (progress !== null) {
      const t = (progress * 3) % 1;
      shell.position.set(-0.1 * (1 - t), -0.32 * (1 - t), 0.1);
      shell.rotation.x = t * 0.5;
    }
  }
}
