import { Client } from 'boardgame.io/react';
import { SocketIO } from 'boardgame.io/multiplayer';
import { LobbyClient } from 'boardgame.io/client';
import { GhostFightGame, GAME_ID } from '@gf/engine';
import { Table } from './Table';

// dev (Vite на 5173) — сервер на том же хосте, порт 3001; prod — тот же origin.
export const SERVER =
  import.meta.env.VITE_SERVER ?? (import.meta.env.DEV ? `http://${location.hostname}:3001` : location.origin);

export const lobby = new LobbyClient({ server: SERVER });

/** Один клиент и для игроков, и для зрителей: зритель — это клиент без playerID. */
export const NetClient = Client({
  game: GhostFightGame,
  board: Table,
  multiplayer: SocketIO({ server: SERVER }),
  debug: false,
});

export { GAME_ID };

export interface Seat {
  playerID: string;
  credentials: string;
  name: string;
}

const seatKey = (matchID: string) => `gf:seat:${matchID}`;

export function loadSeat(matchID: string): Seat | null {
  try {
    const raw = localStorage.getItem(seatKey(matchID));
    return raw ? (JSON.parse(raw) as Seat) : null;
  } catch {
    return null;
  }
}

/** Забыть место: его освободили (игрок встал из-за стола на платформе). */
export function forgetSeat(matchID: string): void {
  try {
    localStorage.removeItem(seatKey(matchID));
  } catch {
    /* ignore */
  }
}

export function saveSeat(matchID: string, seat: Seat): void {
  try {
    localStorage.setItem(seatKey(matchID), JSON.stringify(seat));
  } catch {
    /* приватный режим — место не запомнится */
  }
}

export function savedName(): string {
  try {
    return localStorage.getItem('gf:name') ?? '';
  } catch {
    return '';
  }
}

export function rememberName(name: string): void {
  try {
    localStorage.setItem('gf:name', name);
  } catch {
    /* ignore */
  }
}

// Платформа Zarya Boardgames открывает игру с ?name=<ник>&embed=1:
// имя берём из аккаунта платформы, а ссылки «на главную» прячем — навигация у платформы.
const params = new URLSearchParams(location.search);
const nameFromUrl = params.get('name')?.trim();
if (nameFromUrl) rememberName(nameFromUrl.slice(0, 20));
if (params.has('embed')) document.documentElement.classList.add('embed');
