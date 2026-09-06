export const MODES = ['solo', 'duos', 'gun-game', 'team-deathmatch'] as const;
export type GameMode = (typeof MODES)[number];
export const MODE_NAMES: Record<GameMode, string> = {
  solo: 'Solo Royale',
  duos: 'Duos',
  'gun-game': 'Gun Game',
  'team-deathmatch': 'Team Deathmatch',
};
export const isArenaMode = (mode?: string) =>
  mode === 'gun-game' || mode === 'team-deathmatch';
export const isTeamMode = (mode?: string) =>
  mode === 'duos' || mode === 'team-deathmatch';
export const TEAM_GOAL = 30;
export function votedMode(
  players: { id: string; connected: boolean; bot?: boolean }[],
  votes: Record<string, GameMode> = {},
  current: GameMode = 'solo',
): GameMode {
  const counts = MODES.map((mode) => ({
    mode,
    count: players.filter((p) => p.connected && !p.bot && votes[p.id] === mode)
      .length,
  }));
  counts.sort(
    (a, b) =>
      b.count - a.count ||
      Number(b.mode === current) - Number(a.mode === current),
  );
  return counts[0].count ? counts[0].mode : current;
}
