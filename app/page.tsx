'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Crosshair,
  Footprints,
  Flag,
  Gamepad2,
  Heart,
  Eye,
  Navigation,
  HelpCircle,
  MapPin,
  Maximize,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  Shield,
  Skull,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import type { BattleGame, GameState } from '@/lib/game/engine';
import { FriendsRoom } from '@/components/friends-room';
import { ActiveGames } from '@/components/active-games';
import { MultiplayerClient } from '@/lib/game/network';
import type {
  RoomSnapshot,
  RoomSession,
  ConnectionStatus,
} from '@/lib/game/multiplayer';
import { WEAPONS, SUPPLIES, RARITIES } from '@/lib/game/rules';
import { zoneAt } from '@/lib/game/zones';

const initial: GameState = {
  phase: 'lobby',
  health: 100,
  medkits: 0,
  cells: 0,
  healing: null,
  healUntil: 0,
  healRemaining: 0,
  dropping: false,
  altitude: 0,
  threat: 0,
  killer: 'The sandbox',
  deathRemaining: 0,
  survived: 0,
  eliminationPulse: 0,
  damageNumber: 0,
  damageShield: false,
  headshot: false,
  shieldBreak: 0,
  damageAngle: null,
  feed: [],
  spectator: null,
  shield: 50,
  alive: 16,
  kills: 0,
  ammo: 0,
  reserve: 0,
  weapon: -1,
  owned: [false, false, false],
  elapsed: 0,
  storm: 107,
  outside: false,
  reloading: false,
  aiming: false,
  pickup: '',
  notice: '',
  hit: 0,
  hurt: 0,
  heading: 0,
  x: 0,
  z: 0,
  rank: 16,
  bots: [],
};
const controls = [
  ['W A S D', 'Move'],
  ['MOUSE', 'Look around'],
  ['LEFT CLICK', 'Fire'],
  ['RIGHT CLICK', 'Aim down sights'],
  ['SHIFT', 'Sprint'],
  ['C / CTRL', 'Toggle crouch / hold crouch'],
  ['SPACE', 'Jump / mantle nearby cover'],
  ['R', 'Reload'],
  ['V', 'Switch first / third person'],
  ['E', 'Collect / revive teammate'],
  ['G / Middle click', 'Ping enemy, loot, or location'],
  ['Q / F', 'Use medkit / shield cell'],
  ['X', 'Cancel healing / revive'],
  ['[ / ]', 'Switch player while spectating'],
  ['1  2  3 / WHEEL', 'Switch collected weapons'],
  ['ESC', 'Pause'],
];

function IslandMap({
  state,
  large = false,
}: {
  state: GameState;
  large?: boolean;
}) {
  return (
    <svg
      className={large ? 'island-map large' : 'island-map'}
      viewBox="-120 -120 240 240"
      aria-label="Sandbox map with your position and the safe zone"
    >
      <defs>
        <pattern
          id={large ? 'grid-big' : 'grid-small'}
          width="20"
          height="20"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 20 0 L 0 0 0 20"
            fill="none"
            stroke="#e6f3da"
            strokeOpacity=".13"
            strokeWidth=".5"
          />
        </pattern>
      </defs>
      <rect x="-120" y="-120" width="240" height="240" fill="#9d6b40" />
      <rect x="-113" y="-113" width="226" height="226" fill="#e8c780" />
      <path
        d="M-24-107 18-108 40-94 63-92 79-68 99-56 105-21 111 7 97 28 95 56 64 69 58 89 27 104-5 109-31 97-61 94-73 69-94 50-103 23-107-5-98-33-85-47-78-73-53-83Z"
        fill="#d6ca95"
      />
      <path
        d="M-23-100 17-100 37-87 60-84 72-62 92-51 98-20 101 6 88 25 87 50 58 63 52 82 25 96-4 101-29 90-56 86-65 64-86 44-95 19-99-4-91-28-79-42-72-66-48-77Z"
        fill="#e8c780"
      />
      <path d="M0-88V92M-80 4H82M40-53V31" stroke="#cda65d" strokeWidth="7" />
      {state.pingPoints?.map((point) => (
        <g key={point.id}>
          <circle
            cx={point.x}
            cy={point.z}
            r={4}
            fill={point.label === 'Enemy' ? '#ff786a' : '#a7ffcf'}
            stroke="#111"
            strokeWidth={1.5}
          />
          <title>{point.label}</title>
        </g>
      ))}
      {[
        [18, -23, 14, 12],
        [-22, -16, 14, 12],
        [30, 20, 12, 10],
        [-35, 28, 12, 10],
        [2, -57, 12, 9],
        [-47, -28, 9, 11],
        [48, -40, 11, 12],
        [-18, 49, 10, 8],
        [49, 45, 9, 10],
        [-56, 7, 11, 9],
      ].map(([x, z, w, h], i) => (
        <rect
          key={i}
          x={x - w / 2}
          y={z - h / 2}
          width={w}
          height={h}
          fill={i % 2 ? '#e1ba88' : '#c38366'}
          stroke="#fff4d3"
          strokeWidth=".6"
        />
      ))}
      {[
        [-67, 30],
        [-35, 65],
        [70, 15],
        [-20, -75],
        [43, -68],
        [70, -31],
        [-73, -27],
        [20, 71],
        [-53, -53],
        [-57, 60],
        [65, 62],
        [-32, 8],
      ].map(([x, y], i) => (
        <g key={i} fill="#548761">
          <circle cx={x} cy={y} r="7" />
          <circle cx={x + 7} cy={y - 6} r="5" />
        </g>
      ))}
      <rect
        x="-120"
        y="-120"
        width="240"
        height="240"
        fill={`url(#${large ? 'grid-big' : 'grid-small'})`}
      />
      {state.phase !== 'lobby' && (
        <>
          <circle
            cx={state.zone?.x ?? 0}
            cy={state.zone?.z ?? 0}
            r={state.storm}
            fill="none"
            stroke="#e7ccff"
            strokeWidth="2"
          />
          {state.zone && state.zone.stage !== 'final' && (
            <circle
              cx={state.zone.next.x}
              cy={state.zone.next.z}
              r={state.zone.next.radius}
              fill="none"
              stroke="#ffffff"
              strokeWidth="1.5"
              strokeDasharray="4 3"
              aria-label="Next safe circle"
            />
          )}
          {state.bots
            .filter((b) => Math.hypot(b.x - state.x, b.z - state.z) < 30)
            .map((b, i) => (
              <circle key={i} cx={b.x} cy={b.z} r="2.2" fill="#ff8265" />
            ))}
          <g
            transform={`translate(${state.x},${state.z}) rotate(${-state.heading})`}
          >
            <circle r="6" fill="#ffffff" fillOpacity=".2" />
            <path d="M0-5 3.5 4 0 2-3.5 4Z" fill="#fff" />
          </g>
        </>
      )}
      {large && (
        <>
          <text x="18" y="-36">
            SANDCASTLE SQUARE
          </text>
          <text x="-34" y="44">
            PALM GROVE
          </text>
          <text x="3" y="-72">
            NORTH PIER
          </text>
        </>
      )}
    </svg>
  );
}

