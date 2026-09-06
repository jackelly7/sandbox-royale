import type { RoomSnapshot } from '../lib/game/multiplayer';
import { GUN_LADDER } from '../lib/game/gun-game';
import { WEAPONS } from '../lib/game/rules';
export function MatchScoreboard({
  room,
  playerId,
  close,
}: {
  room: RoomSnapshot;
  playerId?: string;
  close: () => void;
}) {
  const gun = room.mode === 'gun-game';
  const players = [...room.players]
    .filter((p) => !p.spectator)
    .sort((a, b) =>
      gun
        ? (b.gunStage ?? 0) - (a.gunStage ?? 0) || b.kills - a.kills
        : (b.health > 0 ? 1 : 0) - (a.health > 0 ? 1 : 0) || b.kills - a.kills,
    );
  const scores = [...(room.scores ?? [])].sort(
    (a, b) => b.wins - a.wins || b.kills - a.kills,
  );
  return (
    <section className="live-scoreboard" aria-label="Live leaderboard">
      <header>
        <div>
          <small>
            ROOM {room.code} · ROUND {room.round}
          </small>
          <h2>{gun ? 'Gun Game leaderboard' : 'Sandbox leaderboard'}</h2>
        </div>
        <button onClick={close} aria-label="Close leaderboard">
          ×
        </button>
      </header>
      <div className="score-scroll">
        <table>
          <thead>
            <tr>
              <th>Player</th>
              {gun && <th>Weapon</th>}
              <th>Elims</th>
              <th>Deaths</th>
              <th>Wins</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p, i) => (
              <tr key={p.id} className={p.id === playerId ? 'is-you' : ''}>
                <td>
                  <b>{i + 1}.</b> {p.name}
                  {p.id === playerId ? ' · YOU' : ''}
                  <small>
                    {!p.connected
                      ? 'OFFLINE'
                      : p.health <= 0
                        ? 'ELIMINATED'
                        : p.downed
                          ? 'DOWNED'
                          : ''}
                  </small>
                </td>
                {gun && (
                  <td>
                    {Math.min((p.gunStage ?? 0) + 1, 8)}/8{' '}
                    <small>
                      {(p.gunStage ?? 0) >= 8
                        ? 'FINISHED'
                        : WEAPONS[GUN_LADDER[p.gunStage ?? 0]].short}
                    </small>
                  </td>
                )}
                <td>{p.kills}</td>
                <td>{p.deaths ?? 0}</td>
                <td>{room.scores?.find((s) => s.id === p.id)?.wins ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {scores.length > 0 && (
        <>
          <h3>This session</h3>
          <div className="score-scroll">
            <table>
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Wins</th>
                  <th>Elims</th>
                  <th>Deaths</th>
                  <th>Rounds</th>
                </tr>
              </thead>
              <tbody>
                {scores.map((s) => (
                  <tr key={s.id} className={s.id === playerId ? 'is-you' : ''}>
                    <td>{s.name}</td>
                    <td>{s.wins}</td>
                    <td>{s.kills}</td>
                    <td>{s.deaths}</td>
                    <td>{s.rounds}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <footer>
        Hold Tab to view · Match continues · Session scores count completed
        rounds
      </footer>
    </section>
  );
}
