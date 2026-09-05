import type { ChestState } from './chests.ts';
import type { WorldDrop } from './loot.ts';
import type { Point } from './movement.ts';
import type { Zone } from './zones.ts';
import type { RecoveryState, SupplyKind } from './rules.ts';
export type PlayerPose = {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  weapon: number;
  crouching?: boolean;
  sprinting?: boolean;
};
export type Player = PlayerPose &
  RecoveryState & {
    id: string;
    name: string;
    health: number;
    shield: number;
    kills: number;
    rank: number;
    connected: boolean;
    ready?: boolean;
    dropping: boolean;
    killedBy: string | null;
    diedAt: number;
    spectator?: boolean;
    team?: number;
    downed?: boolean;
    bleedOutAt?: number;
    downedBy?: string | null;
    reviving?: string | null;
    reviveUntil?: number;
    owned: boolean[];
    tiers?: number[];
    mantleFrom?: Point;
    mantleTo?: Point;
    mantleStarted?: number;
    mantleUntil?: number;
    ammo: number[];
    reserve: number[];
    reloadUntil: number;
    shotAt: number;
    meleeAt?: number;
  };
export type RoomSnapshot = {
  code: string;
  host: string;
  phase: 'waiting' | 'countdown' | 'playing' | 'finished';
  round: number;
  startAt: number;
  now: number;
  storm: number;
  zone?: Zone;
  winner: string | null;
  players: Player[];
  loot: boolean[];
  drops?: WorldDrop[];
  chests?: ChestState[];
  events: GameEvent[];
  mode?: 'solo' | 'duos';
  winningTeam?: number | null;
};
export type GameEvent = {
  id: string;
  type:
    | 'chest'
    | 'shot'
    | 'melee'
    | 'hit'
    | 'elimination'
    | 'pickup'
    | 'heal'
    | 'down'
    | 'revive'
    | 'mark';
  player: string;
  target?: string;
  end?: [number, number, number];
  at: number;
  amount?: number;
  shieldDamage?: number;
  shieldBreak?: boolean;
  headshot?: boolean;
  item?: SupplyKind;
  label?: 'Go here' | 'Enemy' | 'Loot';
};
export type Command =
  | { type: 'pose'; pose: PlayerPose }
  | { type: 'shoot'; pose: PlayerPose; aiming: boolean }
  | { type: 'mantle'; pose: PlayerPose }
  | { type: 'melee'; pose: PlayerPose }
  | { type: 'reload' }
  | { type: 'heal'; item: SupplyKind }
  | { type: 'cancelHeal' }
  | { type: 'pickup'; index: number }
  | { type: 'chest'; index: number }
  | { type: 'ready' }
  | { type: 'start' }
  | { type: 'rematch' }
  | { type: 'leave' }
  | { type: 'ping' }
  | { type: 'mode'; mode: 'solo' | 'duos' }
  | { type: 'team'; team: number }
  | { type: 'revive'; target: string }
  | { type: 'cancelRevive' }
  | {
      type: 'mark';
      point: [number, number, number];
      label: 'Go here' | 'Enemy' | 'Loot';
    };
// Room controls and squad actions are validated by the authoritative server.
export type RoomSession = { code: string; playerId: string; token: string };
export type ActiveRoom = {
  mode: 'solo' | 'duos';
  code: string;
  hostName: string;
  phase: RoomSnapshot['phase'];
  players: number;
  capacity: number;
  alive: number;
  joinable: boolean;
};
export type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'offline';
