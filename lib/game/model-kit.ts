import * as THREE from 'three';
import { batchIsland } from './render-world.ts';

// An eight-sided profile gives highlights and shaped corners for 28 triangles.
export function chamferBox(w: number, h: number, d: number, bevel = 0.08) {
  const x = w / 2,
    y = h / 2,
    b = Math.min(bevel, x * 0.4, y * 0.4);
  const shape = new THREE.Shape();
  const points = [
    [-x + b, -y],
    [x - b, -y],
    [x, -y + b],
    [x, y - b],
    [x - b, y],
    [-x + b, y],
    [-x, y - b],
    [-x, -y + b],
  ];
  points.forEach(([px, py], i) =>
    i ? shape.lineTo(px, py) : shape.moveTo(px, py),
  );
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: d,
    bevelEnabled: false,
    steps: 1,
  });
  g.translate(0, 0, -d / 2);
  return g;
}
export function modelKit(name: string) {
  const root = new THREE.Group();
  root.name = name;
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const material = (color: string) => {
    let m = materials.get(color);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
      materials.set(color, m);
    }
    return m;
  };
  const add = (
    geometry: THREE.BufferGeometry,
    color: string,
    x = 0,
    y = 0,
    z = 0,
  ) => {
    const mesh = new THREE.Mesh(geometry, material(color));
    mesh.position.set(x, y, z);
    root.add(mesh);
    return mesh;
  };
  const box = (
    w: number,
    h: number,
    d: number,
    color: string,
    x = 0,
    y = 0,
    z = 0,
    bevel = 0,
  ) =>
    add(
      bevel ? chamferBox(w, h, d, bevel) : new THREE.BoxGeometry(w, h, d),
      color,
      x,
      y,
      z,
    );
  const tube = (
    r: number,
    length: number,
    color: string,
    x = 0,
    y = 0,
    z = 0,
    segments = 6,
  ) => {
    const m = add(
      new THREE.CylinderGeometry(r, r, length, segments),
      color,
      x,
      y,
      z,
    );
    m.rotation.x = Math.PI / 2;
    return m;
  };
  const finish = () => {
    batchIsland(root, [], Infinity);
    root.children[0].name = name + ' mesh';
    return root;
  };
  return { root, box, tube, add, finish };
}
