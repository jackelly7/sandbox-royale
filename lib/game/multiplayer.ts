export type PlayerPose = {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  weapon: number;
};
export type Player = PlayerPose & {
  id: string;
  name: string;
  health: number;
  shield: number;
  kills: number;
  rank: number;
  connected: boolean;
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
  type: 'shot' | 'hit' | 'elimination' | 'pickup';
  player: string;
  target?: string;
  end?: [number, number, number];
  at: number;
};
export type Command =
  | { type: 'pose'; pose: PlayerPose }
  | { type: 'shoot'; pose: PlayerPose; aiming: boolean }
  | { type: 'reload' }
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
