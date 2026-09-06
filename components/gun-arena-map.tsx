import type { GameState } from '../lib/game/engine';
import { ARENA_BLOCKS } from '../lib/game/gun-arena';
export function GunArenaMap({
  state,
  large,
}: {
  state: GameState;
  large: boolean;
}) {
  return (
    <svg
      className={`island-map ${large ? 'large' : ''}`}
      viewBox="-43 -39 86 78"
      aria-label="Sandcastle courtyard map"
    >
      <rect x="-41" y="-37" width="82" height="74" rx="3" fill="#8f6247" />
      <rect x="-37" y="-33" width="74" height="66" fill="#e5c991" />
      {ARENA_BLOCKS.filter((b) => b.role !== 'ramp').map((b, i) => (
        <rect
          key={i}
          x={b.x - b.w / 2}
          y={b.z - b.d / 2}
          width={b.w}
          height={b.d}
          fill={b.color}
          stroke="#9d7c55"
          strokeWidth=".3"
        />
      ))}
      {[-23, 23].map((x) => (
        <path
          key={x}
          d={`M${x - 2.5} 6h5v11.2h-5z`}
          fill="#f4e2b6"
          stroke="#a58156"
          strokeWidth=".4"
        />
      ))}
      {large && (
        <>
          <text x="0" y="-14" textAnchor="middle" fontSize="2.4" fill="#60452f">
            COURTYARD
          </text>
          <text x="-23" y="-8" textAnchor="middle" fontSize="2" fill="#60452f">
            BLUE FORT
          </text>
          <text x="23" y="-8" textAnchor="middle" fontSize="2" fill="#60452f">
            PURPLE FORT
          </text>
        </>
      )}
      {state.pingPoints?.map((p) => (
        <circle key={p.id} cx={p.x} cy={p.z} r="1.4" fill="#ffdb6c" />
      ))}
      <g
        transform={`translate(${state.x} ${state.z}) rotate(${-state.heading})`}
      >
        <path
          d="M0 -2.5L1.6 1.6L0 .8L-1.6 1.6Z"
          fill="#fff"
          stroke="#213d47"
          strokeWidth=".45"
        />
      </g>
    </svg>
  );
}
