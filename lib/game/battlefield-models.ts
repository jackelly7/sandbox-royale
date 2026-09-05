import * as THREE from 'three';
import { modelKit } from './model-kit.ts';
import { type Smoke, type SupplyDrop, SUPPLY_FALL } from './battlefield.ts';
export function supplyCrateModel() {
  const k = modelKit('Supply crate');
  k.box(2.2, 1.8, 2.2, '#f6c955', 0, 0.9, 0);
  k.box(2.25, 0.18, 2.25, '#343e49', 0, 1.5, 0);
  k.box(0.25, 1.82, 2.24, '#343e49', 0, 0.91, 0);
  k.box(2.24, 1.82, 0.25, '#343e49', 0, 0.91, 0);
  const flag = k.add(new THREE.ConeGeometry(0.8, 5, 5), '#c37dff', 0, 4.5, 0);
  flag.rotation.z = Math.PI;
  return k.finish();
}
export class BattlefieldEffects {
  root = new THREE.Group();
  crate = supplyCrateModel();
  smoke = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshBasicMaterial({
      color: '#b5c4c9',
      transparent: true,
      opacity: 0.94,
      depthWrite: false,
    }),
    30,
  );
  matrix = new THREE.Matrix4();
  constructor() {
    this.root.add(this.crate, this.smoke);
    this.crate.visible = false;
    this.smoke.count = 0;
    this.smoke.frustumCulled = false;
  }
  update(smokes: Smoke[], supply: SupplyDrop | undefined, now: number) {
    let n = 0;
    for (const s of smokes) {
      if (now >= s.endsAt) continue;
      if (now < s.startsAt) {
        const t = Math.max(0, (now - s.thrownAt) / (s.startsAt - s.thrownAt));
        this.matrix.makeScale(0.15, 0.15, 0.15);
        this.matrix.setPosition(
          s.from.x + (s.x - s.from.x) * t,
          s.from.y + (s.y - s.from.y) * t + 3 * Math.sin(t * Math.PI),
          s.from.z + (s.z - s.from.z) * t,
        );
        this.smoke.setMatrixAt(n++, this.matrix);
        continue;
      }
      const scale = Math.min(
        1,
        (now - s.startsAt) / 350,
        (s.endsAt - now) / 700,
      );
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5;
        this.matrix.makeScale(4 * scale, 3.8 * scale, 4 * scale);
        this.matrix.setPosition(
          s.x + Math.cos(a) * 2,
          s.y + 2.5,
          s.z + Math.sin(a) * 2,
        );
        this.smoke.setMatrixAt(n++, this.matrix);
      }
    }
    this.smoke.count = n;
    this.smoke.instanceMatrix.needsUpdate = true;
    this.crate.visible =
      !!supply && !supply.opened && now >= supply.arrivesAt - SUPPLY_FALL;
    if (supply)
      this.crate.position.set(
        supply.x,
        Math.max(0, ((supply.arrivesAt - now) / SUPPLY_FALL) * 45),
        supply.z,
      );
  }
}
