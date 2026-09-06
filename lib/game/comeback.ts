import { ARENA_SCALE as S } from './arena.ts';
import type { Zone } from './zones.ts';
export const REBOOT_SECONDS = 5;
export const REBOOT_STATIONS = [
  { x: 18 * S, z: -23 * S + 2.8, name: 'Sandcastle Square' },
  { x: -22 * S, z: -16 * S + 2.8, name: 'Bucket Town' },
];
export type ComebackToken = {
  player: string;
  team: number;
  x: number;
  z: number;
  carriedBy: string | null;
};
export const comebacksOpen = (mode: string | undefined, zone: Zone) =>
  mode === 'duos' && zone.phase < 4;
