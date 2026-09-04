import type { RecoveryState, SupplyKind } from './rules.ts';
export type PlayerPose = {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  weapon: number;
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
    dropping: boolean;
    killedBy: string | null;
    diedAt: number;
    owned: boolean[];
    ammo: number[];
    reserve: number[];
    reloadUntil: number;
    shotAt: number;
  };
export type RoomSnapshot = {
  code: string;
  host: string;
  phase: 'waiting' | 'countdown' | 'playing' | 'finished';
  round: number;
  startAt: number;
  now: number;
  storm: number;
  winner: string | null;
  players: Player[];
  loot: boolean[];
  events: GameEvent[];
};
export type GameEvent = {
  id: string;
  type: 'shot' | 'hit' | 'elimination' | 'pickup' | 'heal';
  player: string;
  target?: string;
  end?: [number, number, number];
  at: number;
  amount?: number;
  shieldDamage?: number;
  shieldBreak?: boolean;
  headshot?: boolean;
  item?: SupplyKind;
};
export type Command =
  | { type: 'pose'; pose: PlayerPose }
  | { type: 'shoot'; pose: PlayerPose; aiming: boolean }
  | { type: 'reload' }
  | { type: 'heal'; item: SupplyKind }
  | { type: 'cancelHeal' }
  | { type: 'pickup'; index: number }
  | { type: 'start' }
  | { type: 'rematch' }
  | { type: 'leave' }
  | { type: 'ping' };
export type RoomSession = { code: string; playerId: string; token: string };
export type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'offline';
