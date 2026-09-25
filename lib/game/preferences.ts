import { WEAPONS } from './rules.ts';
export type Preferences = {
  arenaWeapon: number;
  look: number;
  aim: number;
  crosshairSize: number;
  crosshairColor: string;
  sprint: 'hold' | 'toggle';
  crouch: 'hold' | 'toggle';
  slots: number[];
  muted: boolean;
  visualSound: boolean;
};
export const DEFAULT_PREFERENCES: Preferences = {
  arenaWeapon: 0,
  look: 1,
  aim: 0.7,
  crosshairSize: 1,
  crosshairColor: '#ffffff',
  sprint: 'hold',
  crouch: 'toggle',
  slots: [0, 1, 2],
  muted: false,
  visualSound: true,
};
export function cleanPreferences(value: unknown): Preferences {
  const p = (
    value && typeof value === 'object' ? value : {}
  ) as Partial<Preferences>;
  const num = (v: unknown, min: number, max: number, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v)
      ? Math.min(max, Math.max(min, v))
      : fallback;
  return {
    arenaWeapon:
      typeof p.arenaWeapon === 'number' &&
      Number.isInteger(p.arenaWeapon) &&
      p.arenaWeapon >= 0 &&
      p.arenaWeapon < WEAPONS.length
        ? p.arenaWeapon
        : 0,
    look: num(p.look, 0.3, 2.5, 1),
    aim: num(p.aim, 0.2, 2, 0.7),
    crosshairSize: num(p.crosshairSize, 0.7, 1.5, 1),
    crosshairColor:
      typeof p.crosshairColor === 'string' &&
      /^#[0-9a-f]{6}$/i.test(p.crosshairColor)
        ? p.crosshairColor
        : '#ffffff',
    sprint: p.sprint === 'toggle' ? 'toggle' : 'hold',
    crouch: p.crouch === 'hold' ? 'hold' : 'toggle',
    slots:
      Array.isArray(p.slots) &&
      p.slots.length === 3 &&
      new Set(p.slots).size === 3 &&
      p.slots.every((n) => [0, 1, 2].includes(n))
        ? [...p.slots]
        : [0, 1, 2],
    muted: p.muted === true,
    visualSound: p.visualSound !== false,
  };
}
export function readPreferences(): Preferences {
  try {
    return cleanPreferences(
      JSON.parse(localStorage.getItem('sandbox-controls') ?? '{}'),
    );
  } catch {
    return { ...DEFAULT_PREFERENCES, slots: [0, 1, 2] };
  }
}
export function savePreferences(p: Preferences) {
  try {
    localStorage.setItem(
      'sandbox-controls',
      JSON.stringify(cleanPreferences(p)),
    );
  } catch {}
}
export function assignSlot(slots: number[], slot: number, weapon: number) {
  const next = [...slots],
    old = next.indexOf(weapon);
  next[old] = next[slot];
  next[slot] = weapon;
  return next;
}
