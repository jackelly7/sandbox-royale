import * as THREE from 'three';
import { footstepDirection } from './sound-cues.ts';
import { parachuteModel } from './parachute.ts';
import { weaponModel } from './weapon-models.ts';
import { batchIsland } from './render-world.ts';
import type { Command, RoomSnapshot, PlayerPose } from './multiplayer.ts';
import {
  BOT_COUNT,
  WEAPONS,
  HEADSHOT_MULTIPLIER,
  stormRadius,
  takeDamage,
  reloadAmmo,
  cycleWeapon,
  SUPPLIES,
  SUPPLY_LIMIT,
  DROP_HEIGHT,
  DROP_SPEED,
  beginRecovery,
  cancelRecovery,
  completeRecovery,
  type RecoveryState,
  type SupplyKind,
} from './rules.ts';

export type GameState = RecoveryState & {
  phase:
    | 'lobby'
    | 'playing'
    | 'paused'
    | 'won'
    | 'lost'
    | 'spectating'
    | 'dying';
  health: number;
  shield: number;
  alive: number;
  kills: number;
  ammo: number;
  reserve: number;
  weapon: number;
  owned: boolean[];
  elapsed: number;
  storm: number;
  outside: boolean;
  reloading: boolean;
  aiming: boolean;
  pickup: string;
  notice: string;
  hit: number;
  hurt: number;
  heading: number;
  x: number;
  z: number;
  rank: number;
  bots: { x: number; z: number }[];
  dropLoot?: { x: number; y: number; kind: number; distance: number }[];
  pingPoints?: { id: string; x: number; z: number; label: string }[];
  footsteps?: { id: string; angle: number; strength: number }[];
  markers?: {
    id: string;
    x: number;
    y: number;
    label: string;
    distance: number;
  }[];
  healRemaining: number;
  dropping: boolean;
  altitude: number;
  threat: number;
  killer: string;
  deathRemaining: number;
  survived: number;
  eliminationPulse: number;
  damageNumber: number;
  damageShield: boolean;
  headshot: boolean;
  shieldBreak: number;
  damageAngle: number | null;
  feed: { id: string; text: string; at: number }[];
  spectator: {
    id: string;
    name: string;
    health: number;
    shield: number;
    kills: number;
  } | null;
};
type Bot = {
  mesh: THREE.Group;
  hp: number;
  shield: number;
  cooldown: number;
  turn: number;
  seed: number;
  name: string;
  tag?: THREE.Sprite;
  armed: boolean;
  dropping: boolean;
  dying: number;
  deathY: number;
};
type Loot = { mesh: THREE.Group; kind: number; used: boolean };
export const landmarks = [
  { x: 18, z: -23, w: 14, d: 12, name: 'SANDCASTLE SQUARE' },
  { x: -22, z: -16, w: 14, d: 12, name: 'BUCKET TOWN' },
  { x: 30, z: 20, w: 12, d: 10, name: 'BLOCK FORT' },
  { x: -35, z: 28, w: 12, d: 10, name: 'TOY GROVE' },
  { x: 2, z: -57, w: 12, d: 9, name: 'NORTH RIM' },
];
const names = [
  'Kestrel',
  'Ghostwave',
  'Mako',
  'Sidewinder',
  'Copper',
  'Rook',
  'Solstice',
  'Drift',
  'Bishop',
  'Cinder',
  'Juno',
  'Echo',
  'Talon',
  'Vex',
  'Nomad',
];
export class BattleGame {
  footsteps = new Map<
    string,
    { x: number; z: number; until: number; nextAt: number }
  >();
  localMarks: {
    id: string;
    point: THREE.Vector3;
    label: string;
    until: number;
  }[] = [];
  isDowned() {
    return !!this.networkRoom?.players.find(
      (p) => p.id === this.network?.playerId,
    )?.downed;
  }
  state: GameState = {
    phase: 'lobby',
    health: 100,
    medkits: 0,
    cells: 0,
    healing: null,
    healUntil: 0,
    healRemaining: 0,
    dropping: false,
    altitude: 0,
    threat: 0,
    killer: 'The sandbox',
    deathRemaining: 0,
    survived: 0,
    eliminationPulse: 0,
    damageNumber: 0,
    damageShield: false,
    headshot: false,
    shieldBreak: 0,
    damageAngle: null,
    feed: [],
    spectator: null,
    shield: 50,
    alive: 16,
    kills: 0,
    ammo: 0,
    reserve: 0,
    weapon: -1,
    owned: [false, false, false],
    elapsed: 0,
    storm: 107,
    outside: false,
    reloading: false,
    aiming: false,
    pickup: '',
    notice: '',
    hit: 0,
    hurt: 0,
    heading: 0,
    x: 0,
    z: 0,
    rank: 16,
    bots: [],
  };
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(62, 1, 0.08, 850);
  renderer: THREE.WebGLRenderer;
  world = new THREE.Group();
  gun = new THREE.Group();
  bots: Bot[] = [];
  loot: Loot[] = [];
  colliders: THREE.Box3[] = [];
  solids: THREE.Object3D[] = [];
  storm!: THREE.Mesh;
  flash!: THREE.Mesh;
  keys = new Set<string>();
  ray = new THREE.Raycaster();
  position = new THREE.Vector3(0, 1.7, 50);
  yaw = 0;
  pitch = 0;
  velocityY = 0;
  weaponAmmo = [0, 0, 0];
  reserveAmmo = [0, 0, 0];
  gunModels: THREE.Group[] = [];
  wheelAt = 0;
  damageTimer = 0;
  spectatorId: string | null = null;
  killerId: string | null = null;
  parachute = parachuteModel();
  correction = new THREE.Vector3();
  renderStats = { before: 0, after: 0 };
  framesRendered = 0;
  measuredAt = 0;
  resolutionScale = 1;
  slowSamples = 0;
  shooting = false;
  aiming = false;
  cooldown = 0;
  reloadTimer = 0;
  sensitivity = 1;
  muted = false;
  touch = false;
  touchMove = { x: 0, y: 0 };
  time = 0;
  previous = 0;
  frame = 0;
  uiTime = 0;
  noticeTimer = 0;
  recoil = 0;
  aiTimer = 0;
  audio: AudioContext | null = null;
  observer: ResizeObserver;
  cleanup: (() => void)[] = [];
  tracers: { mesh: THREE.Line; life: number }[] = [];
  destroyed = false;
  menuOpen = false;
  onState: (state: GameState) => void;
  network: { playerId: string; send: (command: Command) => void } | null = null;
  networkRoom: RoomSnapshot | null = null;
  networkRound = 0;
  networkTime = 0;
  networkEvents = new Set<string>();
  remoteTargets: THREE.Vector3[] = [];
  container: HTMLElement;
  constructor(container: HTMLElement, onState: (state: GameState) => void) {
    this.container = container;
    this.onState = onState;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.shadowMap.enabled = false;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color('#9bc9d2');
    this.scene.fog = new THREE.Fog('#9bc9d2', 115, 340);
    this.scene.add(this.world);
    this.scene.add(this.camera);
    this.scene.add(new THREE.HemisphereLight('#d6f8ff', '#869852', 2.5));
    const sun = new THREE.DirectionalLight('#fff1cf', 3.5);
    sun.position.set(-50, 100, 40);
    sun.castShadow = true;
    Object.assign(sun.shadow.camera, {
      left: -115,
      right: 115,
      top: 115,
      bottom: -115,
      near: 1,
      far: 300,
    });
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.bias = -0.0008;
    this.scene.add(sun);
    this.buildWorld();
    this.renderStats = batchIsland(
      this.world,
      this.loot.map((l) => l.mesh),
    );
    this.world.updateMatrixWorld(true);
    this.scene.add(this.parachute);
    this.parachute.visible = false;
    this.buildGun();
    this.resetBots();
    this.bind();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
    this.frame = requestAnimationFrame(this.tick);
  }
  material(
    color: string | number,
    extra: THREE.MeshStandardMaterialParameters = {},
  ) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
  }
  box(
    w: number,
    h: number,
    d: number,
    color: string | number,
    x: number,
    y: number,
    z: number,
    parent: THREE.Object3D = this.world,
  ) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      this.material(color),
    );
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  solid(mesh: THREE.Object3D) {
    mesh.updateMatrixWorld(true);
    this.colliders.push(new THREE.Box3().setFromObject(mesh));
    this.solids.push(mesh);
  }
  buildWorld() {
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(1600, 1600),
      this.material('#9aa66b', { roughness: 1 }),
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -3.2;
    this.world.add(sea);
    const beach = new THREE.Mesh(
      new THREE.BoxGeometry(232, 3, 232),
      this.material('#dfca8d'),
    );
    beach.position.y = -2;
    beach.receiveShadow = true;
    this.world.add(beach);
    const island = new THREE.Mesh(
      new THREE.BoxGeometry(226, 5, 226),
      this.material('#e8c780'),
    );
    island.position.y = -2.5;
    island.receiveShadow = true;
    this.world.add(island);
    // A full-size wooden toy box frames the playable sandy arena.
    for (const side of [-1, 1]) {
      this.box(238, 5, 5, '#9d6b40', 0, 1, side * 116);
      this.box(5, 5, 228, '#ad7949', side * 116, 1, 0);
      this.box(239, 0.7, 6, '#ce9b64', 0, 3.7, side * 116);
      this.box(6, 0.7, 228, '#ce9b64', side * 116, 3.7, 0);
      for (let n = -2; n <= 2; n++) {
        const screw = new THREE.Mesh(
          new THREE.CylinderGeometry(0.35, 0.35, 0.08, 8),
          this.material('#494844'),
        );
        screw.position.set(n * 40, 4.1, side * 116);
        this.world.add(screw);
      }
    }
    // Oversized buckets sit beyond the rim, making the arena feel miniature.
    for (const [x, z, color] of [
      [126, -62, '#ee7655'],
      [-125, 55, '#69a9d0'],
    ] as const) {
      const bucket = new THREE.Mesh(
        new THREE.CylinderGeometry(8, 6, 12, 16, 1, true),
        this.material(color, { side: THREE.DoubleSide }),
      );
      bucket.position.set(x, 3, z);
      this.world.add(bucket);
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(8, 0.55, 6, 24),
        this.material(color),
      );
      rim.rotation.x = Math.PI / 2;
      rim.position.set(x, 9, z);
      this.world.add(rim);
      const handle = new THREE.Mesh(
        new THREE.TorusGeometry(8.2, 0.45, 6, 24, Math.PI),
        this.material('#f1d863'),
      );
      handle.position.set(x, 7, z);
      this.world.add(handle);
    }
    // Sand paths join the settlements and remain open for movement.
    this.box(9, 0.05, 184, '#d4ae64', 0, 0.035, 0);
    this.box(162, 0.055, 8, '#d4ae64', 0, 0.04, 4);
    this.box(6, 0.06, 86, '#d4ae64', 40, 0.05, -12);
    const building = (
      x: number,
      z: number,
      w: number,
      d: number,
      h: number,
      color: string,
    ) => {
      const base = this.box(w, h, d, color, x, h / 2, z);
      this.solid(base);
      this.box(w + 0.8, 0.45, d + 0.8, '#f2e0b6', x, h, z);
      this.box(w + 0.4, 0.28, d + 0.4, color, x, h + 0.35, z);
      for (const edge of [-1, 1])
        for (let n = -1; n <= 1; n++)
          this.box(
            1.7,
            1.1,
            1.7,
            '#f1d495',
            x + n * w * 0.36,
            h + 0.8,
            z + edge * d * 0.4,
          );
      for (let n = -1; n <= 1; n++) {
        this.box(
          1.5,
          1.7,
          0.08,
          '#294b58',
          x + n * w * 0.26,
          h * 0.59,
          z + d / 2 + 0.05,
        );
        this.box(
          1.7,
          0.16,
          0.3,
          '#e7d7b6',
          x + n * w * 0.26,
          h * 0.59 - 0.88,
          z + d / 2 + 0.1,
        );
      }
      this.box(1.75, 2.8, 0.12, '#365a60', x, h / 2 - 1.4, z + d / 2 + 0.12);
      const awning = this.box(
        w * 0.8,
        0.2,
        2.5,
        '#d98e60',
        x,
        3.3,
        z + d / 2 + 1.1,
      );
      awning.rotation.x = 0.1;
      for (const s of [-1, 1])
        this.box(
          0.14,
          3.3,
          0.14,
          '#e5d9bb',
          x + s * w * 0.36,
          1.65,
          z + d / 2 + 2.1,
        );
      this.box(2.2, 1, 2, '#e2dfc0', x + w * 0.2, h + 0.8, z - 1);
    };
    building(18, -23, 14, 12, 7.5, '#e5bd75');
    building(-22, -16, 14, 12, 6, '#e2c884');
    building(30, 20, 12, 10, 5.7, '#65b5c5');
    building(-35, 28, 12, 10, 6.6, '#e7bc70');
    building(2, -57, 12, 9, 5, '#e0b365');
    building(-47, -28, 9, 11, 4.5, '#ed865b');
    building(48, -40, 11, 12, 7.2, '#e1b47c');
    building(-18, 49, 10, 8, 4.5, '#dfb365');
    building(49, 45, 9, 10, 4.5, '#dc7861');
    building(-56, 7, 11, 9, 5.4, '#669f9b');
    // A stepped clock tower gives the island its silhouette.
    const tower = this.box(7, 17, 7, '#ebc993', 18, 8.5, -23);
    this.solid(tower);
    this.box(8.2, 0.7, 8.2, '#f5e7c0', 18, 16.8, -23);
    this.box(6, 4, 6, '#d5a271', 18, 19, -23);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(5.3, 3, 4),
      this.material('#dfb064'),
    );
    roof.position.set(18, 22.2, -23);
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    this.world.add(roof);
    const clock = new THREE.Mesh(
      new THREE.CircleGeometry(1.3, 24),
      this.material('#f9edcd'),
    );
    clock.position.set(18, 18.9, -19.98);
    this.world.add(clock);
    this.box(0.12, 0.9, 0.08, '#3b5b60', 18, 19.2, -19.9);
    this.box(0.75, 0.12, 0.08, '#3b5b60', 18.3, 18.9, -19.9);
    this.box(0.15, 5, 0.15, '#d7d6b7', 18, 25, -23);
    const flag = this.box(2.5, 1.25, 0.07, '#ed744e', 19.2, 26.7, -23);
    flag.rotation.y = 0.15;
    // Utility poles and bunting through the central street.
    for (let i = 0; i < 4; i++) {
      const z = -36 + i * 21;
      this.box(0.3, 9, 0.3, '#626d56', -6, 4.5, z);
      this.box(2.3, 0.2, 0.2, '#626d56', -6, 8.4, z);
      if (i < 3) {
        const wire = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-6, 8.5, z),
            new THREE.Vector3(-6, 7.5, z + 10.5),
            new THREE.Vector3(-6, 8.5, z + 21),
          ]),
          new THREE.LineBasicMaterial({ color: '#4f6a60' }),
        );
        this.world.add(wire);
      }
    }
    const rand = this.random(82);
    for (let i = 0; i < 125; i++) {
      const x = (rand() - 0.5) * 204,
        z = (rand() - 0.5) * 204;
      if (
        Math.hypot(x, z) > 101 ||
        Math.abs(x) < 9 ||
        Math.abs(z - 4) < 8 ||
        this.colliders.some((b) =>
          b
            .clone()
            .expandByScalar(5)
            .containsPoint(new THREE.Vector3(x, 2, z)),
        )
      )
        continue;
      if (i % 4 === 0) this.palm(x, z, 4 + rand() * 3);
      else this.tree(x, z, 4 + rand() * 4, rand);
    }
    for (let i = 0; i < 40; i++) {
      const a = rand() * Math.PI * 2,
        r = 83 + rand() * 22;
      const x = Math.cos(a) * r,
        z = Math.sin(a) * r;
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(2 + rand() * 3, 0),
        this.material(i % 2 ? '#c7a775' : '#e0c493'),
      );
      rock.position.set(x, 0.4, z);
      rock.scale.y = 0.65;
      rock.rotation.set(rand(), rand(), rand());
      rock.castShadow = true;
      rock.receiveShadow = true;
      this.world.add(rock);
      this.solid(rock);
    }
    for (const [x, z] of [
      [9, 15],
      [-9, -3],
      [34, -9],
      [-18, 30],
      [9, -42],
      [55, 15],
      [-48, 43],
      [-32, -44],
    ]) {
      const c = this.box(2.4, 2.4, 2.4, '#99764e', x, 1.2, z);
      this.solid(c);
      this.box(2.5, 0.2, 2.5, '#d0a671', x, 0.3, z);
      this.box(2.5, 0.2, 2.5, '#d0a671', x, 2.1, z);
    }
    // Outlying islets and clouds create depth without extra game space.
    for (let i = 0; i < 12; i++) {
      const a = i * 0.58,
        r = 230 + rand() * 70;
      const m = new THREE.Mesh(
        new THREE.ConeGeometry(22 + rand() * 32, 30 + rand() * 35, 5),
        this.material('#739f96'),
      );
      m.position.set(Math.cos(a) * r, -2, Math.sin(a) * r);
      this.world.add(m);
    }
    for (let i = 0; i < 18; i++) {
      const g = new THREE.Group();
      for (let j = 0; j < 4; j++) {
        const c = new THREE.Mesh(
          new THREE.IcosahedronGeometry(7 + rand() * 4, 1),
          this.material('#f4eee0', { flatShading: true }),
        );
        c.scale.set(1.7, 0.45, 1);
        c.position.set(j * 8, rand() * 3, rand() * 4);
        g.add(c);
      }
      g.position.set(
        (rand() - 0.5) * 600,
        70 + rand() * 30,
        (rand() - 0.5) * 600,
      );
      this.world.add(g);
    }
    this.storm = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 65, 96, 1, true),
      new THREE.MeshBasicMaterial({
        color: '#b291f4',
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.storm.position.y = 24;
    this.storm.scale.set(107, 1, 107);
    this.storm.visible = false;
    this.scene.add(this.storm);
    this.spawnLoot();
  }
  random(seed: number) {
    return () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }
  tree(x: number, z: number, h: number, rand: () => number) {
    const trunk = this.box(0.55, h * 0.55, 0.55, '#776e49', x, h * 0.27, z);
    for (let j = 0; j < 2; j++) {
      const leaf = new THREE.Mesh(
        new THREE.ConeGeometry(h * 0.43 - j * 0.5, h * 0.68, 6),
        this.material(j ? '#80cdb4' : '#53b394'),
      );
      leaf.position.set(x, h * 0.65 + j * h * 0.27, z);
      leaf.rotation.y = rand();
      leaf.castShadow = true;
      this.world.add(leaf);
    }
    this.solid(trunk);
  }
  palm(x: number, z: number, h: number) {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.4, h, 6),
      this.material('#b19864'),
    );
    trunk.position.set(x, h / 2, z);
    trunk.rotation.z = 0.12;
    trunk.castShadow = true;
    this.world.add(trunk);
    for (let j = 0; j < 6; j++) {
      const leaf = new THREE.Mesh(
        new THREE.ConeGeometry(0.75, h * 0.75, 3),
        this.material(j % 2 ? '#5caa73' : '#3d966d'),
      );
      leaf.position.set(
        x + Math.cos((j * Math.PI) / 3) * 1.7,
        h - 0.3,
        z + Math.sin((j * Math.PI) / 3) * 1.7,
      );
      leaf.rotation.set(
        Math.cos((j * Math.PI) / 3) * 0.9,
        (j * Math.PI) / 3,
        Math.sin((j * Math.PI) / 3) * 0.9,
      );
      leaf.castShadow = true;
      this.world.add(leaf);
    }
  }
  spawnLoot() {
    for (const l of this.loot) {
      this.world.remove(l.mesh);
      this.disposeObject(l.mesh);
    }
    this.loot = [];
    const points = [
      [3, 39],
      [-5, 19],
      [10, -6],
      [-12, -31],
      [34, 8],
      [-29, 15],
      [26, -41],
      [-5, -50],
      [45, 30],
      [-46, -12],
      [-10, 61],
      [59, -17],
      [-28, -57],
      [5, 4],
      [65, 48],
      [-57, 46],
      [5, 72],
      [70, -48],
      [-60, -57],
    ];
    // Each of the eight spawn sectors has three nearby weapon choices.
    for (let sector = 0; sector < 8; sector++) {
      const angle = (sector / 8) * Math.PI * 2;
      for (let kind = 0; kind < 3; kind++) {
        points.push([
          Math.sin(angle) * 62 + Math.cos(angle) * (5 + kind * 3),
          Math.cos(angle) * 62 - Math.sin(angle) * (5 + kind * 3),
        ]);
      }
    }
    // Recovery items beside every landing sector, with additional supplies inland.
    for (let sector = 0; sector < 8; sector++) {
      const angle = (sector / 8) * Math.PI * 2;
      for (let item = 0; item < 2; item++)
        points.push([
          Math.sin(angle) * 58 + Math.cos(angle) * (14 + item * 3),
          Math.cos(angle) * 58 - Math.sin(angle) * (14 + item * 3),
        ]);
    }
    points.push([4, 12], [-5, -12], [15, 4], [-15, 4]);
    points.forEach(([x, z], i) => {
      const kind = i < 19 ? i % 5 : i < 43 ? (i - 19) % 3 : 3 + ((i - 43) % 2);
      const colors = ['#85e2bc', '#ffc06a', '#cf9cf4', '#78dfee', '#ff7474'];
      const group = new THREE.Group();
      if (kind < 3) {
        const model = weaponModel(kind);
        model.scale.setScalar(1.7);
        model.rotation.z = -0.15;
        model.position.y = 0.95;
        group.add(model);
      } else {
        const item = new THREE.Group();
        if (kind === 3) {
          const bottle = new THREE.Mesh(
            new THREE.CylinderGeometry(0.28, 0.28, 0.8, 8),
            this.material(colors[kind]),
          );
          item.add(bottle);
          this.box(0.4, 0.16, 0.4, '#d9f6ff', 0, 0.45, 0, item);
        } else this.box(0.7, 0.8, 0.5, colors[kind], 0, 0, 0, item);
        this.box(kind === 4 ? 0.5 : 0.73, 0.13, 0.53, '#fff8de', 0, 0, 0, item);
        if (kind === 4) this.box(0.13, 0.5, 0.53, '#fff8de', 0, 0, 0, item);
        batchIsland(item, [], Infinity);
        item.position.y = 0.85;
        group.add(item);
      }
      const ring = new THREE.Mesh(
        new THREE.CylinderGeometry(0.9, 0.9, 0.05, 20),
        new THREE.MeshBasicMaterial({
          color: colors[kind],
          transparent: true,
          opacity: 0.35,
        }),
      );
      ring.position.y = 0.07;
      group.add(ring);
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.5, 5, 6, 1, true),
        new THREE.MeshBasicMaterial({
          color: colors[kind],
          transparent: true,
          opacity: 0.15,
          depthWrite: false,
        }),
      );
      beam.position.y = 2.5;
      group.add(beam);
      group.position.copy(this.safePosition(x, z));
      this.world.add(group);
      this.loot.push({ mesh: group, kind, used: false });
    });
  }
  buildGun() {
    this.camera.add(this.gun);
    this.gunModels = WEAPONS.map((_, i) => {
      const model = weaponModel(i);
      model.visible = false;
      this.gun.add(model);
      return model;
    });
    this.flash = new THREE.Mesh(
      new THREE.ConeGeometry(0.08, 0.28, 5),
      new THREE.MeshBasicMaterial({ color: '#ffe69c' }),
    );
    this.flash.rotation.x = -Math.PI / 2;
    this.flash.visible = false;
    this.gun.add(this.flash);
    this.gun.visible = false;
  }
  showWeapon() {
    const index = this.state.weapon;
    this.gun.visible =
      this.state.phase === 'playing' &&
      this.state.health > 0 &&
      index >= 0 &&
      this.state.owned[index] &&
      !(this.aiming && index === 2) &&
      !this.isDowned();
    this.gunModels?.forEach((model, i) => {
      model.visible = i === index;
    });
    this.flash.position.set(
      0,
      0.025,
      index === 2 ? -1.12 : index === 1 ? -0.85 : -0.74,
    );
  }
  nameTag(name: string) {
    if (typeof document === 'undefined') return undefined;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 152;
    if (!canvas.getContext('2d')) return undefined;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(canvas),
        depthTest: true,
        depthWrite: false,
        sizeAttenuation: false,
      }),
    );
    sprite.raycast = () => {};
    sprite.name = 'Gamertag: ' + name;
    sprite.position.set(0, 2.95, 0);
    sprite.scale.set(0.23, 0.068, 1);
    this.paintTag(sprite, name, 100, 50);
    return sprite;
  }
  paintTag(sprite: THREE.Sprite, name: string, health: number, shield: number) {
    const key = `${name}:${Math.ceil(health)}:${Math.ceil(shield)}`;
    if (sprite.userData.vitals === key) return;
    const texture = sprite.material.map as THREE.CanvasTexture;
    const canvas = texture.image as HTMLCanvasElement,
      context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, 512, 152);
    context.fillStyle = '#102b34ee';
    context.fillRect(0, 0, 512, 152);
    context.fillStyle = '#fff8de';
    context.font = 'bold 38px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(name, 256, 33, 480);
    context.fillStyle = '#ffffff25';
    context.fillRect(20, 66, 380, 19);
    context.fillRect(20, 105, 380, 23);
    context.fillStyle = '#78dfee';
    context.fillRect(20, 66, (380 * Math.max(0, shield)) / 100, 19);
    context.fillStyle = health <= 30 ? '#ff7971' : '#9bef9e';
    context.fillRect(20, 105, (380 * Math.max(0, health)) / 100, 23);
    context.font = 'bold 27px sans-serif';
    context.textAlign = 'right';
    context.fillStyle = '#78dfee';
    context.fillText(String(Math.ceil(shield)), 490, 77);
    context.fillStyle = '#fff8de';
    context.fillText(String(Math.ceil(health)), 490, 117);
    sprite.userData.vitals = key;
    texture.needsUpdate = true;
  }
  resetBots(count = BOT_COUNT) {
    for (const b of this.bots) {
      this.world.remove(b.mesh);
      this.disposeObject(b.mesh);
    }
    this.bots = [];
    for (let i = 0; i < count; i++) {
      const g = new THREE.Group(),
        color = ['#d77a5c', '#638bad', '#bcaa74', '#925f83'][i % 4];
      this.box(0.72, 0.88, 0.4, color, 0, 1.25, 0, g);
      this.box(0.5, 0.5, 0.5, '#d8ad83', 0, 1.96, 0, g);
      this.box(0.54, 0.16, 0.53, '#344a4d', 0, 2.2, 0, g);
      this.box(0.44, 0.15, 0.03, '#253e43', 0, 1.98, 0.26, g);
      for (const s of [-1, 1]) {
        this.box(0.24, 0.77, 0.26, '#3c5556', s * 0.22, 0.4, 0, g);
        this.box(0.24, 0.65, 0.26, color, s * 0.49, 1.29, 0.1, g);
      }
      const held = weaponModel(i % 3);
      held.name = 'Bot weapon';
      held.userData.weapon = i % 3;
      held.scale.setScalar(0.8);
      held.rotation.y = Math.PI;
      held.position.set(0.35, 1.35, 0.25);
      held.visible = false;
      g.add(held);
      const chute = parachuteModel();
      chute.visible = false;
      g.add(chute);
      const tag = this.nameTag(names[i] ?? 'Player');
      if (tag) g.add(tag);
      const a = (i / count) * Math.PI * 2,
        r = 48 + (i % 4) * 11;
      g.position.copy(this.safePosition(Math.sin(a) * r, Math.cos(a) * r));
      this.world.add(g);
      g.userData.bot = i;
      g.traverse((c) => {
        c.userData.bot = i;
      });
      this.bots.push({
        mesh: g,
        hp: 100,
        shield: 50,
        cooldown: 2 + i * 0.2,
        turn: 0,
        seed: i * 0.7,
        name: names[i],
        tag,
        armed: false,
        dropping: false,
        dying: 0,
        deathY: 0,
      });
    }
  }
  bind() {
    const on = (target: EventTarget, type: string, fn: EventListener) => {
      target.addEventListener(type, fn);
      this.cleanup.push(() => target.removeEventListener(type, fn));
    };
    on(document, 'keydown', ((e: KeyboardEvent) => {
      if (this.state.phase === 'spectating' && !this.menuOpen) {
        if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
          e.preventDefault();
          this.spectate(e.code === 'BracketLeft' ? -1 : 1);
        }
        return;
      }
      if (this.state.phase !== 'playing' || this.menuOpen) return;
      if (
        [
          'Space',
          'Tab',
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
        ].includes(e.code)
      )
        e.preventDefault();
      this.keys.add(e.code);
      if (e.code === 'KeyR') this.reload();
      if (!e.repeat && e.code === 'KeyE') this.interact();
      if (!e.repeat && e.code === 'KeyG') this.mark();
      if (!e.repeat && e.code === 'KeyQ') this.heal('medkit');
      if (!e.repeat && e.code === 'KeyF') this.heal('shield');
      if (!e.repeat && e.code === 'KeyX') {
        this.cancelHeal();
        this.network?.send({ type: 'cancelRevive' });
      }
      if (['Digit1', 'Digit2', 'Digit3'].includes(e.code))
        this.selectWeapon(Number(e.code.slice(-1)) - 1);
      if (
        e.code === 'Space' &&
        !this.isDowned() &&
        !this.state.dropping &&
        this.position.y <= 1.71
      )
        this.velocityY = 7;
      if (e.code === 'Escape') this.pause();
    }) as EventListener);
    on(this.renderer.domElement, 'wheel', ((e: WheelEvent) => {
      if (this.state.phase !== 'playing' || this.menuOpen) return;
      e.preventDefault();
      if (Math.abs(e.deltaY) < 1 || performance.now() - this.wheelAt < 140)
        return;
      this.wheelAt = performance.now();
      this.selectWeapon(
        cycleWeapon(this.state.weapon, this.state.owned, e.deltaY),
      );
    }) as EventListener);
    on(document, 'keyup', ((e: KeyboardEvent) => {
      this.keys.delete(e.code);
    }) as EventListener);
    on(document, 'mousemove', ((e: MouseEvent) => {
      if (
        document.pointerLockElement === this.renderer.domElement &&
        this.state.phase === 'playing'
      )
        this.look(e.movementX, e.movementY);
    }) as EventListener);
    on(this.renderer.domElement, 'mousedown', ((e: MouseEvent) => {
      if (this.state.phase === 'playing') {
        if (e.button === 0) this.shooting = true;
        if (e.button === 2) this.setAiming(true);
        if (e.button === 1) {
          e.preventDefault();
          this.mark();
        }
      }
    }) as EventListener);
    on(document, 'mouseup', (() => {
      this.shooting = false;
      if (!this.touch) this.setAiming(false);
    }) as EventListener);
    on(this.renderer.domElement, 'contextmenu', (e: Event) =>
      e.preventDefault(),
    );
    on(document, 'pointerlockchange', (() => {
      if (
        !document.pointerLockElement &&
        this.state.phase === 'playing' &&
        !this.touch
      )
        this.pause();
    }) as EventListener);
    on(window, 'blur', (() => {
      if (this.state.phase === 'playing') this.pause();
    }) as EventListener);
  }
  hearStep(id: string, x: number, z: number) {
    if (this.state.phase !== 'playing' || this.state.dropping) return;
    const cue = footstepDirection(
      { x: this.position.x, z: this.position.z, yaw: this.yaw },
      { x, z },
    );
    if (!cue) return;
    const previous = this.footsteps.get(id);
    this.footsteps.set(id, {
      x,
      z,
      until: this.time + 0.55,
      nextAt: previous?.nextAt ?? 0,
    });
    if ((previous?.nextAt ?? 0) > this.time) return;
    this.footsteps.get(id)!.nextAt = this.time + 0.38;
    if (this.muted || !this.audio) return;
    const osc = this.audio.createOscillator(),
      gain = this.audio.createGain(),
      pan = this.audio.createStereoPanner();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(105, this.audio.currentTime);
    osc.frequency.exponentialRampToValueAtTime(
      35,
      this.audio.currentTime + 0.09,
    );
    gain.gain.setValueAtTime(0.035 * cue.strength, this.audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      this.audio.currentTime + 0.09,
    );
    pan.pan.value = Math.sin((cue.angle * Math.PI) / 180);
    osc.connect(gain);
    gain.connect(pan);
    pan.connect(this.audio.destination);
    osc.start();
    osc.stop(this.audio.currentTime + 0.1);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
      pan.disconnect();
    };
  }
  interact() {
    const me = this.networkRoom?.players.find(
      (p) => p.id === this.network?.playerId,
    );
    const target =
      this.networkRoom?.mode === 'duos' && me && !me.downed
        ? this.networkRoom.players.find(
            (p) =>
              p.id !== me.id &&
              p.team === me.team &&
              p.downed &&
              p.health > 0 &&
              Math.hypot(p.x - me.x, p.z - me.z) <= 3,
          )
        : null;
    if (target) {
      this.network?.send({ type: 'revive', target: target.id });
      return;
    }
    if (!this.isDowned()) this.pickup();
  }
  mark() {
    if (this.state.phase !== 'playing') return;
    this.camera.updateMatrixWorld();
    this.ray.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const hits = this.ray.intersectObjects(
      [...this.solids, ...this.bots.filter((b) => b.hp > 0).map((b) => b.mesh)],
      true,
    );
    const hit = hits[0];
    let point: THREE.Vector3 | undefined = hit ? hit.point.clone() : undefined;
    if (!point)
      point =
        this.ray.ray.intersectPlane(
          new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
          new THREE.Vector3(),
        ) ?? undefined;
    if (
      !point ||
      point.distanceTo(this.position) > 180 ||
      Math.hypot(point.x, point.z) > 110
    ) {
      this.notice('Aim at a nearby location to ping.');
      return;
    }
    const loot = this.loot.find(
      (l) => !l.used && l.mesh.position.distanceTo(point!) < 4,
    );
    const label =
      hit?.object.userData.bot !== undefined
        ? 'Enemy'
        : loot
          ? 'Loot'
          : 'Go here';
    point.y += 1;
    if (this.network)
      this.network.send({
        type: 'mark',
        point: [point.x, point.y, point.z],
        label,
      });
    else
      this.localMarks = [{ id: 'local', point, label, until: this.time + 8 }];
    this.sound(650, 0.08, 0.035, 'sine');
    this.notice(`${label} marked`);
  }
  setAiming(aiming: boolean) {
    this.aiming =
      aiming &&
      this.state.phase === 'playing' &&
      this.state.weapon >= 0 &&
      !this.state.healing &&
      !this.state.dropping &&
      !this.isDowned();
    this.showWeapon();
    this.emit();
  }
  look(x: number, y: number) {
    this.yaw -= x * 0.002 * this.sensitivity;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch - y * 0.002 * this.sensitivity,
      -1.35,
      1.35,
    );
  }
  resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    // Keep Retina and large displays from multiplying the full-screen GPU work.
    this.renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio,
        1.5,
        Math.sqrt((1920 * 1080) / Math.max(1, w * h)),
      ) * this.resolutionScale,
    );
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  setMenuOpen(open: boolean) {
    this.menuOpen = open;
    if (open && this.state.phase === 'playing') this.pause();
  }
  async start(touch = false) {
    if (this.state.phase !== 'paused' && !this.network) {
      this.state = {
        ...this.state,
        health: 100,
        shield: 50,
        medkits: 0,
        cells: 0,
        healing: null,
        healUntil: 0,
        healRemaining: 0,
        dropping: true,
        altitude: DROP_HEIGHT,
        threat: 0,
        killer: 'The sandbox',
        deathRemaining: 0,
        survived: 0,
        eliminationPulse: 0,
        damageNumber: 0,
        damageShield: false,
        headshot: false,
        shieldBreak: 0,
        damageAngle: null,
        feed: [],
        spectator: null,
        alive: 16,
        kills: 0,
        ammo: 0,
        reserve: 0,
        weapon: -1,
        owned: [false, false, false],
        elapsed: 0,
        storm: 107,
        rank: 16,
        notice: 'Find a weapon drop. Press E to collect it.',
        hit: 0,
        hurt: 0,
        pickup: '',
        outside: false,
        reloading: false,
        aiming: false,
      };
      this.position.set(0, DROP_HEIGHT, 50);
      this.yaw = 0;
      this.pitch = -0.6;
      this.velocityY = 0;
      this.weaponAmmo = [0, 0, 0];
      this.reserveAmmo = [0, 0, 0];
      this.reloadTimer = 0;
      this.cooldown = 0.3;
      this.resetBots();
      for (const b of this.bots) {
        b.mesh.position.y = DROP_HEIGHT - 1.7;
        b.dropping = true;
      }
      this.spawnLoot();
      this.noticeTimer = 5;
      this.aiTimer = 0;
    }
    if (
      this.network &&
      (this.networkRoom?.players.find((p) => p.id === this.network?.playerId)
        ?.health ?? 0) <= 0
    )
      return;
    this.touch = touch;
    this.state.phase = 'playing';
    this.showWeapon();
    this.storm.visible = true;
    if (!this.audio) {
      try {
        this.audio = new AudioContext();
      } catch {
        /* Sound is optional. */
      }
    }
    void this.audio?.resume();
    if (!touch) {
      try {
        await this.renderer.domElement.requestPointerLock();
      } catch {
        this.state.phase = 'paused';
        this.state.notice =
          'Click Resume to capture the mouse, or use touch controls.';
      }
    }
    this.emit();
  }
  pause() {
    if (this.state.phase !== 'playing') return;
    this.state.phase = 'paused';
    this.keys.clear();
    this.shooting = false;
    this.aiming = false;
    this.touchMove = { x: 0, y: 0 };
    if (document.pointerLockElement) document.exitPointerLock();
    this.emit();
  }
  lobby() {
    this.state.phase = 'lobby';
    this.state.spectator = null;
    this.spectatorId = null;
    this.keys.clear();
    this.shooting = false;
    this.aiming = false;
    this.gun.visible = false;
    this.storm.visible = false;
    if (document.pointerLockElement) document.exitPointerLock();
    this.emit();
  }
  selectWeapon(index: number) {
    if (index < 0 || index > 2 || !this.state.owned[index]) return;
    if (this.state.phase !== 'playing') return;
    this.cancelHeal(false);
    this.state.weapon = index;
    this.showWeapon();
    this.network?.send({ type: 'pose', pose: this.pose() });
    this.reloadTimer = 0;
    this.state.reloading = false;
    this.cooldown = 0.25;
    this.emit();
  }
  reload() {
    if (this.state.weapon < 0 || !this.state.owned[this.state.weapon]) return;
    const i = this.state.weapon,
      w = WEAPONS[i];
    if (
      this.reloadTimer > 0 ||
      this.weaponAmmo[i] >= w.capacity ||
      this.reserveAmmo[i] <= 0
    )
      return;
    this.cancelHeal(false);
    this.network?.send({ type: 'reload' });
    this.reloadTimer = w.reload;
    this.state.reloading = true;
    this.sound(160, 0.12, 0.04, 'triangle');
    this.emit();
  }
  pickup() {
    if (this.state.phase !== 'playing' || this.state.dropping) return;
    const l = this.nearestLoot();
    if (!l) return;
    if (this.network) {
      this.network.send({ type: 'pickup', index: this.loot.indexOf(l) });
      return;
    }
    if (l.kind < 3) {
      const first = !this.state.owned[l.kind];
      this.state.owned[l.kind] = true;
      if (first) this.weaponAmmo[l.kind] = WEAPONS[l.kind].capacity;
      this.reserveAmmo[l.kind] += WEAPONS[l.kind].capacity * 2;
      if (first) this.selectWeapon(l.kind);
      this.notice(
        `${WEAPONS[l.kind].name} ${first ? 'collected' : 'ammo collected'}`,
      );
    }
    if (l.kind >= 3) {
      const item = l.kind === 3 ? 'shield' : 'medkit',
        supply = SUPPLIES[item];
      if (this.state[supply.slot] >= SUPPLY_LIMIT) {
        this.notice(`${supply.name} inventory full`);
        return;
      }
      this.state[supply.slot]++;
      this.notice(
        `${supply.name} stored. Press ${item === 'medkit' ? 'Q' : 'F'} to use.`,
      );
    }
    l.used = true;
    l.mesh.visible = false;
    this.sound(620, 0.16, 0.07, 'sine');
    this.emit();
  }
  nearestLoot() {
    let nearest: Loot | undefined,
      distance = 3.8 * 3.8;
    for (const loot of this.loot) {
      if (
        loot.used ||
        (loot.kind >= 3 &&
          this.state[loot.kind === 3 ? 'cells' : 'medkits'] >= SUPPLY_LIMIT)
      )
        continue;
      const d =
        (loot.mesh.position.x - this.position.x) ** 2 +
        (loot.mesh.position.z - this.position.z) ** 2;
      if (d < distance) {
        distance = d;
        nearest = loot;
      }
    }
    return nearest;
  }
  heal(item: SupplyKind) {
    if (
      this.state.phase !== 'playing' ||
      this.state.dropping ||
      (this.network && this.networkRoom?.phase !== 'playing')
    )
      return;
    if (!beginRecovery(this.state, item, this.state.elapsed * 1000)) {
      this.notice(
        this.state.healing
          ? 'Already healing. X to cancel.'
          : this.state[SUPPLIES[item].stat] >= 100
            ? `${item === 'medkit' ? 'Health' : 'Shield'} is full`
            : `Find a ${SUPPLIES[item].name.toLowerCase()} first`,
      );
      return;
    }
    this.network?.send({ type: 'heal', item });
    this.reloadTimer = 0;
    this.state.reloading = false;
    this.shooting = false;
    this.aiming = false;
    this.showWeapon();
    this.state.healRemaining = SUPPLIES[item].seconds;
    this.sound(430, 0.1, 0.035, 'sine');
    this.emit();
  }
  cancelHeal(message = true) {
    if (!this.state.healing) return;
    cancelRecovery(this.state);
    this.state.healRemaining = 0;
    this.network?.send({ type: 'cancelHeal' });
    if (message) this.notice('Healing canceled. Item saved.');
  }
  hitFeedback(
    amount: number,
    shieldDamage: number,
    headshot: boolean,
    shieldBreak: boolean,
  ) {
    this.state.damageNumber = Math.round(
      (this.damageTimer > 0 ? this.state.damageNumber : 0) + amount,
    );
    this.state.damageShield = shieldDamage > 0;
    this.state.headshot = headshot;
    this.damageTimer = 0.8;
    this.state.hit = 0.2;
    if (shieldBreak) {
      this.state.shieldBreak = 1.2;
      this.sound(1200, 0.16, 0.045, 'triangle');
    }
  }
  addFeed(text: string, id = `${this.time}-${Math.random()}`) {
    this.state.feed = [
      ...(this.state.feed ?? []),
      { id, text, at: this.time },
    ].slice(-4);
  }
  spectate(direction = 1) {
    if (
      !this.network ||
      this.state.health > 0 ||
      !this.networkRoom ||
      !['countdown', 'playing', 'finished'].includes(this.networkRoom.phase)
    )
      return;
    const alive = this.networkRoom.players.filter((p) => p.health > 0);
    if (!alive.length) return;
    const current = alive.findIndex((p) => p.id === this.spectatorId);
    const next =
      alive[
        (current < 0 ? 0 : current + direction + alive.length) % alive.length
      ];
    this.spectatorId = next.id;
    this.state.spectator = {
      id: next.id,
      name: next.name,
      health: next.health,
      shield: next.shield,
      kills: next.kills,
    };
    this.state.phase = 'spectating';
    this.gun.visible = false;
    this.emit();
  }
  stopSpectating() {
    if (this.state.phase !== 'spectating') return;
    this.state.phase = 'lost';
    this.state.spectator = null;
    this.spectatorId = null;
    this.emit();
  }
  notice(text: string) {
    this.state.notice = text;
    this.noticeTimer = 3;
  }
  sound(
    freq: number,
    duration: number,
    volume: number,
    type: OscillatorType = 'sawtooth',
  ) {
    if (this.muted || !this.audio) return;
    const osc = this.audio.createOscillator(),
      gain = this.audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.audio.currentTime);
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(20, freq * 0.2),
      this.audio.currentTime + duration,
    );
    gain.gain.setValueAtTime(volume, this.audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      this.audio.currentTime + duration,
    );
    osc.connect(gain);
    gain.connect(this.audio.destination);
    osc.start();
    osc.stop(this.audio.currentTime + duration);
  }
  shoot() {
    if (
      this.state.dropping ||
      this.state.phase !== 'playing' ||
      this.isDowned()
    )
      return;
    if (this.state.weapon < 0 || !this.state.owned[this.state.weapon]) return;
    this.cancelHeal(false);
    const i = this.state.weapon,
      w = WEAPONS[i];
    if (this.network && this.networkRoom?.phase !== 'playing') return;
    if (this.cooldown > 0 || this.reloadTimer > 0) return;
    if (this.weaponAmmo[i] === 0) {
      this.reload();
      return;
    }
    this.weaponAmmo[i]--;
    this.cooldown = w.interval;
    this.recoil = 0.095;
    this.flash.visible = true;
    this.sound(i === 1 ? 90 : 170, 0.1, 0.055);
    this.scene.updateMatrixWorld(true);
    if (this.network)
      this.network.send({
        type: 'shoot',
        pose: this.pose(),
        aiming: this.aiming,
      });
    let hit = false;
    for (let p = 0; p < w.pellets; p++) {
      const spread = w.spread * (this.aiming ? 0.3 : 1);
      this.ray.setFromCamera(
        new THREE.Vector2(
          (Math.random() - 0.5) * spread,
          (Math.random() - 0.5) * spread,
        ),
        this.camera,
      );
      const enemies = this.bots.filter((b) => b.hp > 0).map((b) => b.mesh);
      const hits = this.ray.intersectObjects(
        [...this.solids, ...enemies],
        true,
      );
      const first = hits[0];
      if (!this.network && first && first.object.userData.bot !== undefined) {
        const b = this.bots[first.object.userData.bot];
        if (b.hp > 0) {
          const headshot = first.point.y - b.mesh.position.y > 1.72;
          const before = b.hp + b.shield,
            oldShield = b.shield;
          const result = takeDamage(
            b.hp,
            b.shield,
            w.damage * (headshot ? HEADSHOT_MULTIPLIER : 1),
          );
          b.hp = result.health;
          b.shield = result.shield;
          this.hitFeedback(
            before - b.hp - b.shield,
            oldShield - b.shield,
            headshot,
            oldShield > 0 && b.shield === 0,
          );
          hit = true;
          if (b.hp <= 0) this.killBot(b, true);
        }
      }
      const end = first
        ? first.point
        : this.ray.ray.at(120, new THREE.Vector3());
      if (p === 0)
        this.tracer(
          this.camera.localToWorld(new THREE.Vector3(0.2, -0.17, -0.7)),
          end,
          '#ffe9a8',
        );
    }
    if (hit) {
      this.state.hit = 0.18;
      this.sound(900, 0.06, 0.035, 'sine');
    }
    this.emit();
  }
  tracer(from: THREE.Vector3, to: THREE.Vector3, color: string) {
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([from, to]),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 }),
    );
    this.scene.add(line);
    this.tracers.push({ mesh: line, life: 0.08 });
  }
  beginBotDeath(b: Bot) {
    b.dying = 0.9;
    b.deathY = b.mesh.position.y;
    const chute = b.mesh.getObjectByName('Parachute');
    if (chute) chute.visible = false;
    if (b.tag) b.tag.visible = false;
  }
  killBot(b: Bot, player = false) {
    this.beginBotDeath(b);
    b.hp = 0;
    if (player) {
      this.state.kills++;
      this.state.eliminationPulse = 1;
      this.notice(`Eliminated ${b.name}`);
    }
    this.addFeed(`${player ? 'You' : 'The sandbox'} eliminated ${b.name}`);
    this.state.alive = this.bots.filter((b) => b.hp > 0).length + 1;
  }
  damage(amount: number, from?: THREE.Vector3, killer = 'The storm') {
    this.state.killer = killer;
    this.cancelHeal();
    this.state.damageAngle = from
      ? ((Math.atan2(-(from.x - this.position.x), -(from.z - this.position.z)) -
          this.yaw) *
          -180) /
        Math.PI
      : null;
    const d = takeDamage(this.state.health, this.state.shield, amount);
    Object.assign(this.state, d);
    this.state.hurt = 0.7;
    if (from) this.incomingFire(from);
    if (this.state.health <= 0) this.finish(false);
  }
  incomingFire(from: THREE.Vector3) {
    this.state.threat = 1.2;
    this.state.damageAngle =
      ((Math.atan2(-(from.x - this.position.x), -(from.z - this.position.z)) -
        this.yaw) *
        -180) /
      Math.PI;
  }
  completeDeath() {
    if (this.state.phase !== 'dying') return;
    this.state.phase = 'lost';
    this.spectatorId = this.killerId;
    this.spectate(0);
    this.emit();
  }
  finish(won: boolean) {
    if (!this.network) this.state.rank = won ? 1 : this.state.alive;
    this.state.survived = this.state.elapsed;
    this.state.phase = won ? 'won' : 'dying';
    this.state.deathRemaining = won ? 0 : 1.4;
    this.state.dropping = false;
    this.gun.visible = false;
    cancelRecovery(this.state);
    this.state.healRemaining = 0;
    this.shooting = false;
    this.keys.clear();
    this.aiming = false;
    if (document.pointerLockElement) document.exitPointerLock();
    this.sound(won ? 780 : 150, 0.5, 0.07, 'triangle');
    this.emit();
  }
  safePosition(x: number, z: number) {
    if (!this.blocked(x, z)) return new THREE.Vector3(x, 0, z);
    for (let r = 2; r <= 18; r += 2)
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6,
          nx = x + Math.cos(a) * r,
          nz = z + Math.sin(a) * r;
        if (Math.hypot(nx, nz) < 104 && !this.blocked(nx, nz))
          return new THREE.Vector3(nx, 0, nz);
      }
    return new THREE.Vector3(0, 0, 4);
  }
  blocked(x: number, z: number) {
    return this.colliders.some(
      (b) =>
        x > b.min.x - 0.48 &&
        x < b.max.x + 0.48 &&
        z > b.min.z - 0.48 &&
        z < b.max.z + 0.48,
    );
  }
  move(pos: THREE.Vector3, dx: number, dz: number) {
    if (pos.y > 3.1 || !this.blocked(pos.x + dx, pos.z)) pos.x += dx;
    if (pos.y > 3.1 || !this.blocked(pos.x, pos.z + dz)) pos.z += dz;
    const length = Math.hypot(pos.x, pos.z);
    if (length > 110) {
      pos.x *= 110 / length;
      pos.z *= 110 / length;
    }
  }
  visible(from: THREE.Vector3, to: THREE.Vector3) {
    const dir = to.clone().sub(from);
    const distance = dir.length();
    this.ray.set(from, dir.normalize());
    const hit = this.ray.intersectObjects(this.solids, false)[0];
    return !hit || hit.distance > distance;
  }
  updateBots(dt: number) {
    const target = this.position.clone();
    target.y = 1.3;
    for (const b of this.bots) {
      if (b.hp <= 0) continue;
      const p = b.mesh.position,
        distance = p.distanceTo(this.position);
      if (b.dropping) {
        p.y = Math.max(0, p.y - DROP_SPEED * dt);
        if (p.y === 0) {
          p.copy(this.safePosition(p.x, p.z));
          b.dropping = false;
        } else {
          const nearest = this.loot
            .filter((l) => !l.used && l.kind < 3)
            .sort(
              (a, c) =>
                Math.hypot(a.mesh.position.x - p.x, a.mesh.position.z - p.z) -
                Math.hypot(c.mesh.position.x - p.x, c.mesh.position.z - p.z),
            )[0];
          if (nearest) {
            const delta = nearest.mesh.position.clone().sub(p);
            delta.y = 0;
            delta.clampLength(0, 5 * dt);
            p.add(delta);
          }
        }
        continue;
      }
      b.cooldown -= dt;
      const safe = Math.hypot(p.x, p.z) < this.state.storm - 5;
      if (!b.armed) {
        const supply = this.loot
          .filter((l) => !l.used && l.kind < 3)
          .sort(
            (a, c) =>
              a.mesh.position.distanceToSquared(p) -
              c.mesh.position.distanceToSquared(p),
          )[0];
        if (supply) {
          if (supply.mesh.position.distanceTo(p) < 2.8) {
            b.armed = true;
            supply.used = true;
            supply.mesh.visible = false;
            const oldGun = b.mesh.getObjectByName('Bot weapon');
            if (oldGun) {
              oldGun.removeFromParent();
              this.disposeObject(oldGun);
            }
            const held = weaponModel(supply.kind);
            held.name = 'Bot weapon';
            held.scale.setScalar(0.8);
            held.rotation.y = Math.PI;
            held.position.set(0.35, 1.35, 0.25);
            b.mesh.add(held);
          } else {
            const direction = Math.atan2(
              supply.mesh.position.x - p.x,
              supply.mesh.position.z - p.z,
            );
            this.move(
              p,
              Math.sin(direction) * 4 * dt,
              Math.cos(direction) * 4 * dt,
            );
            b.mesh.rotation.y = direction;
            continue;
          }
        }
      }
      const angle = !safe
        ? Math.atan2(-p.x, -p.z)
        : distance < 43
          ? Math.atan2(this.position.x - p.x, this.position.z - p.z)
          : b.seed + Math.sin(this.time * 0.13 + b.seed) * 2;
      const speed =
        (!safe ? 5.8 : distance < 3.5 ? 0 : distance < 13 ? 1.7 : 3.2) * dt;
      const old = p.clone();
      this.move(p, Math.sin(angle) * speed, Math.cos(angle) * speed);
      if (p.distanceToSquared(old) < 0.0001) {
        b.seed += dt * 3;
        this.move(p, Math.cos(angle) * speed, -Math.sin(angle) * speed);
      }
      if (p.distanceToSquared(old) > 0.0001) this.hearStep(b.name, p.x, p.z);
      b.mesh.rotation.y = angle;
      b.mesh.children[4].rotation.x = Math.sin(this.time * 9 + b.seed) * 0.3;
      b.mesh.children[6].rotation.x = -Math.sin(this.time * 9 + b.seed) * 0.3;
      if (!safe) {
        b.hp -= dt * (this.state.elapsed > 160 ? 5 : 2);
        if (b.hp <= 0) {
          this.killBot(b);
          continue;
        }
      }
      if (
        b.armed &&
        distance < 47 &&
        b.cooldown <= 0 &&
        this.state.phase === 'playing'
      ) {
        const from = p.clone().add(new THREE.Vector3(0, 1.45, 0));
        if (this.visible(from, target)) {
          this.tracer(from, target, '#ff9c73');
          this.incomingFire(from);
          if (Math.random() < (distance < 18 ? 0.68 : 0.38))
            this.damage(5 + Math.random() * 4, from, b.name);
        }
        b.cooldown = 1.1 + Math.random() * 1.4;
      }
    }
    this.aiTimer += dt;
    if (this.aiTimer > 1.5) {
      this.aiTimer = 0;
      const alive = this.bots.filter((b) => b.hp > 0);
      for (const b of alive) {
        if (!b.armed) continue;
        const enemy = alive.find(
          (o) =>
            o !== b &&
            o.hp > 0 &&
            o.mesh.position.distanceTo(b.mesh.position) < 34,
        );
        if (!enemy) continue;
        const from = b.mesh.position.clone().add(new THREE.Vector3(0, 1.4, 0)),
          to = enemy.mesh.position.clone().add(new THREE.Vector3(0, 1.4, 0));
        if (this.visible(from, to)) {
          this.tracer(from, to, '#ffe9a8');
          const result = takeDamage(
            enemy.hp,
            enemy.shield,
            9 + Math.random() * 12,
          );
          enemy.hp = result.health;
          enemy.shield = result.shield;
          if (enemy.hp <= 0) this.killBot(enemy);
        }
      }
    }
  }
  tick = (now: number) => this.updateFrame(now);
  updateFrame(now: number) {
    if (this.destroyed) return;
    // Leave the last island frame behind forms. Rendering shadows and applying
    // backdrop blur every frame competes with typing on integrated GPUs.
    if (this.menuOpen || document.hidden) {
      this.previous = now;
      this.frame = requestAnimationFrame(this.tick);
      return;
    }
    const interval = ['playing', 'spectating', 'dying'].includes(
      this.state.phase,
    )
      ? 1000 / 60
      : 1000 / 24;
    if (now - this.previous < interval - 1) {
      this.frame = requestAnimationFrame(this.tick);
      return;
    }
    const dt = Math.min((now - this.previous) / 1000 || 0, 0.04);
    this.previous = now;
    this.time += dt;
    this.state.threat = Math.max(0, (this.state.threat ?? 0) - dt);
    this.state.eliminationPulse = Math.max(
      0,
      (this.state.eliminationPulse ?? 0) - dt,
    );
    if (!this.state.threat) this.state.damageAngle = null;
    if (this.state.phase === 'dying') {
      this.state.deathRemaining = Math.max(0, this.state.deathRemaining - dt);
      this.camera.position.y = THREE.MathUtils.lerp(
        this.camera.position.y,
        0.6,
        dt * 4,
      );
      this.camera.rotation.z = THREE.MathUtils.lerp(
        this.camera.rotation.z,
        0.3,
        dt * 4,
      );
      if (!this.state.deathRemaining) this.completeDeath();
    }
    this.damageTimer = Math.max(0, (this.damageTimer ?? 0) - dt);
    if (!this.damageTimer) this.state.damageNumber = 0;
    this.state.shieldBreak = Math.max(0, (this.state.shieldBreak ?? 0) - dt);
    this.state.feed = (this.state.feed ?? []).filter(
      (e) => this.time - e.at < 7,
    );
    if (this.state.phase === 'lobby') {
      const t = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 0
        : this.time * 0.025;
      this.camera.position.set(83 + Math.sin(t) * 8, 55, 93 + Math.cos(t) * 8);
      this.camera.lookAt(0, 2, -8);
    } else if (this.state.phase === 'playing') {
      if (!this.network) {
        this.state.elapsed += dt;
        if (completeRecovery(this.state, this.state.elapsed * 1000)) {
          this.notice('Recovery complete');
          this.sound(740, 0.2, 0.045, 'sine');
        }
      }
      this.state.healRemaining = this.state.healing
        ? Math.max(0, (this.state.healUntil - this.state.elapsed * 1000) / 1000)
        : 0;
      if (!this.network) this.state.storm = stormRadius(this.state.elapsed);
      this.storm.scale.set(this.state.storm, 1, this.state.storm);
      this.cooldown = Math.max(0, this.cooldown - dt);
      this.recoil = Math.max(0, this.recoil - dt * 0.65);
      this.state.hit = Math.max(0, this.state.hit - dt);
      this.state.hurt = Math.max(0, this.state.hurt - dt);
      if (this.reloadTimer > 0) {
        this.reloadTimer -= dt;
        if (this.reloadTimer <= 0) {
          const i = this.state.weapon;
          const reloaded = reloadAmmo(
            this.weaponAmmo[i],
            this.reserveAmmo[i],
            WEAPONS[i].capacity,
          );
          if (!this.network) {
            this.weaponAmmo[i] = reloaded.ammo;
            this.reserveAmmo[i] = reloaded.reserve;
          }
          this.state.reloading = false;
        }
      }
      let mx =
          Number(this.keys.has('KeyD')) -
          Number(this.keys.has('KeyA')) +
          this.touchMove.x,
        mz =
          Number(this.keys.has('KeyW')) -
          Number(this.keys.has('KeyS')) -
          this.touchMove.y;
      const length = Math.hypot(mx, mz);
      if (length > 1) {
        mx /= length;
        mz /= length;
      }
      const speed =
        (this.network && this.networkRoom?.phase !== 'playing'
          ? 0
          : this.state.dropping
            ? 9
            : this.isDowned()
              ? 2
              : this.keys.has('ShiftLeft')
                ? 11
                : 7) *
        (this.state.healing ? 0.5 : this.aiming ? 0.6 : 1) *
        dt;
      this.move(
        this.position,
        (mx * Math.cos(this.yaw) - mz * Math.sin(this.yaw)) * speed,
        (-mx * Math.sin(this.yaw) - mz * Math.cos(this.yaw)) * speed,
      );
      if (this.keys.has('ArrowLeft')) this.yaw += dt * 1.5;
      if (this.keys.has('ArrowRight')) this.yaw -= dt * 1.5;
      if (this.network && this.networkRoom?.phase === 'countdown')
        this.velocityY = 0;
      if (this.state.dropping) {
        if (!this.network || this.networkRoom?.phase === 'playing')
          this.position.y = Math.max(1.7, this.position.y - DROP_SPEED * dt);
        this.velocityY = 0;
        if (!this.network && this.position.y <= 1.7) {
          this.state.dropping = false;
          this.position.copy(
            this.safePosition(this.position.x, this.position.z),
          );
          this.position.y = 1.7;
          this.notice('Feet in the sand. Find a weapon and press E.');
          this.sound(110, 0.18, 0.035, 'triangle');
        }
      } else {
        this.velocityY -= 20 * dt;
        this.position.y = Math.max(1.7, this.position.y + this.velocityY * dt);
      }
      this.state.altitude = Math.max(0, this.position.y - 1.7);
      if (this.position.y === 1.7) this.velocityY = 0;
      if (this.correction.lengthSq() > 0.000001) {
        const step = this.correction
          .clone()
          .multiplyScalar(1 - Math.exp(-dt * 12));
        this.position.add(step);
        this.correction.sub(step);
      }
      this.camera.position.copy(this.position);
      if (this.isDowned()) this.camera.position.y -= 0.95;
      this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
      this.camera.fov = THREE.MathUtils.lerp(
        this.camera.fov,
        this.aiming ? (this.state.weapon === 2 ? 28 : 45) : 72,
        dt * 12,
      );
      this.camera.updateProjectionMatrix();
      this.gun.position.set(
        this.aiming ? 0.18 : 0.28,
        (this.aiming ? -0.33 : -0.28) +
          Math.sin(this.time * 10) * Math.min(length, 1) * 0.012,
        -0.5 + this.recoil,
      );
      this.gun.rotation.set(
        this.reloadTimer > 0 ? -0.6 : 0,
        0,
        this.reloadTimer > 0 ? -0.45 : 0,
      );
      this.gun.scale.setScalar(1);
      this.flash.visible = this.recoil > 0.075;
      if (this.shooting) this.shoot();
      this.state.outside =
        Math.hypot(this.position.x, this.position.z) > this.state.storm;
      if (this.state.outside && !this.network)
        this.damage(dt * (this.state.elapsed > 180 ? 11 : 5));
      if (this.state.phase === 'playing' && !this.network) this.updateBots(dt);
      if (
        this.state.phase === 'playing' &&
        this.state.alive <= 1 &&
        !this.network
      )
        this.finish(true);
      const near = this.state.dropping ? undefined : this.nearestLoot();
      this.state.pickup = near
        ? near.kind < 3
          ? `${WEAPONS[near.kind].name}${this.state.owned[near.kind] ? ' ammo' : ''}`
          : near.kind === 3
            ? 'Shield cell · F to use'
            : 'Medkit · Q to use'
        : '';
      this.noticeTimer -= dt;
      if (this.noticeTimer <= 0) this.state.notice = '';
    }
    if (this.network) {
      this.bots.forEach((b, i) => {
        const target = this.remoteTargets[i];
        if (target && b.hp > 0) {
          b.mesh.position.lerp(target, Math.min(1, dt * 15));
          b.mesh.children[4].rotation.x = Math.sin(this.time * 9) * 0.2;
          b.mesh.children[6].rotation.x = -Math.sin(this.time * 9) * 0.2;
        }
      });
      this.networkTime += dt;
      if (this.networkTime > 0.05) {
        this.networkTime = 0;
        if (
          this.state.phase === 'playing' &&
          this.networkRoom?.phase === 'playing'
        )
          this.network.send({ type: 'pose', pose: this.pose() });
      }
    }
    if (this.state.phase === 'spectating' && this.networkRoom) {
      let target = this.networkRoom.players.find(
        (p) => p.id === this.spectatorId && p.health > 0,
      );
      if (!target) {
        this.spectate();
        target = this.networkRoom.players.find(
          (p) => p.id === this.spectatorId && p.health > 0,
        );
      }
      if (target) {
        const remotes = this.networkRoom.players.filter(
          (p) => p.id !== this.network?.playerId,
        );
        this.bots.forEach((b, i) => {
          b.mesh.visible =
            (b.hp > 0 || b.dying > 0) && remotes[i]?.id !== target.id;
        });
        this.camera.position.lerp(
          new THREE.Vector3(target.x, target.y, target.z),
          Math.min(1, dt * 18),
        );
        this.camera.quaternion.slerp(
          new THREE.Quaternion().setFromEuler(
            new THREE.Euler(target.pitch, target.yaw, 0, 'YXZ'),
          ),
          Math.min(1, dt * 18),
        );
        this.camera.fov = 72;
        this.camera.updateProjectionMatrix();
        this.state.spectator = {
          id: target.id,
          name: target.name,
          health: target.health,
          shield: target.shield,
          kills: target.kills,
        };
      }
    }
    for (const l of this.loot)
      if (!l.used) {
        l.mesh.children[0].rotation.y = this.time * 0.7;
        l.mesh.children[0].position.y = 0.85 + Math.sin(this.time * 2) * 0.15;
      }
    this.tracers = this.tracers.filter((t) => {
      t.life -= dt;
      if (t.life <= 0) {
        this.scene.remove(t.mesh);
        t.mesh.geometry.dispose();
        (t.mesh.material as THREE.Material).dispose();
        return false;
      }
      return true;
    });
    this.uiTime += dt;
    if (this.uiTime > 0.1) {
      this.uiTime = 0;
      for (const b of this.bots)
        if (b.tag) this.paintTag(b.tag, b.name, b.hp, b.shield);
      if (['playing', 'spectating', 'dying'].includes(this.state.phase))
        this.emit();
    }
    if (this.parachute) {
      this.parachute.visible =
        this.state.dropping && this.state.phase === 'playing';
      this.parachute.position
        .copy(this.position)
        .add(new THREE.Vector3(0, -1.7, 0));
    }
    for (const b of this.bots) {
      const chute = b.mesh.getObjectByName('Parachute');
      if (chute) chute.visible = b.dropping && b.hp > 0;
      if (b.hp <= 0 && b.dying > 0) {
        b.dying = Math.max(0, b.dying - dt);
        const progress = 1 - b.dying / 0.9;
        b.mesh.rotation.z = progress * 1.45;
        b.mesh.position.y = b.deathY - progress * 0.4;
        b.mesh.visible = b.dying > 0;
      }
      if (b.tag)
        b.tag.visible =
          this.state.phase !== 'lobby' &&
          b.hp > 0 &&
          b.mesh.position.distanceToSquared(this.camera.position) < 85 * 85;
    }
    this.renderer.render(this.scene, this.camera);
    this.framesRendered++;
    if (now - this.measuredAt >= 1000) {
      const fps = Math.round(
        (this.framesRendered * 1000) / (now - this.measuredAt),
      );
      this.container.dataset.fps = String(fps);
      this.container.dataset.drawCalls = String(
        this.renderer.info.render.calls,
      );
      this.framesRendered = 0;
      this.measuredAt = now;
      this.slowSamples =
        this.state.phase === 'playing' && fps < 42 ? this.slowSamples + 1 : 0;
      if (this.slowSamples >= 2 && this.resolutionScale > 0.6) {
        this.resolutionScale = Math.max(0.6, this.resolutionScale * 0.85);
        this.slowSamples = 0;
        this.resize();
      }
    }
    this.frame = requestAnimationFrame(this.tick);
  }
  emit() {
    this.state.footsteps = [];
    for (const [id, cue] of this.footsteps ?? []) {
      if (cue.until < this.time) {
        this.footsteps.delete(id);
        continue;
      }
      const direction = footstepDirection(
        { x: this.position.x, z: this.position.z, yaw: this.yaw },
        cue,
      );
      if (direction && this.state.phase === 'playing')
        this.state.footsteps.push({ id, ...direction });
    }
    const marks = this.network
      ? (this.networkRoom?.events ?? [])
          .filter((e) => e.type === 'mark' && e.end)
          .map((e) => ({
            id: e.id,
            point: new THREE.Vector3(...e.end!),
            label: e.label ?? 'Go here',
            until: this.time + 1,
          }))
      : (this.localMarks ?? []).filter((m) => m.until > this.time);
    this.state.pingPoints = marks.map((m) => ({
      id: m.id,
      x: m.point.x,
      z: m.point.z,
      label: m.label,
    }));
    this.state.markers = marks
      .map((m) => {
        const point = m.point.clone().project(this.camera);
        return {
          id: m.id,
          x: (point.x + 1) * 50,
          y: (1 - point.y) * 50,
          label: m.label,
          distance: Math.round(m.point.distanceTo(this.position)),
          z: point.z,
        };
      })
      .filter(
        (m) =>
          m.z > -1 && m.z < 1 && m.x > 2 && m.x < 98 && m.y > 5 && m.y < 90,
      );
    this.state.aiming = this.aiming;
    this.state.dropLoot = [];
    if (this.state.dropping && this.state.phase === 'playing') {
      this.camera.updateMatrixWorld();
      const visible = this.loot
        .filter((l) => !l.used)
        .map((l) => {
          const point = l.mesh.position
            .clone()
            .add(new THREE.Vector3(0, 1, 0))
            .project(this.camera);
          return {
            x: (point.x + 1) * 50,
            y: (1 - point.y) * 50,
            z: point.z,
            kind: l.kind,
            distance: Math.hypot(
              l.mesh.position.x - this.position.x,
              l.mesh.position.z - this.position.z,
            ),
          };
        })
        .filter(
          (p) =>
            p.z > -1 &&
            p.z < 1 &&
            p.x > 5 &&
            p.x < 95 &&
            p.y > 15 &&
            p.y < 70 &&
            p.distance < 90,
        )
        .sort((a, b) => a.distance - b.distance);
      for (const item of visible) {
        if (this.state.dropLoot.length >= 8) break;
        if (
          !this.state.dropLoot.some(
            (p) => Math.abs(p.x - item.x) < 9 && Math.abs(p.y - item.y) < 7,
          )
        )
          this.state.dropLoot.push(item);
      }
    }
    this.state.ammo = this.weaponAmmo[this.state.weapon] ?? 0;
    this.state.reserve = this.reserveAmmo[this.state.weapon] ?? 0;
    this.state.heading = ((((this.yaw * 180) / Math.PI) % 360) + 360) % 360;
    const watched =
      this.state.phase === 'spectating'
        ? this.networkRoom?.players.find((p) => p.id === this.spectatorId)
        : null;
    this.state.x = watched?.x ?? this.position.x;
    this.state.z = watched?.z ?? this.position.z;
    if (watched) {
      this.state.heading =
        ((((watched.yaw * 180) / Math.PI) % 360) + 360) % 360;
      this.state.outside = Math.hypot(watched.x, watched.z) > this.state.storm;
    }
    this.state.bots = this.bots
      .filter((b) => b.hp > 0)
      .map((b) => ({ x: b.mesh.position.x, z: b.mesh.position.z }));
    this.onState({ ...this.state });
  }
  pose(): PlayerPose {
    return {
      x: this.position.x,
      y: this.position.y,
      z: this.position.z,
      yaw: this.yaw,
      pitch: this.pitch,
      weapon: this.state.weapon,
    };
  }
  attachNetwork(playerId: string, send: (command: Command) => void) {
    this.network = { playerId, send };
    this.networkRound = 0;
    this.networkRoom = null;
    this.networkEvents.clear();
  }
  detachNetwork() {
    this.network = null;
    this.networkRoom = null;
    this.networkRound = 0;
    this.remoteTargets = [];
    this.lobby();
    this.resetBots();
  }
  applyNetworkSnapshot(room: RoomSnapshot, acknowledgedPose?: PlayerPose) {
    if (!this.network) return;
    const previousRoom = this.networkRoom;
    this.networkRoom = room;
    const me = room.players.find((p) => p.id === this.network?.playerId);
    if (!me) return;
    if (room.phase === 'waiting') {
      if (this.state.phase !== 'lobby') this.lobby();
      return;
    }
    const remotes = room.players.filter((p) => p.id !== me.id);
    const newRound = room.round !== this.networkRound;
    if (newRound) {
      this.networkRound = room.round;
      this.networkEvents.clear();
      this.footsteps.clear();
      this.localMarks = [];
      this.state.phase = 'paused';
      this.killerId = null;
      this.state.killer = 'The sandbox';
      this.state.deathRemaining = 0;
      this.state.threat = 0;
      this.state.survived = 0;
      this.state.eliminationPulse = 0;
      this.spectatorId = null;
      this.state.spectator = null;
      this.state.feed = [];
      this.state.damageNumber = 0;
      this.state.damageAngle = null;
      this.state.shieldBreak = 0;
      this.state.weapon = -1;
      this.state.owned = [...me.owned];
      this.correction.set(0, 0, 0);
      this.state.hit = 0;
      this.state.hurt = 0;
      this.state.pickup = '';
      this.state.notice = 'The sandbox is ready. Enter the match.';
      this.position.set(me.x, me.y, me.z);
      this.yaw = me.yaw;
      this.pitch = -0.6;
      this.velocityY = 0;
      this.reloadTimer = 0;
      this.cooldown = 0.3;
      this.resetBots(remotes.length);
      this.spawnLoot();
      this.showWeapon();
      this.storm.visible = true;
      this.camera.position.copy(this.position);
      this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    }
    if (this.bots.length !== remotes.length) this.resetBots(remotes.length);
    this.remoteTargets = remotes.map((p, i) => {
      const b = this.bots[i];
      if (newRound) b.mesh.position.set(p.x, p.y - 1.7, p.z);
      const teammate = room.mode === 'duos' && me.team === p.team;
      const label = `${teammate ? '◆ ' : ''}${p.name}${p.downed ? ' · DOWN' : ''}`;
      const previous = previousRoom?.players.find((q) => q.id === p.id);
      if (
        !newRound &&
        !teammate &&
        !p.dropping &&
        p.y <= 1.9 &&
        !p.downed &&
        p.health > 0 &&
        previous &&
        Math.hypot(p.x - previous.x, p.z - previous.z) > 0.025
      )
        this.hearStep(p.id, p.x, p.z);
      b.mesh.scale.y = p.downed ? 0.38 : 1;
      if (b.name !== label) {
        if (b.tag) {
          b.mesh.remove(b.tag);
          b.tag.material.map?.dispose();
          b.tag.material.dispose();
        }
        b.tag = this.nameTag(label);
        if (b.tag) b.mesh.add(b.tag);
        b.name = label;
        if (b.tag) b.tag.material.color.set(teammate ? '#7effd1' : '#ffffff');
      }
      let held = b.mesh.getObjectByName('Bot weapon');
      if (p.weapon >= 0 && held?.userData.weapon !== p.weapon) {
        if (held) {
          held.removeFromParent();
          this.disposeObject(held);
        }
        held = weaponModel(p.weapon);
        held.name = 'Bot weapon';
        held.userData.weapon = p.weapon;
        held.scale.setScalar(0.8);
        held.rotation.y = Math.PI;
        held.position.set(0.35, 1.35, 0.25);
        b.mesh.add(held);
      }
      if (held) held.visible = p.weapon >= 0 && !p.downed;
      if (p.health <= 0 && b.hp > 0 && !p.spectator && !newRound)
        this.beginBotDeath(b);
      b.hp = p.health;
      b.shield = p.shield;
      b.dropping = p.dropping;
      b.mesh.visible = p.health > 0 || b.dying > 0;
      b.mesh.rotation.y = p.yaw + Math.PI;
      return new THREE.Vector3(p.x, p.y - 1.7, p.z);
    });
    if (!newRound && acknowledgedPose) {
      const correctionX = me.x - acknowledgedPose.x,
        correctionZ = me.z - acknowledgedPose.z;
      if (Math.hypot(correctionX, correctionZ) > 0.05) {
        if (Math.hypot(correctionX, correctionZ) > 4) {
          this.position.x += correctionX;
          this.position.z += correctionZ;
          this.correction.set(0, 0, 0);
        } else this.correction.set(correctionX, 0, correctionZ);
      }
    }
    if (
      !newRound &&
      !me.spectator &&
      (me.health < this.state.health || me.shield < this.state.shield)
    )
      this.state.hurt = 0.3;
    if (me.dropping)
      this.position.y = THREE.MathUtils.lerp(this.position.y, me.y, 0.5);
    if (this.state.dropping && !me.dropping && me.health > 0) {
      this.position.set(me.x, me.y, me.z);
      this.velocityY = 0;
      this.correction.set(0, 0, 0);
      this.notice('Feet in the sand. Find a weapon and press E.');
    }
    this.state.dropping = me.dropping && me.health > 0;
    this.state.altitude = Math.max(0, me.y - 1.7);
    const wasHealing = this.state.healing;
    this.state.medkits = me.medkits ?? 0;
    this.state.cells = me.cells ?? 0;
    this.state.healing = me.healing ?? null;
    this.state.healUntil = me.healUntil ? me.healUntil - room.startAt : 0;
    this.state.healRemaining = me.healing
      ? Math.max(0, (me.healUntil - room.now) / 1000)
      : 0;
    if (
      wasHealing &&
      !me.healing &&
      (me.health < this.state.health || me.shield < this.state.shield)
    )
      this.notice('Healing interrupted. Item saved.');
    this.state.health = me.health;
    this.state.shield = me.shield;
    this.state.kills = me.kills;
    this.state.alive = room.players.filter((p) => p.health > 0).length;
    this.state.rank = me.rank || this.state.alive;
    this.state.elapsed = Math.max(0, (room.now - room.startAt) / 1000);
    this.state.storm = room.storm;
    this.state.outside = Math.hypot(me.x, me.z) > room.storm;
    this.storm.scale.set(room.storm, 1, room.storm);
    const inventoryChanged = this.state.owned.some(
      (has, i) => has !== me.owned[i],
    );
    this.state.owned = [...me.owned];
    if (inventoryChanged || newRound) this.state.weapon = me.weapon;
    this.showWeapon();
    if (me.health <= 0) this.gun.visible = false;
    this.weaponAmmo = [...me.ammo];
    this.reserveAmmo = [...me.reserve];
    this.state.reloading = me.reloadUntil > room.now;
    room.loot.forEach((used, i) => {
      if (this.loot[i]) {
        this.loot[i].used = used;
        this.loot[i].mesh.visible = !used;
      }
    });
    for (const e of room.events) {
      if (this.networkEvents.has(e.id)) continue;
      this.networkEvents.add(e.id);
      if (e.type === 'shot' && e.player !== me.id && e.end) {
        const p = room.players.find((p) => p.id === e.player);
        if (p) {
          const from = new THREE.Vector3(p.x, p.y, p.z),
            end = new THREE.Vector3(...e.end);
          if (
            me.health > 0 &&
            new THREE.Line3(from, end)
              .closestPointToPoint(this.position, true, new THREE.Vector3())
              .distanceTo(this.position) < 3
          )
            this.incomingFire(from);
          this.tracer(
            new THREE.Vector3(p.x, p.y, p.z),
            new THREE.Vector3(...e.end),
            '#ffce8f',
          );
        }
      }
      if (e.type === 'hit' && e.player === me.id) {
        this.hitFeedback(
          e.amount ?? 0,
          e.shieldDamage ?? 0,
          e.headshot ?? false,
          e.shieldBreak ?? false,
        );
        this.sound(900, 0.06, 0.035, 'sine');
      }
      if (e.type === 'hit' && e.target === me.id) {
        const source = room.players.find((p) => p.id === e.player);
        if (source) {
          this.state.hurt = 0.7;
          this.incomingFire(new THREE.Vector3(source.x, source.y, source.z));
        }
        if (source)
          this.state.damageAngle =
            ((Math.atan2(-(source.x - me.x), -(source.z - me.z)) - this.yaw) *
              -180) /
            Math.PI;
      }
      if (
        (e.type === 'down' || e.type === 'revive') &&
        (e.player === me.id || e.target === me.id)
      ) {
        const name =
          room.players.find((p) => p.id === e.target)?.name ?? 'Teammate';
        this.notice(
          e.type === 'down'
            ? e.target === me.id
              ? 'Downed! Your teammate can revive you.'
              : `Downed ${name}`
            : e.target === me.id
              ? 'Revived. Find cover!'
              : `Revived ${name}`,
        );
      }
      if (e.type === 'heal' && e.player === me.id) {
        this.notice(`${e.item === 'medkit' ? 'Health' : 'Shield'} restored`);
        this.sound(740, 0.2, 0.045, 'sine');
      }
      if (e.type === 'elimination') {
        const winner =
            room.players.find((p) => p.id === e.player)?.name ?? 'The storm',
          loser = room.players.find((p) => p.id === e.target)?.name ?? 'Player';
        if (e.target === me.id) {
          this.killerId = e.player;
          this.state.killer = winner;
        }
        if (e.player === me.id) {
          this.state.eliminationPulse = 1;
          this.sound(600, 0.25, 0.05, 'triangle');
        }
        this.addFeed(`${winner} eliminated ${loser}`, e.id);
        this.notice(
          e.player === me.id
            ? `Eliminated ${loser}`
            : `${winner} eliminated ${loser}`,
        );
      }
      if (e.type === 'pickup' && e.player === me.id) {
        this.notice('Supplies collected');
        this.sound(620, 0.16, 0.07, 'sine');
      }
    }
    if (me.killedBy) {
      this.killerId = me.killedBy;
      this.state.killer =
        room.players.find((p) => p.id === me.killedBy)?.name ?? 'Player';
    }
    if (this.networkEvents.size > 300)
      this.networkEvents = new Set(room.events.map((e) => e.id));
    if (
      me.health <= 0 &&
      this.state.phase !== 'lost' &&
      this.state.phase !== 'spectating' &&
      this.state.phase !== 'dying' &&
      !me.spectator
    ) {
      this.finish(false);
      if (me.diedAt)
        this.state.survived = Math.max(0, (me.diedAt - room.startAt) / 1000);
    }
    if (
      room.phase === 'finished' &&
      (room.winner === me.id ||
        (room.mode === 'duos' &&
          !me.spectator &&
          room.winningTeam != null &&
          room.winningTeam === me.team)) &&
      this.state.phase !== 'won'
    )
      this.finish(true);
    if (me.spectator && this.state.phase === 'paused') {
      if (room.phase === 'countdown') this.state.phase = 'spectating';
      this.spectate(0);
      if (!this.state.spectator) this.state.phase = 'lost';
    }
    if (
      ['lobby', 'paused', 'won', 'lost'].includes(this.state.phase) ||
      newRound
    )
      this.emit();
  }
  disposeObject(object: THREE.Object3D) {
    object.traverse((o) => {
      if (o instanceof THREE.Sprite) {
        o.material.map?.dispose();
        o.material.dispose();
      }
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        materials.forEach((m) => m.dispose());
      }
    });
  }
  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.cleanup.forEach((fn) => fn());
    if (document.pointerLockElement === this.renderer.domElement)
      document.exitPointerLock();
    this.disposeObject(this.scene);
    for (const t of this.tracers) {
      t.mesh.geometry.dispose();
      (t.mesh.material as THREE.Material).dispose();
    }
    this.renderer.dispose();
    this.renderer.domElement.remove();
    void this.audio?.close();
  }
}
