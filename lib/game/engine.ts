import { PositionHistory } from './position-history.ts';
import { ActionParticles } from './action-particles.ts';
import { isArenaMode, isTeamMode } from './modes.ts';
import { DEFAULT_PREFERENCES, type Preferences } from './preferences.ts';
import { practiceRange } from './practice-range.ts';
import {
  GUN_COLLIDERS,
  GUN_RADIUS,
  arenaMove,
  arenaGround,
} from './gun-arena.ts';
import { gunArenaModel } from './gun-arena-model.ts';
import { ComebackModels } from './comeback-model.ts';
import { REBOOT_STATIONS } from './comeback.ts';
import { BattlefieldEffects } from './battlefield-models.ts';
import {
  supplyPlan,
  supplyLoot,
  smokeLoot,
  throwSmoke,
  smokeBlocks,
  SMOKE_LIMIT,
  type Smoke,
  type SupplyDrop,
} from './battlefield.ts';
import {
  BUS_SECONDS,
  GLIDE_SPEED,
  canGlideFire,
  busPosition,
  padAt,
  glideHeight,
  LIFT_SECONDS,
} from './traversal.ts';
import { LAUNCH_PADS } from './traversal.ts';
import { launchPadModel, dropBusModel } from './traversal-models.ts';
import {
  CHEST_SPOTS,
  chestLayout,
  chestDrops,
  floorAmmo,
  SHELTERS,
  canReach,
  type ChestState,
} from './chests.ts';
import { ChestInstances } from './chest-model.ts';
import {
  ARENA_SCALE,
  ARENA_RADIUS,
  INITIAL_CIRCLE,
  SPAWN_RADIUS,
} from './arena.ts';
import { MAP } from './map-data.ts';
import { MELEE, meleeTarget, meleeBody } from './melee.ts';
import {
  bulletTrail,
  fadeTrail,
  disposeTrail,
  stormWall,
} from './combat-effects.ts';
import { shoulderCamera, convergedAim } from './camera-rig.ts';
import { FEEL, reloadMotion, animateWeapon } from './weapon-feel.ts';
import { WeaponAudio } from './weapon-audio.ts';
import {
  floorAvailable,
  floorRarity,
  lootColor,
  collectGun,
  collectAmmo,
  isAmmo,
  AMMO_TYPES,
  eliminationDrops,
  type WorldDrop,
} from './loot.ts';
import {
  MOVE,
  smoothVelocity,
  blocksBody,
  groundAt,
  mantleTarget,
  mantlePoint,
  type Point,
  type Bounds,
} from './movement.ts';
import { zoneAt, outsideZone, type Zone } from './zones.ts';
import * as THREE from 'three';
import { footstepDirection } from './sound-cues.ts';
import { parachuteModel } from './parachute.ts';
import { weaponModel } from './weapon-models.ts';
import {
  characterModel,
  skinIndex,
  animateCharacter,
  setCharacterSkin,
} from './character-models.ts';
import { supplyModel } from './supply-models.ts';
import { LootInstances } from './loot-instances.ts';
import { chamferBox, modelKit } from './model-kit.ts';
import { batchIsland } from './render-world.ts';
import type { Command, RoomSnapshot, PlayerPose } from './multiplayer.ts';
import {
  automaticWeapon,
  BOT_COUNT,
  WEAPONS,
  HEADSHOT_MULTIPLIER,
  RARITIES,
  shotDirection,
  weaponDamage,
  takeDamage,
  reloadAmmo,
  cycleWeapon,
  SUPPLIES,
  SUPPLY_LIMIT,
  DROP_HEIGHT,
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
  mode?: RoomSnapshot['mode'];
  scoreboardOpen?: boolean;
  practice?: boolean;
  practiceHit?: { damage: number; distance: number; headshot: boolean };
  smokes?: number;
  smokeObscured?: boolean;
  supply?: SupplyDrop;
  gunStage?: number;
  respawnRemaining?: number;
  health: number;
  shield: number;
  alive: number;
  kills: number;
  ammo: number;
  reserve: number;
  weapon: number;
  owned: boolean[];
  tiers?: number[];
  perspective?: 'first' | 'third';
  crouching?: boolean;
  sprinting?: boolean;
  mantling?: boolean;
  elapsed: number;
  storm: number;
  zone?: Zone;
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
  onBus?: boolean;
  padGliding?: boolean;
  busRemaining?: number;
  mapOpen?: boolean;
  squadPoints?: { x: number; z: number; name: string }[];
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
  remoteId?: string;
  remoteTarget?: THREE.Vector3;
  hp: number;
  shield: number;
  cooldown: number;
  target?: number | null;
  thinkAt?: number;
  seed: number;
  name: string;
  tag?: THREE.Sprite;
  armed: boolean;
  rarity?: number;
  ammunition?: number;
  dropping: boolean;
  dying: number;
  busJumpAt?: number;
  liftRemaining?: number;
  launchAt?: number;
  deathY: number;
};
type Loot = {
  mesh: THREE.Group;
  kind: number;
  used: boolean;
  rarity: number;
  ammo?: number;
  amount?: number;
};
export const landmarks = [
  { x: 18, z: -23, w: 14, d: 12, name: 'SANDCASTLE SQUARE' },
  { x: -22, z: -16, w: 14, d: 12, name: 'BUCKET TOWN' },
  { x: 30, z: 20, w: 12, d: 10, name: 'BLOCK FORT' },
  { x: -35, z: 28, w: 12, d: 10, name: 'TOY GROVE' },
  { x: 2, z: -57, w: 12, d: 9, name: 'NORTH RIM' },
].map((p) => ({
  ...p,
  x: p.x * ARENA_SCALE,
  z: p.z * ARENA_SCALE,
  w: p.w * ARENA_SCALE,
  d: p.d * ARENA_SCALE,
}));
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
  particles?: ActionParticles;
  weaponSway = new THREE.Vector2();
  landingKick = 0;
  previousGrounded = true;
  fx(
    at: { x: number; y: number; z: number },
    kind: 'sand' | 'shield' | 'elimination' | 'casing',
    count = 5,
  ) {
    if (
      this.camera.position.distanceToSquared(
        new THREE.Vector3(at.x, at.y, at.z),
      ) >
      90 * 90
    )
      return;
    this.particles ??= new ActionParticles();
    if (!this.particles.mesh.parent) this.scene.add(this.particles.mesh);
    this.particles.burst(at, kind, count);
  }
  preferences: Preferences = { ...DEFAULT_PREFERENCES, slots: [0, 1, 2] };
  sprintToggle = false;
  practice = false;
  practiceNetwork: BattleGame['network'] = null;
  range?: ReturnType<typeof practiceRange>;
  setPreferences(p: Preferences) {
    this.preferences = p;
    this.sensitivity = p.look;
    this.muted = p.muted;
    this.sprintToggle = false;
    this.crouchToggle = false;
  }
  async startPractice(touch = false) {
    if (
      this.networkRoom &&
      !['waiting', 'finished'].includes(this.networkRoom.phase)
    )
      return;
    if (this.practice) return;
    this.practiceNetwork = this.network;
    this.network = null;
    this.practice = true;
    this.setArena(true);
    this.gunArena!.visible = false;
    this.arenaActors!.visible = false;
    this.colliders = [];
    this.solids = [];
    this.physicsCache = undefined;
    this.range ??= practiceRange();
    this.scene.add(this.range.root);
    this.range.root.visible = true;
    Object.assign(this.state, {
      practice: true,
      feed: [],
      mapOpen: false,
      scoreboardOpen: false,
      spectator: null,
      deathRemaining: 0,
      practiceHit: undefined,
      phase: 'paused',
      health: 100,
      shield: 0,
      weapon: 0,
      owned: WEAPONS.map(() => true),
      tiers: WEAPONS.map(() => 0),
      dropping: false,
      onBus: false,
      healing: null,
      healUntil: 0,
      medkits: 0,
      cells: 0,
      smokes: 0,
      elapsed: 0,
      alive: 1,
      kills: 0,
      damageNumber: 0,
      damageAngle: null,
      hurt: 0,
      hit: 0,
      outside: false,
      zone: {
        x: 0,
        z: 0,
        radius: 100,
        next: { x: 0, z: 0, radius: 100 },
        phase: 1,
        stage: 'final',
        remaining: 0,
      },
      supply: undefined,
      respawnRemaining: 0,
    });
    this.position.set(0, 1.7, 30);
    this.yaw = 0;
    this.pitch = 0;
    this.motion.set(0, 0);
    this.velocityY = 0;
    this.mantle = undefined;
    this.correction.set(0, 0, 0);
    this.weaponAmmo = WEAPONS.map((w) => w.capacity);
    this.reserveAmmo = WEAPONS.map(() => 999);
    this.reloadTimer = 0;
    this.cooldown = 0;
    this.localSupply = undefined;
    this.localSmokes = [];
    this.footsteps?.clear();
    this.localMarks = [];
    this.state.footsteps = [];
    this.crouchToggle = false;
    this.sprintToggle = false;
    this.crouchOffset = 0;
    this.menuOpen = false;
    await this.start(touch);
    this.storm.visible = false;
    this.notice('Practice range · 1–8 or wheel to test every weapon');
  }
  stopPractice() {
    if (!this.practice) return;
    this.practice = false;
    this.state.practice = false;
    this.state.practiceHit = undefined;
    if (this.range) this.range.root.visible = false;
    this.network = this.practiceNetwork;
    this.practiceNetwork = null;
    this.lobby();
  }
  royalePhysics?: { colliders: THREE.Box3[]; solids: THREE.Object3D[] };
  gunArena?: THREE.Group;
  arenaActors?: THREE.Group;
  gunSolids?: THREE.Mesh[];
  comebackModels?: ComebackModels;
  setArena(gun: boolean) {
    if (gun && !this.gunArena) {
      this.royalePhysics = { colliders: this.colliders, solids: this.solids };
      this.gunArena = gunArenaModel();
      this.arenaActors = new THREE.Group();
      this.scene.add(this.gunArena, this.arenaActors);
      const material = new THREE.MeshBasicMaterial();
      this.gunSolids = GUN_COLLIDERS.map((b) => {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(
            b.max[0] - b.min[0],
            b.max[1] - b.min[1],
            b.max[2] - b.min[2],
          ),
          material,
        );
        mesh.position.set(
          (b.max[0] + b.min[0]) / 2,
          (b.max[1] + b.min[1]) / 2,
          (b.max[2] + b.min[2]) / 2,
        );
        mesh.updateMatrixWorld(true);
        return mesh;
      });
    }
    if (this.gunArena) this.gunArena.visible = gun;
    if (this.arenaActors) this.arenaActors.visible = gun;
    this.world.visible = !gun;
    if (gun) {
      this.colliders = GUN_COLLIDERS.map(
        (b) =>
          new THREE.Box3(
            new THREE.Vector3(...b.min),
            new THREE.Vector3(...b.max),
          ),
      );
      this.solids = this.gunSolids!;
    } else if (this.royalePhysics) {
      this.colliders = this.royalePhysics.colliders;
      this.solids = this.royalePhysics.solids;
    }
    this.physicsCache = undefined;
    for (const b of this.bots)
      (gun ? this.arenaActors! : this.world).add(b.mesh);
    this.state.mode = gun
      ? isArenaMode(this.networkRoom?.mode)
        ? this.networkRoom?.mode
        : 'gun-game'
      : this.networkRoom?.mode;
  }
  showScoreboard(open: boolean) {
    this.state.scoreboardOpen = open;
    this.emit();
  }
  nearReboot() {
    const room = this.networkRoom;
    if (
      !room?.comebacksOpen ||
      !room.tokens?.some((t) => t.carriedBy === this.network?.playerId)
    )
      return -1;
    return REBOOT_STATIONS.findIndex(
      (s) =>
        canReach(this.position, { ...s, y: 1 }, this.physicsBounds(), 3.6) &&
        !outsideZone(s.x, s.z, room.zone!),
    );
  }

  battlefield?: BattlefieldEffects;
  localSmokes: Smoke[] = [];
  localSupply?: SupplyDrop;
  isGunGame() {
    return this.practice || isArenaMode(this.networkRoom?.mode);
  }
  activeSmokes() {
    return this.networkRoom?.smokes ?? this.localSmokes ?? [];
  }
  activeSupply() {
    return this.network ? this.networkRoom?.supply : this.localSupply;
  }
  nearSupply() {
    const s = this.activeSupply();
    return (
      !!s &&
      !s.opened &&
      this.state.elapsed * 1000 >= s.arrivesAt &&
      canReach(
        this.position,
        { x: s.x, y: 0.9, z: s.z },
        this.physicsBounds(),
        3.8,
      )
    );
  }
  throwSmoke() {
    if (
      this.state.phase !== 'playing' ||
      this.state.dropping ||
      this.isDowned() ||
      this.mantle ||
      !(this.state.smokes ?? 0) ||
      this.isGunGame()
    )
      return;
    if (
      this.activeSmokes().filter((s) => s.endsAt > this.state.elapsed * 1000)
        .length >= SMOKE_LIMIT
    ) {
      this.notice('Wait for a smoke cloud to clear');
      return;
    }
    if (this.network) {
      this.network.send({ type: 'smoke', pose: this.pose() });
      return;
    }
    this.localSmokes.push(
      throwSmoke(
        this.position,
        this.yaw,
        this.pitch,
        this.state.elapsed * 1000,
        this.physicsBounds(),
        String(this.time),
      ),
    );
    this.state.smokes!--;
    this.cancelHeal();
    this.reloadTimer = 0;
    this.state.reloading = false;
    this.notice('Smoke out!');
    this.emit();
  }
  updateBattlefield() {
    if (this.practice) {
      if (this.battlefield) this.battlefield.root.visible = false;
      if (this.comebackModels) this.comebackModels.root.visible = false;
      return;
    }
    const now = this.state.elapsed * 1000;
    this.localSmokes = (this.localSmokes ?? []).filter((s) => s.endsAt > now);
    const supply = this.activeSupply();
    if (!this.battlefield) {
      this.battlefield = new BattlefieldEffects();
      this.scene.add(this.battlefield.root);
    }
    this.battlefield.update(this.activeSmokes(), supply, now);
    if (this.networkRoom?.mode === 'duos' && !this.comebackModels) {
      this.comebackModels = new ComebackModels();
      this.scene.add(this.comebackModels.root);
    }
    if (this.comebackModels) {
      const me = this.networkRoom?.players.find(
        (p) => p.id === this.network?.playerId,
      );
      this.comebackModels.update(
        this.networkRoom?.tokens ?? [],
        me?.team,
        !!this.networkRoom?.comebacksOpen && this.state.phase !== 'lobby',
        this.time,
      );
    }

    this.battlefield.root.visible = this.state.phase !== 'lobby';
    this.state.smokeObscured = smokeBlocks(
      this.camera.position,
      this.camera.position,
      this.activeSmokes(),
      now,
    );
    if (
      supply &&
      !supply.opened &&
      now >= supply.arrivesAt - 8000 &&
      !this.state.supply
    )
      this.notice('Supply drop incoming. Look for the diamond on your map.');
    this.state.supply =
      supply && !supply.opened && now >= supply.arrivesAt - 8000
        ? { ...supply }
        : undefined;
  }

  lootInstances?: LootInstances;
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
    storm: INITIAL_CIRCLE,
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
  fists?: THREE.Group;
  meleeAt = -100;
  zoneCue = '';
  bots: Bot[] = [];
  loot: Loot[] = [];
  chests: ChestState[] = [];
  chestRenderer?: ChestInstances;
  chestSeed = 'sandbox';
  chestHumAt = 0;
  colliders: THREE.Box3[] = [];
  solids: THREE.Object3D[] = [];
  storm!: THREE.Mesh;
  flash!: THREE.Mesh;
  keys = new Set<string>();
  ray = new THREE.Raycaster();
  position = new THREE.Vector3(0, 1.7, SPAWN_RADIUS);
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
  dropBus = dropBusModel();
  liftRemaining = 0;
  launchAt = -100;
  correction = new THREE.Vector3();
  positionHistory = new PositionHistory();
  renderStats = { before: 0, after: 0 };
  framesRendered = 0;
  measuredAt = 0;
  resolutionScale = 1;
  slowSamples = 0;
  perspective: 'first' | 'third' = 'first';
  avatar?: THREE.Group;
  weaponAudio?: WeaponAudio;
  triggerHeld = false;
  lastShotAt = -100;
  shotWeapon = -1;
  actionPlayed = true;
  reloadCue = 0;
  viewKick = 0;
  shooting = false;
  aiming = false;
  mouseAimHeld = false;
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
  zoneSeed = 'sandbox';
  motion = new THREE.Vector2();
  crouchOffset = 0;
  crouchToggle = false;
  touchSprint = false;
  mantle?: { from: Point; to: Point; at: number };
  physicsCache?: Bounds[];
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
    this.scene.fog = new THREE.Fog('#9bc9d2', 115 * ARENA_SCALE, 450);
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
    this.scene.add(this.dropBus);
    this.dropBus.visible = false;
    this.scene.add(this.parachute);
    this.parachute.visible = false;
    this.buildGun();
    this.buildFists();
    try {
      if (localStorage.getItem('sandbox-perspective') === 'third')
        this.perspective = 'third';
    } catch {}
    this.state.perspective = this.perspective;
    this.resetBots();
    this.bind();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
    this.emit();
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
      new THREE.PlaneGeometry(226, 226, 14, 14),
      this.material('#e8c780'),
    );
    island.rotation.x = -Math.PI / 2;
    island.position.y = 0;
    const sandPositions = island.geometry.getAttribute('position');
    const sandColors = new Float32Array(sandPositions.count * 3);
    for (let i = 0; i < sandPositions.count; i++) {
      const x = sandPositions.getX(i),
        z = sandPositions.getY(i);
      const shade =
        0.93 +
        Math.sin(x * 0.08 + Math.sin(z * 0.05)) * 0.045 +
        Math.cos(z * 0.11) * 0.025;
      sandColors.set([shade, shade, shade], i * 3);
    }
    island.geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(sandColors, 3),
    );
    island.material.vertexColors = true;
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
      const base = new THREE.Mesh(
        chamferBox(w, h, d, 0.24),
        this.material(color),
      );
      base.position.set(x, h / 2, z);
      this.world.add(base);
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
    this.buildCastle(18, -23, '#e5bd75');
    this.buildCastle(-22, -16, '#e2c884');
    for (const shelter of SHELTERS) this.buildShelter(shelter);

    building(-47, -28, 9, 11, 4.5, '#ed865b');
    building(48, -40, 11, 12, 7.2, '#e1b47c');

    building(49, 45, 9, 10, 4.5, '#dc7861');
    building(-56, 7, 11, 9, 5.4, '#669f9b');
    // A stepped clock tower gives the island its silhouette.
    const tower = this.box(7, 17, 7, '#ebc993', 13, 8.5, -27);
    this.solid(tower);
    this.box(8.2, 0.7, 8.2, '#f5e7c0', 13, 16.8, -27);
    this.box(6, 4, 6, '#d5a271', 13, 19, -27);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(5.3, 3, 4),
      this.material('#dfb064'),
    );
    roof.position.set(13, 22.2, -27);
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    this.world.add(roof);
    const clock = new THREE.Mesh(
      new THREE.CircleGeometry(1.3, 24),
      this.material('#f9edcd'),
    );
    clock.position.set(13, 18.9, -23.98);
    this.world.add(clock);
    this.box(0.12, 0.9, 0.08, '#3b5b60', 13, 19.2, -23.9);
    this.box(0.75, 0.12, 0.08, '#3b5b60', 13.3, 18.9, -23.9);
    this.box(0.15, 5, 0.15, '#d7d6b7', 13, 25, -27);
    const flag = this.box(2.5, 1.25, 0.07, '#ed744e', 14.2, 26.7, -27);
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
      const c = new THREE.Mesh(
        chamferBox(2.4, 2.4, 2.4, 0.16),
        this.material('#778f9b'),
      );
      c.position.set(x, 1.2, z);
      this.world.add(c);
      this.solid(c);
      this.box(2.5, 0.2, 2.5, '#d8b777', x, 0.3, z);
      this.box(2.5, 0.2, 2.5, '#d8b777', x, 2.1, z);
      this.box(0.85, 0.85, 0.03, '#334750', x, 1.2, z + 1.215);
      const stripe = this.box(0.12, 0.75, 0.04, '#f2dfba', x, 1.2, z + 1.24);
      stripe.rotation.z = Math.PI / 4;
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
    for (let i = 0; i < 8; i++) {
      const g = new THREE.Group();
      for (let j = 0; j < 3; j++) {
        const c = new THREE.Mesh(
          new THREE.IcosahedronGeometry(7 + rand() * 4, 0),
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
    this.storm = stormWall();
    this.storm.position.y = 24;
    this.storm.scale.set(INITIAL_CIRCLE, 1, INITIAL_CIRCLE);
    this.storm.visible = false;
    this.scene.add(this.storm);
    for (const [x, z] of [
      [18, -23],
      [-22, -16],
      [30, 20],
      [-35, 28],
    ]) {
      for (const side of [-1, 1]) {
        this.box(0.08, 1.9, 0.1, '#b89865', x + side * 5.4, 1, z + 5.8);
        this.box(0.4, 0.3, 0.08, '#e8d19c', x + side * 5.4, 2, z + 5.8);
      }
      for (let j = 0; j < 4; j++)
        this.box(
          2.2,
          0.014,
          0.05,
          '#d4b57b',
          x + j * 0.15,
          0.02,
          z + 8 + j * 0.8,
        );
    }
    this.spawnLoot(false);
    this.buildCover();
    // Stretch only the island horizontally. Dynamic characters and loot keep their size.
    const staticWorld = new THREE.Group();
    staticWorld.name = 'Expanded sandbox';
    const pickups = new Set<THREE.Object3D>(this.loot.map((l) => l.mesh));
    if (this.lootInstances) pickups.add(this.lootInstances.root);
    const scenery = this.world.children.filter(
      (object) => !pickups.has(object),
    );
    for (const object of scenery) staticWorld.add(object);
    staticWorld.scale.set(ARENA_SCALE, 1, ARENA_SCALE);
    this.world.add(staticWorld);
    for (const box of this.colliders) {
      box.min.x *= ARENA_SCALE;
      box.min.z *= ARENA_SCALE;
      box.max.x *= ARENA_SCALE;
      box.max.z *= ARENA_SCALE;
    }
    this.physicsCache = undefined;
    for (const item of this.loot) {
      item.mesh.position.x *= ARENA_SCALE;
      item.mesh.position.z *= ARENA_SCALE;
    }
    this.rebuildLoot();
    this.resetChests('sandbox');
    for (const p of LAUNCH_PADS) {
      const pad = launchPadModel();
      pad.position.set(p.x, 0, p.z);
      this.world.add(pad);
    }
    this.world.updateMatrixWorld(true);
  }
  buildCastle(x: number, z: number, color: string) {
    const wall = (
      w: number,
      h: number,
      d: number,
      dx: number,
      y: number,
      dz: number,
    ) => {
      const mesh = this.box(w, h, d, color, x + dx, y, z + dz);
      mesh.name = 'Sandcastle wall';
      this.solid(mesh);
    };
    // Four wide doorways and a shaded hall. Roof and walls have separate collision.
    for (const side of [-1, 1]) {
      for (const part of [-1, 1]) {
        wall(5, 6, 0.7, part * 4.5, 3, side * 6);
        wall(0.7, 6, 4, side * 7, 3, part * 4);
      }
      wall(4, 2.2, 0.7, 0, 4.9, side * 6);
      wall(0.7, 2.2, 4, side * 7, 4.9, 0);
    }
    wall(14.7, 0.35, 12.7, 0, 6.175, 0);
    // Broad, two-metre ledges lead up to the roof using the existing mantle.
    for (let i = 0; i < 3; i++) {
      const h = (i + 1) * 2;
      wall(2.7, h, 3, 8.7, h / 2, 8 - i * 3);
      this.box(2.8, 0.12, 3.1, '#f4deaa', x + 8.7, h + 0.02, z + 8 - i * 3);
    }
    for (const side of [-1, 1])
      for (const n of [-2, -1, 0, 1, 2]) {
        wall(1.5, 0.9, 0.8, n * 3, 6.8, side * 6);
      }
    this.box(3.6, 0.035, 12, '#b9985e', x, 0.025, z);
    // Low partitions break sightlines while leaving two routes around the chest.
    wall(3, 2.2, 0.65, 3.8, 1.1, 1.7);
    this.box(0.12, 4, 0.12, '#7a6245', x - 5, 8.4, z + 4);
    this.box(2, 1, 0.08, '#a7e3cd', x - 4, 9.7, z + 4);
  }
  buildShelter({ x, z, w, d }: { x: number; z: number; w: number; d: number }) {
    const wall = (
      width: number,
      height: number,
      depth: number,
      dx: number,
      y: number,
      dz: number,
    ) => {
      const mesh = this.box(width, height, depth, '#e1bd78', x + dx, y, z + dz);
      mesh.name = 'Shelter wall';
      this.solid(mesh);
    };
    for (const side of [-1, 1]) {
      wall(0.65, 4, d, (side * w) / 2, 2, 0);
      for (const part of [-1, 1])
        wall((w - 4) / 2, 4, 0.65, (part * (w + 4)) / 4, 2, (side * d) / 2);
      wall(4, 1, 0.65, 0, 3.5, (side * d) / 2);
    }
    wall(w + 0.65, 0.3, d + 0.65, 0, 4.15, 0);
    this.box(w + 0.9, 0.2, d + 0.9, '#77aeab', x, 4.4, z);
    wall(2, 1.8, 0.5, w / 2 - 2, 0.9, -1);
    this.box(3.8, 0.035, d + 1, '#c9a368', x, 0.025, z);
  }
  resetChests(seed: string) {
    if (this.chestRenderer) {
      this.chestRenderer.root.removeFromParent();
      this.disposeObject(this.chestRenderer.root);
    }
    this.chestSeed = seed;
    this.chests = chestLayout(seed);
    this.chestRenderer = new ChestInstances(this.chests);
    this.chestRenderer.update(this.chests, 1);
    this.world.add(this.chestRenderer.root);
  }

  nearestChest(position = this.position) {
    return (this.chests ?? []).findIndex(
      (c, i) =>
        c.active &&
        !c.openedAt &&
        canReach(position, { ...CHEST_SPOTS[i], y: 0.8 }, this.physicsBounds()),
    );
  }
  openChest(index: number) {
    const c = this.chests?.[index];
    if (!c?.active || c.openedAt) return;
    c.openedAt = Math.max(0.001, this.time);
    for (const drop of chestDrops(this.chestSeed, index)) this.addLoot(drop);
    this.rebuildLoot();
    this.sound(740, 0.24, 0.045, 'triangle');
  }
  updateChests(dt: number) {
    if (this.practice) return;
    this.chestRenderer?.update(this.chests, dt);
    if (
      this.state.phase !== 'playing' ||
      this.state.dropping ||
      this.time < (this.chestHumAt ?? 0)
    )
      return;
    const nearby = this.chests.findIndex(
      (c, i) =>
        c.active &&
        !c.openedAt &&
        Math.hypot(
          CHEST_SPOTS[i].x - this.position.x,
          CHEST_SPOTS[i].z - this.position.z,
        ) < 13,
    );
    if (nearby >= 0) {
      this.chestHumAt = this.time + 2.5;
      this.sound(520, 0.45, 0.012, 'sine');
    }
  }
  buildCover() {
    // Short L-shaped sand walls break long sightlines, with two open exits.
    for (let x = -72; x <= 72; x += 24)
      for (let z = -72; z <= 72; z += 24) {
        if (Math.hypot(x, z) > 94) continue;
        const space = new THREE.Box3(
          new THREE.Vector3(x - 5, 0, z - 5),
          new THREE.Vector3(x + 5, 3, z + 5),
        );
        if (
          this.colliders.some((b) => b.intersectsBox(space)) ||
          this.loot.some(
            (l) =>
              Math.abs(l.mesh.position.x - x) < 6 &&
              Math.abs(l.mesh.position.z - z) < 6,
          )
        )
          continue;
        const horizontal = ((x + z) / 24) % 2 === 0;
        const parts = horizontal
          ? [
              [0, 0, 6, 1],
              [-2.5, 1.5, 1, 4],
            ]
          : [
              [0, 0, 1, 6],
              [1.5, 2.5, 4, 1],
            ];
        for (const [dx, dz, w, d] of parts) {
          const wall = this.box(w, 2.6, d, '#d8b16e', x + dx, 1.3, z + dz);
          wall.name = 'Sand cover';
          this.solid(wall);
          this.box(w + 0.12, 0.18, d + 0.12, '#f1d697', x + dx, 2.62, z + dz);
        }
      }
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
        new THREE.ConeGeometry(h * 0.43 - j * 0.5, h * 0.68, 6, 1, true),
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
  spawnLoot(expanded = true) {
    if (this.lootInstances) {
      this.world.remove(this.lootInstances.root);
      this.disposeObject(this.lootInstances.root);
      this.lootInstances = undefined;
    }
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
      this.addLoot({
        x: expanded ? MAP.loot[i].x : x,
        z: expanded ? MAP.loot[i].z : z,
        kind,
        rarity: floorRarity(i),
        used: !floorAvailable(i),
      });
    });
    if (expanded && !this.network)
      for (const drop of [...floorAmmo(), ...smokeLoot()]) this.addLoot(drop);
    this.rebuildLoot();
  }
  addLoot(drop: WorldDrop) {
    const { kind, rarity } = drop;
    const color = lootColor(kind, rarity);
    const group = new THREE.Group();
    if (kind < 3) {
      const model = weaponModel(kind, 'world', rarity);
      model.scale.setScalar(1.7);
      model.rotation.z = -0.15;
      model.position.y = 0.95;
      group.add(model);
    } else {
      const item = supplyModel(kind);
      item.position.y = isAmmo(kind) ? 0.25 : 0.85;
      group.add(item);
    }
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 1.25, 6),
      new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.35,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.07;
    group.add(ring);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.65, 4, 4, 1, true),
      new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.15,
        depthWrite: false,
      }),
    );
    beam.position.y = 2;
    if (isAmmo(kind)) {
      beam.scale.setScalar(0);
      ring.scale.setScalar(0.45);
    }
    group.add(beam);
    group.position.copy(this.safePosition(drop.x, drop.z));
    group.visible = !drop.used;
    this.world.add(group);
    this.loot.push({
      mesh: group,
      kind,
      rarity,
      ammo: drop.ammo,
      amount: drop.amount,
      used: drop.used,
    });
  }
  replaceLoot(index: number, drop: WorldDrop) {
    const old = this.loot[index];
    old.mesh.removeFromParent();
    this.disposeObject(old.mesh);
    this.addLoot(drop);
    this.loot[index] = this.loot.pop()!;
  }
  rebuildLoot() {
    if (this.lootInstances) {
      this.lootInstances.root.removeFromParent();
      this.disposeObject(this.lootInstances.root);
    }
    this.lootInstances = new LootInstances(this.loot.filter((l) => !l.used));
    this.world.add(this.lootInstances.root);
    this.lootInstances.update(this.time ?? 0);
  }
  buildGun() {
    this.camera.add(this.gun);
    this.gunModels = WEAPONS.map((_, i) => {
      const model = weaponModel(i, 'held');
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
  canUseAirWeapon() {
    const me = this.networkRoom?.players.find(
      (p) => p.id === this.network?.playerId,
    );
    return canGlideFire(
      this.state.dropping,
      !!this.state.onBus,
      this.network ? me?.launchAt : this.launchAt * 1000,
      this.network ? (this.networkRoom?.now ?? 0) : this.time * 1000,
    );
  }
  canUseWeapon() {
    return !this.state.dropping || this.canUseAirWeapon();
  }
  showWeapon() {
    const index = this.state.weapon;
    this.gun.visible =
      this.state.phase === 'playing' &&
      this.state.health > 0 &&
      index >= 0 &&
      this.state.owned[index] &&
      !this.thirdPerson() &&
      !this.isPunching() &&
      !(this.aiming && index === 2) &&
      !this.isDowned() &&
      this.canUseWeapon();
    this.gunModels?.forEach((model, i) => {
      const tier = this.state.tiers?.[i] ?? 0;
      if (model.userData.rarity !== tier) {
        model.removeFromParent();
        this.disposeObject(model);
        model = weaponModel(i, 'held', tier);
        this.gunModels[i] = model;
        this.gun.add(model);
      }
      model.visible = i === index;
    });
    this.flash.position.set(
      0,
      0.025,
      [-0.74, -0.85, -1.12, -0.38, -0.43, -0.8, -0.93, -0.61][index] ?? -0.74,
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
      b.mesh.removeFromParent();
      this.disposeObject(b.mesh);
    }
    this.bots = [];
    for (let i = 0; i < count; i++) this.bots.push(this.createBot(i, count));
  }
  createBot(i: number, count: number): Bot {
    const g = characterModel(i % 4);
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
      r = (62 + (i % 4) * 9) * ARENA_SCALE;
    g.position.copy(this.safePosition(Math.sin(a) * r, Math.cos(a) * r));
    (this.isGunGame() && this.arenaActors ? this.arenaActors : this.world).add(
      g,
    );
    g.userData.bot = i;
    g.traverse((c) => {
      c.userData.bot = i;
    });
    return {
      mesh: g,
      hp: 100,
      shield: 50,
      cooldown: 2 + i * 0.2,
      target: null,
      thinkAt: i * 0.025,
      seed: i * 0.7,
      name: names[i] ?? 'Player',
      tag,
      armed: false,
      dropping: false,
      dying: 0,
      deathY: 0,
    };
  }
  syncRemotePlayers(remotes: RoomSnapshot['players']) {
    const existing = new Map(this.bots.map((bot) => [bot.remoteId, bot]));
    const retained = new Set<Bot>();
    const next = remotes.map((player, i) => {
      const bot = existing.get(player.id) ?? this.createBot(i, remotes.length);
      if (bot.remoteId !== player.id) {
        bot.remoteId = player.id;
        bot.mesh.position.set(player.x, player.y - 1.7, player.z);
        bot.remoteTarget = new THREE.Vector3();
      }
      if (bot.mesh.userData.bot !== i)
        bot.mesh.traverse((object) => {
          object.userData.bot = i;
        });
      retained.add(bot);
      return bot;
    });
    for (const bot of this.bots) {
      if (retained.has(bot)) continue;
      bot.mesh.removeFromParent();
      this.disposeObject(bot.mesh);
    }
    this.bots = next;
  }
  bind() {
    const on = (target: EventTarget, type: string, fn: EventListener) => {
      target.addEventListener(type, fn);
      this.cleanup.push(() => target.removeEventListener(type, fn));
    };
    on(document, 'keydown', ((e: KeyboardEvent) => {
      if (
        e.code === 'Tab' &&
        !this.menuOpen &&
        this.network &&
        this.state.phase !== 'lobby'
      ) {
        e.preventDefault();
        if (!e.repeat) this.showScoreboard(true);
        return;
      }
      if (
        !this.menuOpen &&
        ['playing', 'spectating'].includes(this.state.phase) &&
        e.code === 'KeyM'
      ) {
        e.preventDefault();
        if (!e.repeat) this.toggleMap();
        return;
      }
      if (this.state.mapOpen) {
        if (e.code === 'Escape') {
          e.preventDefault();
          this.toggleMap();
        }
        return;
      }

      if (this.state.phase === 'spectating' && !this.menuOpen) {
        if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
          e.preventDefault();
          this.spectate(e.code === 'BracketLeft' ? -1 : 1);
        }
        return;
      }
      if (this.state.phase !== 'playing' || this.menuOpen) return;
      if (e.metaKey || e.altKey) return;
      if (
        [
          'Space',
          'ControlLeft',
          'ControlRight',
          'KeyZ',
          'Tab',
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
        ].includes(e.code)
      )
        e.preventDefault();
      this.keys.add(e.code);
      if (!e.repeat && e.code === 'KeyZ') this.setAiming(true);
      if (e.code === 'KeyR') this.reload();
      if (!e.repeat && e.code === 'KeyV')
        this.setPerspective(this.perspective === 'third' ? 'first' : 'third');
      if (!e.repeat && e.code === 'KeyB') this.melee();
      if (!e.repeat && e.code === 'KeyE') this.interact();
      if (!e.repeat && e.code === 'KeyG') this.mark();
      if (!e.repeat && e.code === 'KeyH') this.throwSmoke();
      if (!e.repeat && e.code === 'KeyQ') this.heal('medkit');
      if (!e.repeat && e.code === 'KeyF') this.heal('shield');
      if (!e.repeat && e.code === 'KeyX') {
        this.network?.send({ type: 'cancelReboot' });
        this.cancelHeal();
        this.network?.send({ type: 'cancelRevive' });
      }
      if (/^Digit[1-8]$/.test(e.code)) {
        const slot = Number(e.code.slice(-1)) - 1;
        this.selectWeapon(
          this.practice ? slot : (this.preferences?.slots ?? [0, 1, 2])[slot],
        );
      }
      if (
        !e.repeat &&
        e.code === 'KeyC' &&
        this.preferences.crouch === 'toggle'
      )
        this.crouchToggle = !this.crouchToggle;
      if (
        !e.repeat &&
        (e.code === 'ShiftLeft' || e.code === 'ShiftRight') &&
        this.preferences.sprint === 'toggle'
      )
        this.sprintToggle = !this.sprintToggle;
      if (!e.repeat && e.code === 'Space') this.jump();
      if (e.code === 'Escape') this.pause();
    }) as EventListener);
    on(this.renderer.domElement, 'wheel', ((e: WheelEvent) => {
      if (this.state.phase !== 'playing' || this.menuOpen) return;
      e.preventDefault();
      if (Math.abs(e.deltaY) < 1 || performance.now() - this.wheelAt < 140)
        return;
      this.wheelAt = performance.now();
      this.selectWeapon(
        this.practice || this.isGunGame()
          ? cycleWeapon(this.state.weapon, this.state.owned, e.deltaY)
          : this.cycleSlots(e.deltaY),
      );
    }) as EventListener);
    on(document, 'keyup', ((e: KeyboardEvent) => {
      if (e.code === 'Tab') {
        this.showScoreboard(false);
        return;
      }
      this.keys.delete(e.code);
      if (e.code === 'KeyZ') {
        e.preventDefault();
        this.setAiming(
          this.mouseAimHeld && !this.state.mapOpen && !this.menuOpen,
        );
      }
    }) as EventListener);
    on(document, 'mousemove', ((e: MouseEvent) => {
      if (
        document.pointerLockElement === this.renderer.domElement &&
        this.state.phase === 'playing' &&
        !this.state.mapOpen
      )
        this.look(e.movementX, e.movementY);
    }) as EventListener);
    on(this.renderer.domElement, 'mousedown', ((e: MouseEvent) => {
      if (this.state.phase === 'playing' && !this.state.mapOpen) {
        if (e.button === 0) {
          this.triggerHeld = false;
          this.shooting = true;
        }
        if (e.button === 2) {
          this.mouseAimHeld = true;
          this.setAiming(true);
        }
        if (e.button === 1) {
          e.preventDefault();
          this.mark();
        }
      }
    }) as EventListener);
    on(document, 'mouseup', ((e: MouseEvent) => {
      if (e.button === 0) {
        this.shooting = false;
        this.triggerHeld = false;
      }
      if (e.button === 2) {
        this.mouseAimHeld = false;
        if (!this.touch) this.setAiming(this.keys.has('KeyZ'));
      }
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
    if (this.practice) return;
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
    if (
      this.isDowned() ||
      this.state.phase !== 'playing' ||
      this.state.dropping ||
      this.mantle
    )
      return;
    const station = this.nearReboot();
    if (station >= 0) {
      this.network?.send({ type: 'reboot', station });
      return;
    }
    if (this.nearSupply()) {
      if (this.network) this.network.send({ type: 'supply' });
      else if (this.localSupply) {
        this.localSupply.opened = true;
        for (const drop of supplyLoot(this.localSupply)) this.addLoot(drop);
        this.rebuildLoot();
        this.notice('Supply drop opened. Epic or legendary gear awaits.');
      }
      return;
    }
    const chest = this.nearestChest();
    if (chest >= 0) {
      if (this.network) this.network.send({ type: 'chest', index: chest });
      else {
        this.openChest(chest);
        this.notice('Treasure found. Press E to collect your loot.');
      }
      return;
    }
    this.pickup();
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
      point.distanceTo(this.position) > 180 * ARENA_SCALE ||
      Math.hypot(point.x, point.z) > ARENA_RADIUS
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
  thirdPerson() {
    return (
      this.perspective === 'third' && !(this.aiming && this.state.weapon === 2)
    );
  }
  setPerspective(value: 'first' | 'third') {
    this.perspective = value;
    this.state.perspective = value;
    try {
      if (typeof window !== 'undefined')
        window.localStorage.setItem('sandbox-perspective', value);
    } catch {}
    this.showWeapon();
    if (this.avatar) this.avatar.visible = false;
    this.emit();
  }
  updatePlayerCamera() {
    if (this.state.onBus) {
      this.camera.position.set(
        this.position.x + Math.sin(this.yaw) * 18,
        this.position.y + 12,
        this.position.z + Math.cos(this.yaw) * 18,
      );
      this.camera.lookAt(
        this.position.x,
        this.position.y + 5 + Math.sin(this.pitch) * 8,
        this.position.z,
      );
      if (this.avatar) this.avatar.visible = false;
      return;
    }
    const eye = this.position.clone();
    eye.y -= this.crouchOffset || 0;
    if (this.isDowned()) eye.y -= 0.95;
    const pitch = THREE.MathUtils.clamp(
      this.pitch + (this.viewKick || 0),
      -1.35,
      1.35,
    );
    let distance = 0;
    if (this.thirdPerson()) {
      const view = shoulderCamera(
        eye,
        this.yaw,
        pitch,
        this.aiming,
        this.colliders,
      );
      this.camera.position.copy(view.position);
      this.camera.lookAt(view.target);
      distance = view.distance;
    } else {
      this.camera.position.copy(eye);
      this.camera.rotation.set(pitch, this.yaw, 0, 'YXZ');
    }
    if (this.thirdPerson() && !this.avatar) {
      this.avatar = characterModel(0);
      this.scene.add(this.avatar);
    }
    if (this.avatar) {
      this.avatar.visible = this.thirdPerson() && distance > 0.85;
      if (this.avatar.visible) {
        const me = this.networkRoom?.players.find(
          (p) => p.id === this.network?.playerId,
        );
        setCharacterSkin(
          this.avatar,
          this.networkRoom?.mode === 'team-deathmatch' && me
            ? 4 + (me.team ?? 0)
            : me
              ? skinIndex(me.name)
              : 0,
        );
        this.avatar.position.copy(this.position).y -= 1.7;
        this.avatar.rotation.set(0, this.yaw + Math.PI, 0);
        this.avatar.scale.set(
          1,
          this.isDowned() ? 0.38 : 1 - ((this.crouchOffset || 0) / 0.65) * 0.34,
          1,
        );
        animateCharacter(
          this.avatar,
          this.time * (this.state.sprinting ? 13 : 10),
          Math.min((this.motion?.length() ?? 0) / MOVE.run, 1) * 0.5,
        );
        const index = this.state.weapon,
          tier = this.state.tiers?.[index] ?? 0;
        let held = this.avatar.getObjectByName('Player weapon');
        if (
          index >= 0 &&
          (!held ||
            held.userData.weapon !== index ||
            held.userData.rarity !== tier)
        ) {
          if (held) {
            held.removeFromParent();
            this.disposeObject(held);
          }
          held = weaponModel(index, 'world', tier);
          held.name = 'Player weapon';
          held.userData.weapon = index;
          held.scale.setScalar(0.8);
          this.avatar.add(held);
        }
        if (held) {
          held.visible = index >= 0 && !this.isDowned() && this.canUseWeapon();
          const reload =
            this.reloadTimer > 0 && index >= 0
              ? 1 - this.reloadTimer / WEAPONS[index].reload
              : 0;
          const pose = reloadMotion(index, reload);
          held.position.set(0.35 + pose.x, 1.35 + pose.y, 0.25 - this.recoil);
          held.rotation.set(
            -this.pitch + pose.rx + this.recoil * 0.45,
            Math.PI,
            pose.rz,
          );
          if (held.visible) {
            const right = this.avatar.getObjectByName('Right arm');
            const left = this.avatar.getObjectByName('Left arm');
            if (right) right.rotation.x = -1.15 - this.pitch;
            if (left) left.rotation.x = -0.95 - this.pitch + pose.work * 0.7;
          }
        }
      }
    }
  }
  playWeapon(index: number, source?: THREE.Vector3) {
    if (this.muted || !this.audio || index < 0 || index >= WEAPONS.length)
      return;
    this.weaponAudio ??= new WeaponAudio(this.audio);
    const delta = source?.clone().sub(this.camera.position);
    const distance = delta?.length() ?? 0;
    const pan = delta
      ? delta
          .normalize()
          .dot(new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)))
      : 0;
    this.weaponAudio.shot(index, distance, pan);
  }
  weaponClick(index: number, phase = 0) {
    if (this.muted || !this.audio) return;
    this.weaponAudio ??= new WeaponAudio(this.audio);
    this.weaponAudio.mechanical(index, phase);
  }
  updateWeaponFeel() {
    const i = this.state.weapon;
    if (i < 0) return;
    const progress =
      this.reloadTimer > 0
        ? Math.max(0, 1 - this.reloadTimer / WEAPONS[i].reload)
        : null;
    if (progress !== null) {
      const cues = i === 1 ? [0.15, 0.4, 0.65, 0.9] : [0.12, 0.55, 0.87];
      while (this.reloadCue < cues.length && progress >= cues[this.reloadCue]) {
        this.weaponClick(i, this.reloadCue === cues.length - 1 ? 2 : 0);
        this.reloadCue++;
      }
    }
    const since = this.time - this.lastShotAt;
    if (
      !this.actionPlayed &&
      this.shotWeapon === i &&
      progress === null &&
      since >= 0.24
    ) {
      if (i === 1 || i === 2 || i === 7) this.weaponClick(i, 2);
      this.actionPlayed = true;
    }
    const pose = reloadMotion(i, progress ?? 0);
    if (this.weaponSway) {
      this.gun.position.x -= this.weaponSway.x * (this.aiming ? 0.25 : 1);
      this.gun.position.y +=
        this.weaponSway.y * (this.aiming ? 0.25 : 1) -
        (this.landingKick ?? 0) * 0.07;
    }
    if (this.state.sprinting) {
      pose.rx += 0.25;
      pose.rz -= 0.22;
      pose.y -= 0.045;
    }
    this.gun.position.x += pose.x;
    this.gun.position.y += pose.y;
    this.gun.position.z += pose.z;
    this.gun.rotation.set(pose.rx + this.recoil * 0.45, 0, pose.rz);
    const model = this.gunModels?.[i];
    if (model)
      animateWeapon(model, i, progress, this.shotWeapon === i ? since : 100);
  }
  setAiming(aiming: boolean) {
    this.aiming =
      aiming &&
      this.state.phase === 'playing' &&
      this.state.weapon >= 0 &&
      !this.state.healing &&
      !this.state.reloading &&
      !this.isPunching() &&
      this.canUseWeapon() &&
      !this.isDowned();
    this.showWeapon();
    this.emit();
  }
  look(x: number, y: number) {
    if (this.weaponSway) {
      this.weaponSway.x = THREE.MathUtils.clamp(
        this.weaponSway.x + x * 0.00015,
        -0.025,
        0.025,
      );
      this.weaponSway.y = THREE.MathUtils.clamp(
        this.weaponSway.y + y * 0.00015,
        -0.02,
        0.02,
      );
    }
    const speed = this.aiming
      ? (this.preferences?.aim ?? 0.7) * (this.state.weapon === 2 ? 0.65 : 1)
      : this.sensitivity;
    this.yaw -= x * 0.002 * speed;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch - y * 0.002 * speed,
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
  toggleMap() {
    this.state.mapOpen = !this.state.mapOpen;
    this.shooting = false;
    this.triggerHeld = false;
    this.setAiming(false);
    this.keys.clear();
    this.mouseAimHeld = false;
    this.touchMove = { x: 0, y: 0 };
    this.emit();
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
        smokes: 0,
        supply: undefined,
        medkits: 0,
        cells: 0,
        healing: null,
        healUntil: 0,
        healRemaining: 0,
        dropping: true,
        onBus: true,
        mapOpen: false,
        busRemaining: BUS_SECONDS,
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
        storm: INITIAL_CIRCLE,
        rank: 16,
        notice: 'Find a weapon drop. Press E to collect it.',
        hit: 0,
        hurt: 0,
        pickup: '',
        outside: false,
        reloading: false,
        aiming: false,
      };
      this.state.tiers = [0, 0, 0];
      this.state.crouching = false;
      this.state.sprinting = false;
      this.mantle = undefined;
      this.crouchToggle = false;
      this.crouchOffset = 0;
      this.motion?.set(0, 0);
      const bus = busPosition(0);
      this.position.set(bus.x, bus.y, bus.z);
      this.liftRemaining = 0;
      this.launchAt = -100;
      this.yaw = 0;
      this.pitch = -0.6;
      this.velocityY = 0;
      this.weaponAmmo = [0, 0, 0];
      this.reserveAmmo = [0, 0, 0];
      this.reloadTimer = 0;
      this.meleeAt = -100;
      this.zoneCue = '';
      this.cooldown = 0.3;
      this.resetBots();
      this.bots.forEach((b, i) => {
        b.mesh.position.set(bus.x, bus.y - 1.7, bus.z);
        b.busJumpAt = 1 + i * 1.05;
        b.dropping = true;
      });
      this.spawnLoot();
      this.noticeTimer = 5;
      this.zoneSeed = String(Math.random());
      this.resetChests(this.zoneSeed);
      this.localSmokes = [];
      this.localSupply = supplyPlan(this.zoneSeed);
      this.state.zone = zoneAt(0, this.zoneSeed);
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
    this.sprintToggle = false;
    this.state.scoreboardOpen = false;
    if (this.state.phase !== 'playing') return;
    this.state.phase = 'paused';
    this.state.mapOpen = false;
    this.keys.clear();
    this.mouseAimHeld = false;
    this.shooting = false;
    this.aiming = false;
    this.touchMove = { x: 0, y: 0 };
    if (document.pointerLockElement) document.exitPointerLock();
    this.emit();
  }
  lobby() {
    if (this.practice) {
      this.stopPractice();
      return;
    }
    this.setArena(false);
    this.particles?.clear();
    this.state.scoreboardOpen = false;
    this.state.phase = 'lobby';
    this.state.mapOpen = false;
    this.state.spectator = null;
    this.spectatorId = null;
    this.keys.clear();
    this.mouseAimHeld = false;
    this.shooting = false;
    this.aiming = false;
    this.gun.visible = false;
    this.storm.visible = false;
    if (document.pointerLockElement) document.exitPointerLock();
    this.emit();
  }
  cycleSlots(direction: number) {
    const slots = this.preferences?.slots ?? [0, 1, 2];
    const owned = slots.map((w) => !!this.state.owned[w]);
    return (
      slots[cycleWeapon(slots.indexOf(this.state.weapon), owned, direction)] ??
      this.state.weapon
    );
  }
  selectWeapon(index: number) {
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= WEAPONS.length ||
      !this.state.owned[index]
    )
      return;
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
    if (!this.canUseWeapon()) return;
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
    this.reloadCue = 0;
    this.actionPlayed = true;
    this.setAiming(false);
    this.weaponClick(i);
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
      const inv = {
        owned: this.state.owned,
        tiers: this.state.tiers,
        ammo: this.weaponAmmo,
        reserve: this.reserveAmmo,
        weapon: this.state.weapon,
        medkits: this.state.medkits,
        cells: this.state.cells,
      };
      const { first, swapped } = collectGun(inv, l);
      if (swapped !== null) {
        const old = {
          x: l.mesh.position.x,
          z: l.mesh.position.z,
          kind: l.kind,
          rarity: swapped,
          ammo: 0,
          used: false,
        };
        this.state.tiers = inv.tiers;
        this.selectWeapon(l.kind);
        if (this.loot.indexOf(l) >= MAP.loot.length) {
          this.replaceLoot(this.loot.indexOf(l), old);
          this.rebuildLoot();
          this.notice(
            `${RARITIES[l.rarity].name} ${WEAPONS[l.kind].name} · swapped`,
          );
          this.sound(620, 0.16, 0.07, 'sine');
          this.emit();
          return;
        }
        this.addLoot(old);
      }
      this.state.tiers = inv.tiers;
      this.selectWeapon(l.kind);
      this.showWeapon();
      this.notice(
        `${RARITIES[l.rarity].name} ${WEAPONS[l.kind].name} · ${first ? 'collected' : 'swapped'}`,
      );
    }
    if (l.kind === 8) {
      const take = Math.min(2 - (this.state.smokes ?? 0), l.amount ?? 1);
      if (!take) {
        this.notice('Smoke inventory full');
        return;
      }
      this.state.smokes = (this.state.smokes ?? 0) + take;
      l.amount = (l.amount ?? 1) - take;
      this.notice('Smoke grenade stored. Press H to throw.');
    }
    if (l.kind === 3 || l.kind === 4) {
      const item = l.kind === 3 ? 'shield' : 'medkit',
        supply = SUPPLIES[item];
      if (this.state[supply.slot] >= SUPPLY_LIMIT) {
        this.notice(`${supply.name} inventory full`);
        return;
      }
      const collected = Math.min(
        SUPPLY_LIMIT - this.state[supply.slot],
        l.amount ?? 1,
      );
      this.state[supply.slot] += collected;
      l.amount = (l.amount ?? 1) - collected;
      this.notice(
        `${supply.name} stored. Press ${item === 'medkit' ? 'Q' : 'F'} to use.`,
      );
    }
    l.used = l.kind < 3 || (l.amount ?? 0) <= 0;
    l.mesh.visible = !l.used;
    this.rebuildLoot();
    this.sound(620, 0.16, 0.07, 'sine');
    this.emit();
  }
  autoAmmo() {
    if (this.practice) return;
    if (
      this.network ||
      this.state.phase !== 'playing' ||
      this.state.dropping ||
      this.isDowned() ||
      this.mantle
    )
      return;
    const inv = {
      owned: this.state.owned,
      ammo: this.weaponAmmo,
      reserve: this.reserveAmmo,
    };
    for (const l of this.loot) {
      if (
        !isAmmo(l.kind) ||
        l.used ||
        !canReach(
          this.position,
          { x: l.mesh.position.x, y: 0.65, z: l.mesh.position.z },
          this.physicsBounds(),
          2.5,
        )
      )
        continue;
      const drop: WorldDrop = {
        x: l.mesh.position.x,
        z: l.mesh.position.z,
        kind: l.kind,
        rarity: 0,
        amount: l.amount,
        used: l.used,
      };
      const taken = collectAmmo(inv, drop, !this.state.reloading);
      l.amount = drop.amount;
      l.used = drop.used;
      l.mesh.visible = !l.used;
      if (taken) {
        this.notice(`+${taken} ${AMMO_TYPES[l.kind - 5].name}`);
        this.sound(680, 0.09, 0.025, 'sine');
      }
    }
  }
  nearestLoot() {
    if (this.isGunGame()) return undefined;
    let nearest: Loot | undefined,
      distance = 3.8 * 3.8;
    for (const loot of this.loot) {
      if (
        loot.used ||
        isAmmo(loot.kind) ||
        !canReach(
          this.position,
          { x: loot.mesh.position.x, y: 0.85, z: loot.mesh.position.z },
          this.physicsBounds(),
        ) ||
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
    if (this.isGunGame() && this.networkRoom?.phase === 'playing') return;
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
      !this.canUseWeapon() ||
      this.mantle ||
      this.state.phase !== 'playing' ||
      this.isDowned()
    )
      return;
    if (this.state.weapon < 0) {
      this.melee();
      return;
    }
    if (!this.state.owned[this.state.weapon]) return;
    this.cancelHeal(false);
    const i = this.state.weapon,
      w = WEAPONS[i];
    if (this.network && this.networkRoom?.phase !== 'playing') return;
    if (this.cooldown > 0 || this.reloadTimer > 0) return;
    if (this.weaponAmmo[i] === 0) {
      this.reload();
      return;
    }
    if (!automaticWeapon(i) && this.triggerHeld) return;
    this.triggerHeld = true;
    if (this.practice) this.state.practiceHit = undefined;
    this.weaponAmmo[i]--;
    if (this.practice) this.reserveAmmo[i] = 999;
    this.cooldown = w.interval;
    this.recoil = FEEL[i].kick;
    this.lastShotAt = this.time;
    this.shotWeapon = i;
    this.actionPlayed = false;
    this.flash.visible = true;
    this.playWeapon(i);
    this.fx(
      this.camera.localToWorld(new THREE.Vector3(0.3, -0.15, -0.5)),
      'casing',
      1,
    );
    this.scene.updateMatrixWorld(true);
    let hit = false;
    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const direction = this.camera.getWorldDirection(new THREE.Vector3());
    let aim = convergedAim(origin, origin.clone().add(direction));
    const enemies = this.practice
      ? (this.range?.targets ?? [])
      : this.bots.filter((b) => b.hp > 0).map((b) => b.mesh);
    if (this.thirdPerson()) {
      this.ray.set(origin, direction);
      const target =
        this.ray.intersectObjects([...this.solids, ...enemies], true)[0]
          ?.point ?? origin.clone().addScaledVector(direction, w.range);
      origin.copy(this.position);
      origin.y -= this.state.crouching ? 0.65 : 0;
      aim = convergedAim(origin, target);
    }
    if (this.network)
      this.network.send({
        type: 'shoot',
        pose: this.pose(aim),
        aiming: this.aiming,
      });
    this.viewKick = Math.min(0.06, (this.viewKick || 0) + FEEL[i].view);
    for (let p = 0; p < w.pellets; p++) {
      this.ray.set(
        origin,
        new THREE.Vector3(
          ...shotDirection(
            aim.yaw,
            aim.pitch,
            this.state.weapon,
            this.aiming,
            p,
          ),
        ),
      );
      const enemies = this.practice
        ? (this.range?.targets ?? [])
        : this.bots.filter((b) => b.hp > 0).map((b) => b.mesh);
      const hits = this.ray.intersectObjects(
        [...this.solids, ...enemies],
        true,
      );
      const first = hits.find((h) => h.distance < w.range);
      if (
        this.practice &&
        first &&
        first.object.userData.practiceTarget !== undefined
      ) {
        const headshot = first.point.y > 2;
        const damage =
          weaponDamage(i, first.distance) *
          (headshot ? HEADSHOT_MULTIPLIER : 1);
        const previous = this.state.practiceHit;
        this.state.practiceHit = {
          damage: (p > 0 ? (previous?.damage ?? 0) : 0) + damage,
          distance: Math.round(first.distance),
          headshot,
        };
        this.hitFeedback(damage, 0, headshot, false);
        hit = true;
        const target =
          this.range!.targets[first.object.userData.practiceTarget];
        target.userData.hitAt = this.time;
      }
      if (
        !this.practice &&
        !this.network &&
        first &&
        first.object.userData.bot !== undefined
      ) {
        const b = this.bots[first.object.userData.bot];
        if (b.hp > 0) {
          const headshot = first.point.y - b.mesh.position.y > 1.72;
          const before = b.hp + b.shield,
            oldShield = b.shield;
          const result = takeDamage(
            b.hp,
            b.shield,
            weaponDamage(
              this.state.weapon,
              first.distance,
              this.state.tiers?.[this.state.weapon] ?? 0,
            ) * (headshot ? HEADSHOT_MULTIPLIER : 1),
          );
          b.hp = result.health;
          b.shield = result.shield;
          if (oldShield > 0 && !b.shield)
            this.fx(
              {
                x: b.mesh.position.x,
                y: b.mesh.position.y + 1,
                z: b.mesh.position.z,
              },
              'shield',
              8,
            );
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
        : this.ray.ray.at(w.range, new THREE.Vector3());
      this.tracer(
        this.thirdPerson()
          ? origin
          : this.camera.localToWorld(new THREE.Vector3(0.2, -0.17, -0.7)),
        end,
        '#fff0a3',
        Boolean(first),
      );
    }
    if (hit) {
      this.state.hit = 0.18;
      this.sound(900, 0.06, 0.035, 'sine');
    }
    this.emit();
  }
  tracer(
    from: THREE.Vector3,
    to: THREE.Vector3,
    color: string,
    impact = false,
  ) {
    // Bound bursts even when several shotguns fire together.
    if (this.tracers.length >= 96) disposeTrail(this.tracers.shift()!.mesh);
    if (impact) this.fx(to, 'sand', 2);
    const line = bulletTrail(from, to, color, impact);
    this.scene.add(line);
    this.tracers.push({ mesh: line, life: 0.18 });
  }
  isPunching() {
    return this.time - (this.meleeAt ?? -100) < MELEE.animation;
  }
  buildFists() {
    this.fists = new THREE.Group();
    for (const side of [-1, 1]) {
      const kit = modelKit('Glove');
      kit.box(0.16, 0.17, 0.23, '#283c46', 0, 0, 0, 0.035);
      kit.box(0.17, 0.07, 0.12, '#8de0cf', 0, -0.02, 0.15, 0.025);
      const hand = kit.finish();
      hand.userData.side = side;
      this.fists.add(hand);
    }
    this.fists.visible = false;
    this.camera.add(this.fists);
  }
  animatePunch(root: THREE.Group, at: number) {
    const age = this.time - at;
    if (age < 0 || age >= MELEE.animation) return false;
    const reach = Math.sin((Math.PI * age) / MELEE.animation);
    const arm = root.getObjectByName('Right arm');
    if (arm) {
      arm.rotation.x = -1.0 - reach * 1.55;
      arm.rotation.z = -reach * 0.12;
    }
    const held =
      root.getObjectByName('Player weapon') ??
      root.getObjectByName('Bot weapon');
    if (held) held.visible = false;
    return true;
  }
  updateMelee() {
    if (this.fists) {
      this.fists.visible =
        this.state.phase === 'playing' &&
        !this.thirdPerson() &&
        !this.isDowned() &&
        !this.state.dropping &&
        (this.state.weapon < 0 || this.isPunching());
      const age = this.time - (this.meleeAt ?? -100),
        reach = this.isPunching()
          ? Math.sin((Math.PI * age) / MELEE.animation)
          : 0;
      for (const hand of this.fists.children) {
        const side = hand.userData.side;
        hand.position.set(
          side * (0.3 - (side > 0 ? reach * 0.19 : 0)),
          -0.3 + (side > 0 ? reach * 0.13 : 0),
          -0.48 - (side > 0 ? reach * 0.42 : 0),
        );
        hand.rotation.set(side > 0 ? -reach * 0.35 : 0, -side * 0.15, 0);
      }
    }
    if (this.avatar?.visible) {
      const arm = this.avatar.getObjectByName('Right arm');
      if (arm) arm.rotation.z = 0;
      this.animatePunch(this.avatar, this.meleeAt ?? -100);
    }
    if (this.state.phase === 'playing') this.showWeapon();
  }
  melee() {
    if (
      this.state.phase !== 'playing' ||
      this.state.dropping ||
      this.isDowned() ||
      this.mantle ||
      this.cooldown > 0 ||
      (this.network && this.networkRoom?.phase !== 'playing')
    )
      return;
    this.cancelHeal(false);
    this.reloadTimer = 0;
    this.state.reloading = false;
    this.aiming = false;
    this.meleeAt = this.time;
    this.cooldown = MELEE.interval;
    this.actionPlayed = true;
    this.showWeapon();
    this.sound(210, 0.12, 0.025, 'triangle');
    if (this.network) {
      this.network.send({ type: 'melee', pose: this.pose() });
      this.emit();
      return;
    }
    const origin = {
      x: this.position.x,
      y: this.position.y - (this.state.crouching ? 0.65 : 0),
      z: this.position.z,
    };
    if (this.practice) {
      this.emit();
      return;
    }
    const contact = meleeTarget(
      origin,
      this.yaw,
      this.pitch,
      this.bots.flatMap((b, i) =>
        b.hp > 0
          ? [
              meleeBody(
                String(i),
                b.mesh.position.x,
                b.mesh.position.y + 1.7,
                b.mesh.position.z,
              ),
            ]
          : [],
      ),
      this.colliders.map((b) => ({
        min: b.min.toArray(),
        max: b.max.toArray(),
      })),
    );
    if (contact) {
      const b = this.bots[Number(contact.id)],
        oldShield = b.shield;
      const amount = Math.min(MELEE.damage, b.hp + b.shield),
        result = takeDamage(b.hp, b.shield, amount);
      b.hp = result.health;
      b.shield = result.shield;
      this.hitFeedback(
        amount,
        Math.min(oldShield, amount),
        false,
        oldShield > 0 && b.shield === 0,
      );
      this.sound(90, 0.12, 0.05, 'triangle');
      if (b.hp <= 0) this.killBot(b, true);
    }
    this.emit();
  }
  updateZoneCue() {
    const zone = this.state.zone;
    const material = this.storm.material;
    if (material instanceof THREE.ShaderMaterial) {
      material.uniforms.time.value = this.time;
      material.uniforms.closing.value = zone?.stage === 'closing' ? 1 : 0;
    }
    if (!zone || this.state.dropping) return;
    const cue = `${zone.phase}:${zone.stage}:${zone.stage === 'waiting' && zone.remaining <= 5 ? 'soon' : ''}`;
    if (cue !== this.zoneCue) {
      this.zoneCue = cue;
      if (zone.stage === 'closing') this.sound(420, 0.65, 0.045, 'sine');
      else if (zone.stage === 'waiting' && zone.remaining <= 5)
        this.sound(620, 0.3, 0.035, 'sine');
    }
  }
  beginBotDeath(b: Bot) {
    this.fx(
      { x: b.mesh.position.x, y: b.mesh.position.y + 1, z: b.mesh.position.z },
      'elimination',
      12,
    );
    b.dying = 0.9;
    b.deathY = b.mesh.position.y;
    const chute = b.mesh.getObjectByName('Parachute');
    if (chute) chute.visible = false;
    if (b.tag) b.tag.visible = false;
  }
  killBot(b: Bot, player = false, killer = 'The sandbox') {
    if (!b.dying && !this.network && (b.armed || b.ammunition !== undefined)) {
      const kind = b.mesh.getObjectByName('Bot weapon')?.userData.weapon ?? 0;
      const inv = {
        owned: [0, 1, 2].map((i) => i === kind),
        tiers: [0, 1, 2].map(() => b.rarity ?? 0),
        ammo: [0, 1, 2].map((i) =>
          i === kind ? (b.ammunition ?? WEAPONS[kind].capacity) : 0,
        ),
        reserve: [0, 0, 0],
        weapon: kind,
        medkits: 0,
        cells: 0,
      };
      for (const drop of eliminationDrops(
        inv,
        b.mesh.position.x,
        b.mesh.position.z,
      ))
        this.addLoot(drop);
      this.rebuildLoot();
    }
    this.beginBotDeath(b);
    b.hp = 0;
    if (player) {
      this.state.kills++;
      this.state.eliminationPulse = 1;
      this.notice(`Eliminated ${b.name}`);
    }
    this.addFeed(`${player ? 'You' : killer} eliminated ${b.name}`);
    this.state.alive = this.bots.filter((b) => b.hp > 0).length + 1;
  }
  damage(amount: number, from?: THREE.Vector3, killer = 'The storm') {
    this.state.killer = killer;
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
    this.state.phase =
      this.isGunGame() && this.networkRoom?.phase !== 'finished'
        ? 'spectating'
        : 'lost';
    this.spectatorId = this.killerId;
    if (this.networkRoom?.phase !== 'finished') this.spectate(0);
    this.emit();
  }
  finish(won: boolean) {
    this.state.mapOpen = false;
    this.state.onBus = false;
    if (!this.network) this.state.rank = won ? 1 : this.state.alive;
    if (!won && !this.network) {
      for (const drop of eliminationDrops(
        { ...this.state, ammo: this.weaponAmmo, reserve: this.reserveAmmo },
        this.position.x,
        this.position.z,
      ))
        this.addLoot(drop);
      this.rebuildLoot();
    }
    this.state.survived = this.state.elapsed;
    this.state.phase = won ? 'won' : 'dying';
    this.state.deathRemaining = won ? 0 : 1.4;
    this.state.dropping = false;
    this.gun.visible = false;
    cancelRecovery(this.state);
    this.state.healRemaining = 0;
    this.shooting = false;
    this.keys.clear();
    this.mouseAimHeld = false;
    this.aiming = false;
    if (
      (!this.isGunGame() || won || this.networkRoom?.phase === 'finished') &&
      document.pointerLockElement
    )
      document.exitPointerLock();
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
        if (Math.hypot(nx, nz) < ARENA_RADIUS - 6 && !this.blocked(nx, nz))
          return new THREE.Vector3(nx, 0, nz);
      }
    return new THREE.Vector3(0, 0, 4);
  }
  blocked(x: number, z: number) {
    return this.colliders.some(
      (b) =>
        b.min.y < 1.8 &&
        b.max.y > 0.08 &&
        x > b.min.x - 0.48 &&
        x < b.max.x + 0.48 &&
        z > b.min.z - 0.48 &&
        z < b.max.z + 0.48,
    );
  }
  groundHeight(x: number, z: number, feet: number) {
    if (this.practice) return 0;
    return this.isGunGame()
      ? arenaGround(x, z, feet)
      : groundAt(x, z, feet, this.physicsBounds());
  }
  physicsBounds() {
    if (
      !this.physicsCache ||
      this.physicsCache.length !== this.colliders.length
    )
      this.physicsCache = this.colliders.map((b) => ({
        min: b.min.toArray(),
        max: b.max.toArray(),
      }));
    return this.physicsCache;
  }
  jump() {
    if (this.state.phase === 'playing' && this.state.onBus) {
      if (this.network) {
        if (this.networkRoom?.phase === 'playing')
          this.network.send({ type: 'jumpBus' });
      } else {
        this.state.onBus = false;
        this.notice('Steer toward your landing spot.');
      }
      return;
    }
    if (
      this.state.phase !== 'playing' ||
      this.state.dropping ||
      this.isDowned() ||
      this.mantle
    )
      return;
    const floor =
      this.groundHeight(
        this.position.x,
        this.position.z,
        this.position.y - 1.7,
      ) + 1.7;
    if (Math.abs(this.position.y - floor) > 0.15) return;
    const to = mantleTarget(this.position, this.yaw, this.physicsBounds());
    if (to) {
      this.network?.send({ type: 'mantle', pose: this.pose() });
      this.mantle = {
        from: { x: this.position.x, y: this.position.y, z: this.position.z },
        to,
        at: this.time,
      };
      this.crouchToggle = false;
      this.velocityY = 0;
      this.motion?.set(0, 0);
    } else this.velocityY = MOVE.jump;
  }
  move(pos: THREE.Vector3, dx: number, dz: number, feet = 0) {
    if (this.practice) {
      pos.x = THREE.MathUtils.clamp(pos.x + dx, -14, 14);
      pos.z = THREE.MathUtils.clamp(pos.z + dz, -53, 43);
      return;
    }
    if (this.isGunGame()) {
      const next = arenaMove({ x: pos.x, y: feet + 1.7, z: pos.z }, dx, dz);
      pos.set(next.x, Math.max(pos.y, next.y), next.z);
      const length = Math.hypot(pos.x, pos.z);
      if (length > GUN_RADIUS) {
        pos.x *= GUN_RADIUS / length;
        pos.z *= GUN_RADIUS / length;
      }
      return;
    }

    const airborneDrop = pos === this.position && this.state.dropping;
    if (
      airborneDrop ||
      !blocksBody(pos.x + dx, pos.z, feet, this.physicsBounds())
    )
      pos.x += dx;
    if (
      airborneDrop ||
      !blocksBody(pos.x, pos.z + dz, feet, this.physicsBounds())
    )
      pos.z += dz;
    const length = Math.hypot(pos.x, pos.z);
    if (length > ARENA_RADIUS) {
      pos.x *= ARENA_RADIUS / length;
      pos.z *= ARENA_RADIUS / length;
    }
  }
  visible(from: THREE.Vector3, to: THREE.Vector3) {
    if (smokeBlocks(from, to, this.activeSmokes(), this.state.elapsed * 1000))
      return false;
    const dir = to.clone().sub(from);
    const distance = dir.length();
    this.ray.set(from, dir.normalize());
    const hit = this.ray.intersectObjects(this.solids, false)[0];
    return !hit || hit.distance > distance;
  }
  updateBots(dt: number) {
    for (const b of this.bots) {
      if (b.hp <= 0) continue;
      const p = b.mesh.position;
      if (b.busJumpAt !== undefined && this.state.elapsed < b.busJumpAt) {
        const bus = busPosition(this.state.elapsed);
        p.set(bus.x, bus.y - 1.7, bus.z);
        b.mesh.visible = false;
        continue;
      }
      b.mesh.visible = true;
      b.busJumpAt = undefined;
      if (b.dropping) {
        p.y = glideHeight(p.y + 1.7, dt, b.liftRemaining ?? 0) - 1.7;
        b.liftRemaining = Math.max(0, (b.liftRemaining ?? 0) - dt);
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
            delta.clampLength(0, GLIDE_SPEED * 0.75 * dt);
            p.add(delta);
          }
        }
        continue;
      }
      if (
        this.time - (b.launchAt ?? -100) > 6 &&
        padAt(p.x, p.y + 1.7, p.z) >= 0
      ) {
        b.dropping = true;
        b.liftRemaining = LIFT_SECONDS;
        b.launchAt = this.time;
        continue;
      }
      b.cooldown -= dt;
      const zone = this.state.zone ?? { x: 0, z: 0, radius: this.state.storm };
      const safe = !outsideZone(p.x, p.z, {
        ...zone,
        radius: Math.max(0, zone.radius - 3),
      });
      const botKind =
        b.mesh.getObjectByName('Bot weapon')?.userData.weapon ?? 0;
      if (b.armed)
        for (const l of this.loot) {
          if (
            l.used ||
            l.kind !== botKind + 5 ||
            !canReach(
              { x: p.x, y: 1.7, z: p.z },
              { x: l.mesh.position.x, y: 0.65, z: l.mesh.position.z },
              this.physicsBounds(),
              2.8,
            )
          )
            continue;
          b.ammunition = (b.ammunition ?? 0) + (l.amount ?? 0);
          l.amount = 0;
          l.used = true;
          l.mesh.visible = false;
        }
      if (!b.armed || !b.ammunition) {
        const chest = this.nearestChest(new THREE.Vector3(p.x, 1.7, p.z));
        if (chest >= 0) this.openChest(chest);
        const supply = this.loot
          .filter(
            (l) => !l.used && (b.armed ? l.kind === botKind + 5 : l.kind < 3),
          )
          .sort(
            (a, c) =>
              a.mesh.position.distanceToSquared(p) -
              c.mesh.position.distanceToSquared(p),
          )[0];
        const treasure = (this.chests ?? [])
          .map((c, i) => ({ c, i, p: CHEST_SPOTS[i] }))
          .filter((v) => v.c.active && !v.c.openedAt)
          .sort(
            (a, c) =>
              Math.hypot(a.p.x - p.x, a.p.z - p.z) -
              Math.hypot(c.p.x - p.x, c.p.z - p.z),
          )[0];
        if (
          treasure &&
          safe &&
          (!supply ||
            Math.hypot(treasure.p.x - p.x, treasure.p.z - p.z) <
              supply.mesh.position.distanceTo(p))
        ) {
          const direction = Math.atan2(treasure.p.x - p.x, treasure.p.z - p.z);
          this.moveBot(b, direction, 5 * dt);
          b.mesh.rotation.y = direction;
          continue;
        }
        if (supply) {
          if (supply.mesh.position.distanceTo(p) < 2.8) {
            if (isAmmo(supply.kind)) {
              b.ammunition = (b.ammunition ?? 0) + (supply.amount ?? 0);
              supply.amount = 0;
              supply.used = true;
              continue;
            }
            b.armed = true;
            b.rarity = supply.rarity;
            b.ammunition = 0;
            supply.used = true;
            supply.mesh.visible = false;
            const oldGun = b.mesh.getObjectByName('Bot weapon');
            if (oldGun) {
              oldGun.removeFromParent();
              this.disposeObject(oldGun);
            }
            const held = weaponModel(supply.kind, 'world', supply.rarity);
            held.name = 'Bot weapon';
            held.userData.weapon = supply.kind;
            held.traverse((o) => {
              o.userData.bot = b.mesh.userData.bot;
            });
            held.scale.setScalar(0.8);
            held.rotation.y = Math.PI;
            held.position.set(0.35, 1.35, 0.25);
            b.mesh.add(held);
          } else {
            const direction = Math.atan2(
              supply.mesh.position.x - p.x,
              supply.mesh.position.z - p.z,
            );
            if (safe) {
              this.moveBot(b, direction, 4 * dt);
              b.mesh.rotation.y = direction;
              animateCharacter(b.mesh, this.time * 9 + b.seed, 0.3);
              this.hearStep(b.name, p.x, p.z);
              continue;
            }
          }
        }
      }
      if (this.time >= (b.thinkAt ?? 0)) {
        b.target = this.chooseBotTarget(b);
        b.thinkAt = this.time + 0.35;
      }
      const opponent = b.target === -1 ? null : this.bots[b.target ?? -1];
      const target =
        b.target === -1 && this.state.health > 0 && this.canUseWeapon()
          ? this.position.clone().add(new THREE.Vector3(0, -0.4, 0))
          : opponent && opponent.hp > 0 && !opponent.dropping
            ? opponent.mesh.position.clone().add(new THREE.Vector3(0, 1.3, 0))
            : null;
      const distance = target
        ? Math.hypot(target.x - p.x, target.z - p.z)
        : Infinity;
      const angle = !safe
        ? Math.atan2(zone.x - p.x, zone.z - p.z)
        : target
          ? Math.atan2(target.x - p.x, target.z - p.z)
          : b.seed + Math.sin(this.time * 0.13 + b.seed) * 2;
      const speed =
        (!safe ? 5.8 : distance < 3.5 ? 0 : distance < 13 ? 1.7 : 3.2) * dt;
      const old = p.clone();
      this.moveBot(b, angle, speed);
      if (p.distanceToSquared(old) > 0.0001) this.hearStep(b.name, p.x, p.z);
      b.mesh.rotation.y = angle;
      animateCharacter(b.mesh, this.time * 9 + b.seed, speed > 0 ? 0.3 : 0);
      if (outsideZone(p.x, p.z, zone)) {
        b.hp -= dt * (this.state.elapsed > 160 ? 5 : 2);
        if (b.hp <= 0) {
          this.killBot(b);
          continue;
        }
      }
      const weapon = b.mesh.getObjectByName('Bot weapon')?.userData.weapon ?? 0;
      if (
        b.armed &&
        (b.ammunition ?? 90) > 0 &&
        target &&
        distance < Math.min(47, WEAPONS[weapon].range) &&
        b.cooldown <= 0 &&
        this.state.phase === 'playing'
      ) {
        const from = p.clone().add(new THREE.Vector3(0, 1.45, 0));
        if (this.visible(from, target)) {
          b.ammunition = Math.max(0, (b.ammunition ?? 90) - 1);

          this.tracer(from, target, '#ff9c73');
          this.playWeapon(weapon, from);
          if (b.target === -1) this.incomingFire(from);
          if (Math.random() < (distance < 18 ? 0.68 : 0.38)) {
            const amount =
              (5 + Math.random() * 4) *
              (weaponDamage(weapon, distance, b.rarity ?? 0) /
                WEAPONS[weapon].damage);
            if (b.target === -1) this.damage(amount, from, b.name);
            else if (opponent) {
              const hit = takeDamage(opponent.hp, opponent.shield, amount);
              opponent.hp = hit.health;
              opponent.shield = hit.shield;
              if (opponent.hp <= 0) this.killBot(opponent, false, b.name);
            }
          }
        }
        b.cooldown = 1.1 + Math.random() * 1.4;
      }
    }
  }
  moveBot(bot: Bot, angle: number, speed: number) {
    const p = bot.mesh.position,
      x = p.x,
      z = p.z;
    this.move(p, Math.sin(angle) * speed, Math.cos(angle) * speed);
    if (Math.hypot(p.x - x, p.z - z) < speed * 0.1) {
      const side = Math.floor(bot.seed * 10) % 2 === 0 ? 1 : -1;
      this.move(
        p,
        Math.cos(angle) * speed * side,
        -Math.sin(angle) * speed * side,
      );
    }
  }
  chooseBotTarget(bot: Bot): number | null {
    const p = bot.mesh.position;
    const candidates = this.bots.flatMap((other, i) =>
      other !== bot && other.hp > 0 && !other.dropping
        ? [
            {
              id: i,
              point: other.mesh.position
                .clone()
                .add(new THREE.Vector3(0, 1.3, 0)),
            },
          ]
        : [],
    );
    if (this.state.health > 0 && this.canUseWeapon())
      candidates.push({
        id: -1,
        point: this.position.clone().add(new THREE.Vector3(0, -0.4, 0)),
      });
    candidates.sort(
      (a, b) => p.distanceToSquared(a.point) - p.distanceToSquared(b.point),
    );
    const from = p.clone().add(new THREE.Vector3(0, 1.45, 0));
    for (const candidate of candidates) {
      if (p.distanceToSquared(candidate.point) > 47 * 47) break;
      if (this.visible(from, candidate.point)) return candidate.id;
    }
    return null;
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
    this.particles?.update(dt);
    this.weaponSway?.multiplyScalar(Math.exp(-dt * 10));
    this.landingKick = (this.landingKick ?? 0) * Math.exp(-dt * 12);
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
    if (this.avatar && this.state.phase !== 'playing')
      this.avatar.visible = false;
    if (this.state.phase === 'lobby') {
      const t = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 0
        : this.time * 0.025;
      this.camera.position.set(
        (83 + Math.sin(t) * 8) * ARENA_SCALE,
        80,
        (93 + Math.cos(t) * 8) * ARENA_SCALE,
      );
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
      if (!this.network && !this.practice)
        this.state.zone = zoneAt(
          Math.max(0, this.state.elapsed - BUS_SECONDS),
          this.zoneSeed,
        );
      this.state.storm = this.state.zone?.radius ?? this.state.storm;
      this.storm.position.set(
        this.state.zone?.x ?? 0,
        24,
        this.state.zone?.z ?? 0,
      );
      this.storm.scale.set(this.state.storm, 1, this.state.storm);
      if (!this.isGunGame()) this.updateZoneCue();
      this.cooldown = Math.max(0, this.cooldown - dt);
      this.recoil *= Math.exp(-dt * 18);
      this.viewKick *= Math.exp(-dt * 12);
      if (!this.shooting) this.triggerHeld = false;
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
      if (this.state.mapOpen || this.state.onBus) {
        mx = 0;
        mz = 0;
      }
      const length = Math.hypot(mx, mz);
      if (length > 1) {
        mx /= length;
        mz /= length;
      }
      this.state.crouching =
        !this.state.dropping &&
        !this.isDowned() &&
        !this.mantle &&
        (this.crouchToggle ||
          (this.preferences?.crouch === 'hold' && this.keys.has('KeyC')) ||
          this.keys.has('ControlLeft') ||
          this.keys.has('ControlRight'));
      this.state.sprinting =
        !this.state.crouching &&
        !this.aiming &&
        !this.state.healing &&
        length > 0.1 &&
        ((this.preferences?.sprint === 'toggle'
          ? this.sprintToggle
          : this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) ||
          this.touchSprint);
      const speed =
        this.network && this.networkRoom?.phase !== 'playing'
          ? 0
          : this.state.dropping
            ? GLIDE_SPEED
            : this.isDowned()
              ? 2
              : this.state.crouching
                ? MOVE.crouch
                : this.state.sprinting
                  ? MOVE.sprint
                  : MOVE.run;
      const pace = this.state.dropping
        ? 1
        : this.state.healing
          ? 0.7
          : this.aiming
            ? 0.7
            : 1;
      this.motion.x = smoothVelocity(
        this.motion.x,
        (mx * Math.cos(this.yaw) - mz * Math.sin(this.yaw)) * speed * pace,
        dt,
      );
      this.motion.y = smoothVelocity(
        this.motion.y,
        (-mx * Math.sin(this.yaw) - mz * Math.cos(this.yaw)) * speed * pace,
        dt,
      );
      if (!this.mantle && !this.state.onBus)
        this.move(
          this.position,
          this.motion.x * dt,
          this.motion.y * dt,
          this.position.y - 1.7,
        );
      if (this.keys.has('ArrowLeft')) this.yaw += dt * 1.5;
      if (this.keys.has('ArrowRight')) this.yaw -= dt * 1.5;
      if (this.network && this.networkRoom?.phase === 'countdown')
        this.velocityY = 0;
      if (this.state.onBus) {
        const bus = busPosition(this.state.elapsed);
        this.position.set(bus.x, bus.y, bus.z);
        this.motion.set(0, 0);
        this.velocityY = 0;
        if (!this.network && this.state.elapsed >= BUS_SECONDS)
          this.state.onBus = false;
      } else if (this.state.dropping) {
        if (!this.network || this.networkRoom?.phase === 'playing')
          this.position.y = glideHeight(
            this.position.y,
            dt,
            this.liftRemaining,
          );
        this.liftRemaining = Math.max(0, this.liftRemaining - dt);
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
      } else if (this.mantle) {
        const progress = (this.time - this.mantle.at) / MOVE.mantleSeconds;
        const point = mantlePoint(this.mantle.from, this.mantle.to, progress);
        this.position.set(point.x, point.y, point.z);
        this.velocityY = 0;
        if (progress >= 1) this.mantle = undefined;
      } else {
        const floor =
          this.groundHeight(
            this.position.x,
            this.position.z,
            this.position.y - 1.7,
          ) + 1.7;
        this.velocityY -= 22 * dt;
        this.position.y = Math.max(
          floor,
          this.position.y + this.velocityY * dt,
        );
        if (this.position.y <= floor) this.velocityY = 0;
      }
      if (
        !this.network &&
        !this.practice &&
        !this.state.dropping &&
        !this.isDowned() &&
        !this.mantle &&
        this.time - this.launchAt > 6 &&
        padAt(this.position.x, this.position.y, this.position.z) >= 0
      ) {
        this.state.dropping = true;
        this.liftRemaining = LIFT_SECONDS;
        this.launchAt = this.time;
        this.cancelHeal();
        this.reloadTimer = 0;
        this.state.reloading = false;
        this.setAiming(false);
        this.notice('Launched! Steer toward your next landing.');
        this.sound(420, 0.3, 0.05, 'sine');
      }
      const padGliding = this.canUseAirWeapon();
      if (padGliding !== !!this.state.padGliding) {
        this.state.padGliding = padGliding;
        this.showWeapon();
      }
      this.state.mantling = !!this.mantle;
      this.state.altitude = Math.max(0, this.position.y - 1.7);
      if (this.position.y === 1.7) this.velocityY = 0;
      if (!this.mantle && this.correction.lengthSq() > 0.000001) {
        const step = this.correction
          .clone()
          .multiplyScalar(1 - Math.exp(-dt * 12));
        this.position.add(step);
        this.positionHistory.applied(step.x, step.z);
        this.correction.sub(step);
      }
      this.crouchOffset +=
        ((this.state.crouching ? 0.65 : 0) - this.crouchOffset) *
        (1 - Math.exp(-dt * 18));
      const grounded =
        this.velocityY === 0 && !this.state.dropping && !this.mantle;
      if (grounded && !this.previousGrounded) {
        this.landingKick = 1;
        this.fx(
          { x: this.position.x, y: this.position.y - 1.62, z: this.position.z },
          'sand',
          6,
        );
      }
      this.previousGrounded = grounded;
      this.updatePlayerCamera();
      this.camera.fov = THREE.MathUtils.lerp(
        this.camera.fov,
        this.aiming
          ? this.state.weapon === 2
            ? 28
            : this.thirdPerson()
              ? 58
              : 45
          : this.state.sprinting
            ? 78
            : 72,
        dt * 12,
      );
      this.camera.updateProjectionMatrix();
      this.gun.position.set(
        this.aiming ? 0.18 : 0.28,
        (this.aiming ? -0.33 : -0.28) +
          Math.sin(this.time * (this.state.sprinting ? 13 : 10)) *
            Math.min(this.motion.length() / MOVE.run, 1) *
            0.009,
        -0.5 + this.recoil,
      );
      this.updateWeaponFeel();
      this.gun.scale.setScalar(1);
      this.flash.visible =
        this.time - this.lastShotAt < 0.045 &&
        this.shotWeapon === this.state.weapon;
      if (this.shooting) this.shoot();
      this.state.outside = outsideZone(
        this.position.x,
        this.position.z,
        this.state.zone ?? { x: 0, z: 0, radius: this.state.storm },
      );
      if (this.state.outside && !this.network && !this.practice)
        this.damage(dt * (this.state.elapsed > 300 ? 11 : 5));
      if (this.state.phase === 'playing' && !this.network && !this.practice)
        this.updateBots(dt);
      if (
        this.state.phase === 'playing' &&
        this.state.alive <= 1 &&
        !this.network &&
        !this.practice
      )
        this.finish(true);
      this.autoAmmo();
      const near = this.state.dropping ? undefined : this.nearestLoot();
      this.state.pickup =
        this.nearReboot() >= 0
          ? 'Bring teammate back'
          : !this.state.dropping && this.nearSupply()
            ? 'Open supply drop'
            : !this.state.dropping && this.nearestChest() >= 0
              ? 'Open treasure chest'
              : near
                ? near.kind < 3
                  ? `${RARITIES[near.rarity].name} ${WEAPONS[near.kind].name}${!this.state.owned[near.kind] ? '' : ' · SWAP'}`
                  : near.kind === 8
                    ? 'Smoke grenade · H to throw'
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
          animateCharacter(
            b.mesh,
            this.time * 9,
            b.mesh.position.distanceToSquared(target) > 0.001 ? 0.25 : 0,
          );
          const held = b.mesh.getObjectByName('Bot weapon');
          if (held?.visible) {
            const index = held.userData.weapon;
            const remaining = Math.max(
              0,
              (b.mesh.userData.reloadEnd ?? 0) - this.time,
            );
            const pose = reloadMotion(
              index,
              remaining > 0 ? 1 - remaining / WEAPONS[index].reload : 0,
            );
            held.position.set(0.35 + pose.x, 1.35 + pose.y, 0.25);
            held.rotation.set(
              -(b.mesh.userData.pitch ?? 0) + pose.rx,
              Math.PI,
              pose.rz,
            );
            const right = b.mesh.getObjectByName('Right arm'),
              left = b.mesh.getObjectByName('Left arm');
            if (right) right.rotation.x = -1.15 - (b.mesh.userData.pitch ?? 0);
            if (left)
              left.rotation.x =
                -0.95 - (b.mesh.userData.pitch ?? 0) + pose.work * 0.7;
          }
        }
      });
      for (const b of this.bots) {
        const arm = b.mesh.getObjectByName('Right arm');
        if (arm) arm.rotation.z = 0;
        if (b.hp > 0)
          this.animatePunch(b.mesh, b.mesh.userData.meleeAt ?? -100);
      }
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
    if (this.practice && this.range) {
      this.range.targets.forEach((t) => {
        const age = this.time - (t.userData.hitAt ?? -10);
        t.rotation.x = age < 0.4 ? Math.sin((age * Math.PI) / 0.4) * 0.2 : 0;
      });
    }
    this.updateMelee();
    this.updateChests(dt);
    this.lootInstances?.update(this.time);
    this.tracers = this.tracers.filter((t) => {
      t.life -= dt;
      fadeTrail(t.mesh, t.life);
      if (t.life <= 0) {
        disposeTrail(t.mesh);
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
    if (this.dropBus) {
      const duration = this.network
        ? (this.networkRoom?.busDuration ?? 0)
        : BUS_SECONDS;
      this.state.busRemaining = Math.max(0, duration - this.state.elapsed);
      this.dropBus.visible =
        !this.practice &&
        this.state.phase !== 'lobby' &&
        duration > 0 &&
        this.state.elapsed < duration;
      const bus = busPosition(this.state.elapsed);
      // Ride beside the bus so its body never fills the first-person view.
      this.dropBus.position.set(bus.x, bus.y + 3, bus.z);
      this.dropBus.rotation.y = Math.atan2(-280, -130);
    }
    if (this.parachute) {
      this.parachute.visible =
        this.state.dropping &&
        !this.state.onBus &&
        this.liftRemaining <= 0 &&
        this.state.phase === 'playing';
      this.parachute.position
        .copy(this.position)
        .add(new THREE.Vector3(0, -1.7, 0));
    }
    for (const b of this.bots) {
      const chute = b.mesh.getObjectByName('Parachute');
      if (chute)
        chute.visible =
          b.dropping &&
          b.hp > 0 &&
          b.mesh.visible &&
          !b.busJumpAt &&
          !(b.liftRemaining && b.liftRemaining > 0);
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
          !smokeBlocks(
            this.camera.position,
            {
              x: b.mesh.position.x,
              y: b.mesh.position.y + 1.5,
              z: b.mesh.position.z,
            },
            this.activeSmokes(),
            this.state.elapsed * 1000,
          ) &&
          b.mesh.position.distanceToSquared(this.camera.position) < 85 * 85;
    }
    this.updateBattlefield();
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
      this.state.outside = outsideZone(
        watched.x,
        watched.z,
        this.state.zone ?? { x: 0, z: 0, radius: this.state.storm },
      );
    }
    this.state.bots = this.bots
      .filter(
        (b) =>
          b.hp > 0 &&
          !smokeBlocks(
            this.camera.position,
            b.mesh.position,
            this.activeSmokes(),
            this.state.elapsed * 1000,
          ),
      )
      .map((b) => ({ x: b.mesh.position.x, z: b.mesh.position.z }));
    this.onState({ ...this.state });
  }
  pose(aim?: { yaw: number; pitch: number }): PlayerPose {
    return this.positionHistory.record({
      spawnedAt: this.networkRoom?.players.find(
        (p) => p.id === this.network?.playerId,
      )?.spawnedAt,
      x: this.position.x,
      y: this.position.y,
      z: this.position.z,
      yaw: aim?.yaw ?? this.yaw,
      pitch: aim?.pitch ?? this.pitch,
      weapon: this.state.weapon,
      crouching: this.state.crouching,
      sprinting: this.state.sprinting,
    });
  }
  attachNetwork(playerId: string, send: (command: Command) => void) {
    this.network = { playerId, send };
    this.positionHistory = new PositionHistory();
    this.networkRound = 0;
    this.networkRoom = null;
    this.networkEvents.clear();
  }
  detachNetwork() {
    if (this.practice) this.stopPractice();
    this.network = null;
    this.networkRoom = null;
    this.networkRound = 0;
    this.remoteTargets = [];
    this.lobby();
    this.resetBots();
  }
  applyNetworkSnapshot(room: RoomSnapshot, acknowledgedPose?: PlayerPose) {
    if (this.practice) {
      this.networkRoom = room;
      if (['waiting', 'finished'].includes(room.phase)) return;
      this.stopPractice();
      this.networkRound = -1;
    }
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
      this.positionHistory = new PositionHistory();
      this.networkRound = room.round;
      this.networkEvents.clear();
      this.footsteps.clear();
      this.localMarks = [];
      this.state.phase = 'paused';
      this.state.supply = undefined;
      this.localSmokes = [];
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
      this.state.mapOpen = false;
      this.state.scoreboardOpen = false;
      this.state.weapon = -1;
      this.state.owned = [...me.owned];
      this.state.tiers = [...(me.tiers ?? [0, 0, 0])];
      this.correction.set(0, 0, 0);
      this.state.hit = 0;
      this.state.hurt = 0;
      this.state.pickup = '';
      this.state.notice = 'The sandbox is ready. Enter the match.';
      this.position.set(me.x, me.y, me.z);
      this.yaw = me.yaw;
      this.pitch = isArenaMode(room.mode) ? 0 : -0.6;
      this.velocityY = 0;
      this.reloadTimer = 0;
      this.meleeAt = -100;
      this.zoneCue = '';
      this.cooldown = 0.3;
      this.setArena(isArenaMode(room.mode));
      this.resetBots(0);
      this.spawnLoot();
      this.resetChests(`${room.code}:${room.round}`);
      if (isArenaMode(room.mode)) {
        this.chests = [];
        this.chestRenderer?.root.removeFromParent();
        if (this.chestRenderer) this.disposeObject(this.chestRenderer.root);
        this.chestRenderer = undefined;
      }
      this.showWeapon();
      this.storm.visible = true;
      this.camera.position.copy(this.position);
      this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    }
    const oldMe = previousRoom?.players.find((p) => p.id === me.id);
    const respawned =
      !newRound &&
      (me.spawnedAt ?? 0) > 0 &&
      me.health > 0 &&
      me.spawnedAt !== oldMe?.spawnedAt;
    if (respawned) {
      this.positionHistory.reset();
      this.position.set(me.x, me.y, me.z);
      this.correction.set(0, 0, 0);
      this.motion.set(0, 0);
      this.velocityY = 0;
      this.mantle = undefined;
      this.camera.rotation.z = 0;
      this.cooldown = 0.2;
      this.reloadTimer = 0;
      this.recoil = 0;
      this.viewKick = 0;
      this.triggerHeld = false;
      this.shooting = false;
      this.state.deathRemaining = 0;
      this.state.hurt = 0;
      this.state.threat = 0;
      this.state.damageAngle = null;
      this.killerId = null;
      this.spectatorId = null;
      this.state.spectator = null;
      if (['dying', 'spectating', 'lost'].includes(this.state.phase))
        this.state.phase =
          this.touch || document.pointerLockElement ? 'playing' : 'paused';
      this.notice(
        room.mode === 'team-deathmatch'
          ? 'Back in the sandbox. Fight with your team.'
          : isArenaMode(room.mode)
            ? 'Back in the sandbox. Your weapon progress is saved.'
            : 'Your teammate brought you back. Find a weapon!',
      );
    }
    // Preserve each player's model and interpolation when people join/leave.
    this.syncRemotePlayers(remotes);
    const previousPlayers = new Map(
      previousRoom?.players.map((p) => [p.id, p]),
    );
    this.remoteTargets = remotes.map((p, i) => {
      const b = this.bots[i];
      setCharacterSkin(
        b.mesh,
        room.mode === 'team-deathmatch' ? 4 + (p.team ?? 0) : skinIndex(p.name),
      );
      const teammate = isTeamMode(room.mode) && me.team === p.team;
      const label = `${teammate ? '◆ ' : ''}${p.name}${p.downed ? ' · DOWN' : (p.protectedUntil ?? 0) > room.now ? ' · SAFE' : ''}`;
      const previous = previousPlayers.get(p.id);
      if (p.health > 0 && (newRound || p.spawnedAt !== previous?.spawnedAt)) {
        b.dying = 0;
        b.mesh.rotation.z = 0;
        b.mesh.position.set(p.x, p.y - 1.7, p.z);
      }
      if (
        !newRound &&
        !teammate &&
        !p.dropping &&
        Math.abs(p.y - this.groundHeight(p.x, p.z, p.y - 1.7) - 1.7) < 0.2 &&
        !p.downed &&
        p.health > 0 &&
        previous &&
        Math.hypot(p.x - previous.x, p.z - previous.z) > 0.025
      )
        this.hearStep(p.id, p.x, p.z);
      b.mesh.scale.y = p.downed ? 0.38 : p.crouching ? 0.66 : 1;
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
      b.mesh.userData.meleeAt =
        this.time - (room.now - (p.meleeAt ?? -100000)) / 1000;
      b.mesh.userData.reloadEnd =
        this.time + Math.max(0, (p.reloadUntil - room.now) / 1000);
      b.mesh.userData.pitch = p.pitch;
      let held = b.mesh.getObjectByName('Bot weapon');
      if (
        p.weapon >= 0 &&
        (held?.userData.weapon !== p.weapon ||
          held?.userData.rarity !== (p.tiers?.[p.weapon] ?? 0))
      ) {
        if (held) {
          held.removeFromParent();
          this.disposeObject(held);
        }
        held = weaponModel(p.weapon, 'world', p.tiers?.[p.weapon] ?? 0);
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
      b.mesh.visible = !p.onBus && (p.health > 0 || b.dying > 0);
      b.mesh.rotation.y = p.yaw + Math.PI;
      return b.remoteTarget!.set(p.x, p.y - 1.7, p.z);
    });
    if (
      me.mantleUntil &&
      me.mantleUntil > room.now &&
      me.mantleFrom &&
      me.mantleTo
    ) {
      this.positionHistory.reset();
      this.mantle = {
        from: me.mantleFrom,
        to: me.mantleTo,
        at: this.time - (room.now - (me.mantleStarted ?? room.now)) / 1000,
      };
      this.correction.set(0, 0, 0);
    }
    if (newRound) {
      this.mantle = undefined;
      this.motion?.set(0, 0);
      this.crouchToggle = false;
    }
    if (
      !newRound &&
      acknowledgedPose &&
      !respawned &&
      !this.mantle &&
      !me.onBus &&
      !previousRoom?.players.find((p) => p.id === me.id)?.onBus
    ) {
      const error = this.positionHistory.error(me, acknowledgedPose);
      if (error) {
        this.correction.set(0, 0, 0);
        const distance = Math.hypot(error.x, error.z);
        if (distance > 4) {
          this.position.x += error.x;
          this.position.z += error.z;
          this.positionHistory.applied(error.x, error.z);
        } else if (distance > 0.05) this.correction.set(error.x, 0, error.z);
      }
    }
    if (
      !newRound &&
      !me.spectator &&
      (me.health < this.state.health || me.shield < this.state.shield)
    )
      this.state.hurt = 0.3;
    if (
      me.onBus ||
      (this.state.onBus && !me.onBus) ||
      (me.launchAt !==
        previousRoom?.players.find((p) => p.id === me.id)?.launchAt &&
        me.dropping)
    ) {
      this.positionHistory.reset();
      this.position.set(me.x, me.y, me.z);
      this.correction.set(0, 0, 0);
      this.motion.set(0, 0);
    }
    if (
      !newRound &&
      (me.launchAt ?? 0) > 0 &&
      me.launchAt !==
        previousRoom?.players.find((p) => p.id === me.id)?.launchAt
    ) {
      this.setAiming(false);
      this.notice('Launched! Steer toward your next landing.');
      this.sound(420, 0.3, 0.05, 'sine');
    }
    this.state.onBus = me.onBus && me.health > 0;
    this.liftRemaining = Math.max(
      0,
      ((me.launchAt ?? -10000) + LIFT_SECONDS * 1000 - room.now) / 1000,
    );
    this.state.squadPoints = isTeamMode(room.mode)
      ? room.players
          .filter((p) => p.id !== me.id && p.team === me.team && p.health > 0)
          .map((p) => ({ x: p.x, z: p.z, name: p.name }))
      : [];
    if (me.dropping && !me.onBus)
      this.position.y = THREE.MathUtils.lerp(this.position.y, me.y, 0.5);
    if (this.state.dropping && !me.dropping && me.health > 0) {
      this.positionHistory.reset();
      this.position.set(me.x, me.y, me.z);
      this.velocityY = 0;
      this.correction.set(0, 0, 0);
      this.notice('Feet in the sand. Find a weapon and press E.');
    }
    this.state.dropping = me.dropping && me.health > 0;
    this.state.altitude = Math.max(0, me.y - 1.7);
    this.state.smokes = me.smokes ?? 0;
    this.state.gunStage = me.gunStage ?? 0;
    this.state.respawnRemaining =
      isArenaMode(room.mode) && me.health <= 0 && room.phase === 'playing'
        ? Math.max(0, ((me.respawnAt ?? 0) - room.now) / 1000)
        : 0;
    this.state.medkits = me.medkits ?? 0;
    this.state.cells = me.cells ?? 0;
    this.state.healing = me.healing ?? null;
    this.state.healUntil = me.healUntil ? me.healUntil - room.startAt : 0;
    this.state.healRemaining = me.healing
      ? Math.max(0, (me.healUntil - room.now) / 1000)
      : 0;
    this.state.health = me.health;
    this.state.shield = me.shield;
    this.state.kills = me.kills;
    this.state.alive = room.players.filter((p) => p.health > 0).length;
    this.state.rank =
      me.rank ||
      (isArenaMode(room.mode)
        ? 1 +
          room.players.filter((p) => (p.gunStage ?? 0) > (me.gunStage ?? 0))
            .length
        : this.state.alive);
    this.state.elapsed = Math.max(0, (room.now - room.startAt) / 1000);
    if (isArenaMode(room.mode) && room.phase === 'finished')
      this.state.survived = this.state.elapsed;
    this.state.zone =
      room.zone ?? zoneAt(this.state.elapsed, `${room.code}:${room.round}`);
    this.state.storm = this.state.zone.radius;
    this.state.outside = outsideZone(me.x, me.z, this.state.zone);
    this.storm.position.set(this.state.zone.x, 24, this.state.zone.z);
    this.storm.scale.set(this.state.storm, 1, this.state.storm);
    const inventoryChanged = this.state.owned.some(
      (has, i) =>
        has !== me.owned[i] ||
        (this.state.tiers?.[i] ?? 0) !== (me.tiers?.[i] ?? 0),
    );
    this.state.owned = [...me.owned];
    this.state.tiers = [...(me.tiers ?? [0, 0, 0])];
    if (
      inventoryChanged ||
      newRound ||
      me.pickedUpAt !==
        previousRoom?.players.find((p) => p.id === me.id)?.pickedUpAt
    )
      this.state.weapon = me.weapon;
    this.showWeapon();
    if (me.health <= 0) this.gun.visible = false;
    this.weaponAmmo = [...me.ammo];
    this.reserveAmmo = [...me.reserve];
    const wasReloading = this.state.reloading;
    this.state.reloading = me.reloadUntil > room.now;
    this.reloadTimer = Math.max(0, (me.reloadUntil - room.now) / 1000);
    if (this.state.reloading && !wasReloading) this.reloadCue = 0;
    if (room.chests) this.chests = room.chests.map((c) => ({ ...c }));
    room.loot.forEach((used, i) => {
      if (this.loot[i]) {
        this.loot[i].used = used;
        this.loot[i].mesh.visible = !used;
      }
    });
    let added = false;
    (room.drops ?? []).forEach((drop, i) => {
      const index = room.loot.length + i;
      if (!this.loot[index]) {
        this.addLoot(drop);
        added = true;
      }
      if (
        this.loot[index].kind !== drop.kind ||
        this.loot[index].rarity !== drop.rarity
      ) {
        this.replaceLoot(index, drop);
        added = true;
      }
      this.loot[index].used = drop.used;
      this.loot[index].amount = drop.amount;
    });
    if (added) this.rebuildLoot();
    for (const e of room.events) {
      if (this.networkEvents.has(e.id)) continue;
      this.networkEvents.add(e.id);
      if (
        e.type === 'chest' &&
        e.end &&
        this.position.distanceTo(new THREE.Vector3(...e.end)) < 22
      )
        this.sound(740, 0.24, 0.045, 'triangle');
      if (e.type === 'hit' && e.shieldBreak) {
        const target = room.players.find((p) => p.id === e.target);
        if (target)
          this.fx({ x: target.x, y: target.y - 0.5, z: target.z }, 'shield', 8);
      }
      if (e.type === 'finalWeapon') {
        const name =
          room.players.find((p) => p.id === e.player)?.name ?? 'A player';
        this.addFeed(`${name} reached the final weapon!`, e.id);
        this.sound(880, 0.4, 0.055, 'triangle');
      }
      if (e.type === 'token' && (e.player === me.id || e.target === me.id)) {
        this.notice(
          e.player === me.id
            ? 'Token collected. Reach a comeback station before circle 4.'
            : 'Your teammate has your token.',
        );
        this.sound(660, 0.2, 0.04, 'sine');
      }
      if (e.type === 'reboot') {
        const name =
          room.players.find((p) => p.id === e.target)?.name ?? 'Teammate';
        this.addFeed(`${name} is back in the sandbox`, e.id);
        if (e.player === me.id || e.target === me.id)
          this.sound(780, 0.3, 0.05, 'triangle');
      }
      if (e.type === 'shot' && e.player !== me.id && e.end) {
        const p = room.players.find((p) => p.id === e.player);
        if (p) {
          const from = new THREE.Vector3(p.x, p.y, p.z),
            end = new THREE.Vector3(...e.end);
          this.playWeapon(e.weapon ?? p.weapon, from);
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
      if (e.type === 'melee' && e.player !== me.id) {
        const attacker = room.players.find((p) => p.id === e.player);
        if (
          attacker &&
          Math.hypot(
            attacker.x - this.position.x,
            attacker.z - this.position.z,
          ) < 10
        )
          this.sound(e.end ? 90 : 210, 0.12, e.end ? 0.035 : 0.015, 'triangle');
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
        this.notice(
          e.ammoKind !== undefined
            ? `+${e.amount} ${AMMO_TYPES[e.ammoKind].name}`
            : 'Supplies collected',
        );
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
        (isTeamMode(room.mode) &&
          !me.spectator &&
          room.winningTeam != null &&
          room.winningTeam === me.team)) &&
      this.state.phase !== 'won'
    )
      this.finish(true);
    if (
      room.phase === 'finished' &&
      this.state.phase !== 'won' &&
      this.state.phase !== 'dying'
    ) {
      this.state.phase = 'lost';
      this.shooting = false;
      this.keys.clear();
      this.mouseAimHeld = false;
      if (document.pointerLockElement) document.exitPointerLock();
    }
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
    for (const solid of this.gunSolids ?? []) this.disposeObject(solid);
    for (const t of this.tracers) {
      t.mesh.geometry.dispose();
      (t.mesh.material as THREE.Material).dispose();
    }
    this.renderer.dispose();
    this.renderer.domElement.remove();
    void this.audio?.close();
  }
}
