import type { Game, Ctx } from 'boardgame.io';
import { INVALID_MOVE, ActivePlayers } from 'boardgame.io/core';

export const GAME_ID = 'ghost-fight';
export const SIZE = 6;
export const PLAYERS = ['0', '1'] as const;
export type PlayerID = (typeof PLAYERS)[number];

/** Добрый или злой. `null` — тайна для того, кто смотрит (чужое привидение на поле). */
export type Kind = 'good' | 'evil';

export interface Ghost {
  id: string;
  owner: PlayerID;
  kind: Kind | null;
  /** Клетка r*6+c; `null` — привидение уже не на поле. */
  pos: number | null;
  /** Съедено соперником (лежит открытым возле поля). */
  captured: boolean;
  /** Вышло через угол соперника. */
  escaped: boolean;
}

export type WinReason = 'ate-good' | 'gave-evil' | 'escaped' | 'no-moves';

export interface LogEntry {
  turn: number;
  player: PlayerID;
  text: string;
}

export interface GFState {
  ghosts: Ghost[];
  /** Расстановка подтверждена. */
  ready: Record<PlayerID, boolean>;
  first: PlayerID;
  lastMove: { ghost: string; from: number; to: number | null; captured?: string } | null;
  log: LogEntry[];
  /** Победитель текущего раунда; пока не `null`, раунд окончен и ждём «Новый раунд». */
  winner: PlayerID | null;
  reason: WinReason | null;
  /** Номер раунда в этом матче (с 1) и счёт побед за матч. */
  round: number;
  score: Record<PlayerID, number>;
  history: { round: number; winner: PlayerID; reason: WinReason }[];
}

export const DIRS = { up: -SIZE, down: SIZE, left: -1, right: 1 } as const;
export type Dir = keyof typeof DIRS;

export const cell = (r: number, c: number) => r * SIZE + c;
export const rowOf = (p: number) => Math.floor(p / SIZE);
export const colOf = (p: number) => p % SIZE;
export const isPlayer = (id: unknown): id is PlayerID => id === '0' || id === '1';
export const other = (p: PlayerID): PlayerID => (p === '0' ? '1' : '0');

/** Стартовая зона 2×4: игрок 0 внизу (ряды 4–5), игрок 1 вверху (ряды 0–1), без крайних столбцов. */
export function startCells(player: PlayerID): number[] {
  const rows = player === '0' ? [4, 5] : [1, 0];
  return rows.flatMap((r) => [1, 2, 3, 4].map((c) => cell(r, c)));
}

/** Выходы игрока — углы на стороне соперника. */
export function exitsOf(player: PlayerID): number[] {
  return player === '0' ? [cell(0, 0), cell(0, SIZE - 1)] : [cell(SIZE - 1, 0), cell(SIZE - 1, SIZE - 1)];
}

export function step(from: number, dir: Dir): number | null {
  const r = rowOf(from), c = colOf(from);
  if (dir === 'up' && r === 0) return null;
  if (dir === 'down' && r === SIZE - 1) return null;
  if (dir === 'left' && c === 0) return null;
  if (dir === 'right' && c === SIZE - 1) return null;
  return from + DIRS[dir];
}

export const ghostAt = (G: GFState, pos: number) => G.ghosts.find((g) => g.pos === pos);
export const onBoard = (G: GFState, player: PlayerID) => G.ghosts.filter((g) => g.owner === player && g.pos !== null);

/** Клетки, куда может пойти привидение (без выхода с поля). */
export function targets(G: GFState, ghost: Ghost): number[] {
  if (ghost.pos === null) return [];
  return (Object.keys(DIRS) as Dir[])
    .map((d) => step(ghost.pos!, d))
    .filter((p): p is number => p !== null && ghostAt(G, p)?.owner !== ghost.owner);
}

/** Может ли привидение выйти с поля: доброе на угле-выходе. */
export const canEscape = (ghost: Ghost) =>
  ghost.kind === 'good' && ghost.pos !== null && exitsOf(ghost.owner).includes(ghost.pos);

/** Сколько привидений вида `kind` у `owner` съедено. */
export const eaten = (G: GFState, owner: PlayerID, kind: Kind) =>
  G.ghosts.filter((g) => g.owner === owner && g.captured && g.kind === kind).length;

function hasMoves(G: GFState, player: PlayerID) {
  return onBoard(G, player).some((g) => targets(G, g).length > 0 || canEscape(g));
}

function finish(G: GFState, winner: PlayerID, reason: WinReason) {
  G.winner = winner;
  G.reason = reason;
  G.score[winner] += 1;
  G.history.push({ round: G.round, winner, reason });
}

/** Привидения на стартовых клетках; по умолчанию добрые в первом ряду — игрок переставит. */
function freshGhosts(): Ghost[] {
  return PLAYERS.flatMap((owner) =>
    startCells(owner).map((pos, i) => ({
      id: `${owner}-${i}`,
      owner,
      kind: (i < 4 ? 'good' : 'evil') as Kind,
      pos,
      captured: false,
      escaped: false,
    })),
  );
}

