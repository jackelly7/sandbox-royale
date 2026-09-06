import { isArenaMode, isTeamMode } from '../lib/game/modes.ts';
import { smokeBlocks } from '../lib/game/battlefield.ts';
import { GLIDE_SPEED } from '../lib/game/traversal.ts';
import { MAP } from '../lib/game/map-data.ts';
import { GUN_RADIUS, GUN_COLLIDERS } from '../lib/game/gun-arena.ts';
import { REBOOT_STATIONS } from '../lib/game/comeback.ts';
import { ARENA_RADIUS } from '../lib/game/arena.ts';
import { CHEST_SPOTS, canReach } from '../lib/game/chests.ts';
import { floorAvailable, floorRarity } from '../lib/game/loot.ts';
import { blocksBody } from '../lib/game/movement.ts';
import { WEAPONS, weaponDamage } from '../lib/game/rules.ts';
import { zoneAt, outsideZone } from '../lib/game/zones.ts';
import { applyCommand, type Room, type Member } from './model.ts';
type Point = { x: number; z: number };
const cells = new Map<string, boolean>();
function clear(x: number, z: number, gun = false) {
  const key = `${gun}:${x},${z}`;
  let result = cells.get(key);
  if (result === undefined) {
    result =
      Math.hypot(x, z) < (gun ? GUN_RADIUS : ARENA_RADIUS) - 2 &&
      !blocksBody(x, z, 0, gun ? GUN_COLLIDERS : MAP.colliders);
    cells.set(key, result);
  }
  return result;
}
function segment(a: Point, b: Point, gun = false) {
  const n = Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) / 0.6);
  for (let i = 1; i <= n; i++)
    if (
      blocksBody(
        a.x + ((b.x - a.x) * i) / n,
        a.z + ((b.z - a.z) * i) / n,
        0,
        gun ? GUN_COLLIDERS : MAP.colliders,
      )
    )
      return false;
  return true;
}
// Bounded A*: paths are retained in room state and rebuilt at most every four seconds.
export function botPath(from: Point, to: Point, gun = false): Point[] {
  if (segment(from, to, gun)) return [to];
  const snap = (p: Point) => ({
    x: Math.round(p.x / 3) * 3,
    z: Math.round(p.z / 3) * 3,
  });
  const start = snap(from),
    goal = snap(to),
    key = (p: Point) => `${p.x},${p.z}`;
  const open = [{ ...start, g: 0, f: 0 }],
    best = new Map([[key(start), 0]]),
    parent = new Map<string, Point>();
  let end: Point | undefined;
  for (let visits = 0; open.length && visits < 1800; visits++) {
    let index = 0;
    for (let i = 1; i < open.length; i++)
      if (open[i].f < open[index].f) index = i;
    const p = open.splice(index, 1)[0];
    if (Math.hypot(p.x - goal.x, p.z - goal.z) < 4 && segment(p, to, gun)) {
      end = p;
      break;
    }
    for (const [dx, dz] of [
      [3, 0],
      [-3, 0],
      [0, 3],
      [0, -3],
      [3, 3],
      [3, -3],
      [-3, 3],
      [-3, -3],
    ]) {
      const q = { x: p.x + dx, z: p.z + dz };
      if (!clear(q.x, q.z, gun) || !segment(p, q, gun)) continue;
      const g = p.g + Math.hypot(dx, dz),
        k = key(q);
      if (g >= (best.get(k) ?? Infinity)) continue;
      best.set(k, g);
      parent.set(k, p);
      open.push({ ...q, g, f: g + Math.hypot(q.x - goal.x, q.z - goal.z) });
    }
  }
  if (!end) return [];
  const path: Point[] = [to];
  while (key(end) !== key(start)) {
    path.unshift({ x: end.x, z: end.z });
    end = parent.get(key(end))!;
  }
  if (segment(from, start, gun)) path.unshift(start);
  return path;
}
function command(
  room: Room,
  p: Member,
  c: Parameters<typeof applyCommand>[2],
  now: number,
) {
  applyCommand(room, p.id, c, now, true);
}
export function updateRoomBots(room: Room, now: number, dt: number) {
  const gun = isArenaMode(room.mode),
    boxes = gun ? GUN_COLLIDERS : MAP.colliders;
  const zone = isArenaMode(room.mode)
    ? {
        x: 0,
        z: 0,
        radius: GUN_RADIUS,
        next: { x: 0, z: 0, radius: GUN_RADIUS },
      }
    : zoneAt(
        Math.max(0, (now - room.startAt) / 1000 - (room.busDuration ?? 0)),
        `${room.code}:${room.round}`,
      );
  for (const p of room.players) {
    if (room.phase !== 'playing') return;
    if (!p.bot || p.health <= 0 || p.onBus || p.downed) continue;
    const ai = (p.ai ??= { thinkAt: 0, jumpAt: 8 });
    if (now >= ai.thinkAt) {
      ai.thinkAt = now + 250;
      const enemies = room.players.filter(
        (q) =>
          q.id !== p.id &&
          q.health > 0 &&
          (q.protectedUntil ?? 0) <= now &&
          !q.spectator &&
          !q.onBus &&
          !smokeBlocks(p, q, room.smokes ?? [], now - room.startAt) &&
          (!isTeamMode(room.mode) || q.team !== p.team),
      );
      const enemy = enemies.sort(
        (a, b) =>
          Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z),
      )[0];
      const distance = enemy
        ? Math.hypot(enemy.x - p.x, enemy.z - p.z)
        : Infinity;
      const gear = [
        ...MAP.loot.map((d, i) => ({
          ...d,
          rarity: floorRarity(i),
          used: room.loot[i] || !floorAvailable(i),
          index: i,
        })),
        ...(room.drops ?? []).map((d, i) => ({
          ...d,
          index: MAP.loot.length + i,
        })),
      ];
      const needsGun = !p.owned.some(Boolean);
      const usable = p.owned.some(
        (has, i) => has && (p.ammo[i] > 0 || p.reserve[i] > 0),
      );
      const loot = gear
        .filter(
          (d) =>
            !d.used &&
            (needsGun
              ? d.kind < 3
              : !usable
                ? d.kind >= 5 && p.owned[d.kind - 5]
                : (d.kind === 4 && p.medkits < 1) ||
                  (d.kind === 3 && p.cells < 1)),
        )
        .sort(
          (a, b) =>
            Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z),
        )[0];
      const chest = (room.chests ?? [])
        .map((c, i) => ({ ...c, ...CHEST_SPOTS[i], index: i }))
        .filter((c) => c.active && !c.openedAt)
        .sort(
          (a, b) =>
            Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z),
        )[0];
      const mate = room.players.find(
        (q) =>
          room.mode === 'duos' &&
          q.id !== p.id &&
          q.team === p.team &&
          q.downed &&
          q.health > 0,
      );
      const token = room.tokens?.find(
        (t) =>
          t.team === p.team &&
          t.player !== p.id &&
          (!t.carriedBy || t.carriedBy === p.id),
      );
      const station =
        token?.carriedBy === p.id
          ? REBOOT_STATIONS.map((s, i) => ({ ...s, index: i }))
              .filter((s) => !outsideZone(s.x, s.z, zone))
              .sort(
                (a, b) =>
                  Math.hypot(a.x - p.x, a.z - p.z) -
                  Math.hypot(b.x - p.x, b.z - p.z),
              )[0]
          : undefined;
      if (
        outsideZone(p.x, p.z, { ...zone, radius: Math.max(2, zone.radius - 8) })
      )
        ai.goal = { x: zone.next.x, z: zone.next.z };
      else if (mate) {
        ai.goal = { x: mate.x, z: mate.z };
        if (canReach(p, { ...mate, y: 1.7 }, boxes, 3))
          command(room, p, { type: 'revive', target: mate.id }, now);
      } else if (token && (station || !token.carriedBy)) {
        const target = station ?? token;
        ai.goal = { x: target.x, z: target.z };
        if (station && canReach(p, { ...station, y: 1 }, boxes, 3.6))
          command(room, p, { type: 'reboot', station: station.index }, now);
      } else if ((needsGun || !usable) && (loot || chest)) {
        const useChest =
          chest &&
          (!loot ||
            Math.hypot(chest.x - p.x, chest.z - p.z) <
              Math.hypot(loot.x - p.x, loot.z - p.z));
        const target = useChest ? chest : loot!;
        ai.goal = { x: target.x, z: target.z };
        if (!p.dropping && canReach(p, { ...target, y: 0.9 }, boxes, 3.6)) {
          if (useChest)
            command(room, p, { type: 'chest', index: chest.index }, now);
          else if (loot && loot.kind < 5)
            command(room, p, { type: 'pickup', index: loot.index }, now);
        }
      } else if (
        loot &&
        distance > 35 &&
        Math.hypot(loot.x - p.x, loot.z - p.z) < 20
      ) {
        ai.goal = { x: loot.x, z: loot.z };
        if (canReach(p, { ...loot, y: 0.9 }, boxes, 3.6))
          command(room, p, { type: 'pickup', index: loot.index }, now);
      } else if (enemy) ai.goal = { x: enemy.x, z: enemy.z };
      if (!p.dropping && !p.reviving && !p.rebooting) {
        if (p.health < 65 && p.medkits && !p.healing)
          command(room, p, { type: 'heal', item: 'medkit' }, now);
        else if (p.shield < 40 && p.cells && !p.healing)
          command(room, p, { type: 'heal', item: 'shield' }, now);
        if (enemy && usable && !p.healing) {
          const slots = p.owned
            .map((_, i) => i)
            .filter((i) => p.owned[i] && (p.ammo[i] > 0 || p.reserve[i] > 0));
          slots.sort(
            (a, b) =>
              (weaponDamage(b, distance) * WEAPONS[b].pellets) /
                WEAPONS[b].interval -
              (weaponDamage(a, distance) * WEAPONS[a].pellets) /
                WEAPONS[a].interval,
          );
          const weapon = slots[0];
          if (p.weapon !== weapon) {
            p.weapon = weapon;
            p.reloadUntil = 0;
          }
          if (!p.ammo[weapon]) command(room, p, { type: 'reload' }, now);
          const visible =
            !smokeBlocks(p, enemy, room.smokes ?? [], now - room.startAt) &&
            canReach(
              { ...p, y: p.y - 0.35 },
              { ...enemy, y: enemy.y - 0.4 },
              boxes,
              WEAPONS[weapon].range,
            );
          if (visible) {
            const error = Math.sin(now * 0.003 + p.id.length + p.team!) * 0.024;
            p.yaw = Math.atan2(-(enemy.x - p.x), -(enemy.z - p.z)) + error;
            p.pitch =
              Math.atan2(enemy.y - p.y - 0.25, Math.max(0.1, distance)) +
              error * 0.5;
            if (distance < (weapon === 1 ? 10 : weapon === 2 ? 90 : 36))
              ai.goal = undefined;
            command(
              room,
              p,
              { type: 'shoot', pose: { ...p }, aiming: weapon !== 1 },
              now,
            );
          }
        } else if (enemy && distance < 2.4 && !p.healing) {
          p.yaw = Math.atan2(-(enemy.x - p.x), -(enemy.z - p.z));
          command(room, p, { type: 'melee', pose: { ...p } }, now);
        }
      }
      if (ai.goal && !p.dropping && now >= (ai.pathAt ?? 0)) {
        ai.path = botPath(p, ai.goal, gun);
        ai.pathAt = now + 4000;
      }
    }
    if (p.reviving || p.rebooting) continue;
    const goal = p.dropping ? ai.goal : ai.path?.[0];
    if (!goal || (!ai.goal && !p.dropping)) continue;
    const distance = Math.hypot(goal.x - p.x, goal.z - p.z);
    if (distance < 0.7) {
      ai.path?.shift();
      continue;
    }
    const step = Math.min(
      distance,
      dt * (p.dropping ? GLIDE_SPEED * 0.85 : p.healing ? 5 : 9),
    );
    const x = p.x + ((goal.x - p.x) / distance) * step,
      z = p.z + ((goal.z - p.z) / distance) * step;
    if (p.dropping || segment(p, { x, z }, gun)) {
      p.x = x;
      p.z = z;
    } else ai.pathAt = 0;
  }
}
