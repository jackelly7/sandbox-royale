import { MAP } from './map-data.ts';
export type Circle = { x: number; z: number; radius: number };
export type Zone = Circle & {
  next: Circle;
  phase: number;
  stage: 'waiting' | 'closing' | 'final';
  remaining: number;
};
// Each phase announces its destination before the wall starts moving.
export const ZONE_PHASES = [
  { wait: 18, close: 22, radius: 78 },
  { wait: 12, close: 22, radius: 53 },
  { wait: 10, close: 20, radius: 32 },
  { wait: 8, close: 18, radius: 16 },
  { wait: 6, close: 16, radius: 5 },
];
const plans = new Map<string, Circle[]>();
export function zonePlan(seed: string, players = 16): Circle[] {
  const key = `${seed}:${players}`;
  const cached = plans.get(key);
  if (cached) return cached;
  let hash = 2166136261;
  for (const c of seed) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  const random = () => {
    hash = (Math.imul(hash, 1664525) + 1013904223) >>> 0;
    return hash / 4294967296;
  };
  const circles: Circle[] = [
    { x: 0, z: 0, radius: players <= 4 ? 78 : players <= 8 ? 90 : 107 },
  ];
  for (const [i, original] of ZONE_PHASES.entries()) {
    const phase = {
      ...original,
      radius:
        players <= 4
          ? [48, 30, 18, 10, 5][i]
          : players <= 8
            ? [62, 40, 24, 12, 5][i]
            : original.radius,
    };
    const previous = circles[circles.length - 1];
    let next = { ...previous, radius: phase.radius };
    for (let attempt = 0; attempt < 64; attempt++) {
      const angle = random() * Math.PI * 2;
      const offset = (previous.radius - phase.radius) * (0.35 + random() * 0.4);
      const x = previous.x + Math.cos(angle) * offset;
      const z = previous.z + Math.sin(angle) * offset;
      // Keep final-circle centers in playable space, not inside a castle.
      if (
        MAP.colliders.some(
          (b) =>
            x > b.min[0] - 2 &&
            x < b.max[0] + 2 &&
            z > b.min[2] - 2 &&
            z < b.max[2] + 2,
        )
      )
        continue;
      next = { x, z, radius: phase.radius };
      break;
    }
    circles.push(next);
  }
  if (plans.size >= 32) plans.delete(plans.keys().next().value!);
  plans.set(key, circles);
  return circles;
}
export function zoneAt(elapsed: number, seed = 'sandbox', players = 16): Zone {
  const circles = zonePlan(seed, players);
  const pace = players <= 4 ? 0.8 : players <= 8 ? 0.9 : 1;
  let time = Math.max(0, elapsed) / pace;
  for (let i = 0; i < ZONE_PHASES.length; i++) {
    const { wait, close } = ZONE_PHASES[i];
    const from = circles[i],
      next = circles[i + 1];
    if (time < wait)
      return {
        ...from,
        next,
        phase: i + 1,
        stage: 'waiting',
        remaining: (wait - time) * pace,
      };
    time -= wait;
    if (time < close) {
      const t = time / close;
      return {
        x: from.x + (next.x - from.x) * t,
        z: from.z + (next.z - from.z) * t,
        radius: from.radius + (next.radius - from.radius) * t,
        next,
        phase: i + 1,
        stage: 'closing',
        remaining: (close - time) * pace,
      };
    }
    time -= close;
  }
  const last = circles[circles.length - 1];
  return {
    ...last,
    next: last,
    phase: ZONE_PHASES.length,
    stage: 'final',
    remaining: 0,
  };
}
export function outsideZone(x: number, z: number, circle: Circle) {
  return Math.hypot(x - circle.x, z - circle.z) > circle.radius;
}
