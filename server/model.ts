import { updateRoomBots } from './bots.ts';
import {
  BUS_SECONDS,
  GLIDE_SPEED,
  canGlideFire,
  busPosition,
  padAt,
  glideHeight,
  LIFT_SECONDS,
} from '../lib/game/traversal.ts';
import {
  CHEST_SPOTS,
  chestLayout,
  chestDrops,
  floorAmmo,
  canReach,
  type ChestState,
} from '../lib/game/chests.ts';
import { ARENA_RADIUS, ARENA_SCALE, SPAWN_RADIUS } from '../lib/game/arena.ts';
import { MELEE, meleeTarget, meleeBody } from '../lib/game/melee.ts';
import {
  floorAvailable,
  floorRarity,
  collectGun,
  collectAmmo,
  isAmmo,
  eliminationDrops,
  type WorldDrop,
} from '../lib/game/loot.ts';
import {
  MOVE,
  blocksBody,
  groundAt,
  mantleTarget,
  mantlePoint,
} from '../lib/game/movement.ts';
import { zoneAt, outsideZone } from '../lib/game/zones.ts';
import { randomUUID } from 'node:crypto';
import { MAP } from '../lib/game/map-data.ts';
import {
  WEAPONS,
  HEADSHOT_MULTIPLIER,
  shotDirection,
  weaponDamage,
  takeDamage,
  reloadAmmo,
  SUPPLY_LIMIT,
  beginRecovery,
  cancelRecovery,
  completeRecovery,
} from '../lib/game/rules.ts';
import type {
  Command,
  GameEvent,
  Player,
  PlayerPose,
  RoomSnapshot,
} from '../lib/game/multiplayer.ts';
export const CAPACITY = 8;
export type Member = Player & {
  tokenHash: string;
  lastSeen: number;
  moveAt: number;
  credit: number;
  lastCommand: number;
  commandError?: string;
  lastMark?: number;
  ai?: {
    thinkAt: number;
    jumpAt: number;
    goal?: { x: number; z: number };
    path?: { x: number; z: number }[];
    pathAt?: number;
  };
};
export type Room = {
  code: string;
  host: string;
  phase: RoomSnapshot['phase'];
  mode?: 'solo' | 'duos';
  winningTeam?: number | null;
  round: number;
  startAt: number;
  tickAt: number;
  winner: string | null;
  players: Member[];
  loot: boolean[];
  drops?: WorldDrop[];
  chests?: ChestState[];
  zonePlayers?: number;
  botCount?: number;
  busDuration?: number;
  events: GameEvent[];
  marks?: GameEvent[];
};
export class GameError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
export function cleanName(value: unknown) {
  if (typeof value !== 'string') throw new GameError('Enter a player name.');
  const name = value
    .trim()
    .replace(/[^\p{L}\p{N} _.-]/gu, '')
    .slice(0, 18);
  if (!name) throw new GameError('Enter a player name.');
  return name;
}
export function blocked(x: number, z: number) {
  return MAP.colliders.some(
    (b) =>
      b.min[1] < 1.8 &&
      b.max[1] > 0.08 &&
      x > b.min[0] - 0.48 &&
      x < b.max[0] + 0.48 &&
      z > b.min[2] - 0.48 &&
      z < b.max[2] + 0.48,
  );
}
export function safeSpawn(index: number, count: number) {
  const angle = (index / count) * Math.PI * 2;
  const x = Math.sin(angle) * SPAWN_RADIUS,
    z = Math.cos(angle) * SPAWN_RADIUS;
  for (let r = 0; r <= 20; r += 2)
    for (let i = 0; i < 12; i++) {
      const nx = x + Math.cos((i * Math.PI) / 6) * r,
        nz = z + Math.sin((i * Math.PI) / 6) * r;
      if (!blocked(nx, nz)) return { x: nx, y: 1.7, z: nz };
    }
  return { x: 0, y: 1.7, z: SPAWN_RADIUS };
}
export function createMember(
  id: string,
  name: string,
  tokenHash: string,
  now: number,
): Member {
  return {
    id,
    name,
    tokenHash,
    x: 0,
    y: 1.7,
    z: 50,
    yaw: 0,
    pitch: 0,
    weapon: -1,
    health: 100,
    shield: 50,
    medkits: 0,
    cells: 0,
    healing: null,
    healUntil: 0,
    kills: 0,
    rank: 0,
    connected: true,
    ready: false,
    pickedUpAt: 0,
    dropping: false,
    killedBy: null,
    diedAt: 0,
    spectator: false,
    team: 0,
    downed: false,
    bleedOutAt: 0,
    downedBy: null,
    reviving: null,
    reviveUntil: 0,
    owned: [false, false, false],
    tiers: [0, 0, 0],
    crouching: false,
    sprinting: false,
    mantleFrom: undefined,
    mantleTo: undefined,
    mantleStarted: 0,
    mantleUntil: 0,
    ammo: [0, 0, 0],
    reserve: [0, 0, 0],
    reloadUntil: 0,
    shotAt: 0,
    meleeAt: -1000,
    lastSeen: now,
    moveAt: now,
    credit: 1,
    lastCommand: 0,
  };
}
export function createRoom(code: string, member: Member, now: number): Room {
  return {
    code,
    host: member.id,
    phase: 'waiting',
    mode: 'solo',
    winningTeam: null,
    round: 0,
    startAt: 0,
    tickAt: now,
    winner: null,
    players: [member],
    loot: MAP.loot.map((_, i) => !floorAvailable(i)),
    events: [],
  };
}
export function addMember(room: Room, member: Member) {
  if (room.players.filter((p) => !p.bot).length >= CAPACITY)
    throw new GameError('This room is full.', 409);
  // Late arrivals reserve a seat for the next round without changing this one.
  if (room.phase !== 'waiting') {
    member.spectator = true;
    member.health = 0;
    member.shield = 0;
  }
  if (room.mode === 'duos')
    member.team =
      [0, 1, 2, 3].find(
        (team) => room.players.filter((p) => p.team === team).length < 2,
      ) ?? 0;
  room.players.push(member);
}
export function teammates(room: Room, a: Member, b: Member) {
  return room.mode === 'duos' && a.team === b.team && a.id !== b.id;
}
function stopRevive(p: Member) {
  p.reviving = null;
  p.reviveUntil = 0;
}
function canRevive(room: Room, p: Member, target: Member) {
  return (
    teammates(room, p, target) &&
    p.health > 0 &&
    !p.downed &&
    !p.dropping &&
    p.connected &&
    target.health > 0 &&
    target.downed &&
    Math.hypot(p.x - target.x, p.z - target.z) <= 3
  );
}
export function damageMember(
  room: Room,
  target: Member,
  amount: number,
  now: number,
  attacker: Member,
) {
  if (
    teammates(room, attacker, target) ||
    target.health <= 0 ||
    target.spectator ||
    target.onBus
  )
    return;
  stopRevive(target);
  for (const q of room.players) if (q.reviving === target.id) stopRevive(q);
  Object.assign(target, takeDamage(target.health, target.shield, amount));
  if (target.health > 0) return;
  cancelRecovery(target);
  if (
    !target.downed &&
    room.players.some(
      (q) =>
        teammates(room, target, q) && q.health > 0 && !q.downed && !q.spectator,
    )
  ) {
    target.mantleUntil = 0;
    target.downed = true;
    target.health = 100;
    target.shield = 0;
    target.bleedOutAt = now + 20000;
    target.downedBy = attacker.id;
    target.reloadUntil = 0;
    target.credit = 0;
    event(room, {
      type: 'down',
      player: attacker.id,
      target: target.id,
      at: now,
    });
  } else eliminate(room, target, now, attacker);
}
function event(room: Room, data: Omit<GameEvent, 'id'>) {
  room.events.push({ ...data, id: randomUUID() });
  room.events = room.events.slice(-40);
}
function eliminate(room: Room, player: Member, now: number, killer?: Member) {
  if (player.rank || player.spectator) return;
  room.drops ??= [];
  for (const drop of eliminationDrops(player, player.x, player.z)) {
    const landing = safeLanding(drop.x, drop.z);
    room.drops.push({ ...drop, ...landing });
  }
  player.mantleUntil = 0;
  player.health = 0;
  player.downed = false;
  player.reviving = null;
  player.reviveUntil = 0;
  player.dropping = false;
  player.killedBy = killer?.id ?? null;
  player.diedAt = now;
  cancelRecovery(player);
  player.rank = room.players.filter((p) => p.health > 0 && !p.rank).length + 1;
  if (killer && killer.id !== player.id) killer.kills++;
  event(room, {
    type: 'elimination',
    player: killer?.id ?? 'storm',
    target: player.id,
    at: now,
  });
}
export function advance(room: Room, now: number) {
  const dt = Math.max(0, (now - room.tickAt) / 1000);
  room.tickAt = now;
  for (const p of room.players) {
    // Existing rooms finish with their previous loadout; new rounds start empty.
    p.dropping ??= false;
    p.killedBy ??= null;
    p.diedAt ??= 0;
    p.medkits ??= 0;
    p.cells ??= 0;
    p.healing ??= null;
    p.healUntil ??= 0;
    p.owned ??= p.ammo.map((n, i) => n > 0 || p.reserve[i] > 0);
    p.connected = p.bot || now - p.lastSeen < 5000;
    if (p.weapon >= 0 && p.reloadUntil && now >= p.reloadUntil) {
      const r = reloadAmmo(
        p.ammo[p.weapon],
        p.reserve[p.weapon],
        WEAPONS[p.weapon].capacity,
      );
      p.ammo[p.weapon] = r.ammo;
      p.reserve[p.weapon] = r.reserve;
      p.reloadUntil = 0;
    }
  }
  if (room.phase === 'waiting' || room.phase === 'finished') {
    room.players = room.players.filter(
      (p) => p.bot || now - p.lastSeen < 60000,
    );
    if (!room.players.find((p) => p.id === room.host)?.connected) {
      const next = room.players.find((p) => p.connected && !p.bot);
      if (next) room.host = next.id;
    }
    const connected = room.players.filter((p) => p.connected && !p.bot);
    if (
      room.phase === 'finished' &&
      connected.length > 0 &&
      connected.length + (room.botCount ?? 0) >= 2 &&
      connected.every((p) => p.ready) &&
      (room.mode !== 'duos' ||
        (room.botCount ?? 0) > 0 ||
        new Set(connected.map((p) => p.team)).size >= 2)
    ) {
      room.phase = 'waiting';
      applyCommand(room, room.host, { type: 'start' }, now);
    }
    return;
  }
  if (room.phase === 'countdown' && now >= room.startAt) room.phase = 'playing';
  if (room.phase !== 'playing') return;
  const elapsed = Math.max(0, (now - room.startAt) / 1000),
    zone = zoneAt(
      Math.max(0, elapsed - (room.busDuration ?? 0)),
      `${room.code}:${room.round}`,
      room.zonePlayers ?? 16,
    );
  for (const p of room.players) {
    if (p.health <= 0) continue;
    if (p.bot) p.lastSeen = now;
    if (p.onBus) {
      Object.assign(p, busPosition(elapsed));
      if (elapsed >= (p.ai?.jumpAt ?? room.busDuration ?? BUS_SECONDS)) {
        p.onBus = false;
        p.moveAt = now;
        p.credit = 0;
      }
      continue;
    }
    if (p.downed && now >= (p.bleedOutAt ?? 0)) {
      eliminate(
        room,
        p,
        now,
        room.players.find((q) => q.id === p.downedBy),
      );
      continue;
    }
    if (p.mantleUntil && p.mantleFrom && p.mantleTo) {
      Object.assign(
        p,
        mantlePoint(
          p.mantleFrom,
          p.mantleTo,
          (now - (p.mantleStarted ?? now)) / (MOVE.mantleSeconds * 1000),
        ),
      );
      if (now >= p.mantleUntil) {
        p.mantleUntil = 0;
        p.credit = 0;
      }
    }
    if (p.dropping) {
      p.y = glideHeight(
        p.y,
        Math.min(dt, elapsed),
        Math.max(
          0,
          ((p.launchAt ?? -10000) + LIFT_SECONDS * 1000 - (now - dt * 1000)) /
            1000,
        ),
      );
      if (p.y <= 1.7) {
        p.dropping = false;
        const landing = safeLanding(p.x, p.z);
        p.x = landing.x;
        p.z = landing.z;
      }
    }
    if (
      !p.dropping &&
      !p.downed &&
      !p.mantleUntil &&
      now - (p.launchAt ?? -10000) > 6000 &&
      padAt(p.x, p.y, p.z) >= 0
    ) {
      p.launchAt = now;
      p.dropping = true;
      p.crouching = false;
      p.reloadUntil = 0;
      cancelRecovery(p);
      stopRevive(p);
    }
    if (now - p.lastSeen > 20000) {
      eliminate(room, p, now);
      continue;
    }
    if (outsideZone(p.x, p.z, zone)) {
      stopRevive(p);
      p.health = Math.max(0, p.health - dt * (elapsed > 300 ? 11 : 5));
      if (!p.health) eliminate(room, p, now);
    }
  }
  if (dt > 0) updateRoomBots(room, now, Math.min(dt, 0.25));
  for (const p of room.players) autoAmmo(room, p, now);
  for (const p of room.players) {
    const item = p.healing;
    if (completeRecovery(p, now) && item)
      event(room, { type: 'heal', player: p.id, item, at: now });
  }
  for (const p of room.players) {
    if (!p.reviving) continue;
    const target = room.players.find((q) => q.id === p.reviving);
    if (!target || !canRevive(room, p, target)) stopRevive(p);
    else if (now >= (p.reviveUntil ?? 0)) {
      target.downed = false;
      target.bleedOutAt = 0;
      target.downedBy = null;
      target.health = 50;
      target.shield = 0;
      stopRevive(p);
      event(room, { type: 'revive', player: p.id, target: target.id, at: now });
    }
  }
  if (room.mode === 'duos') {
    for (const p of room.players)
      if (
        p.downed &&
        !room.players.some(
          (q) => q.team === p.team && q.health > 0 && !q.downed && !q.spectator,
        )
      )
        eliminate(
          room,
          p,
          now,
          room.players.find((q) => q.id === p.downedBy),
        );
  }
  const alive = room.players.filter((p) => p.health > 0 && !p.spectator);
  const teams = new Set(alive.map((p) => p.team));
  if (room.mode === 'duos' ? teams.size <= 1 : alive.length <= 1) {
    room.phase = 'finished';
    room.winner = alive[0]?.id ?? null;
    room.winningTeam = room.mode === 'duos' ? (alive[0]?.team ?? null) : null;
    for (const p of room.players)
      if (
        p.id === room.winner ||
        (room.mode === 'duos' && !p.spectator && p.team === room.winningTeam)
      )
        p.rank = 1;
  }
}
export function autoAmmo(room: Room, p: Member, now: number) {
  if (
    room.phase !== 'playing' ||
    p.health <= 0 ||
    p.spectator ||
    p.downed ||
    p.dropping ||
    (p.mantleUntil ?? 0) > now
  )
    return;
  for (const drop of room.drops ?? []) {
    if (
      !isAmmo(drop.kind) ||
      drop.used ||
      !canReach(p, { x: drop.x, y: 0.65, z: drop.z }, MAP.colliders, 2.5)
    )
      continue;
    const amount = collectAmmo(p, drop, !p.reloadUntil);
    if (amount)
      event(room, {
        type: 'pickup',
        player: p.id,
        at: now,
        amount,
        ammoKind: drop.kind - 5,
      });
  }
}
export function safeLanding(x: number, z: number) {
  if (!blocked(x, z)) return { x, z };
  for (let radius = 1; radius <= 24; radius++)
    for (let i = 0; i < 16; i++) {
      const nx = x + Math.cos((i * Math.PI) / 8) * radius,
        nz = z + Math.sin((i * Math.PI) / 8) * radius;
      if (Math.hypot(nx, nz) <= ARENA_RADIUS - 1 && !blocked(nx, nz))
        return { x: nx, z: nz };
    }
  return { x: 0, z: SPAWN_RADIUS };
}
function validPose(p: unknown): p is PlayerPose {
  if (!p || typeof p !== 'object') return false;
  const v = p as PlayerPose;
  return (
    ['x', 'y', 'z', 'yaw', 'pitch', 'weapon'].every((k) =>
      Number.isFinite(v[k as keyof PlayerPose]),
    ) &&
    Number.isInteger(v.weapon) &&
    v.weapon >= -1 &&
    v.weapon < 3
  );
}
function move(p: Member, pose: PlayerPose, now: number) {
  if (!validPose(pose)) throw new GameError('Invalid movement.');
  if (p.onBus) {
    p.yaw = pose.yaw;
    p.pitch = Math.max(-1.35, Math.min(1.35, pose.pitch));
    return;
  }
  p.crouching = pose.crouching === true && !p.dropping && !p.downed;
  p.sprinting = pose.sprinting === true && !p.crouching;
  if (p.mantleUntil && now < p.mantleUntil) {
    p.yaw = pose.yaw;
    p.pitch = pose.pitch;
    return;
  }
  const dt = Math.max(0, (now - p.moveAt) / 1000);
  p.moveAt = now;
  p.credit = Math.min(
    p.downed ? 0.5 : 8,
    p.credit +
      dt *
        (p.downed
          ? 2
          : p.dropping
            ? GLIDE_SPEED
            : p.crouching
              ? MOVE.crouch + 0.2
              : p.sprinting
                ? MOVE.sprint + 0.3
                : MOVE.run + 0.3),
  );
  const dx = pose.x - p.x,
    dz = pose.z - p.z,
    distance = Math.hypot(dx, dz);
  if (
    distance <= p.credit &&
    Math.hypot(pose.x, pose.z) <= ARENA_RADIUS + 0.1
  ) {
    let clear = true;
    const steps = Math.max(1, Math.ceil(distance / 0.25));
    for (let i = 1; i <= steps && !p.dropping; i++)
      if (
        blocksBody(
          p.x + (dx * i) / steps,
          p.z + (dz * i) / steps,
          Math.min(p.y, pose.y) - 1.7,
          MAP.colliders,
        )
      ) {
        clear = false;
        break;
      }
    if (clear) {
      p.x = pose.x;
      p.z = pose.z;
      p.credit -= distance;
    }
  }
  if (!p.dropping) {
    const floor = groundAt(p.x, p.z, p.y - 1.7, MAP.colliders) + 1.7;
    p.y = p.downed
      ? floor
      : Math.max(
          floor,
          Math.min(Math.max(p.y, floor + 2.1), p.y + dt * 9 + 0.05, pose.y),
        );
  }
  p.yaw = pose.yaw % (Math.PI * 2);
  p.pitch = Math.max(-1.35, Math.min(1.35, pose.pitch));
  if (p.weapon !== pose.weapon && pose.weapon >= 0 && p.owned[pose.weapon]) {
    cancelRecovery(p);
    p.weapon = pose.weapon;
    p.reloadUntil = 0;
  }
}
function rayBox(origin: number[], dir: number[], min: number[], max: number[]) {
  let near = 0,
    far = 160;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dir[i]) < 1e-8) {
      if (origin[i] < min[i] || origin[i] > max[i]) return null;
      continue;
    }
    let a = (min[i] - origin[i]) / dir[i],
      b = (max[i] - origin[i]) / dir[i];
    if (a > b) [a, b] = [b, a];
    near = Math.max(near, a);
    far = Math.min(far, b);
    if (near > far) return null;
  }
  return near;
}
function shoot(room: Room, p: Member, aiming: boolean, now: number) {
  if (p.weapon < 0 || !p.owned[p.weapon]) return;
  cancelRecovery(p);
  const w = WEAPONS[p.weapon];
  if (
    p.reloadUntil ||
    now - (p.meleeAt ?? -1000) < MELEE.interval * 1000 ||
    now - p.shotAt < w.interval * 1000 - 5 ||
    p.ammo[p.weapon] <= 0
  )
    return;
  p.ammo[p.weapon]--;
  p.shotAt = now;
  const origin = [p.x, p.y - (p.crouching ? 0.65 : 0), p.z];
  let end: [number, number, number] = [p.x, p.y, p.z];
  let centerEnd: [number, number, number] | undefined;
  const hits = new Map<
    string,
    {
      amount: number;
      shieldDamage: number;
      shieldBreak: boolean;
      headshot: boolean;
    }
  >();
  for (let n = 0; n < w.pellets; n++) {
    const dir = shotDirection(p.yaw, p.pitch, p.weapon, aiming, n);
    let nearest = w.range,
      target: Member | undefined;
    for (const box of MAP.colliders) {
      const t = rayBox(origin, dir, box.min, box.max);
      if (t !== null && t < nearest) nearest = t;
    }
    for (const other of room.players) {
      if (
        other.id === p.id ||
        other.health <= 0 ||
        other.onBus ||
        teammates(room, p, other)
      )
        continue;
      const base = other.y - 1.7;
      const t = rayBox(
        origin,
        dir,
        [other.x - 0.47, base + 0.02, other.z - 0.32],
        [
          other.x + 0.47,
          base + (other.downed ? 0.85 : other.crouching ? 1.5 : 2.28),
          other.z + 0.32,
        ],
      );
      if (t !== null && t < nearest) {
        nearest = t;
        target = other;
      }
    }
    end = [
      origin[0] + dir[0] * nearest,
      origin[1] + dir[1] * nearest,
      origin[2] + dir[2] * nearest,
    ];
    if (n === 0) centerEnd = end;
    if (target) {
      const headshot =
        end[1] - (target.y - 1.7) > (target.crouching ? 1.15 : 1.72);
      const oldHealth = target.health,
        oldShield = target.shield;
      const amount = Math.min(
        oldHealth + oldShield,
        weaponDamage(p.weapon, nearest, p.tiers?.[p.weapon] ?? 0) *
          (headshot ? HEADSHOT_MULTIPLIER : 1),
      );
      damageMember(room, target, amount, now, p);
      const hit = hits.get(target.id) ?? {
        amount: 0,
        shieldDamage: 0,
        shieldBreak: false,
        headshot: false,
      };
      hit.amount += amount;
      hit.shieldDamage += oldShield - target.shield;
      hit.shieldBreak ||= oldShield > 0 && target.shield === 0;
      hit.headshot ||= headshot;
      hits.set(target.id, hit);
    }
  }
  for (const [target, hit] of hits)
    event(room, { type: 'hit', player: p.id, target, ...hit, at: now });
  event(room, { type: 'shot', player: p.id, end: centerEnd ?? end, at: now });
}
function melee(room: Room, p: Member, now: number) {
  if (
    now - (p.meleeAt ?? -1000) < MELEE.interval * 1000 ||
    now - p.shotAt < (WEAPONS[p.weapon]?.interval ?? 0.14) * 1000
  )
    return;
  p.meleeAt = now;
  p.reloadUntil = 0;
  cancelRecovery(p);
  const contact = meleeTarget(
    { x: p.x, y: p.y - (p.crouching ? 0.65 : 0), z: p.z },
    p.yaw,
    p.pitch,
    room.players
      .filter(
        (q) =>
          q.id !== p.id &&
          q.health > 0 &&
          !q.spectator &&
          !teammates(room, p, q),
      )
      .map((q) => meleeBody(q.id, q.x, q.y, q.z, q.crouching, q.downed)),
    MAP.colliders,
  );
  event(room, { type: 'melee', player: p.id, end: contact?.point, at: now });
  if (!contact) return;
  const target = room.players.find((q) => q.id === contact.id)!;
  const shield = target.shield,
    amount = Math.min(MELEE.damage, target.health + shield);
  damageMember(room, target, amount, now, p);
  event(room, {
    type: 'hit',
    player: p.id,
    target: target.id,
    amount,
    shieldDamage: Math.min(shield, amount),
    shieldBreak: shield > 0 && amount >= shield,
    headshot: false,
    at: now,
  });
}
export function applyCommand(
  room: Room,
  id: string,
  command: Command,
  now: number,
  internal = false,
) {
  const p = room.players.find((p) => p.id === id);
  if (!p) throw new GameError('Your room session has ended.', 401);
  p.lastSeen = now;
  p.connected = true;
  if (!internal) advance(room, now);
  if (command.type === 'leave') {
    if (
      !p.spectator &&
      (room.phase === 'playing' || room.phase === 'countdown')
    )
      eliminate(room, p, now);
    else room.players = room.players.filter((o) => o.id !== id);
    p.lastSeen = 0;
    p.connected = false;
    if (room.host === id)
      room.host =
        room.players.find((o) => o.id !== id && o.connected && !o.bot)?.id ??
        '';
    advance(room, now);
    return;
  }
  if (command.type === 'bots') {
    if (room.host !== id)
      throw new GameError('Only the host can set bots.', 403);
    if (room.phase !== 'waiting')
      throw new GameError('Set bots between rounds.', 409);
    if (![0, 4, 8].includes(command.count))
      throw new GameError('Choose 0, 4, or 8 bots.');
    room.botCount = command.count;
    return;
  }
  if (command.type === 'mode' || command.type === 'team') {
    if (room.phase !== 'waiting')
      throw new GameError('Change teams between rounds.', 409);
    if (command.type === 'mode') {
      if (room.host !== id)
        throw new GameError('Only the host can change the mode.', 403);
      room.mode = command.mode;
      room.players.forEach((q, i) => {
        q.team = i % Math.max(2, Math.ceil(room.players.length / 2));
      });
    } else {
      if (room.mode !== 'duos') throw new GameError('Choose Duos first.');
      if (
        room.players.filter((q) => q.id !== id && q.team === command.team)
          .length >= 2
      )
        throw new GameError('That duo is full.');
      p.team = command.team;
    }
    return;
  }
  if (command.type === 'start') {
    if (room.host !== id)
      throw new GameError('Only the host can start the match.', 403);
    if (room.phase !== 'waiting')
      throw new GameError('The match is already running.', 409);
    const connected = room.players.filter((o) => o.connected && !o.bot);
    if (connected.length + (room.botCount ?? 0) < 2)
      throw new GameError('At least two connected players are needed.');
    if (
      room.mode === 'duos' &&
      !(room.botCount ?? 0) &&
      new Set(connected.map((q) => q.team)).size < 2
    )
      throw new GameError(
        'Duos needs at least two teams. Choose different teams or invite more friends.',
      );
    room.players = [...connected];
    for (let i = 0; i < (room.botCount ?? 0); i++) {
      const bot = createMember(
        `bot-${i}`,
        [
          'Dune',
          'Pebble',
          'Bucket',
          'Sprout',
          'Scoop',
          'Rivet',
          'Marble',
          'Drift',
        ][i] + ' · BOT',
        'bot:no-login',
        now,
      );
      bot.bot = true;
      // Bots form their own duos; human team choices stay intact.
      bot.team = 4 + Math.floor(i / 2);
      room.players.push(bot);
    }
    room.busDuration = BUS_SECONDS;
    room.phase = 'countdown';
    room.round++;
    room.startAt = now + 5000;
    room.tickAt = now;
    room.winner = null;
    room.winningTeam = null;
    room.loot = MAP.loot.map((_, i) => !floorAvailable(i));
    room.drops = floorAmmo().map((d) => ({ ...d, ...safeLanding(d.x, d.z) }));
    room.chests = chestLayout(`${room.code}:${room.round}`);
    room.zonePlayers = connected.length;
    room.events = [];
    room.marks = [];
    room.players.forEach((member, i) => {
      const team = member.team,
        bot = member.bot;
      Object.assign(member, {
        ...createMember(member.id, member.name, member.tokenHash, now),
        team,
        ...busPosition(0),
        dropping: true,
        onBus: true,
        bot,
        launchAt: -10000,
        ai: bot ? { thinkAt: 0, jumpAt: 2 + ((i * 2.13) % 14) } : undefined,
      });
      member.yaw = Math.atan2(member.x, member.z);
    });
    return;
  }
  if (command.type === 'ready') {
    if (room.phase !== 'finished') return;
    p.ready = !p.ready;
    const connected = room.players.filter((q) => q.connected && !q.bot);
    if (
      connected.length > 0 &&
      connected.length + (room.botCount ?? 0) >= 2 &&
      connected.every((q) => q.ready) &&
      (room.mode !== 'duos' ||
        (room.botCount ?? 0) > 0 ||
        new Set(connected.map((q) => q.team)).size >= 2)
    ) {
      room.phase = 'waiting';
      applyCommand(room, room.host, { type: 'start' }, now);
    }
    return;
  }
  if (command.type === 'rematch') {
    if (room.host !== id)
      throw new GameError('Only the host can reset the room.', 403);
    if (room.phase !== 'finished')
      throw new GameError('Wait for this match to finish.', 409);
    room.phase = 'waiting';
    room.players = room.players.filter((p) => !p.bot);
    room.winner = null;
    return;
  }
  if (command.type === 'ping') return;
  if (room.phase !== 'playing' || p.health <= 0) return;
  if (command.type === 'jumpBus' && p.onBus) {
    Object.assign(p, busPosition((now - room.startAt) / 1000));
    p.onBus = false;
    p.moveAt = now;
    p.credit = 0;
    return;
  }
  if (p.onBus && command.type !== 'pose' && command.type !== 'mark') return;
  if (command.type === 'mark') {
    if (now - (p.lastMark ?? 0) < 1000) return;
    if (
      Math.hypot(command.point[0] - p.x, command.point[2] - p.z) >
      180 * ARENA_SCALE
    )
      return;
    p.lastMark = now;
    room.marks = (room.marks ?? []).filter(
      (e) => e.player !== p.id && now - e.at < 8000,
    );
    room.marks.push({
      id: randomUUID(),
      type: 'mark',
      player: p.id,
      end: command.point,
      label: command.label,
      at: now,
    });
    return;
  }
  if (command.type === 'cancelRevive') {
    stopRevive(p);
    return;
  }
  if (p.downed) {
    if (command.type === 'pose') move(p, command.pose, now);
    return;
  }
  if (
    p.dropping &&
    command.type !== 'pose' &&
    !(
      canGlideFire(p.dropping, !!p.onBus, p.launchAt, now) &&
      ['shoot', 'reload'].includes(command.type)
    )
  )
    return;
  if (command.type === 'mantle') {
    if (p.mantleUntil && now < p.mantleUntil) return;
    move(p, command.pose, now);
    const floor = groundAt(p.x, p.z, p.y - 1.7, MAP.colliders) + 1.7;
    const to =
      Math.abs(p.y - floor) < 0.2
        ? mantleTarget(p, p.yaw, MAP.colliders)
        : null;
    if (to) {
      p.crouching = false;
      p.mantleFrom = { x: p.x, y: p.y, z: p.z };
      p.mantleTo = to;
      p.mantleStarted = now;
      p.mantleUntil = now + MOVE.mantleSeconds * 1000;
    }
    return;
  }
  if (p.mantleUntil && now < p.mantleUntil && command.type !== 'pose') return;
  if (command.type === 'revive') {
    const target = room.players.find((q) => q.id === command.target);
    if (!target || !canRevive(room, p, target))
      throw new GameError('Move within 3m of your downed teammate.');
    if (p.reviving === target.id) return;
    cancelRecovery(p);
    p.reloadUntil = 0;
    p.reviving = target.id;
    p.reviveUntil = now + 4000;
    return;
  }
  if (['shoot', 'melee', 'reload', 'heal', 'pickup'].includes(command.type))
    stopRevive(p);
  if (command.type === 'cancelHeal') cancelRecovery(p);
  if (command.type === 'heal' && beginRecovery(p, command.item, now))
    p.reloadUntil = 0;
  if (
    command.type === 'pose' ||
    command.type === 'shoot' ||
    command.type === 'melee'
  )
    move(p, command.pose, now);
  if (command.type === 'shoot') shoot(room, p, command.aiming, now);
  if (command.type === 'melee') melee(room, p, now);
  if (
    command.type === 'reload' &&
    p.weapon >= 0 &&
    p.owned[p.weapon] &&
    !p.reloadUntil &&
    p.ammo[p.weapon] < WEAPONS[p.weapon].capacity &&
    p.reserve[p.weapon] > 0
  ) {
    cancelRecovery(p);
    p.reloadUntil = now + WEAPONS[p.weapon].reload * 1000;
  }
  if (command.type === 'chest') {
    const chest = room.chests?.[command.index],
      spot = CHEST_SPOTS[command.index];
    if (
      !chest?.active ||
      chest.openedAt ||
      !spot ||
      !canReach(p, { ...spot, y: 0.8 }, MAP.colliders)
    )
      return;
    chest.openedAt = now;
    room.drops ??= [];
    for (const drop of chestDrops(`${room.code}:${room.round}`, command.index))
      room.drops.push({ ...drop, ...safeLanding(drop.x, drop.z) });
    stopRevive(p);
    event(room, {
      type: 'chest',
      player: p.id,
      at: now,
      end: [spot.x, 0.8, spot.z],
    });
  }
  if (command.type === 'pickup') {
    if (!Number.isInteger(command.index)) return;
    const floor = command.index < MAP.loot.length;
    const l = floor
      ? MAP.loot[command.index]
      : room.drops?.[command.index - MAP.loot.length];
    if (
      !l ||
      isAmmo(l.kind) ||
      (floor ? room.loot[command.index] : (l as WorldDrop).used) ||
      !canReach(p, { x: l.x, y: 0.85, z: l.z }, MAP.colliders)
    )
      return;
    const drop = floor
      ? { ...l, rarity: floorRarity(command.index), used: false }
      : (l as WorldDrop);
    if (l.kind < 3) {
      const { swapped } = collectGun(p, drop);
      p.pickedUpAt = now;
      if (swapped !== null) {
        if (!floor) {
          drop.rarity = swapped;
          drop.ammo = 0;
          cancelRecovery(p);
          p.reloadUntil = 0;
          event(room, { type: 'pickup', player: p.id, at: now });
          advance(room, now);
          return;
        }
        room.drops ??= [];
        room.drops.push({
          x: l.x,
          z: l.z,
          kind: l.kind,
          rarity: swapped,
          ammo: 0,
          used: false,
        });
      }
      cancelRecovery(p);
      p.reloadUntil = 0;
    } else {
      const slot = l.kind === 3 ? 'cells' : 'medkits';
      if (p[slot] >= SUPPLY_LIMIT) return;
      const collected = Math.min(SUPPLY_LIMIT - p[slot], drop.amount ?? 1);
      p[slot] += collected;
      if (!floor) {
        drop.amount = (drop.amount ?? 1) - collected;
        if (drop.amount > 0) return;
      }
    }
    if (floor) room.loot[command.index] = true;
    else drop.used = true;
    event(room, { type: 'pickup', player: p.id, at: now });
  }
  if (!internal) advance(room, now);
}
export function snapshot(room: Room, now: number): RoomSnapshot {
  const zone = zoneAt(
    Math.max(0, (now - room.startAt) / 1000 - (room.busDuration ?? 0)),
    `${room.code}:${room.round}`,
    room.zonePlayers ?? 16,
  );
  return {
    code: room.code,
    host: room.host,
    botCount: room.botCount ?? 0,
    busDuration: room.busDuration ?? 0,
    mode: room.mode ?? 'solo',
    winningTeam: room.winningTeam ?? null,
    phase: room.phase,
    round: room.round,
    startAt: room.startAt,
    now,
    storm: zone.radius,
    zone,
    winner: room.winner,
    players: room.players.map(
      ({
        tokenHash: _tokenHash,
        lastSeen: _lastSeen,
        moveAt: _moveAt,
        credit: _credit,
        lastCommand: _lastCommand,
        commandError: _commandError,
        lastMark: _lastMark,
        ai: _ai,
        ...p
      }) => p,
    ),
    loot: room.loot,
    drops: room.drops ?? [],
    chests: room.chests ?? [],
    events: [
      ...room.events.filter((e) => now - e.at < 1500),
      ...(room.marks ?? []).filter((e) => now - e.at < 8000),
    ],
  };
}
export function parseCommand(value: unknown): Command {
  if (!value || typeof value !== 'object')
    throw new GameError('Invalid message.');
  const c = value as Command;
  if (
    [
      'ping',
      'reload',
      'leave',
      'start',
      'rematch',
      'ready',
      'jumpBus',
      'cancelHeal',
      'cancelRevive',
    ].includes(c.type)
  )
    return { type: c.type } as Command;
  if (c.type === 'bots' && [0, 4, 8].includes(c.count))
    return { type: 'bots', count: c.count };
  if (c.type === 'mode' && (c.mode === 'solo' || c.mode === 'duos'))
    return { type: 'mode', mode: c.mode };
  if (
    c.type === 'team' &&
    Number.isInteger(c.team) &&
    c.team >= 0 &&
    c.team < 4
  )
    return { type: 'team', team: c.team };
  if (
    c.type === 'revive' &&
    typeof c.target === 'string' &&
    c.target.length <= 100
  )
    return { type: 'revive', target: c.target };
  if (
    c.type === 'mark' &&
    Array.isArray(c.point) &&
    c.point.length === 3 &&
    c.point.every((n) => Number.isFinite(n) && Math.abs(n) <= 200) &&
    ['Go here', 'Enemy', 'Loot'].includes(c.label)
  )
    return { type: 'mark', point: c.point, label: c.label };
  if (
    (c.type === 'pose' ||
      c.type === 'shoot' ||
      c.type === 'mantle' ||
      c.type === 'melee') &&
    validPose(c.pose)
  ) {
    if (c.type === 'melee') return { type: 'melee', pose: c.pose };
    if (c.type === 'mantle') return { type: 'mantle', pose: c.pose };
    return c.type === 'pose'
      ? { type: 'pose', pose: c.pose }
      : { type: 'shoot', pose: c.pose, aiming: c.aiming === true };
  }
  if (c.type === 'heal' && (c.item === 'medkit' || c.item === 'shield'))
    return { type: 'heal', item: c.item };
  if (
    c.type === 'chest' &&
    Number.isInteger(c.index) &&
    c.index >= 0 &&
    c.index < CHEST_SPOTS.length
  )
    return { type: 'chest', index: c.index };
  if (c.type === 'pickup' && Number.isInteger(c.index))
    return { type: 'pickup', index: c.index };
  throw new GameError('Invalid message.');
}

export function forViewer(room: RoomSnapshot, playerId: string): RoomSnapshot {
  const me = room.players.find((p) => p.id === playerId);
  return {
    ...room,
    events: room.events.filter(
      (e) =>
        e.type !== 'mark' ||
        e.player === playerId ||
        (room.mode === 'duos' &&
          me &&
          room.players.find((p) => p.id === e.player)?.team === me.team),
    ),
  };
}
