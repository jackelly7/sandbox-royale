import { randomUUID } from 'node:crypto';
import { MAP } from '../lib/game/map-data.ts';
import {
  WEAPONS,
  stormRadius,
  takeDamage,
  reloadAmmo,
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
};
export type Room = {
  code: string;
  host: string;
  phase: RoomSnapshot['phase'];
  round: number;
  startAt: number;
  tickAt: number;
  winner: string | null;
  players: Member[];
  loot: boolean[];
  events: GameEvent[];
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
      x > b.min[0] - 0.48 &&
      x < b.max[0] + 0.48 &&
      z > b.min[2] - 0.48 &&
      z < b.max[2] + 0.48,
  );
}
export function safeSpawn(index: number, count: number) {
  const angle = (index / count) * Math.PI * 2;
  const x = Math.sin(angle) * 62,
    z = Math.cos(angle) * 62;
  for (let r = 0; r <= 20; r += 2)
    for (let i = 0; i < 12; i++) {
      const nx = x + Math.cos((i * Math.PI) / 6) * r,
        nz = z + Math.sin((i * Math.PI) / 6) * r;
      if (!blocked(nx, nz)) return { x: nx, y: 1.7, z: nz };
    }
  return { x: 0, y: 1.7, z: 50 };
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
    kills: 0,
    rank: 0,
    connected: true,
    owned: [false, false, false],
    ammo: [0, 0, 0],
    reserve: [0, 0, 0],
    reloadUntil: 0,
    shotAt: 0,
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
    round: 0,
    startAt: 0,
    tickAt: now,
    winner: null,
    players: [member],
    loot: MAP.loot.map(() => false),
    events: [],
  };
}
export function addMember(room: Room, member: Member) {
  if (room.phase !== 'waiting' && room.phase !== 'finished')
    throw new GameError(
      'This match has already started. Join after it finishes.',
      409,
    );
  if (room.players.length >= CAPACITY)
    throw new GameError('This room is full.', 409);
  room.players.push(member);
}
function event(room: Room, data: Omit<GameEvent, 'id'>) {
  room.events.push({ ...data, id: randomUUID() });
  room.events = room.events.slice(-40);
}
function eliminate(room: Room, player: Member, now: number, killer?: Member) {
  if (player.rank) return;
  player.health = 0;
  player.rank = room.players.filter((p) => p.health > 0 && !p.rank).length + 1;
  if (killer) {
    killer.kills++;
    event(room, {
      type: 'elimination',
      player: killer.id,
      target: player.id,
      at: now,
    });
  }
}
export function advance(room: Room, now: number) {
  const dt = Math.max(0, (now - room.tickAt) / 1000);
  room.tickAt = now;
  for (const p of room.players) {
    // Existing rooms finish with their previous loadout; new rounds start empty.
    p.owned ??= p.ammo.map((n, i) => n > 0 || p.reserve[i] > 0);
    p.connected = now - p.lastSeen < 5000;
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
    room.players = room.players.filter((p) => now - p.lastSeen < 60000);
    if (!room.players.find((p) => p.id === room.host)?.connected) {
      const next = room.players.find((p) => p.connected);
      if (next) room.host = next.id;
    }
    return;
  }
  if (room.phase === 'countdown' && now >= room.startAt) room.phase = 'playing';
  if (room.phase !== 'playing') return;
  const elapsed = Math.max(0, (now - room.startAt) / 1000),
    radius = stormRadius(elapsed);
  for (const p of room.players) {
    if (p.health <= 0) continue;
    if (now - p.lastSeen > 20000) {
      eliminate(room, p, now);
      continue;
    }
    if (Math.hypot(p.x, p.z) > radius) {
      p.health = Math.max(0, p.health - dt * (elapsed > 180 ? 11 : 5));
      if (!p.health) eliminate(room, p, now);
    }
  }
  const alive = room.players.filter((p) => p.health > 0);
  if (alive.length <= 1) {
    room.phase = 'finished';
    room.winner = alive[0]?.id ?? null;
    if (alive[0]) alive[0].rank = 1;
  }
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
  const dt = Math.max(0, (now - p.moveAt) / 1000);
  p.moveAt = now;
  p.credit = Math.min(8, p.credit + dt * 11.1);
  const dx = pose.x - p.x,
    dz = pose.z - p.z,
    distance = Math.hypot(dx, dz);
  if (distance <= p.credit && Math.hypot(pose.x, pose.z) <= 110.1) {
    let clear = true;
    const steps = Math.max(1, Math.ceil(distance / 0.25));
    for (let i = 1; i <= steps; i++)
      if (blocked(p.x + (dx * i) / steps, p.z + (dz * i) / steps)) {
        clear = false;
        break;
      }
    if (clear) {
      p.x = pose.x;
      p.z = pose.z;
      p.credit -= distance;
    }
  }
  p.y = Math.max(1.7, Math.min(3.05, pose.y));
  p.yaw = pose.yaw % (Math.PI * 2);
  p.pitch = Math.max(-1.35, Math.min(1.35, pose.pitch));
  if (p.weapon !== pose.weapon && pose.weapon >= 0 && p.owned[pose.weapon]) {
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
  const w = WEAPONS[p.weapon];
  if (
    p.reloadUntil ||
    now - p.shotAt < w.interval * 1000 - 5 ||
    p.ammo[p.weapon] <= 0
  )
    return;
  p.ammo[p.weapon]--;
  p.shotAt = now;
  const origin = [p.x, p.y, p.z];
  let end: [number, number, number] = [p.x, p.y, p.z];
  for (let n = 0; n < w.pellets; n++) {
    const spread = w.spread * (aiming ? 0.3 : 1),
      yaw = p.yaw + (Math.random() - 0.5) * spread,
      pitch = p.pitch + (Math.random() - 0.5) * spread;
    const dir = [
      -Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      -Math.cos(yaw) * Math.cos(pitch),
    ];
    let nearest = 150,
      target: Member | undefined;
    for (const box of MAP.colliders) {
      const t = rayBox(origin, dir, box.min, box.max);
      if (t !== null && t < nearest) nearest = t;
    }
    for (const other of room.players) {
      if (other.id === p.id || other.health <= 0) continue;
      const base = other.y - 1.7;
      const t = rayBox(
        origin,
        dir,
        [other.x - 0.47, base + 0.02, other.z - 0.32],
        [other.x + 0.47, base + 2.28, other.z + 0.32],
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
    if (target) {
      const headshot = end[1] - (target.y - 1.7) > 1.72;
      Object.assign(
        target,
        takeDamage(
          target.health,
          target.shield,
          w.damage * (headshot ? 1.65 : 1),
        ),
      );
      event(room, { type: 'hit', player: p.id, target: target.id, at: now });
      if (target.health <= 0) eliminate(room, target, now, p);
    }
  }
  event(room, { type: 'shot', player: p.id, end, at: now });
}
export function applyCommand(
  room: Room,
  id: string,
  command: Command,
  now: number,
) {
  const p = room.players.find((p) => p.id === id);
  if (!p) throw new GameError('Your room session has ended.', 401);
  p.lastSeen = now;
  p.connected = true;
  advance(room, now);
  if (command.type === 'leave') {
    if (room.phase === 'playing' || room.phase === 'countdown')
      eliminate(room, p, now);
    else room.players = room.players.filter((o) => o.id !== id);
    p.lastSeen = 0;
    p.connected = false;
    if (room.host === id)
      room.host =
        room.players.find((o) => o.id !== id && o.connected)?.id ?? '';
    advance(room, now);
    return;
  }
  if (command.type === 'start') {
    if (room.host !== id)
      throw new GameError('Only the host can start the match.', 403);
    if (room.phase !== 'waiting')
      throw new GameError('The match is already running.', 409);
    const connected = room.players.filter((o) => o.connected);
    if (connected.length < 2)
      throw new GameError('At least two connected players are needed.');
    room.players = connected;
    room.phase = 'countdown';
    room.round++;
    room.startAt = now + 5000;
    room.tickAt = now;
    room.winner = null;
    room.loot = MAP.loot.map(() => false);
    room.events = [];
    room.players.forEach((member, i) => {
      Object.assign(member, {
        ...createMember(member.id, member.name, member.tokenHash, now),
        ...safeSpawn(i, room.players.length),
      });
      member.yaw = Math.atan2(member.x, member.z);
    });
    return;
  }
  if (command.type === 'rematch') {
    if (room.host !== id)
      throw new GameError('Only the host can reset the room.', 403);
    if (room.phase !== 'finished')
      throw new GameError('Wait for this match to finish.', 409);
    room.phase = 'waiting';
    room.winner = null;
    return;
  }
  if (command.type === 'ping') return;
  if (room.phase !== 'playing' || p.health <= 0) return;
  if (command.type === 'pose' || command.type === 'shoot')
    move(p, command.pose, now);
  if (command.type === 'shoot') shoot(room, p, command.aiming, now);
  if (
    command.type === 'reload' &&
    p.weapon >= 0 &&
    p.owned[p.weapon] &&
    !p.reloadUntil &&
    p.ammo[p.weapon] < WEAPONS[p.weapon].capacity &&
    p.reserve[p.weapon] > 0
  )
    p.reloadUntil = now + WEAPONS[p.weapon].reload * 1000;
  if (command.type === 'pickup') {
    if (!Number.isInteger(command.index)) return;
    const l = MAP.loot[command.index];
    if (
      !l ||
      room.loot[command.index] ||
      Math.hypot(l.x - p.x, l.z - p.z) > 3.8
    )
      return;
    if (l.kind < 3) {
      if (!p.owned[l.kind]) {
        p.owned[l.kind] = true;
        p.ammo[l.kind] = WEAPONS[l.kind].capacity;
        p.weapon = l.kind;
        p.reloadUntil = 0;
      }
      p.reserve[l.kind] += WEAPONS[l.kind].capacity * 2;
    } else if (l.kind === 3) p.shield = Math.min(100, p.shield + 50);
    else p.health = Math.min(100, p.health + 45);
    room.loot[command.index] = true;
    event(room, { type: 'pickup', player: p.id, at: now });
  }
  advance(room, now);
}
export function snapshot(room: Room, now: number): RoomSnapshot {
  return {
    code: room.code,
    host: room.host,
    phase: room.phase,
    round: room.round,
    startAt: room.startAt,
    now,
    storm: stormRadius(Math.max(0, (now - room.startAt) / 1000)),
    winner: room.winner,
    players: room.players.map(
      ({
        tokenHash: _tokenHash,
        lastSeen: _lastSeen,
        moveAt: _moveAt,
        credit: _credit,
        lastCommand: _lastCommand,
        commandError: _commandError,
        ...p
      }) => p,
    ),
    loot: room.loot,
    events: room.events.filter((e) => now - e.at < 1500),
  };
}
export function parseCommand(value: unknown): Command {
  if (!value || typeof value !== 'object')
    throw new GameError('Invalid message.');
  const c = value as Command;
  if (['ping', 'reload', 'leave', 'start', 'rematch'].includes(c.type))
    return { type: c.type } as Command;
  if ((c.type === 'pose' || c.type === 'shoot') && validPose(c.pose)) {
    return c.type === 'pose'
      ? { type: 'pose', pose: c.pose }
      : { type: 'shoot', pose: c.pose, aiming: c.aiming === true };
  }
  if (c.type === 'pickup' && Number.isInteger(c.index))
    return { type: 'pickup', index: c.index };
  throw new GameError('Invalid message.');
}
