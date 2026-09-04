import type { ActiveRoom } from '../lib/game/multiplayer.ts';
import { CAPACITY, type Room } from './model.ts';

// Read without taking a match lock or advancing its simulation. Only rooms
// with a recent heartbeat qualify, even if their two-hour record still exists.
export const ACTIVE_ROOMS_QUERY = `
  SELECT state FROM lastlight_rooms
  WHERE expires_at > NOW() AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(state->'players') p
    WHERE (p->>'lastSeen')::bigint > $1
  )
  ORDER BY CASE state->>'phase' WHEN 'waiting' THEN 0 WHEN 'finished' THEN 1 ELSE 2 END,
    expires_at DESC, code
  LIMIT 50`;

export function activeRoom(room: Room, now: number): ActiveRoom | null {
  const online = room.players.filter((p) => p.lastSeen > now - 15000);
  if (!online.length) return null;
  const phase =
    room.phase === 'countdown' && now >= room.startAt ? 'playing' : room.phase;
  const seats = room.players.filter((p) =>
    phase === 'waiting' || phase === 'finished'
      ? p.lastSeen > now - 60000
      : true,
  );
  const host = online.find((p) => p.id === room.host) ?? online[0];
  return {
    code: room.code,
    mode: room.mode ?? 'solo',
    hostName: host.name,
    phase,
    players: online.length,
    capacity: CAPACITY,
    alive: room.players.filter((p) => p.health > 0 && !p.spectator).length,
    joinable: seats.length < CAPACITY,
  };
}
