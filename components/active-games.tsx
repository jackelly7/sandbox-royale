'use client';
import { useEffect, useState } from 'react';
import { ArrowRight, RefreshCw, Users } from 'lucide-react';
import { MultiplayerClient } from '@/lib/game/network';
import type { ActiveRoom } from '@/lib/game/multiplayer';

export function ActiveGames({
  ready,
  currentCode,
  select,
  create,
}: {
  ready: boolean;
  currentCode?: string;
  select: (code: string) => void;
  create: () => void;
}) {
  const [rooms, setRooms] = useState<ActiveRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let request: AbortController | null = null;
    async function load() {
      if (document.hidden || request) return;
      request = new AbortController();
      setLoading(true);
      try {
        const next = await MultiplayerClient.list(request.signal);
        if (!disposed) {
          setRooms(next);
          setError('');
        }
      } catch (e) {
        if (!disposed)
          setError(
            e instanceof Error ? e.message : 'Could not load active games.',
          );
      } finally {
        request = null;
        if (!disposed) {
          setLoading(false);
          timer = setTimeout(() => {
            void load();
          }, 10000);
        }
      }
    }
    const visible = () => {
      clearTimeout(timer);
      if (!document.hidden) void load();
    };
    void load();
    document.addEventListener('visibilitychange', visible);
    return () => {
      disposed = true;
      clearTimeout(timer);
      request?.abort();
      document.removeEventListener('visibilitychange', visible);
    };
  }, [refresh]);
  return (
    <aside className="active-games" aria-labelledby="active-games-title">
      <div className="active-games-heading">
        <div>
          <span className="live-dot" />
          <h2 id="active-games-title">Active games</h2>
        </div>
        <button
          className="active-refresh"
          aria-label="Refresh active games"
          disabled={loading}
          onClick={() => setRefresh((n) => n + 1)}
        >
          <RefreshCw size={17} />
        </button>
      </div>
      <p className="active-games-help">
        Join a lobby, or watch a match and play next round.
      </p>
      <div className="active-games-list" aria-busy={loading}>
        {error ? (
          <output className="active-empty">
            <p>{error}</p>
            <button
              className="text-button"
              onClick={() => setRefresh((n) => n + 1)}
            >
              Try again
            </button>
          </output>
        ) : rooms.length ? (
          rooms.map((room) => {
            const watching =
              room.phase === 'playing' || room.phase === 'countdown';
            const own = room.code === currentCode;
            return (
              <div className="active-game-row" key={room.code}>
                <div className="active-game-info">
                  <strong>{room.hostName}&apos;s room</strong>
                  <span>
                    <Users size={13} /> {room.mode === 'duos' ? 'Duos' : 'Solo'}{' '}
                    · {room.players}/{room.capacity} online{' '}
                    <span aria-hidden="true">·</span> {room.code}
                  </span>
                  <small>
                    {room.phase === 'waiting'
                      ? 'Waiting for players'
                      : room.phase === 'finished'
                        ? 'Between rounds'
                        : room.phase === 'countdown'
                          ? 'Starting now'
                          : `${room.alive} remaining`}
                  </small>
                </div>
                <button
                  className="active-join"
                  disabled={
                    !ready || (!own && (!!currentCode || !room.joinable))
                  }
                  onClick={() => select(room.code)}
                  aria-label={`${own ? 'Open' : watching ? 'Watch and join' : 'Join'} ${room.hostName}&apos;s room ${room.code}`}
                >
                  {own
                    ? 'Your room'
                    : !room.joinable
                      ? 'Full'
                      : watching
                        ? 'Watch & join'
                        : 'Join'}
                  {(own || room.joinable) && <ArrowRight size={15} />}
                </button>
              </div>
            );
          })
        ) : (
          <output className="active-empty">
            <p>
              {loading ? 'Finding active games...' : 'No active games yet.'}
            </p>
            {!loading && (
              <span>Create a room and invite the first players.</span>
            )}
          </output>
        )}
      </div>
      <button className="active-create" disabled={!ready} onClick={create}>
        {currentCode ? 'Open your room' : 'Create a room'}{' '}
        <ArrowRight size={17} />
      </button>
      <small className="active-games-footnote">
        {currentCode
          ? 'Leave your current room to join another.'
          : 'Rooms refresh automatically. Up to 8 players each.'}
      </small>
    </aside>
  );
}
