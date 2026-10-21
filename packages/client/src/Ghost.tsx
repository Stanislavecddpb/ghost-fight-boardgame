import type { Kind, PlayerID } from '@gf/engine';

/** Цвет «своей стороны» — обводка привидения, чтобы различать хозяев даже у открытых привидений. */
export const OWNER_COLOR: Record<PlayerID, string> = { '0': '#f2b84b', '1': '#5fe3cf' };
export const OWNER_NAME: Record<PlayerID, string> = { '0': 'янтарные', '1': 'лунные' };

const FILL = { good: '#4d8dff', evil: '#ff4f62', unknown: '#e9e4f7' };

/** Привидение. `kind === null` — цвет неизвестен смотрящему. */
export function GhostIcon({ kind, owner, size = 48, dim }: {
  kind: Kind | null; owner: PlayerID; size?: number; dim?: boolean;
}) {
  const fill = kind ? FILL[kind] : FILL.unknown;
  return (
    <svg className={`ghost ${kind ?? 'unknown'} ${dim ? 'dim' : ''}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <ellipse cx="32" cy="60" rx="18" ry="3" fill={OWNER_COLOR[owner]} opacity=".55" />
      <path d="M13 56V29C13 16.5 21.5 7 32 7s19 9.5 19 22v27l-6.3-4.6-6.4 4.6-6.3-4.6-6.4 4.6-6.3-4.6z"
        fill={fill} stroke={OWNER_COLOR[owner]} strokeWidth="3.2" strokeLinejoin="round" />
      <path d="M20 22c2-6 7-9 12-9" stroke="#fff" strokeOpacity=".55" strokeWidth="3" fill="none" strokeLinecap="round" />
      {kind === 'evil' ? (
        <>
          <path d="M20 25l9 4M44 25l-9 4" stroke="#2a1030" strokeWidth="3" strokeLinecap="round" />
          <circle cx="25.5" cy="32" r="3.4" fill="#2a1030" />
          <circle cx="38.5" cy="32" r="3.4" fill="#2a1030" />
          <path d="M25 44q7-5 14 0" stroke="#2a1030" strokeWidth="3" fill="none" strokeLinecap="round" />
        </>
      ) : kind === 'good' ? (
        <>
          <ellipse cx="25.5" cy="30" rx="3.6" ry="5" fill="#132045" />
          <ellipse cx="38.5" cy="30" rx="3.6" ry="5" fill="#132045" />
          <path d="M25 40q7 6 14 0" stroke="#132045" strokeWidth="3" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <ellipse cx="25.5" cy="30" rx="3.6" ry="5" fill="#2a1f45" />
          <ellipse cx="38.5" cy="30" rx="3.6" ry="5" fill="#2a1f45" />
          <ellipse cx="32" cy="42" rx="3" ry="3.6" fill="#2a1f45" />
        </>
      )}
    </svg>
  );
}