export default function Home() {
  const viewport = useRef<HTMLDivElement>(null),
    game = useRef<BattleGame | null>(null);
  const [state, setState] = useState(initial),
    [ready, setReady] = useState(false),
    [error, setError] = useState('');
  const [panel, setPanel] = useState<
    'controls' | 'settings' | 'map' | 'friends' | null
  >(null);
  const [visualSound, setVisualSound] = useState(true);
  const [muted, setMuted] = useState(false),
    [sensitivity, setSensitivity] = useState(1),
    [touch, setTouch] = useState(false),
    [best, setBest] = useState(0);
  const client = useRef<MultiplayerClient | null>(null);
  const [room, setRoom] = useState<RoomSnapshot | null>(null),
    [session, setSession] = useState<RoomSession | null>(null),
    [connection, setConnection] = useState<ConnectionStatus>('offline'),
    [roomBusy, setRoomBusy] = useState(false),
    [roomError, setRoomError] = useState(''),
    [inviteCode, setInviteCode] = useState('');
  const roomPhase = useRef('waiting');
  const roomUIAt = useRef(0);
  useEffect(() => {
    game.current?.setMenuOpen(panel !== null);
  }, [panel, ready]);
  const leaveRoom = () => {
    client.current?.close();
    client.current = null;
    game.current?.detachNetwork();
    setRoom(null);
    setSession(null);
    setRoomError('');
    setPanel(null);
  };
  const enterRoom = async (name: string, code?: string) => {
    if (!game.current || roomBusy || session) return;
    setRoomBusy(true);
    setRoomError('');
    try {
      const joined = await MultiplayerClient.enter(name, code);
      setSession(joined);
      roomPhase.current = 'waiting';
      client.current = new MultiplayerClient(
        joined,
        (next, acknowledgedPose) => {
          if (
            next.phase !== roomPhase.current ||
            Date.now() - roomUIAt.current > 250
          ) {
            setRoom(next);
            roomUIAt.current = Date.now();
          }
          game.current?.applyNetworkSnapshot(next, acknowledgedPose);
          if (
            (next.phase === 'countdown' && roomPhase.current !== 'countdown') ||
            ((next.phase === 'playing' || next.phase === 'finished') &&
              roomPhase.current === 'waiting')
          )
            setPanel(null);
          roomPhase.current = next.phase;
        },
        setConnection,
        setRoomError,
      );
      game.current.attachNetwork(joined.playerId, (command) =>
        client.current?.send(command),
      );
    } catch (e) {
      setRoomError(
        e instanceof Error ? e.message : 'Could not connect. Try again.',
      );
    } finally {
      setRoomBusy(false);
    }
  };
  const backToLobby = () => {
    if (client.current) leaveRoom();
    else game.current?.lobby();
  };
  const lookTouch = useRef<{ x: number; y: number } | null>(null);
  const stick = useRef<{ x: number; y: number } | null>(null);
  const [stickPos, setStickPos] = useState({ x: 0, y: 0 });
  useEffect(() => {
    let disposed = false;
    import('@/lib/game/engine')
      .then(({ BattleGame }) => {
        if (disposed || !viewport.current) return;
        setTouch(window.matchMedia('(pointer: coarse)').matches);
        try {
          setBest(Number(localStorage.getItem('lastlight-best') || 0));
        } catch {}
        try {
          game.current = new BattleGame(viewport.current, (next) => {
            setState(next);
            if (next.phase === 'dying') setPanel(null);
            if (next.phase === 'won' || next.phase === 'lost') {
              setBest((previous) => Math.max(previous, next.kills));
              try {
                const saved = Number(
                  localStorage.getItem('lastlight-best') || 0,
                );
                if (next.kills > saved)
                  localStorage.setItem('lastlight-best', String(next.kills));
              } catch {}
            }
          });
          setReady(true);
          const invite = new URLSearchParams(window.location.search).get(
            'room',
          );
          if (invite && /^[A-Z2-9]{6}$/i.test(invite)) {
            setInviteCode(invite.toUpperCase());
            setPanel('friends');
          }
        } catch (e) {
          console.error(e);
          setError(
            'This device could not start 3D graphics. Try a browser with WebGL 2 enabled.',
          );
        }
      })
      .catch(() => setError('The game could not load. Refresh to try again.'));
    return () => {
      disposed = true;
      client.current?.close();
      game.current?.destroy();
      game.current = null;
    };
  }, []);
  const start = () => {
    setPanel(null);
    void game.current?.start(touch);
  };
  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else
      void document.documentElement.requestFullscreen().catch(() => {
        game.current?.notice('Fullscreen is unavailable in this browser.');
      });
  };
  const playing = state.phase === 'playing',
    lobby = state.phase === 'lobby',
    ended = state.phase === 'won' || state.phase === 'lost',
    spectating = state.phase === 'spectating';
  const ownPlayer = room?.players.find((p) => p.id === session?.playerId);
  const teammate =
    room?.mode === 'duos'
      ? room.players.find(
          (p) =>
            p.id !== session?.playerId &&
            p.team === ownPlayer?.team &&
            !p.spectator,
        )
      : null;
  const reviveTarget =
    teammate?.downed &&
    !ownPlayer?.downed &&
    Math.hypot(teammate.x - state.x, teammate.z - state.z) <= 3
      ? teammate
      : null;
  const zone = state.zone ?? zoneAt(state.elapsed);
  const time = Math.ceil(zone.remaining);
  const clock = `${Math.floor(time / 60)
    .toString()
    .padStart(2, '0')}:${(time % 60).toString().padStart(2, '0')}`;
  return (
    <main
      className={`game-shell ${playing || spectating ? 'is-playing' : ''} ${lobby ? 'is-lobby' : ''}`}
    >
      <div
        className="world-view"
        ref={viewport}
        aria-label="3D sandbox battle royale arena"
      />
      <div className={`world-shade ${lobby ? 'lobby-shade' : ''}`} />
      {lobby && (
        <>
          <header className="lobby-header">
            <Link
              className="wordmark"
              href="/"
              aria-label="Sandbox Royale home"
            >
              <Image
                unoptimized
                className="sandbox-logo"
                src="/brand/sandbox-logo.png"
                width={42}
                height={42}
                alt=""
              />
              <span className="sandbox-wordmark">
                Sandbox<span>Royale</span>
              </span>
            </Link>
            <div className="header-mode">
              <span className="live-dot" />{' '}
              {session ? `FRIEND ROOM · ${session.code}` : 'BATTLE ROYALE'}
            </div>
            <div className="header-actions">
              <button
                className="icon-button"
                onClick={() => setPanel('controls')}
                aria-label="How to play"
              >
                <HelpCircle size={20} />
              </button>
              <button
                className="icon-button"
                onClick={() => setPanel('settings')}
                aria-label="Settings"
              >
                <Settings2 size={20} />
              </button>
              <div className="player-badge">
                <span className="player-avatar">J</span>
                <div>
                  Rookie<span>READY TO DROP</span>
                </div>
              </div>
            </div>
          </header>
          <div className="lobby-main">
            <section className="title-block">
              <div className="eyebrow">
                <span /> ONE SANDBOX. LAST ONE STANDING.
              </div>
              <h1>
                Sandbox
                <br />
                <span>Royale.</span>
              </h1>
              <p>
                Drop into the sand. Gear up. Outlast everyone.
                <br />
                Your next close call starts here.
              </p>
              <button
                className="friend-launch"
                disabled={!ready}
                onClick={() => setPanel('friends')}
              >
                <Users size={17} />
                {session ? 'OPEN FRIEND ROOM' : 'PLAY WITH FRIENDS'}
                <ArrowRight size={17} />
              </button>
              <div className="match-facts">
                <span>
                  <Users size={16} />
                  {session
                    ? `${room?.players.length ?? 1} friends`
                    : '16 combatants'}
                </span>
                <span>
                  <Crosshair size={16} />
                  First person
                </span>
                <span>
                  <Zap size={16} />
                  No build
                </span>
              </div>
            </section>
            <div className="location-marker">
              <span className="marker-line" />
              <div className="location-label">
                <MapPin size={17} />
                <div>
                  SANDCASTLE SQUARE<span>THE SANDBOX</span>
                </div>
              </div>
            </div>
            <ActiveGames
              ready={ready && !error}
              currentCode={session?.code}
              select={(code) => {
                setInviteCode(code);
                setRoomError('');
                setPanel('friends');
              }}
              create={() => {
                setInviteCode('');
                setRoomError('');
                setPanel('friends');
              }}
            />
          </div>
          <footer className="lobby-footer">
            <div className="deployment-card">
              <div className="mode-icon">
                <Crosshair size={25} />
              </div>
              <div>
                <div className="mode-label">
                  {session ? 'FRIENDS' : 'SOLO'} <span>BATTLE ROYALE</span>
                </div>
                <p>
                  {session
                    ? `Room ${session.code} · ${room?.players.length ?? 1}/8 players`
                    : 'You against 15 AI rivals.'}
                </p>
              </div>
              <span className="mode-check">
                <Check size={17} />
              </span>
            </div>
            <button
              className="deploy-button"
              onClick={() => (session ? setPanel('friends') : start())}
              disabled={!ready || !!error}
            >
              <span>
                {error
                  ? 'UNAVAILABLE'
                  : ready
                    ? session
                      ? 'OPEN ROOM'
                      : 'DROP IN SOLO'
                    : 'RAKING THE SANDBOX'}
              </span>
              {ready ? (
                <ArrowRight size={28} />
              ) : (
                <span className="loading-spinner" />
              )}
            </button>
            <div className="footer-note">
              <span className="live-dot" />
              {touch ? 'TOUCH CONTROLS ENABLED' : 'KEYBOARD + MOUSE'}
              <button onClick={() => setPanel('controls')}>
                How to play <ChevronRight size={15} />
              </button>
            </div>
          </footer>
          <div className="bottom-bar">
            <span>
              SANDBOX ROYALE <span className="muted">/</span> BATTLE ROYALE
            </span>
            <span className="best-score">
              PERSONAL BEST <b>{best}</b> ELIMINATIONS
            </span>
            <span>BUILT FOR THE LAST ONE STANDING.</span>
          </div>
        </>
      )}
      {session && !lobby && (
        <div className="network-badge">
          ROOM {session.code}
          <span>
            {connection === 'connected' ? 'LIVE' : connection.toUpperCase()}
          </span>
        </div>
      )}
      {room?.phase === 'countdown' && playing && (
        <div className="match-countdown">
          {Math.max(1, Math.ceil((room.startAt - room.now) / 1000))}
          <span>GET READY</span>
        </div>
      )}
      {!lobby && (
        <>
          <div className="hud-top">
            <div className="hud-brand">
              <Image
                unoptimized
                className="sandbox-logo"
                src="/brand/sandbox-logo.png"
                width={25}
                height={25}
                alt=""
              />{' '}
              SANDBOX ROYALE
            </div>
            <div className="compass">
              <span>W</span>
              <i />
              <span>NW</span>
              <i />
              <strong>{Math.round((360 - state.heading) % 360)}°</strong>
              <i />
              <span>N</span>
              <i />
              <span>NE</span>
            </div>
            <button
              className="icon-button hud-pause"
              onClick={() =>
                spectating
                  ? game.current?.stopSpectating()
                  : game.current?.pause()
              }
              aria-label={spectating ? 'Stop spectating' : 'Pause game'}
            >
              <Pause size={20} />
            </button>
          </div>
          <div className="match-status">
            <span>
              <Users size={17} />
              <b>{state.alive}</b> ALIVE
            </span>
            <span>
              <Skull size={17} />
              <b>{state.kills}</b> ELIMS
            </span>
          </div>
          <div className="minimap">
            <IslandMap state={state} />
            <div className={`storm-timer ${state.outside ? 'danger' : ''}`}>
              <span className="storm-symbol">◉</span>
              <span>
                {zone.stage === 'final'
                  ? 'FINAL CIRCLE'
                  : `ZONE ${zone.phase} · ${zone.stage === 'waiting' ? 'CLOSES IN' : 'CLOSING'}`}
              </span>
              <b>{zone.stage === 'final' ? '' : clock}</b>
            </div>
          </div>
          {playing && (
            <div
              className={`crosshair ${state.aiming ? 'ads' : ''} ${state.weapon === 1 ? 'shotgun-reticle' : state.weapon === 2 ? 'sniper-hip' : ''} ${state.aiming && state.weapon === 2 ? 'scoped' : ''} ${state.hit > 0 ? 'confirmed' : ''} ${state.eliminationPulse > 0 ? 'elimination-confirmed' : ''}`}
            >
              <span />
              <span />
              <span />
              <span />
            </div>
          )}
          {playing && state.aiming && state.weapon === 2 && (
            <div
              className="sniper-reticle"
              aria-label="Sniper aiming crosshair"
            >
              <span className="scope-horizontal" />
              <span className="scope-vertical" />
              <small>3×</small>
            </div>
          )}
          {playing && visualSound && !!state.footsteps?.length && (
            <div className="footstep-ring" aria-label="Nearby enemy footsteps">
              {state.footsteps.map((cue) => (
                <div
                  key={cue.id}
                  className="footstep-direction"
                  style={{
                    transform: `rotate(${cue.angle}deg)`,
                    opacity: cue.strength,
                  }}
                >
                  <i />
                  <Footprints
                    size={22}
                    style={{
                      transform: `translateX(-50%) rotate(${-cue.angle}deg)`,
                    }}
                  />
                </div>
              ))}
            </div>
          )}
          {playing &&
            state.markers?.map((mark) => (
              <div
                key={mark.id}
                className={`squad-ping ${mark.label === 'Enemy' ? 'enemy-ping' : ''}`}
                style={{ left: `${mark.x}%`, top: `${mark.y}%` }}
              >
                <MapPin size={24} />
                <span>
                  {mark.label} · {mark.distance}m
                </span>
              </div>
            ))}
          {playing && teammate && (
            <aside className="squad-status">
              <span>YOUR DUO · TEAM {(ownPlayer?.team ?? 0) + 1}</span>
              <strong>{teammate.name}</strong>
              <p>
                {teammate.downed
                  ? 'DOWNED · Get close and press E to revive'
                  : teammate.health <= 0
                    ? 'Out of the sandbox'
                    : `${Math.ceil(teammate.health)} health · ${Math.ceil(teammate.shield)} shield`}
              </p>
            </aside>
          )}
          {playing && ownPlayer?.downed && (
            <output className="downed-banner">
              <strong>DOWN, BUT NOT OUT</strong>
              <span>
                Crawl to your teammate ·{' '}
                {Math.max(
                  0,
                  Math.ceil(
                    ((ownPlayer.bleedOutAt ?? 0) - (room?.now ?? 0)) / 1000,
                  ),
                )}
                s to revive
              </span>
            </output>
          )}
          {playing && ownPlayer?.reviving && (
            <output className="revive-progress">
              <strong>Reviving {teammate?.name ?? 'teammate'}</strong>
              <span>
                {Math.max(
                  0,
                  ((ownPlayer.reviveUntil ?? 0) - (room?.now ?? 0)) / 1000,
                ).toFixed(1)}
                s · Stay close
              </span>
              <button
                onClick={() => client.current?.send({ type: 'cancelRevive' })}
              >
                Cancel · X
              </button>
            </output>
          )}
          {playing && reviveTarget && !ownPlayer?.reviving && (
            <button
              className="revive-prompt"
              onClick={() => game.current?.interact()}
            >
              <kbd>E</kbd> Revive {reviveTarget.name}
            </button>
          )}
          <div className={`damage-flash ${state.hurt > 0 ? 'active' : ''}`} />
          {state.outside && (
            <div className="storm-warning">
              <Navigation
                size={20}
                style={{
                  transform: `rotate(${(Math.atan2(state.x - zone.x, state.z - zone.z) * -180) / Math.PI + state.heading - 45}deg)`,
                }}
              />
              {Math.max(
                1,
                Math.ceil(
                  Math.hypot(state.x - zone.x, state.z - zone.z) - zone.radius,
                ),
              )}
              m TO SAFETY · MOVE TOWARD THE ARROW
            </div>
          )}
          <output className="game-notice">{state.notice}</output>
          {playing &&
            (state.crouching || state.sprinting || state.mantling) && (
              <output className="movement-status">
                {state.mantling
                  ? 'MANTLING'
                  : state.crouching
                    ? 'CROUCHING · C TO STAND'
                    : 'SPRINTING'}
              </output>
            )}
          {playing && touch && (
            <div className="touch-movement">
              <button
                aria-label="Toggle sprint"
                onClick={() => {
                  if (game.current)
                    game.current.touchSprint = !game.current.touchSprint;
                }}
              >
                SPRINT
              </button>
              <button
                aria-label="Toggle crouch"
                onClick={() => {
                  if (game.current)
                    game.current.crouchToggle = !game.current.crouchToggle;
                }}
              >
                CROUCH
              </button>
            </div>
          )}
          <div className="kill-feed" aria-label="Recent eliminations">
            {state.feed.map((e) => (
              <div key={e.id}>
                <Skull size={13} />
                {e.text}
              </div>
            ))}
          </div>
          {playing && state.damageNumber > 0 && (
            <div
              className={`damage-number ${state.damageShield ? 'shield-hit' : ''}`}
            >
              <strong>{state.damageNumber}</strong>
              <span>
                {state.headshot
                  ? 'HEADSHOT'
                  : state.damageShield
                    ? 'SHIELD HIT'
                    : 'HIT'}
              </span>
            </div>
          )}
          {playing && state.shieldBreak > 0 && (
            <div className="shield-break">
              <Shield size={16} /> SHIELD BROKEN
            </div>
          )}
          {playing && state.threat > 0 && state.damageAngle !== null && (
            <div
              className="damage-direction"
              style={{ transform: `rotate(${state.damageAngle}deg)` }}
              aria-label="Incoming fire direction"
            >
              <span />
            </div>
          )}
          {playing && state.threat > 0 && (
            <div className="incoming-fire">
              <Crosshair size={17} />{' '}
              {state.hurt > 0 ? 'TAKING DAMAGE' : 'INCOMING FIRE'}
            </div>
          )}
          {playing && state.eliminationPulse > 0 && (
            <div className="elimination-confirmation">
              <Skull size={23} /> ELIMINATION CONFIRMED
            </div>
          )}
          {playing && state.dropping && (
            <>
              <div className="drop-guidance">
                <span>PARACHUTE DEPLOYED</span>
                <strong>{Math.ceil(state.altitude)}m</strong>
                <p>
                  {touch
                    ? 'Use the left stick to steer toward loot'
                    : 'W A S D to steer · Move mouse to look for loot'}
                </p>
                <small>You land unarmed. Pick a glowing drop below.</small>
              </div>
            </>
          )}
          {state.phase === 'dying' && (
            <section className="death-overlay" aria-label="Elimination">
              <Skull size={36} />
              <span>OUT OF THE SANDBOX</span>
              <strong>{state.killer}</strong>
              <small>Eliminated you</small>
              <p>
                #{state.rank} · {state.kills} eliminations
              </p>
              <small>
                {session
                  ? 'Switching to spectator view...'
                  : 'Your run has ended.'}
              </small>
            </section>
          )}
          {playing && state.health <= 30 && state.health > 0 && (
            <div className="low-health">
              <Heart size={16} /> LOW HEALTH ·{' '}
              {state.medkits > 0 ? 'Q TO HEAL' : 'FIND A MEDKIT'}
            </div>
          )}
          {playing && state.healing && (
            <section className="healing-progress" aria-label="Healing progress">
              {state.healing === 'medkit' ? (
                <Heart size={22} />
              ) : (
                <Shield size={22} />
              )}
              <div>
                <strong>
                  USING {SUPPLIES[state.healing].name.toUpperCase()}
                </strong>
                <div className="healing-track">
                  <span
                    style={{
                      width: `${Math.max(0, Math.min(100, 100 * (1 - state.healRemaining / SUPPLIES[state.healing].seconds)))}%`,
                    }}
                  />
                </div>
                <small>
                  {state.healRemaining.toFixed(1)}s · Keep moving · X to cancel
                </small>
              </div>
              <button
                onClick={() => game.current?.cancelHeal()}
                aria-label="Cancel healing"
              >
                <kbd>X</kbd> Cancel
              </button>
            </section>
          )}
          {spectating && state.spectator && (
            <section
              className="spectator-panel"
              aria-label="Spectator controls"
            >
              <div className="spectator-title">
                <Eye size={18} />
                <span>WATCHING</span>
                <strong>{state.spectator.name}</strong>
              </div>
              <div className="spectator-vitals">
                <span>
                  <Heart size={15} /> {Math.ceil(state.spectator.health)}
                </span>
                <span>
                  <Shield size={15} /> {Math.ceil(state.spectator.shield)}
                </span>
                <span>
                  <Skull size={15} /> {state.spectator.kills}
                </span>
              </div>
              <div className="spectator-buttons">
                <button onClick={() => game.current?.spectate(-1)}>
                  <ArrowLeft size={16} /> Previous
                </button>
                <button onClick={() => game.current?.spectate(1)}>
                  Next <ArrowRight size={16} />
                </button>
                <button onClick={() => game.current?.stopSpectating()}>
                  Results
                </button>
              </div>
              <small>
                {room?.phase === 'finished'
                  ? 'Match finished. Open Results to see the scoreboard and play again.'
                  : '[ / ] switch players · Stay in this room for the next round'}
              </small>
            </section>
          )}
          {state.pickup &&
            playing &&
            !ownPlayer?.downed &&
            !reviveTarget &&
            !ownPlayer?.reviving && (
              <button
                className="pickup-prompt"
                onClick={() => game.current?.interact()}
              >
                <kbd>E</kbd> COLLECT <b>{state.pickup}</b>
              </button>
            )}
          {!spectating && (
            <div className="hud-bottom">
              <div className="vitals">
                <div
                  className="vital-row shield"
                  aria-label={`Shield ${Math.ceil(state.shield)} of 100`}
                >
                  <Shield size={17} />
                  <div className="vital-track">
                    <span style={{ width: `${state.shield}%` }} />
                  </div>
                  <b>{Math.ceil(state.shield)}</b>
                </div>
                <div
                  className={`vital-row health ${state.health <= 30 ? 'critical' : ''}`}
                  aria-label={`Health ${Math.ceil(state.health)} of 100`}
                >
                  <Heart size={17} fill="currentColor" />
                  <div className="vital-track">
                    <span style={{ width: `${state.health}%` }} />
                  </div>
                  <b>{Math.ceil(state.health)}</b>
                </div>
                <div className="player-label">
                  YOU <span>{session ? 'BATTLE ROYALE' : 'SOLO'}</span>
                </div>
              </div>
              <div className="loadout">
                <div className="supply-slots">
                  <button
                    disabled={
                      !playing ||
                      state.medkits < 1 ||
                      state.health >= 100 ||
                      !!state.healing
                    }
                    onClick={() => game.current?.heal('medkit')}
                    aria-label={`Use medkit, ${state.medkits} available`}
                  >
                    <kbd>Q</kbd>
                    <Heart size={17} />
                    <span>
                      MEDKIT <b>{state.medkits}/3</b>
                    </span>
                    <small>+75 HP · 4s</small>
                  </button>
                  <button
                    disabled={
                      !playing ||
                      state.cells < 1 ||
                      state.shield >= 100 ||
                      !!state.healing
                    }
                    onClick={() => game.current?.heal('shield')}
                    aria-label={`Use shield cell, ${state.cells} available`}
                  >
                    <kbd>F</kbd>
                    <Shield size={17} />
                    <span>
                      SHIELD <b>{state.cells}/3</b>
                    </span>
                    <small>+50 · 2.5s</small>
                  </button>
                </div>
                <div className="weapon-slots">
                  {WEAPONS.map((w, i) => (
                    <button
                      key={w.name}
                      className={`weapon-slot ${state.weapon === i ? 'selected' : ''} ${!state.owned[i] ? 'unowned' : ''}`}
                      disabled={!state.owned[i]}
                      aria-label={`${i + 1} ${w.name}${!state.owned[i] ? ', find this weapon' : ''}`}
                      style={
                        {
                          '--weapon-color':
                            RARITIES[state.tiers?.[i] ?? 0].color,
                        } as React.CSSProperties
                      }
                      onClick={() => game.current?.selectWeapon(i)}
                    >
                      <kbd>{i + 1}</kbd>
                      <Crosshair size={22} />
                      <span>
                        {w.short}
                        <small>
                          {state.owned[i]
                            ? `${RARITIES[state.tiers?.[i] ?? 0].name} ${'◆'.repeat((state.tiers?.[i] ?? 0) + 1)}`
                            : 'FIND'}
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="ammo-block">
                <span>
                  {state.reloading
                    ? 'RELOADING'
                    : state.weapon >= 0
                      ? `${RARITIES[state.tiers?.[state.weapon] ?? 0].name} · ${WEAPONS[state.weapon].short}`
                      : 'UNARMED'}
                </span>
                <div>
                  <b>
                    {state.weapon < 0
                      ? '—'
                      : String(state.ammo).padStart(2, '0')}
                  </b>
                  <span>/ {state.reserve}</span>
                </div>
                <small>
                  {state.weapon < 0 ? (
                    'FIND A WEAPON DROP'
                  ) : (
                    <>
                      <kbd>R</kbd> RELOAD · 1–3 / WHEEL
                    </>
                  )}
                </small>
              </div>
            </div>
          )}
          {touch && playing && (
            <div className="touch-controls">
              <div
                className="look-area"
                onPointerDown={(e) => {
                  lookTouch.current = { x: e.clientX, y: e.clientY };
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (!lookTouch.current) return;
                  game.current?.look(
                    e.clientX - lookTouch.current.x,
                    e.clientY - lookTouch.current.y,
                  );
                  lookTouch.current = { x: e.clientX, y: e.clientY };
                }}
                onPointerUp={() => {
                  lookTouch.current = null;
                }}
                onPointerCancel={() => {
                  lookTouch.current = null;
                }}
              />
              <div
                className="joystick"
                onPointerDown={(e) => {
                  stick.current = { x: e.clientX, y: e.clientY };
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (!stick.current || !game.current) return;
                  const dx = e.clientX - stick.current.x,
                    dy = e.clientY - stick.current.y,
                    l = Math.max(40, Math.hypot(dx, dy));
                  game.current.touchMove = { x: dx / l, y: dy / l };
                  setStickPos({ x: (dx / l) * 32, y: (dy / l) * 32 });
                }}
                onPointerUp={() => {
                  stick.current = null;
                  if (game.current) game.current.touchMove = { x: 0, y: 0 };
                  setStickPos({ x: 0, y: 0 });
                }}
                onPointerCancel={() => {
                  stick.current = null;
                  if (game.current) game.current.touchMove = { x: 0, y: 0 };
                  setStickPos({ x: 0, y: 0 });
                }}
              >
                <span
                  style={{
                    transform: `translate(${stickPos.x}px,${stickPos.y}px)`,
                  }}
                />
              </div>
              <button
                className="touch-fire"
                aria-label="Fire weapon"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  if (game.current) {
                    game.current.triggerHeld = false;
                    game.current.shooting = true;
                  }
                }}
                onPointerUp={() => {
                  if (game.current) game.current.shooting = false;
                }}
                onPointerCancel={() => {
                  if (game.current) game.current.shooting = false;
                }}
              >
                <Crosshair size={32} />
              </button>
              <button
                className="touch-ping"
                onClick={() => game.current?.mark()}
                aria-label="Ping location"
              >
                <MapPin size={22} />
              </button>
              <button
                className="touch-aim"
                onClick={() => game.current?.setAiming(!state.aiming)}
                aria-label="Toggle aim"
                aria-pressed={state.aiming}
              >
                <Crosshair size={20} />
              </button>
              <button
                className="touch-reload"
                onClick={() => game.current?.reload()}
                aria-label="Reload"
              >
                <RotateCcw size={20} />
              </button>
              <button
                className="touch-jump"
                onClick={() => {
                  game.current?.jump();
                }}
                aria-label="Jump"
              >
                <ArrowDown size={22} style={{ transform: 'rotate(180deg)' }} />
              </button>
            </div>
          )}
        </>
      )}
      {state.phase === 'paused' && (
        <section className="pause-overlay">
          <div className="pause-panel">
            <div className="eyebrow">
              {session ? 'FRIEND MATCH' : 'TAKE A BREATHER'}
            </div>
            <h2>{session ? 'READY TO DROP?' : 'MATCH PAUSED.'}</h2>
            <p>
              {session
                ? 'The match keeps running while this menu is open.'
                : 'The sandbox can wait.'}
            </p>
            {state.notice.includes('mouse') && <p>{state.notice}</p>}
            <button className="deploy-button" onClick={start}>
              {session ? 'ENTER MATCH' : 'RESUME'}{' '}
              <Play size={22} fill="currentColor" />
            </button>
            <button
              className="secondary-button"
              onClick={() => setPanel('settings')}
            >
              <Settings2 size={18} />
              Settings
            </button>
            <button
              className="secondary-button"
              onClick={() => setPanel('controls')}
            >
              <Gamepad2 size={18} />
              Controls
            </button>
            <button className="text-button" onClick={backToLobby}>
              <ArrowLeft size={16} />
              Leave match
            </button>
          </div>
        </section>
      )}
      {ended && (
        <section className="pause-overlay result-overlay">
          <div className="result-panel">
            <div className="result-icon">
              {state.phase === 'won' ? (
                <Trophy size={38} />
              ) : (
                <Flag size={38} />
              )}
            </div>
            <div className="eyebrow">
              {state.phase === 'won'
                ? 'THE SANDBOX IS YOURS'
                : 'OUT OF THE SANDBOX'}
            </div>
            <h2>
              {state.phase === 'won'
                ? room?.mode === 'duos'
                  ? 'LAST DUO IN\nTHE SANDBOX.'
                  : 'LAST ONE IN\nTHE SANDBOX.'
                : 'BACK TO THE\nSANDBOX?'}
            </h2>
            <div className="result-stats">
              <div>
                <b>
                  {room?.players.find((p) => p.id === session?.playerId)
                    ?.spectator
                    ? '—'
                    : `#${state.rank}`}
                </b>
                <span>PLACEMENT</span>
              </div>
              <div>
                <b>{state.kills}</b>
                <span>ELIMINATIONS</span>
              </div>
              <div>
                <b>
                  {Math.floor(state.survived / 60)}:
                  {Math.floor(state.survived % 60)
                    .toString()
                    .padStart(2, '0')}
                </b>
                <span>SURVIVED</span>
              </div>
            </div>
            {session &&
              (room?.phase === 'playing' || room?.phase === 'finished') &&
              state.phase === 'lost' && (
                <button
                  className="deploy-button"
                  onClick={() => game.current?.spectate()}
                >
                  <Eye size={22} /> WATCH REMAINING PLAYERS
                </button>
              )}
            {session && room?.phase === 'finished' && (
              <div className="scoreboard" aria-label="Match results">
                <div className="scoreboard-heading">
                  <span>PLACEMENT / PLAYER</span>
                  <span>ELIMS</span>
                </div>
                {[...room.players]
                  .filter((p) => !p.spectator)
                  .sort(
                    (a, b) =>
                      (a.rank || 99) - (b.rank || 99) || b.kills - a.kills,
                  )
                  .map((p) => (
                    <div
                      key={p.id}
                      className={p.id === session.playerId ? 'is-you' : ''}
                    >
                      <span>
                        <b>#{p.rank || '–'}</b> {p.name}
                        {p.id === session.playerId && ' · YOU'}
                      </span>
                      <strong>{p.kills}</strong>
                    </div>
                  ))}
              </div>
            )}
            {session &&
              room?.phase === 'finished' &&
              room.host === session.playerId && (
                <button
                  className="deploy-button"
                  onClick={() => {
                    client.current?.send({ type: 'rematch' });
                    setPanel('friends');
                  }}
                >
                  PLAY AGAIN <RotateCcw size={22} />
                </button>
              )}
            <button
              className="secondary-button"
              onClick={() => (session ? setPanel('friends') : start())}
            >
              {session ? 'BACK TO ROOM' : 'DROP AGAIN'} <RotateCcw size={24} />
            </button>
            <button className="text-button" onClick={backToLobby}>
              <ArrowLeft size={16} />
              Back to lobby
            </button>
          </div>
        </section>
      )}
      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}
      <Dialog
        open={panel !== null}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
      >
        <DialogContent
          className={`game-dialog ${panel === 'map' ? 'map-dialog' : ''}`}
        >
          <DialogTitle>
            {panel === 'friends'
              ? 'BRING YOUR FRIENDS.'
              : panel === 'controls'
                ? 'KNOW YOUR MOVES.'
                : panel === 'settings'
                  ? 'MAKE IT YOURS.'
                  : 'KNOW THE SANDBOX.'}
          </DialogTitle>
          <DialogDescription>
            {panel === 'friends'
              ? 'Your friends. Your sandbox. Last team standing.'
              : panel === 'controls'
                ? 'Find supplies, stay inside the storm, and outlast your rivals.'
                : panel === 'settings'
                  ? 'Set up your next drop.'
                  : 'Sandcastle Square. Find cover, loot, and your next landing spot.'}
          </DialogDescription>
          {panel === 'friends' && (
            <FriendsRoom
              room={room}
              session={session}
              status={connection}
              busy={roomBusy}
              error={roomError}
              inviteCode={inviteCode}
              enter={(name, code) => {
                void enterRoom(name, code);
              }}
              leave={leaveRoom}
              command={(command) => {
                setRoomError('');
                client.current?.send(command);
              }}
            />
          )}
          {panel === 'controls' && (
            <>
              <div className="controls-grid">
                {controls.map(([key, label]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <kbd>{key}</kbd>
                  </div>
                ))}
              </div>
              <div className="help-note">
                <Shield size={21} />
                <p>
                  Steer your parachute toward the glowing loot using WASD. You
                  land unarmed. Find an AR, shotgun, or sniper at a glowing drop
                  and press E to collect it. Use 1–3 or the scroll wheel to
                  switch between weapons you have collected. Common weapons are
                  gray, Rare blue, Epic purple, and Legendary gold. Higher tiers
                  deal more damage. Eliminated rivals drop their equipment.
                  Press C to crouch, Shift to sprint, and Space near low cover
                  to mantle onto it. Red medkits and blue shield cells go into
                  your inventory. Press Q to heal or F to restore shields. Carry
                  up to three of each. Healing continues when you take damage.
                  Firing, switching weapons, or reloading cancels healing
                  without using the item.
                </p>
              </div>
              <p className="touch-help">
                After elimination, you automatically watch your killer. Use [ /
                ] or Previous / Next to switch survivors. On touch screens, tap
                the medkit or shield buttons to heal. Use the left stick to
                move, swipe the right side to look, and tap the crosshair to
                fire.
              </p>
              <button
                className="secondary-button"
                onClick={() => setPanel(null)}
              >
                Got it <Check size={18} />
              </button>
            </>
          )}
          {panel === 'settings' && (
            <div className="settings-content">
              <div className="setting-row">
                <div>
                  <label htmlFor="perspective-switch">Third-person view</label>
                  <p>Shoulder camera · Press V to switch during a match</p>
                </div>
                <Switch
                  id="perspective-switch"
                  checked={state.perspective === 'third'}
                  onCheckedChange={(v) =>
                    game.current?.setPerspective(v ? 'third' : 'first')
                  }
                />
              </div>
              <div className="setting-label">
                <span id="sensitivity-label">Look sensitivity</span>
                <span>{sensitivity.toFixed(1)}×</span>
              </div>
              <Slider
                aria-labelledby="sensitivity-label"
                min={0.3}
                max={2.5}
                step={0.1}
                value={[sensitivity]}
                onValueChange={(v) => {
                  const n = Array.isArray(v) ? v[0] : v;
                  setSensitivity(n);
                  if (game.current) game.current.sensitivity = n;
                }}
              />
              <div className="setting-row">
                <div>
                  <label htmlFor="sound-switch">Game audio</label>
                  <p>Directional footsteps, weapon fire, and match cues</p>
                </div>
                <Switch
                  id="sound-switch"
                  checked={!muted}
                  onCheckedChange={(v) => {
                    setMuted(!v);
                    if (game.current) game.current.muted = !v;
                  }}
                />
              </div>
              <div className="setting-row">
                <div>
                  <label htmlFor="visual-sound-switch">Visual footsteps</label>
                  <p>Show nearby enemy footsteps around your crosshair</p>
                </div>
                <Switch
                  id="visual-sound-switch"
                  checked={visualSound}
                  onCheckedChange={setVisualSound}
                />
              </div>
              <div className="setting-row">
                <div>
                  <label htmlFor="touch-switch">Touch controls</label>
                  <p>On-screen movement and fire buttons</p>
                </div>
                <Switch
                  id="touch-switch"
                  checked={touch}
                  onCheckedChange={setTouch}
                />
              </div>
              <button className="secondary-button" onClick={fullscreen}>
                <Maximize size={18} />
                Toggle fullscreen
              </button>
            </div>
          )}
          {panel === 'map' && (
            <>
              <IslandMap state={state} large />
              <div className="map-legend">
                <span>
                  <i className="legend-safe" /> Current circle
                </span>
                <span>
                  <i className="legend-next" /> Next circle
                </span>
                <span>
                  <i className="legend-player" /> Your position
                </span>
                <span>
                  <i className="legend-enemy" /> Nearby rivals
                </span>
              </div>
              <p className="touch-help">
                The white dashed ring marks the next safe circle. Each phase
                pauses before the purple wall moves and shrinks toward it.
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
