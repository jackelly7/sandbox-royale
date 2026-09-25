import {
  MODES,
  isArenaMode,
  isTeamMode,
  votedMode,
  TEAM_GOAL,
  type GameMode,
} from '../lib/game/modes.ts';
import { arenaLoadout, type DeathSpot } from '../lib/game/gun-game.ts';
import {
  GUN_COLLIDERS,
  arenaStep,
  arenaMove,
  arenaGround,
} from '../lib/game/gun-arena.ts';
import {
  REBOOT_STATIONS,
  REBOOT_SECONDS,
  comebacksOpen,
  type ComebackToken,
} from '../lib/game/comeback.ts';
import {
  REGEN_DELAY,
  REGEN_PER_SECOND,
  GUN_LADDER,
  GUN_RESPAWN_MS,
  GUN_RADIUS,
  gunLoadout,
  gunSpawn,
} from '../lib/game/gun-game.ts';
import {
  supplyPlan,
  supplyLoot,
  smokeLoot,
  throwSmoke,
  SMOKE_LIMIT,
  type Smoke,
  type SupplyDrop,
} from '../lib/game/battlefield.ts';
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
  headshotMultiplier,
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
  SessionScore,
} from '../lib/game/multiplayer.ts';
export const CAPACITY = 8;
export type Member = Player & {
  accountId?: string;
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
  mode?: GameMode;
  votes?: Record<string, GameMode>;
  teamScores?: number[];
  deathSpots?: DeathSpot[];
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
  supply?: SupplyDrop;
  smokes?: Smoke[];
  events: GameEvent[];
  marks?: GameEvent[];
  tokens?: ComebackToken[];
  scores?: SessionScore[];
  scoredRound?: number;
  matchId?: string;
  accountResults?: {
    matchId: string;
    accountId: string;
    mode: string;
    wins: number;
    kills: number;
    deaths: number;
  }[];
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
export const roomBounds = (room: Pick<Room, 'mode'>) =>
  isArenaMode(room.mode) ? GUN_COLLIDERS : MAP.colliders;
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
    deaths: 0,
    lastDamageAt: now,
    regenerating: false,
    comebackUsed: false,
    rebooting: null,
    rebootUntil: 0,
    rebootStation: -1,
    kills: 0,
    rank: 0,
    connected: true,
    ready: false,
    pickedUpAt: 0,
    smokes: 0,
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
  if (room.mode === 'team-deathmatch')
    member.team =
      room.players.filter((p) => p.team === 0).length <=
      room.players.filter((p) => p.team === 1).length
        ? 0
        : 1;
  room.players.push(member);
  if (isArenaMode(room.mode) && ['playing', 'countdown'].includes(room.phase))
    respawnGun(room, member, Math.max(member.lastSeen, room.startAt));
}
export function teammates(room: Room, a: Member, b: Member) {
  return isTeamMode(room.mode) && a.team === b.team && a.id !== b.id;
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
    room.phase === 'finished' ||
    teammates(room, attacker, target) ||
    target.health <= 0 ||
    target.spectator ||
    target.onBus ||
    (target.protectedUntil ?? 0) > now
  )
    return;
  target.lastDamageAt = now;
  target.regenerating = false;
  stopReboot(target);
  stopRevive(target);
  for (const q of room.players) if (q.reviving === target.id) stopRevive(q);
  Object.assign(target, takeDamage(target.health, target.shield, amount));
  if (target.health > 0) return;
  cancelRecovery(target);
  if (
    room.mode === 'duos' &&
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
function recordRound(room: Room) {
  if (
    room.phase !== 'finished' ||
    room.round < 1 ||
    room.scoredRound === room.round
  )
    return;
  room.scoredRound = room.round;
  room.scores ??= [];
  for (const p of room.players) {
    if (p.spectator) continue;
    let score = room.scores.find((s) => s.id === p.id);
    if (!score) {
      score = {
        id: p.id,
        name: p.name,
        bot: !!p.bot,
        wins: 0,
        kills: 0,
        deaths: 0,
        rounds: 0,
      };
      room.scores.push(score);
    }
    score.name = p.name;
    score.rounds++;
    score.kills += p.kills;
    score.deaths += p.deaths ?? 0;
    if (
      room.winner === p.id ||
      (isTeamMode(room.mode) &&
        room.winningTeam != null &&
        p.team === room.winningTeam)
    )
      score.wins++;
  }
  room.scores = room.scores.slice(-64);
  if (room.matchId)
    room.accountResults = room.players
      .filter((p) => p.accountId && !p.bot && !p.spectator)
      .map((p) => ({
        matchId: room.matchId!,
        accountId: p.accountId!,
        mode: room.mode ?? 'solo',
        wins: Number(
          room.winner === p.id ||
            (isTeamMode(room.mode) &&
              room.winningTeam != null &&
              p.team === room.winningTeam),
        ),
        kills: p.kills,
        deaths: p.deaths ?? 0,
      }));
}
function currentZone(room: Room, now: number) {
  return zoneAt(
    Math.max(0, (now - room.startAt) / 1000 - (room.busDuration ?? 0)),
    `${room.code}:${room.round}`,
    room.zonePlayers ?? 16,
  );
}
function stopReboot(p: Member) {
  p.rebooting = null;
  p.rebootUntil = 0;
  p.rebootStation = -1;
}
function dropToken(room: Room, p: Member, now: number) {
  if (!comebacksOpen(room.mode, currentZone(room, now))) return;
  const landing = safeLanding(p.x, p.z);
  room.tokens ??= [];
  for (const token of room.tokens)
    if (token.carriedBy === p.id)
      Object.assign(token, { ...landing, carriedBy: null });
  if (!p.comebackUsed && !room.tokens.some((t) => t.player === p.id))
    room.tokens.push({
      player: p.id,
      team: p.team ?? 0,
      ...landing,
      carriedBy: null,
    });
}
function canReboot(
  room: Room,
  p: Member,
  target: Member,
  station: number,
  now: number,
) {
  const spot = REBOOT_STATIONS[station],
    zone = currentZone(room, now);
  return (
    !!spot &&
    comebacksOpen(room.mode, zone) &&
    room.phase === 'playing' &&
    teammates(room, p, target) &&
    p.health > 0 &&
    !p.downed &&
    !p.dropping &&
    !p.mantleUntil &&
    p.connected &&
    target.connected &&
    target.health <= 0 &&
    !target.spectator &&
    !target.comebackUsed &&
    !outsideZone(spot.x, spot.z, zone) &&
    canReach(p, { ...spot, y: 1 }, MAP.colliders, 3.6) &&
    room.tokens?.some((t) => t.player === target.id && t.carriedBy === p.id)
  );
}
function updateComebacks(room: Room, now: number) {
  if (!comebacksOpen(room.mode, currentZone(room, now))) {
    room.tokens = [];
    for (const p of room.players) stopReboot(p);
    return;
  }
  for (const token of room.tokens ?? []) {
    if (token.carriedBy) continue;
    const carrier = room.players.find(
      (p) =>
        p.id !== token.player &&
        p.team === token.team &&
        p.health > 0 &&
        !p.downed &&
        !p.dropping &&
        !p.spectator &&
        p.connected &&
        canReach(p, { x: token.x, y: 0.8, z: token.z }, MAP.colliders, 2.5),
    );
    if (carrier) {
      token.carriedBy = carrier.id;
      event(room, {
        type: 'token',
        player: carrier.id,
        target: token.player,
        at: now,
      });
    }
  }
  for (const p of room.players) {
    if (!p.rebooting) continue;
    const target = room.players.find((q) => q.id === p.rebooting),
      station = p.rebootStation ?? -1;
    if (!target || !canReboot(room, p, target, station, now)) {
      stopReboot(p);
      continue;
    }
    if (now < (p.rebootUntil ?? Infinity)) continue;
    const spot = REBOOT_STATIONS[station],
      landing = safeLanding(spot.x, spot.z + 2);
    Object.assign(target, {
      ...landing,
      y: 1.7,
      health: 100,
      shield: 0,
      comebackUsed: true,
      spawnedAt: now,
      protectedUntil: now + 1800,
      rank: 0,
      respawnAt: 0,
      downed: false,
      bleedOutAt: 0,
      diedAt: 0,
      killedBy: null,
      dropping: false,
      onBus: false,
      weapon: -1,
      owned: [false, false, false],
      tiers: [0, 0, 0],
      ammo: [0, 0, 0],
      reserve: [0, 0, 0],
      medkits: 0,
      cells: 0,
      smokes: 0,
      healing: null,
      healUntil: 0,
      reloadUntil: 0,
      moveAt: now,
      credit: 0,
      mantleUntil: 0,
      launchAt: -10000,
    });
    if (target.bot) target.ai = { thinkAt: 0, jumpAt: 0 };
    room.tokens = (room.tokens ?? []).filter((t) => t.player !== target.id);
    stopReboot(p);
    event(room, { type: 'reboot', player: p.id, target: target.id, at: now });
  }
}
function finishTeam(room: Room, team: number | null) {
  room.phase = 'finished';
  room.winningTeam = team;
  room.winner =
    room.players.find((p) => p.team === team && !p.spectator)?.id ?? null;
  room.players.forEach((p) => (p.rank = p.team === team ? 1 : 2));
  recordRound(room);
}
function nextRound(room: Room, now: number) {
  const mode = votedMode(room.players, room.votes, room.mode);
  if (mode !== room.mode && mode === 'duos')
    room.players
      .filter((p) => !p.bot)
      .forEach(
        (p, i) =>
          (p.team =
            i %
            Math.max(
              2,
              Math.ceil(room.players.filter((q) => !q.bot).length / 2),
            )),
      );
  room.mode = mode;
  room.phase = 'waiting';
  applyCommand(room, room.host, { type: 'start' }, now);
}
function finishGun(room: Room, winner: Member | undefined) {
  room.phase = 'finished';
  room.winner = winner?.id ?? null;
  room.winningTeam = null;
  const ordered = room.players
    .filter((p) => !p.spectator)
    .sort(
      (a, b) =>
        Number(b.id === winner?.id) - Number(a.id === winner?.id) ||
        (b.gunStage ?? 0) - (a.gunStage ?? 0) ||
        b.kills - a.kills,
    );
  ordered.forEach((p, i) => (p.rank = i + 1));
  if (winner) winner.rank = 1;
  recordRound(room);
}
function respawnGun(room: Room, p: Member, now: number) {
  const spot = gunSpawn(
    room.players.filter((q) => q.id !== p.id),
    now + p.kills,
    room.deathSpots ?? [],
    now,
    room.mode === 'team-deathmatch' ? p.team : undefined,
  );
  Object.assign(p, {
    ...spot,
    y: 1.7,
    health: 100,
    shield: 50,
    dropping: false,
    onBus: false,
    downed: false,
    spectator: false,
    rank: 0,
    respawnAt: 0,
    spawnedAt: now,
    lastDamageAt: now,
    regenerating: false,
    protectedUntil: now + 1800,
    killedBy: null,
    healing: null,
    healUntil: 0,
    moveAt: now,
    credit: 0,
    mantleUntil: 0,
    reviving: null,
    reviveUntil: 0,
    launchAt: -10000,
    ...(room.mode === 'team-deathmatch'
      ? arenaLoadout(p.loadout ?? 0)
      : gunLoadout(p.gunStage ?? 0)),
  });
  if (p.bot) p.ai = { thinkAt: 0, jumpAt: 0 };
}
function eliminate(room: Room, player: Member, now: number, killer?: Member) {
  if (player.rank || player.spectator || player.respawnAt) return;
  player.deaths = (player.deaths ?? 0) + 1;
  stopReboot(player);
  if (isArenaMode(room.mode))
    room.deathSpots = [
      ...(room.deathSpots ?? []).filter((d) => now - d.at < 12000),
      { x: player.x, z: player.z, at: now },
    ].slice(-32);
  if (room.mode === 'duos') dropToken(room, player, now);
  if (isArenaMode(room.mode)) {
    if (player.respawnAt) return;
    player.health = 0;
    player.shield = 0;
    player.dropping = false;
    player.onBus = false;
    player.diedAt = now;
    player.killedBy = killer?.id ?? null;
    player.respawnAt = now + GUN_RESPAWN_MS;
    player.reloadUntil = 0;
    player.mantleUntil = 0;
    cancelRecovery(player);
    if (killer && killer.id !== player.id) {
      killer.kills++;
      if (room.mode === 'team-deathmatch') {
        room.teamScores ??= [0, 0];
        room.teamScores[killer.team ?? 0]++;
        if (room.teamScores[killer.team ?? 0] >= TEAM_GOAL)
          finishTeam(room, killer.team ?? 0);
      } else {
        killer.gunStage = (killer.gunStage ?? 0) + 1;
        if (killer.gunStage === GUN_LADDER.length - 1)
          event(room, { type: 'finalWeapon', player: killer.id, at: now });
        if (killer.gunStage >= GUN_LADDER.length) finishGun(room, killer);
        else
          Object.assign(killer, gunLoadout(killer.gunStage), {
            pickedUpAt: now,
          });
      }
    }
    event(room, {
      type: 'elimination',
      player: killer?.id ?? 'sandbox',
      target: player.id,
      at: now,
    });
    return;
  }
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
  room.smokes = (room.smokes ?? []).filter(
    (s) => s.endsAt > now - room.startAt,
  );
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
  if (room.phase === 'finished') recordRound(room);
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
      (votedMode(room.players, room.votes, room.mode) !== 'duos' ||
        room.mode !== 'duos' ||
        (room.botCount ?? 0) > 0 ||
        new Set(connected.map((p) => p.team)).size >= 2)
    ) {
      nextRound(room, now);
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
    if (
      isArenaMode(room.mode) &&
      p.respawnAt &&
      now >= p.respawnAt &&
      p.connected
    )
      respawnGun(room, p, now);
    if (isArenaMode(room.mode) && p.weapon >= 0) p.reserve[p.weapon] = 999;
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
      !isArenaMode(room.mode) &&
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
    if (
      outsideZone(
        p.x,
        p.z,
        isArenaMode(room.mode) ? { x: 0, z: 0, radius: GUN_RADIUS } : zone,
      )
    ) {
      stopRevive(p);
      stopReboot(p);
      p.lastDamageAt = now;
      p.regenerating = false;
      p.health = Math.max(0, p.health - dt * (elapsed > 300 ? 11 : 5));
      if (!p.health) eliminate(room, p, now);
    }
  }
  updateComebacks(room, now);
  if (dt > 0) updateRoomBots(room, now, Math.min(dt, 0.25));
  if (isArenaMode(room.mode) && room.phase === 'playing')
    for (const p of room.players) {
      p.regenerating = false;
      if (
        p.health <= 0 ||
        p.health >= 100 ||
        now < (p.lastDamageAt ?? now) + REGEN_DELAY
      )
        continue;
      const healingSeconds = Math.max(
        0,
        (now -
          Math.max(now - dt * 1000, (p.lastDamageAt ?? now) + REGEN_DELAY)) /
          1000,
      );
      p.health = Math.min(100, p.health + healingSeconds * REGEN_PER_SECOND);
      p.regenerating = p.health < 100;
    }
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
  if (isArenaMode(room.mode)) {
    const playing = room.players.filter(
      (p) => !p.spectator && (p.bot || now - p.lastSeen < 20000),
    );
    if (room.phase === 'playing') {
      if (room.mode === 'team-deathmatch') {
        const teams = new Set(playing.map((p) => p.team));
        if (teams.size < 2) finishTeam(room, playing[0]?.team ?? null);
      } else if (playing.length < 2) finishGun(room, playing[0]);
    }
    return;
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
    recordRound(room);
  }
}
export function autoAmmo(room: Room, p: Member, now: number) {
  if (
    room.phase !== 'playing' ||
    isArenaMode(room.mode) ||
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
    v.weapon < WEAPONS.length
  );
}
function move(room: Room, p: Member, pose: PlayerPose, now: number) {
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
    Math.hypot(pose.x, pose.z) <=
      (isArenaMode(room.mode) ? GUN_RADIUS : ARENA_RADIUS) + 0.1
  ) {
    if (room.mode === 'gun-game') {
      const next = arenaMove(p, dx, dz);
      p.credit -= Math.hypot(next.x - p.x, next.z - p.z);
      p.x = next.x;
      p.y = next.y;
      p.z = next.z;
    } else {
      let clear = true,
        feet = p.y - 1.7;
      const steps = Math.max(1, Math.ceil(distance / 0.25));
      for (let i = 1; i <= steps && !p.dropping; i++) {
        const x = p.x + (dx * i) / steps,
          z = p.z + (dz * i) / steps;
        if (isArenaMode(room.mode)) {
          const next = arenaStep(x, z, feet);
          if (next === null) {
            clear = false;
            break;
          }
          feet = next;
        } else if (
          blocksBody(x, z, Math.min(p.y, pose.y) - 1.7, roomBounds(room))
        ) {
          clear = false;
          break;
        }
      }
      if (clear) {
        p.x = pose.x;
        p.z = pose.z;
        p.credit -= distance;
        if (isArenaMode(room.mode)) p.y = Math.max(p.y, feet + 1.7);
      }
    }
  }
  if (!p.dropping) {
    const floor =
      (isArenaMode(room.mode)
        ? arenaGround(p.x, p.z, p.y - 1.7)
        : groundAt(p.x, p.z, p.y - 1.7, roomBounds(room))) + 1.7;
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
function rayBox(
  origin: number[],
  dir: number[],
  min: readonly number[],
  max: readonly number[],
) {
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
  const shotWeapon = p.weapon,
    w = WEAPONS[shotWeapon];
  if (
    p.reloadUntil ||
    now - (p.meleeAt ?? -1000) < MELEE.interval * 1000 ||
    now - p.shotAt < w.interval * 1000 - 5 ||
    p.ammo[p.weapon] <= 0
  )
    return;
  p.protectedUntil = 0;
  p.ammo[shotWeapon]--;
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
    if (room.phase === 'finished') break;
    const dir = shotDirection(p.yaw, p.pitch, shotWeapon, aiming, n, room.mode);
    let nearest = w.range,
      target: Member | undefined;
    for (const box of roomBounds(room)) {
      const t = rayBox(origin, dir, box.min, box.max);
      if (t !== null && t < nearest) nearest = t;
    }
    for (const other of room.players) {
      if (
        other.id === p.id ||
        other.health <= 0 ||
        other.onBus ||
        (other.protectedUntil ?? 0) > now ||
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
        weaponDamage(
          shotWeapon,
          nearest,
          p.tiers?.[shotWeapon] ?? 0,
          room.mode,
        ) *
          (headshot
            ? headshotMultiplier(shotWeapon, p.tiers?.[shotWeapon] ?? 0)
            : 1),
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
  event(room, {
    type: 'shot',
    player: p.id,
    weapon: shotWeapon,
    end: centerEnd ?? end,
    at: now,
  });
}
function melee(room: Room, p: Member, now: number) {
  if (
    now - (p.meleeAt ?? -1000) < MELEE.interval * 1000 ||
    now - p.shotAt < (WEAPONS[p.weapon]?.interval ?? 0.14) * 1000
  )
    return;
  p.protectedUntil = 0;
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
    roomBounds(room),
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
  if (
    room.mode === 'gun-game' &&
    'pose' in command &&
    command.pose.spawnedAt !== undefined &&
    command.pose.spawnedAt !== p.spawnedAt
  )
    return;
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
  if (command.type === 'vote') {
    if (room.phase !== 'finished')
      throw new GameError('Vote after this round finishes.', 409);
    room.votes ??= {};
    room.votes[id] = command.mode;
    p.ready = false;
    return;
  }
  if (command.type === 'loadout') {
    if (room.mode !== 'team-deathmatch')
      throw new GameError('Choose Team Deathmatch first.');
    p.loadout = command.weapon;
    if (
      room.phase === 'playing' &&
      p.health > 0 &&
      (p.protectedUntil ?? 0) > now
    )
      Object.assign(p, arenaLoadout(command.weapon), { pickedUpAt: now });
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
        q.team =
          i %
          (room.mode === 'team-deathmatch'
            ? 2
            : Math.max(2, Math.ceil(room.players.length / 2)));
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
    if (room.mode === 'team-deathmatch')
      room.players.forEach((p, i) => {
        p.team = i % 2;
        if (p.bot) p.loadout = [0, 1, 4, 6][i % 4];
      });
    room.votes = {};
    room.teamScores = [0, 0];
    room.deathSpots = [];
    room.busDuration = BUS_SECONDS;
    room.phase = 'countdown';
    room.round++;
    room.matchId = randomUUID();
    room.startAt = now + 5000;
    room.tickAt = now;
    room.winner = null;
    room.winningTeam = null;
    room.loot = MAP.loot.map((_, i) => !floorAvailable(i));
    room.smokes = [];
    room.tokens = [];
    room.supply = supplyPlan(`${room.code}:${room.round}`);
    room.drops = [...floorAmmo(), ...smokeLoot()].map((d) => ({
      ...d,
      ...safeLanding(d.x, d.z),
    }));
    room.chests = chestLayout(`${room.code}:${room.round}`);
    room.zonePlayers = connected.length;
    room.events = [];
    room.marks = [];
    room.players.forEach((member, i) => {
      const loadout = member.loadout ?? 0;
      const team = member.team,
        bot = member.bot;
      Object.assign(member, {
        ...createMember(member.id, member.name, member.tokenHash, now),
        team,
        loadout,
        gunStage: 0,
        respawnAt: 0,
        spawnedAt: 0,
        protectedUntil: 0,
        ...busPosition(0),
        dropping: true,
        onBus: true,
        bot,
        launchAt: -10000,
        ai: bot ? { thinkAt: 0, jumpAt: 2 + ((i * 2.13) % 14) } : undefined,
      });
      member.yaw = Math.atan2(member.x, member.z);
    });
    if (isArenaMode(room.mode)) {
      room.busDuration = 0;
      room.supply = undefined;
      room.drops = [];
      room.loot = MAP.loot.map(() => true);
      room.chests = [];
      for (const p of room.players) {
        p.gunStage = 0;
        respawnGun(room, p, room.startAt);
      }
    }
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
      (votedMode(room.players, room.votes, room.mode) !== 'duos' ||
        room.mode !== 'duos' ||
        (room.botCount ?? 0) > 0 ||
        new Set(connected.map((q) => q.team)).size >= 2)
    ) {
      nextRound(room, now);
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
  if (command.type === 'cancelReboot') {
    stopReboot(p);
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
  if (
    isArenaMode(room.mode) &&
    ['heal', 'smoke', 'pickup', 'chest', 'supply', 'revive', 'reboot'].includes(
      command.type,
    )
  )
    return;
  if (
    command.type !== 'pose' &&
    command.type !== 'reboot' &&
    command.type !== 'mark'
  )
    stopReboot(p);
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
    if (command.type === 'pose') move(room, p, command.pose, now);
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
  if (command.type === 'reboot') {
    const token = room.tokens?.find((t) => t.carriedBy === p.id);
    const target = room.players.find((q) => q.id === token?.player);
    if (!target || !canReboot(room, p, target, command.station, now)) return;
    if (p.rebooting === target.id && p.rebootStation === command.station)
      return;
    stopRevive(p);
    cancelRecovery(p);
    p.reloadUntil = 0;
    p.rebooting = target.id;
    p.rebootStation = command.station;
    p.rebootUntil = now + REBOOT_SECONDS * 1000;
    return;
  }
  if (command.type === 'smoke') {
    if ((p.smokes ?? 0) < 1 || (room.smokes?.length ?? 0) >= SMOKE_LIMIT)
      return;
    move(room, p, command.pose, now);
    room.smokes ??= [];
    room.smokes.push(
      throwSmoke(
        p,
        p.yaw,
        p.pitch,
        now - room.startAt,
        MAP.colliders,
        randomUUID(),
      ),
    );
    p.smokes!--;
    cancelRecovery(p);
    p.reloadUntil = 0;
    stopRevive(p);
    event(room, { type: 'smoke', player: p.id, at: now });
    return;
  }
  if (command.type === 'supply') {
    const supply = room.supply;
    if (
      !supply ||
      supply.opened ||
      now - room.startAt < supply.arrivesAt ||
      !canReach(p, { ...supply, y: 1 }, MAP.colliders)
    )
      return;
    supply.opened = true;
    room.drops ??= [];
    room.drops.push(
      ...supplyLoot(supply).map((d) => ({ ...d, ...safeLanding(d.x, d.z) })),
    );
    event(room, { type: 'supply', player: p.id, at: now });
    return;
  }
  if (command.type === 'mantle') {
    if (p.mantleUntil && now < p.mantleUntil) return;
    move(room, p, command.pose, now);
    const floor =
      (isArenaMode(room.mode)
        ? arenaGround(p.x, p.z, p.y - 1.7)
        : groundAt(p.x, p.z, p.y - 1.7, roomBounds(room))) + 1.7;
    const to =
      Math.abs(p.y - floor) < 0.2
        ? mantleTarget(p, p.yaw, roomBounds(room))
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
    move(room, p, command.pose, now);
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
    if (l.kind === 8) {
      const taken = Math.min(2 - (p.smokes ?? 0), drop.amount ?? 1);
      if (taken <= 0) return;
      p.smokes = (p.smokes ?? 0) + taken;
      drop.amount = (drop.amount ?? 1) - taken;
      drop.used = drop.amount <= 0;
      event(room, { type: 'pickup', player: p.id, at: now });
      return;
    }
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
    tokens: room.tokens ?? [],
    scores: room.scores ?? [],
    votes: room.votes ?? {},
    nextMode: votedMode(room.players, room.votes, room.mode),
    teamScores: room.teamScores ?? [0, 0],
    comebacksOpen: room.phase === 'playing' && comebacksOpen(room.mode, zone),
    smokes: room.smokes ?? [],
    supply: room.supply,
    mode: room.mode ?? 'solo',
    winningTeam: room.winningTeam ?? null,
    phase: room.phase,
    round: room.round,
    startAt: room.startAt,
    now,
    storm: isArenaMode(room.mode) ? GUN_RADIUS : zone.radius,
    zone: isArenaMode(room.mode)
      ? {
          x: 0,
          z: 0,
          radius: GUN_RADIUS,
          next: { x: 0, z: 0, radius: GUN_RADIUS },
          phase: 1,
          stage: 'final',
          remaining: 0,
        }
      : zone,
    winner: room.winner,
    players: room.players.map(
      ({
        accountId: _accountId,
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
      'supply',
      'cancelReboot',
      'cancelHeal',
      'cancelRevive',
    ].includes(c.type)
  )
    return { type: c.type } as Command;
  if (
    c.type === 'reboot' &&
    Number.isInteger(c.station) &&
    c.station >= 0 &&
    c.station < REBOOT_STATIONS.length
  )
    return { type: 'reboot', station: c.station };
  if (c.type === 'bots' && [0, 4, 8].includes(c.count))
    return { type: 'bots', count: c.count };
  if ((c.type === 'mode' || c.type === 'vote') && MODES.includes(c.mode))
    return { type: c.type, mode: c.mode };
  if (
    c.type === 'loadout' &&
    Number.isInteger(c.weapon) &&
    c.weapon >= 0 &&
    c.weapon < WEAPONS.length
  )
    return { type: 'loadout', weapon: c.weapon };
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
      c.type === 'melee' ||
      c.type === 'smoke') &&
    validPose(c.pose)
  ) {
    if (c.type === 'smoke') return { type: 'smoke', pose: c.pose };
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
    tokens: room.tokens?.filter((t) => t.team === me?.team),
    events: room.events.filter(
      (e) =>
        e.type !== 'mark' ||
        e.player === playerId ||
        (isTeamMode(room.mode) &&
          me &&
          room.players.find((p) => p.id === e.player)?.team === me.team),
    ),
  };
}
