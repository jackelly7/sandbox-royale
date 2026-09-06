import { MODES, MODE_NAMES, TEAM_GOAL } from '../lib/game/modes';
import { WEAPONS } from '../lib/game/rules';
import type { Command, RoomSnapshot } from '../lib/game/multiplayer';
import { assignSlot, type Preferences } from '../lib/game/preferences';
export function ModeVote({
  room,
  playerId,
  send,
  disabled = false,
}: {
  room: RoomSnapshot;
  playerId: string;
  send: (c: Command) => void;
  disabled?: boolean;
}) {
  return (
    <section className="mode-vote" aria-label="Vote for next mode">
      <h3>Next round</h3>
      <div className="mode-options">
        {MODES.map((mode) => (
          <button
            key={mode}
            disabled={disabled}
            aria-pressed={room.votes?.[playerId] === mode}
            onClick={() => send({ type: 'vote', mode })}
          >
            {MODE_NAMES[mode]}{' '}
            <b>
              {
                room.players.filter(
                  (p) => p.connected && !p.bot && room.votes?.[p.id] === mode,
                ).length
              }
            </b>
          </button>
        ))}
      </div>
      <p>
        Leading: {MODE_NAMES[room.nextMode ?? room.mode ?? 'solo']}. Ties favor
        the current mode, then Solo, Duos, Gun Game, Team Deathmatch. Ready up
        to start the five-second countdown.
      </p>
    </section>
  );
}
export function TeamScore({ room }: { room: RoomSnapshot }) {
  return (
    <div className="team-score" aria-label="Team scores">
      <span className="team-blue">
        BLUE <b>{room.teamScores?.[0] ?? 0}</b>
      </span>
      <small>FIRST TO {TEAM_GOAL}</small>
      <span className="team-coral">
        <b>{room.teamScores?.[1] ?? 0}</b> CORAL
      </span>
    </div>
  );
}
export function LoadoutPicker({
  room,
  playerId,
  send,
  disabled = false,
}: {
  room: RoomSnapshot;
  playerId?: string;
  send: (c: Command) => void;
  disabled?: boolean;
}) {
  const me = room.players.find((p) => p.id === playerId);
  return (
    <section className="loadout-picker">
      <label htmlFor="team-loadout">Your Team Deathmatch weapon</label>
      <select
        id="team-loadout"
        value={me?.loadout ?? 0}
        disabled={disabled}
        onChange={(e) =>
          send({ type: 'loadout', weapon: Number(e.target.value) })
        }
      >
        {WEAPONS.map((w, i) => (
          <option key={w.name} value={i}>
            {w.name}
          </option>
        ))}
      </select>
      <p>
        Applies at your next spawn, or immediately during spawn protection.
        Unlimited reserve ammo; reload between magazines.
      </p>
    </section>
  );
}
export function PersonalControls({
  value,
  onChange,
}: {
  value: Preferences;
  onChange: (p: Preferences) => void;
}) {
  const update = (patch: Partial<Preferences>) =>
    onChange({ ...value, ...patch });
  return (
    <div className="personal-controls">
      {(
        [
          { key: 'look', label: 'Hip-fire sensitivity', min: 0.3, max: 2.5 },
          { key: 'aim', label: 'Aiming sensitivity', min: 0.2, max: 2 },
          { key: 'crosshairSize', label: 'Crosshair size', min: 0.7, max: 1.5 },
        ] as const
      ).map((r) => (
        <label key={r.key}>
          {r.label} <output>{value[r.key].toFixed(1)}×</output>
          <input
            type="range"
            min={r.min}
            max={r.max}
            step="0.1"
            value={value[r.key]}
            onChange={(e) => update({ [r.key]: Number(e.target.value) })}
          />
        </label>
      ))}
      <label>
        Crosshair color{' '}
        <input
          type="color"
          value={value.crosshairColor}
          onChange={(e) => update({ crosshairColor: e.target.value })}
        />
      </label>
      <div className="reticle-preview" style={{ color: value.crosshairColor }}>
        <span style={{ transform: `scale(${value.crosshairSize})` }}>⌖</span>
        <small>Clear center · Saved on this device</small>
      </div>
      {(['sprint', 'crouch'] as const).map((k) => (
        <label key={k}>
          {k === 'sprint' ? 'Sprint · Shift' : 'Crouch · C'}
          <select
            value={value[k]}
            onChange={(e) => update({ [k]: e.target.value })}
          >
            <option value="hold">Hold</option>
            <option value="toggle">Toggle</option>
          </select>
        </label>
      ))}
      <fieldset>
        <legend>Battle Royale weapon keys</legend>
        <p>Choose your 1–3 order. The wheel follows this order.</p>
        {value.slots.map((weapon, slot) => (
          <label key={slot}>
            Key {slot + 1}
            <select
              value={weapon}
              onChange={(e) =>
                update({
                  slots: assignSlot(value.slots, slot, Number(e.target.value)),
                })
              }
            >
              {WEAPONS.slice(0, 3).map((w, i) => (
                <option key={w.name} value={i}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
        ))}
      </fieldset>
    </div>
  );
}
