'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Crosshair,
  Expand,
  Flag,
  Gamepad2,
  Heart,
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
import { WEAPONS } from '@/lib/game/rules';

const initial: GameState = {
  phase: 'lobby',
  health: 100,
  shield: 50,
  alive: 16,
  kills: 0,
  ammo: 30,
  reserve: 120,
  weapon: 0,
  elapsed: 0,
  storm: 107,
  outside: false,
  reloading: false,
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
  ['SPACE', 'Jump'],
  ['R', 'Reload'],
  ['E', 'Collect supplies'],
  ['1  2  3', 'Switch weapon'],
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
      aria-label="Island map with your position and the safe zone"
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
      <rect x="-120" y="-120" width="240" height="240" fill="#397985" />
      <path
        d="M-24-107 18-108 40-94 63-92 79-68 99-56 105-21 111 7 97 28 95 56 64 69 58 89 27 104-5 109-31 97-61 94-73 69-94 50-103 23-107-5-98-33-85-47-78-73-53-83Z"
        fill="#d6ca95"
      />
      <path
        d="M-23-100 17-100 37-87 60-84 72-62 92-51 98-20 101 6 88 25 87 50 58 63 52 82 25 96-4 101-29 90-56 86-65 64-86 44-95 19-99-4-91-28-79-42-72-66-48-77Z"
        fill="#82a578"
      />
      <path d="M0-88V92M-80 4H82M40-53V31" stroke="#d0c9a0" strokeWidth="7" />
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
            r={state.storm}
            fill="none"
            stroke="#e7ccff"
            strokeWidth="2"
            strokeDasharray="4 2"
          />
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
            SUNSET STATION
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
  const [panel, setPanel] = useState<'controls' | 'settings' | 'map' | null>(
    null,
  );
  const [muted, setMuted] = useState(false),
    [sensitivity, setSensitivity] = useState(1),
    [touch, setTouch] = useState(false),
    [best, setBest] = useState(0);
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
    ended = state.phase === 'won' || state.phase === 'lost';
  const time = Math.max(
    0,
    Math.ceil(state.elapsed < 35 ? 35 - state.elapsed : 270 - state.elapsed),
  );
  const clock = `${Math.floor(time / 60)
    .toString()
    .padStart(2, '0')}:${(time % 60).toString().padStart(2, '0')}`;
  return (
    <main
      className={`game-shell ${playing ? 'is-playing' : ''} ${lobby ? 'is-lobby' : ''}`}
    >
      <div
        className="world-view"
        ref={viewport}
        aria-label="3D battle royale island"
      />
      <div className={`world-shade ${lobby ? 'lobby-shade' : ''}`} />
      {lobby && (
        <>
          <header className="lobby-header">
            <Link className="wordmark" href="/" aria-label="Lastlight home">
              <span className="brand-icon">
                <Zap size={23} fill="currentColor" />
              </span>
              LASTLIGHT<span className="brand-dot">®</span>
            </Link>
            <div className="header-mode">
              <span className="live-dot" /> SOLO BATTLE ROYALE
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
                <span /> ONE ISLAND. ONE SURVIVOR.
              </div>
              <h1>
                MAKE IT
                <br />
                TO THE
                <br />
                <span>LASTLIGHT.</span>
              </h1>
              <p>
                Drop in. Gear up. Outlast everyone.
                <br />
                Your next close call starts here.
              </p>
              <div className="match-facts">
                <span>
                  <Users size={16} />
                  16 combatants
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
                  SUNSET STATION<span>LASTLIGHT ISLAND</span>
                </div>
              </div>
            </div>
            <aside className="island-card">
              <div className="card-eyebrow">
                <span className="live-dot" /> THE BATTLEGROUND <span>01</span>
              </div>
              <button
                className="map-preview"
                onClick={() => setPanel('map')}
                aria-label="Explore the island map"
              >
                <IslandMap state={state} />
                <span className="map-expand">
                  <Expand size={16} />
                </span>
                <span className="map-north">N</span>
              </button>
              <div className="island-card-caption">
                <div>
                  <h2>Lastlight Island</h2>
                  <p>Clear skies. Closing storm.</p>
                </div>
                <ArrowRight size={20} />
              </div>
            </aside>
          </div>
          <footer className="lobby-footer">
            <div className="deployment-card">
              <div className="mode-icon">
                <Crosshair size={25} />
              </div>
              <div>
                <div className="mode-label">
                  SOLO <span>BATTLE ROYALE</span>
                </div>
                <p>You against 15 AI rivals.</p>
              </div>
              <span className="mode-check">
                <Check size={17} />
              </span>
            </div>
            <button
              className="deploy-button"
              onClick={start}
              disabled={!ready || !!error}
            >
              <span>
                {error ? 'UNAVAILABLE' : ready ? 'DROP IN' : 'PREPARING ISLAND'}
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
              LASTLIGHT <span className="muted">/</span> FIELD TEST 01
            </span>
            <span className="best-score">
              PERSONAL BEST <b>{best}</b> ELIMINATIONS
            </span>
            <span>BUILT FOR THE LAST ONE STANDING.</span>
          </div>
        </>
      )}
      {!lobby && (
        <>
          <div className="hud-top">
            <div className="hud-brand">
              <Zap size={20} fill="currentColor" /> LASTLIGHT
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
              onClick={() => game.current?.pause()}
              aria-label="Pause game"
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
                {state.elapsed < 35 ? 'STORM CLOSES IN' : 'STORM CLOSING'}
              </span>
              <b>{clock}</b>
            </div>
          </div>
          <div className={`crosshair ${state.hit > 0 ? 'confirmed' : ''}`}>
            <span />
            <span />
            <span />
            <span />
            {state.hit > 0 && <b>×</b>}
          </div>
          <div className={`damage-flash ${state.hurt > 0 ? 'active' : ''}`} />
          {state.outside && (
            <div className="storm-warning">
              YOU ARE IN THE STORM. GET TO THE SAFE ZONE.
            </div>
          )}
          <output className="game-notice">{state.notice}</output>
          {state.pickup && playing && (
            <button
              className="pickup-prompt"
              onClick={() => game.current?.pickup()}
            >
              <kbd>E</kbd> COLLECT <b>{state.pickup}</b>
            </button>
          )}
          <div className="hud-bottom">
            <div className="vitals">
              <div className="vital-row shield">
                <Shield size={17} />
                <div className="vital-track">
                  <span style={{ width: `${state.shield}%` }} />
                </div>
                <b>{Math.ceil(state.shield)}</b>
              </div>
              <div className="vital-row health">
                <Heart size={17} fill="currentColor" />
                <div className="vital-track">
                  <span style={{ width: `${state.health}%` }} />
                </div>
                <b>{Math.ceil(state.health)}</b>
              </div>
              <div className="player-label">
                YOU <span>SOLO</span>
              </div>
            </div>
            <div className="weapon-slots">
              {WEAPONS.map((w, i) => (
                <button
                  key={w.name}
                  className={`weapon-slot ${state.weapon === i ? 'selected' : ''}`}
                  style={{ '--weapon-color': w.color } as React.CSSProperties}
                  onClick={() => game.current?.selectWeapon(i)}
                >
                  <kbd>{i + 1}</kbd>
                  <Crosshair size={22} />
                  <span>{w.name}</span>
                </button>
              ))}
            </div>
            <div className="ammo-block">
              <span>
                {state.reloading ? 'RELOADING' : WEAPONS[state.weapon].short}
              </span>
              <div>
                <b>{String(state.ammo).padStart(2, '0')}</b>
                <span>/ {state.reserve}</span>
              </div>
              <small>
                <kbd>R</kbd> RELOAD
              </small>
            </div>
          </div>
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
                  if (game.current) game.current.shooting = true;
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
                className="touch-reload"
                onClick={() => game.current?.reload()}
                aria-label="Reload"
              >
                <RotateCcw size={20} />
              </button>
              <button
                className="touch-jump"
                onClick={() => {
                  if (game.current && game.current.position.y <= 1.71)
                    game.current.velocityY = 7;
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
            <div className="eyebrow">TAKE A BREATHER</div>
            <h2>MATCH PAUSED.</h2>
            <p>The island can wait.</p>
            {state.notice.includes('mouse') && <p>{state.notice}</p>}
            <button className="deploy-button" onClick={start}>
              RESUME <Play size={22} fill="currentColor" />
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
            <button
              className="text-button"
              onClick={() => game.current?.lobby()}
            >
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
                ? 'THE ISLAND IS YOURS'
                : 'LIVE. LEARN. DROP AGAIN.'}
            </div>
            <h2>
              {state.phase === 'won'
                ? 'LAST ONE\nSTANDING.'
                : 'UNTIL NEXT\nLASTLIGHT.'}
            </h2>
            <div className="result-stats">
              <div>
                <b>#{state.rank}</b>
                <span>PLACEMENT</span>
              </div>
              <div>
                <b>{state.kills}</b>
                <span>ELIMINATIONS</span>
              </div>
              <div>
                <b>
                  {Math.floor(state.elapsed / 60)}:
                  {Math.floor(state.elapsed % 60)
                    .toString()
                    .padStart(2, '0')}
                </b>
                <span>SURVIVED</span>
              </div>
            </div>
            <button className="deploy-button" onClick={start}>
              DROP AGAIN <RotateCcw size={24} />
            </button>
            <button
              className="text-button"
              onClick={() => game.current?.lobby()}
            >
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
            {panel === 'controls'
              ? 'KNOW YOUR MOVES.'
              : panel === 'settings'
                ? 'MAKE IT YOURS.'
                : 'KNOW THE ISLAND.'}
          </DialogTitle>
          <DialogDescription>
            {panel === 'controls'
              ? 'Find supplies, stay inside the storm, and outlast all 15 rivals.'
              : panel === 'settings'
                ? 'Set up your next drop.'
                : 'Lastlight Island. Learn the routes. Find your cover.'}
          </DialogDescription>
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
                  All three weapons are ready at drop. Walk up to glowing
                  supplies and press E for ammo, health, or shields.
                </p>
              </div>
              <p className="touch-help">
                On touch screens, use the left stick to move, swipe the right
                side to look, and tap the crosshair to fire.
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
                  <p>Weapon fire, pickups, and match cues</p>
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
                  <i className="legend-safe" /> Safe zone
                </span>
                <span>
                  <i className="legend-player" /> Your position
                </span>
                <span>
                  <i className="legend-enemy" /> Nearby rivals
                </span>
              </div>
              <p className="touch-help">
                The storm starts closing after 35 seconds. Head toward the
                center before it catches you.
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
