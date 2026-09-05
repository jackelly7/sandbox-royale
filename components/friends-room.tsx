'use client';
import { useState } from 'react';
import {
  ArrowRight,
  Check,
  Copy,
  Crown,
  LogOut,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import type {
  ConnectionStatus,
  Command,
  RoomSession,
  RoomSnapshot,
} from '@/lib/game/multiplayer';
export function FriendsRoom({
  room,
  session,
  status,
  busy,
  error,
  inviteCode,
  enter,
  leave,
  command,
}: {
  room: RoomSnapshot | null;
  session: RoomSession | null;
  status: ConnectionStatus;
  busy: boolean;
  error: string;
  inviteCode: string;
  enter: (name: string, code?: string) => void;
  leave: () => void;
  command: (command: Command) => void;
}) {
  const [name, setName] = useState(''),
    [code, setCode] = useState(inviteCode),
    [copied, setCopied] = useState(false),
    [copyError, setCopyError] = useState('');
  const isHost = room?.host === session?.playerId;
  const share = async () => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/?room=${room?.code}`,
      );
      setCopied(true);
      setCopyError('');
    } catch {
      setCopyError('Copy this room code and send it to your friends.');
    }
  };
  if (!session)
    return (
      <div className="friends-content">
        {inviteCode && (
          <p className="selected-room">
            Join room <strong>{inviteCode}</strong>. Enter your name, then join
            below.
          </p>
        )}
        <label htmlFor="player-name">Your player name</label>
        <Input
          id="player-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={18}
          placeholder="Choose a callsign"
          autoComplete="off"
          spellCheck={false}
          data-bwignore="true"
          data-1p-ignore="true"
          data-lpignore="true"
          className="room-input"
        />
        {!inviteCode && (
          <>
            <button
              className="deploy-button"
              disabled={busy || !name.trim()}
              onClick={() => enter(name)}
            >
              CREATE ROOM <Users size={22} />
            </button>
            <p className="touch-help">
              Rooms appear in Active games so other visitors can join.
            </p>
            <div className="room-divider">OR JOIN A ROOM</div>
          </>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy && name.trim() && code.trim().length === 6)
              enter(name, code);
          }}
        >
          <label htmlFor="room-code">Room code</label>
          <div className="join-row">
            <Input
              id="room-code"
              value={code}
              onChange={(e) =>
                setCode(
                  e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z2-9]/g, '')
                    .slice(0, 6),
                )
              }
              maxLength={6}
              placeholder="ABC234"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              data-bwignore="true"
              data-1p-ignore="true"
              data-lpignore="true"
              className="room-input code-input"
            />
            <button
              className="join-button"
              disabled={busy || !name.trim() || code.length !== 6}
              type="submit"
              aria-label="Join room"
            >
              Join <ArrowRight size={20} />
            </button>
          </div>
        </form>
        {busy && (
          <output className="room-status">Joining the sandbox...</output>
        )}
        {error && (
          <p className="room-error" role="alert">
            {error}
          </p>
        )}
        <p className="touch-help">
          Up to 8 friends, plus optional bots. Ride the drop bus and choose
          where to jump. Collect an AR, shotgun, or sniper. The host starts the
          match when everyone has joined.
        </p>
      </div>
    );
  return (
    <div className="friends-content">
      <div className="room-share">
        <div>
          <span>YOUR ROOM CODE</span>
          <strong>{session.code}</strong>
        </div>
        <button
          className="secondary-button"
          onClick={() => {
            void share();
          }}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}{' '}
          {copied ? 'Link copied' : 'Copy invite link'}
        </button>
      </div>
      {copyError && <p className="touch-help">{copyError}</p>}
      <div className="room-connection">
        {status === 'connected' ? <Wifi size={15} /> : <WifiOff size={15} />}{' '}
        {status === 'connected'
          ? 'CONNECTED'
          : status === 'reconnecting'
            ? 'RECONNECTING...'
            : status === 'offline'
              ? 'DISCONNECTED'
              : 'CONNECTING...'}
        <span>
          {room?.players.filter((p) => !p.bot).length ?? 1} / 8 FRIENDS
        </span>
      </div>
      {room?.phase === 'waiting' && (
        <div className="room-mode-controls">
          <span>Match mode {isHost ? '' : '· chosen by host'}</span>
          <div className="mode-options">
            {(['solo', 'duos'] as const).map((mode) => (
              <button
                key={mode}
                disabled={!isHost || status !== 'connected'}
                aria-pressed={(room.mode ?? 'solo') === mode}
                onClick={() => command({ type: 'mode', mode })}
              >
                {mode === 'solo' ? 'Free for all' : 'Duos'}
              </button>
            ))}
          </div>
          <span>Bot opponents</span>
          <div className="mode-options">
            {[0, 4, 8].map((count) => (
              <button
                key={count}
                disabled={!isHost || status !== 'connected'}
                aria-pressed={(room.botCount ?? 0) === count}
                onClick={() => command({ type: 'bots', count })}
              >
                {count === 0 ? 'No bots' : `${count} bots`}
              </button>
            ))}
          </div>
          <p>Bots loot and fight everyone. Friends keep all 8 human seats.</p>
          {room.mode === 'duos' && (
            <>
              <p>Choose the same team as your friend. Two players per team.</p>
              <div className="team-options">
                {[0, 1, 2, 3].map((team) => (
                  <button
                    key={team}
                    aria-pressed={
                      room.players.find((p) => p.id === session.playerId)
                        ?.team === team
                    }
                    disabled={
                      status !== 'connected' ||
                      (room.players.filter((p) => p.team === team).length >=
                        2 &&
                        room.players.find((p) => p.id === session.playerId)
                          ?.team !== team)
                    }
                    onClick={() => command({ type: 'team', team })}
                  >
                    Team {team + 1}{' '}
                    <small>
                      {room.players.filter((p) => p.team === team).length}/2
                    </small>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      <ul className="room-players">
        {room?.players.map((p) => (
          <li key={p.id}>
            <span className="room-avatar">
              {p.name.slice(0, 1).toUpperCase()}
            </span>
            <div>
              {p.name}
              {room?.mode === 'duos' && <small>TEAM {(p.team ?? 0) + 1}</small>}
              {p.id === session.playerId && <small>YOU</small>}
            </div>
            {p.id === room.host && <Crown size={15} />}
            <span
              className={p.connected ? 'connected-text' : 'disconnected-text'}
            >
              {room.phase === 'playing' || room.phase === 'finished'
                ? p.spectator
                  ? 'SPECTATING'
                  : p.downed
                    ? 'DOWNED'
                    : p.health > 0
                      ? 'ALIVE'
                      : `#${p.rank}`
                : p.connected
                  ? 'READY'
                  : 'RECONNECTING'}
            </span>
          </li>
        ))}
      </ul>
      {error && (
        <p className="room-error" role="alert">
          {error}
        </p>
      )}
      {room?.phase === 'waiting' && (
        <>
          <button
            className="deploy-button"
            disabled={
              !isHost ||
              status !== 'connected' ||
              room.players.filter((p) => p.connected && !p.bot).length +
                (room.botCount ?? 0) <
                2
            }
            onClick={() => command({ type: 'start' })}
          >
            {isHost ? 'START MATCH' : 'WAITING FOR HOST'}
            <ArrowRight size={22} />
          </button>
          <p className="touch-help">
            {room.players.filter((p) => !p.bot).length < 2 &&
            !(room.botCount ?? 0)
              ? 'Share your invite link. Invite a friend or turn on bots to start.'
              : isHost
                ? 'Everyone here joins the match. Ready to drop?'
                : 'The host will start the match when everyone is here.'}
          </p>
        </>
      )}
      {room?.phase === 'finished' && (
        <>
          <div className="room-winner">
            {room.players.find((p) => p.id === room.winner)?.name ?? 'No one'}{' '}
            was last in the sandbox.
          </div>
          <button
            className="deploy-button"
            disabled={status !== 'connected'}
            onClick={() => command({ type: 'ready' })}
          >
            {room.players.find((p) => p.id === session?.playerId)?.ready
              ? 'READY · CLICK TO CANCEL'
              : 'READY FOR NEXT DROP'}
            <ArrowRight size={22} />
          </button>
          <p className="touch-help">
            {
              room.players.filter((p) => p.connected && !p.bot && p.ready)
                .length
            }
            /{room.players.filter((p) => p.connected && !p.bot).length} ready.
            The next drop starts when everyone is ready.
          </p>
        </>
      )}
      {(room?.phase === 'playing' || room?.phase === 'countdown') && (
        <p className="touch-help">
          The match is in progress. Close this panel to watch surviving players
          from the results screen. Stay in the room for the next round.
        </p>
      )}
      <button className="text-button" onClick={leave}>
        <LogOut size={16} />
        Leave room
      </button>
    </div>
  );
}
