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
  command: (type: 'start' | 'rematch') => void;
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
        <button
          className="deploy-button"
          disabled={busy || !name.trim()}
          onClick={() => enter(name)}
        >
          CREATE ROOM <Users size={22} />
        </button>
        <div className="room-divider">OR JOIN YOUR FRIENDS</div>
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
              <ArrowRight size={24} />
            </button>
          </div>
        </form>
        {busy && (
          <output className="room-status">Connecting to the island...</output>
        )}
        {error && (
          <p className="room-error" role="alert">
            {error}
          </p>
        )}
        <p className="touch-help">
          2–8 friends. Land unarmed. Collect an AR, shotgun, or sniper. The host
          starts the match when everyone has joined.
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
        <span>{room?.players.length ?? 1} / 8 PLAYERS</span>
      </div>
      <ul className="room-players">
        {room?.players.map((p) => (
          <li key={p.id}>
            <span className="room-avatar">
              {p.name.slice(0, 1).toUpperCase()}
            </span>
            <div>
              {p.name}
              {p.id === session.playerId && <small>YOU</small>}
            </div>
            {p.id === room.host && <Crown size={15} />}
            <span
              className={p.connected ? 'connected-text' : 'disconnected-text'}
            >
              {room.phase === 'playing' || room.phase === 'finished'
                ? p.health > 0
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
              room.players.filter((p) => p.connected).length < 2
            }
            onClick={() => command('start')}
          >
            {isHost ? 'START MATCH' : 'WAITING FOR HOST'}
            <ArrowRight size={22} />
          </button>
          <p className="touch-help">
            {room.players.length < 2
              ? 'Share your invite link. You need at least one friend to start.'
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
            survived the island.
          </div>
          <button
            className="deploy-button"
            disabled={!isHost || status !== 'connected'}
            onClick={() => command('rematch')}
          >
            {isHost ? 'PREPARE REMATCH' : 'WAITING FOR HOST'}
            <ArrowRight size={22} />
          </button>
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