function checkWin(G: GFState, mover: PlayerID) {
  const opp = other(mover);
  if (eaten(G, opp, 'good') === 4) return finish(G, mover, 'ate-good');
  if (eaten(G, opp, 'evil') === 4) return finish(G, opp, 'gave-evil');
  if (!hasMoves(G, opp)) finish(G, mover, 'no-moves');
}

const log = (G: GFState, ctx: Ctx, player: PlayerID, text: string) => {
  G.log.push({ turn: ctx.turn, player, text });
  if (G.log.length > 200) G.log.shift();
};

const cellName = (p: number) => `${'abcdef'[colOf(p)]}${SIZE - rowOf(p)}`;

export const GhostFightGame: Game<GFState> = {
  name: GAME_ID,
  minPlayers: 2,
  maxPlayers: 2,

  setup: ({ random }) => ({
    ghosts: freshGhosts(),
    ready: { '0': false, '1': false },
    first: random.Die(2) === 1 ? '0' : '1',
    lastMove: null,
    log: [],
    winner: null,
    reason: null,
    round: 1,
    score: { '0': 0, '1': 0 },
    history: [],
  }),

  // Свои привидения видны полностью, чужие на поле — только «какое-то привидение».
  // Зритель (playerID не '0'/'1' — по сокету это null) и все после конца партии видят цвета всех.
  playerView: ({ G, playerID }) => {
    if (!isPlayer(playerID) || G.winner !== null) return G;
    return {
      ...G,
      ghosts: G.ghosts.map((g) => (g.owner === playerID || g.pos === null ? g : { ...g, kind: null })),
    };
  },

  phases: {
    setup: {
      start: true,
      turn: { activePlayers: ActivePlayers.ALL },
      moves: {
        // Аргументы скрыты от соперника в логе (redact): по ним можно было бы узнать расстановку.
        arrange: {
          redact: true,
          move: ({ G, playerID }, goodIDs: string[]) => {
            const p = playerID as PlayerID;
            if (G.ready[p]) return INVALID_MOVE;
            const mine = G.ghosts.filter((g) => g.owner === p);
            const uniq = new Set(goodIDs);
            if (uniq.size !== 4 || ![...uniq].every((id) => mine.some((g) => g.id === id))) return INVALID_MOVE;
            for (const g of mine) g.kind = uniq.has(g.id) ? 'good' : 'evil';
            G.ready[p] = true;
          },
        },
      },
      endIf: ({ G }) => G.ready['0'] && G.ready['1'],
      onEnd: ({ G, ctx }) => {
        log(G, ctx, G.first, `раунд ${G.round}: ходит первым`);
      },
      next: 'play',
    },
    play: {
      turn: {
        order: {
          first: ({ G }) => Number(G.first),
          next: ({ ctx }) => (ctx.playOrderPos + 1) % ctx.numPlayers,
        },
      },
      moves: {
        // client: false — исход взятия знает только сервер (клиент не видит цвет чужого привидения).
        move: {
          client: false,
          move: ({ G, ctx, playerID, events }, ghostID: string, to: number) => {
            const p = playerID as PlayerID;
            const ghost = G.ghosts.find((g) => g.id === ghostID);
            if (!ghost || ghost.owner !== p || !targets(G, ghost).includes(to)) return INVALID_MOVE;
            const from = ghost.pos!;
            const victim = ghostAt(G, to);
            if (victim) {
              victim.pos = null;
              victim.captured = true;
            }
            ghost.pos = to;
            G.lastMove = { ghost: ghost.id, from, to, captured: victim?.id };
            log(G, ctx, p, victim
              ? `${cellName(from)} → ${cellName(to)}, съедено ${victim.kind === 'good' ? 'доброе' : 'злое'} привидение`
              : `${cellName(from)} → ${cellName(to)}`);
            checkWin(G, p);
            events.endTurn();
          },
        },
        escape: {
          client: false,
          move: ({ G, ctx, playerID }, ghostID: string) => {
            const p = playerID as PlayerID;
            const ghost = G.ghosts.find((g) => g.id === ghostID);
            if (!ghost || ghost.owner !== p || !canEscape(ghost)) return INVALID_MOVE;
            const from = ghost.pos!;
            ghost.pos = null;
            ghost.escaped = true;
            G.lastMove = { ghost: ghost.id, from, to: null };
            log(G, ctx, p, `доброе привидение ускользнуло через ${cellName(from)}`);
            finish(G, p, 'escaped');
          },
        },
      },
      endIf: ({ G }) => G.winner !== null,
      next: 'over',
    },
    // Раунд окончен: все цвета открыты, любой из игроков может начать следующий раунд с тем же соперником.
    over: {
      turn: { activePlayers: ActivePlayers.ALL },
      moves: {
        newRound: ({ G, ctx, playerID }) => {
          if (G.winner === null) return INVALID_MOVE;
          G.round += 1;
          G.first = other(G.first); // первый ход по очереди
          G.ghosts = freshGhosts();
          G.ready = { '0': false, '1': false };
          G.lastMove = null;
          G.winner = null;
          G.reason = null;
          log(G, ctx, playerID as PlayerID, `начинает раунд ${G.round}`);
        },
      },
      endIf: ({ G }) => G.winner === null,
      next: 'setup',
    },
  },
};
