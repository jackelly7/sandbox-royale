import * as THREE from 'three';
const streakGeometry = new THREE.CylinderGeometry(1, 1, 1, 4, 1, true);
const impactGeometry = new THREE.IcosahedronGeometry(1, 0);
export function bulletTrail(
  from: THREE.Vector3,
  to: THREE.Vector3,
  color: string,
  impact = false,
) {
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([from, to]),
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95,
      toneMapped: false,
      depthWrite: false,
    }),
  );
  // The line retains exact endpoints for inspection; only the thicker mesh is drawn.
  (line.material as THREE.Material).visible = false;
  const delta = to.clone().sub(from),
    length = delta.length();
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.85,
    toneMapped: false,
    depthWrite: false,
  });
  const streak = new THREE.Mesh(streakGeometry, material);
  streak.position.copy(from).addScaledVector(delta, 0.5);
  streak.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    delta.normalize(),
  );
  const width = Math.min(0.055, 0.018 + length * 0.00025);
  streak.scale.set(width, length, width);
  line.add(streak);
  if (impact) {
    const spark = new THREE.Mesh(impactGeometry, material);
    spark.position.copy(to);
    spark.scale.setScalar(Math.min(0.16, 0.055 + length * 0.001));
    line.add(spark);
  }
  return line;
}
export function fadeTrail(line: THREE.Line, remaining: number) {
  (line.material as THREE.LineBasicMaterial).opacity = Math.min(
    0.95,
    remaining / 0.1,
  );
  const material = (line.children[0] as THREE.Mesh | undefined)?.material as
    | THREE.MeshBasicMaterial
    | undefined;
  if (material) material.opacity = Math.min(0.85, remaining / 0.12);
}
export function disposeTrail(line: THREE.Line) {
  line.removeFromParent();
  line.geometry.dispose();
  (line.material as THREE.Material).dispose();
  const material = (line.children[0] as THREE.Mesh | undefined)?.material as
    | THREE.Material
    | undefined;
  material?.dispose();
}
export function stormWall() {
  const material = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, closing: { value: 0 } },
    vertexShader:
      'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `varying vec2 vUv; uniform float time; uniform float closing;
      void main(){
        float band=1.0-smoothstep(0.0,0.06,abs(fract(vUv.y*16.0-time*0.12)-0.5));
        float column=1.0-smoothstep(0.0,0.035,abs(fract(vUv.x*64.0)-0.5));
        float glow=max(band,column*0.6);
        vec3 color=mix(vec3(0.42,0.18,0.82),vec3(0.82,0.66,1.0),glow);
        gl_FragColor=vec4(color,0.20+closing*0.06+glow*0.28);
      }`,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 65, 96, 1, true),
    material,
  );
  const rim = new THREE.Mesh(
    new THREE.RingGeometry(0.996, 1.004, 128),
    new THREE.MeshBasicMaterial({
      color: '#ddafff',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
      toneMapped: false,
      depthWrite: false,
    }),
  );
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = -23.85;
  wall.add(rim);
  return wall;
}
