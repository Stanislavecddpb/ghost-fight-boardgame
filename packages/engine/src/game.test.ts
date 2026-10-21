import { describe, it, expect } from 'vitest';
import { Client } from 'boardgame.io/client';
import { Local } from 'boardgame.io/multiplayer';
import { GhostFightGame, cell, colOf, startCells, type GFState, type Ghost } from './game';

/** Партия через Local-мастер: каждый клиент получает состояние, отфильтрованное playerView. */
let matchNo = 0;
function table() {
  const multiplayer = Local();
  const matchID = `m${++matchNo}`;
  const mk = (playerID?: string) => {
    const c = Client({ game: GhostFightGame, numPlayers: 2, multiplayer, playerID: playerID as any, matchID });
    c.start();
    return c;
  };
  return { p0: mk('0'), p1: mk('1'), watcher: mk() };
}

const G = (c: ReturnType<typeof table>['p0']) => c.getState()!.G as GFState;
const ghost = (g: GFState, id: string) => g.ghosts.find((x) => x.id === id)!;

describe('расстановка', () => {
  it('стартовые зоны — 2×4 без крайних столбцов', () => {
    expect(startCells('0')).toEqual([cell(4, 1), cell(4, 2), cell(4, 3), cell(4, 4), cell(5, 1), cell(5, 2), cell(5, 3), cell(5, 4)]);
    expect(startCells('1').every((p) => p < 12 && p % 6 !== 0 && p % 6 !== 5)).toBe(true);
  });

  it('нужно ровно 4 добрых своих привидения', () => {
    const { p0 } = table();
    p0.moves.arrange(['0-0', '0-1', '0-2']);
    expect(G(p0).ready['0']).toBe(false);
    p0.moves.arrange(['0-0', '0-1', '0-2', '1-3']);
    expect(G(p0).ready['0']).toBe(false);
    p0.moves.arrange(['0-4', '0-5', '0-6', '0-7']);
    expect(G(p0).ready['0']).toBe(true);
    expect(ghost(G(p0), '0-4').kind).toBe('good');
    expect(ghost(G(p0), '0-0').kind).toBe('evil');
  });

  it('после двух расстановок начинается игра', () => {
    const { p0, p1 } = table();
    p0.moves.arrange(['0-0', '0-1', '0-2', '0-3']);
    p1.moves.arrange(['1-0', '1-1', '1-2', '1-3']);
    expect(p0.getState()!.ctx.phase).toBe('play');
  });
});

describe('кто что видит', () => {
  it('игрок не видит цветов соперника, зритель видит всё', () => {
    const { p0, p1, watcher } = table();
    p0.moves.arrange(['0-4', '0-5', '0-6', '0-7']);
    p1.moves.arrange(['1-0', '1-2', '1-4', '1-6']);
    const theirs = (g: GFState, owner: string) => g.ghosts.filter((x) => x.owner === owner).map((x) => x.kind);
    expect(theirs(G(p0), '1').every((k) => k === null)).toBe(true);
    expect(theirs(G(p1), '0').every((k) => k === null)).toBe(true);
    expect(theirs(G(p0), '0').filter((k) => k === 'good')).toHaveLength(4);
    expect(theirs(G(watcher), '0')).toEqual(['evil', 'evil', 'evil', 'evil', 'good', 'good', 'good', 'good']);
    expect(theirs(G(watcher), '1')).toEqual(['good', 'evil', 'good', 'evil', 'good', 'evil', 'good', 'evil']);
  });

  it('расстановка не утекает сопернику через лог ходов', () => {
    const { p0, p1, watcher } = table();
    p0.moves.arrange(['0-4', '0-5', '0-6', '0-7']);
    const args = (c: typeof p0) => c.log?.find((e) => e.action.payload.type === 'arrange')?.action.payload.args;
    expect(args(p1)).toBeNull();
    expect(args(watcher)).toBeNull();
    expect(args(p0)).toEqual([['0-4', '0-5', '0-6', '0-7']]);
  });
});

/** Готовая к ходам партия: у обоих добрые — передний ряд (индексы 0–3). */
function started() {
  const t = table();
  t.p0.moves.arrange(['0-0', '0-1', '0-2', '0-3']);
  t.p1.moves.arrange(['1-0', '1-1', '1-2', '1-3']);
  const first = t.p0.getState()!.ctx.currentPlayer;
  return { ...t, first };
}

describe('ходы', () => {
  it('на одну клетку по прямой, не на своё привидение', () => {
    const { p0, p1, first } = started();
    const c = first === '0' ? p0 : p1;
    const id = `${first}-0`;
    const from = ghost(G(c), id).pos!;
    c.moves.move(id, from + 7); // по диагонали
    expect(ghost(G(c), id).pos).toBe(from);
    const own = ghost(G(c), `${first}-4`).pos!; // своё во втором ряду
    c.moves.move(`${first}-4`, own + (first === '0' ? -6 : 6));
    expect(ghost(G(c), `${first}-4`).pos).toBe(own);
    const ahead = from + (first === '0' ? -6 : 6);
    c.moves.move(id, ahead);
    expect(ghost(G(c), id).pos).toBe(ahead);
    expect(c.getState()!.ctx.currentPlayer).not.toBe(first);
  });

  it('нельзя ходить чужим привидением и вне очереди', () => {
    const { p0, p1, first } = started();
    const waiting = first === '0' ? p1 : p0;
    const wid = first === '0' ? '1' : '0';
    const pos = ghost(G(waiting), `${wid}-0`).pos!;
    waiting.moves.move(`${wid}-0`, pos + (wid === '0' ? -6 : 6));
    expect(ghost(G(waiting), `${wid}-0`).pos).toBe(pos);
  });
});

/** Чистое состояние посреди партии: вызываем функции ходов напрямую, без клиента. */
function midgame(at: Record<string, number | null>, dead: string[] = []): GFState {
  const ghosts: Ghost[] = ['0', '1'].flatMap((owner) =>
    [0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
      const id = `${owner}-${i}`;
      return {
        id, owner: owner as '0' | '1', kind: i < 4 ? 'good' : 'evil',
        pos: id in at ? at[id] : null, captured: dead.includes(id), escaped: false,
      } as Ghost;
    }),
  );
  return { ghosts, ready: { '0': true, '1': true }, first: '0', lastMove: null, log: [], winner: null, reason: null, round: 1, score: { '0': 0, '1': 0 }, history: [] };
}
const play = (GhostFightGame.phases!.play.moves as any);
const ctx = { turn: 3 } as any;
const events = { endTurn: () => {} };
const doMove = (g: GFState, pid: string, id: string, to: number) => play.move.move({ G: g, ctx, playerID: pid, events }, id, to);
const doEscape = (g: GFState, pid: string, id: string) => play.escape.move({ G: g, ctx, playerID: pid, events }, id);

describe('победа', () => {
  it('доброе привидение выходит через угол соперника', () => {
    const g = midgame({ '0-0': cell(0, 0), '1-0': cell(2, 2) });
    doEscape(g, '0', '0-0');
    expect([g.winner, g.reason]).toEqual(['0', 'escaped']);
    expect(g.score).toEqual({ '0': 1, '1': 0 });
  });

  it('через свой угол или злым — нельзя', () => {
    const g = midgame({ '0-0': cell(5, 0), '0-4': cell(0, 5), '1-0': cell(2, 2) });
    expect(doEscape(g, '0', '0-0')).toBe('INVALID_MOVE');
    expect(doEscape(g, '0', '0-4')).toBe('INVALID_MOVE');
    expect(g.winner).toBeNull();
  });

  it('съел четвёртое доброе — победа', () => {
    const g = midgame({ '0-0': cell(2, 2), '1-0': cell(2, 3), '1-4': cell(5, 5) }, ['1-1', '1-2', '1-3']);
    doMove(g, '0', '0-0', cell(2, 3));
    expect([g.winner, g.reason]).toEqual(['0', 'ate-good']);
  });

  it('съел четвёртое злое — победа соперника', () => {
    const g = midgame({ '0-0': cell(2, 2), '1-4': cell(2, 3), '1-0': cell(5, 5) }, ['1-5', '1-6', '1-7']);
    doMove(g, '0', '0-0', cell(2, 3));
    expect([g.winner, g.reason]).toEqual(['1', 'gave-evil']);
  });

  it('взятие убирает привидение с поля и отмечает его съеденным', () => {
    const g = midgame({ '0-0': cell(2, 2), '1-4': cell(2, 3), '1-0': cell(5, 5) });
    doMove(g, '0', '0-0', cell(2, 3));
    expect(ghost(g, '1-4')).toMatchObject({ pos: null, captured: true });
    expect(ghost(g, '0-0').pos).toBe(cell(2, 3));
    expect(g.winner).toBeNull();
  });
});

describe('матч из нескольких раундов', () => {
  it('после победы — новый раунд с тем же соперником, счёт копится', () => {
    const { p0, p1, watcher, first } = started();
    const c = first === '0' ? p0 : p1;
    const o = first === '0' ? p1 : p0;
    const oid = first === '0' ? '1' : '0';
    // Доброе привидение идёт по крайнему столбцу к углу-выходу, соперник переминается сзади.
    const fwd = first === '0' ? -6 : 6;
    const wait = () => {
      const g = ghost(G(o), `${oid}-7`); // дальний угол, с пути не мешает
      o.moves.move(g.id, g.pos! + (colOf(g.pos!) === 4 ? 1 : -1));
    };
    const id = `${first}-0`; // передний ряд, столбец 1
    c.moves.move(id, ghost(G(c), id).pos! - 1);
    wait();
    for (let i = 0; i < 4; i++) {
      c.moves.move(id, ghost(G(c), id).pos! + fwd);
      wait();
    }
    expect(ghost(G(c), id).pos).toBe(first === '0' ? cell(0, 0) : cell(5, 0));
    c.moves.escape(id);
    let s = watcher.getState()!;
    expect(s.ctx.phase).toBe('over');
    expect(s.ctx.gameover).toBeUndefined();
    expect((s.G as GFState).score[first as '0']).toBe(1);
    // Раунд окончен — соперник видит все цвета.
    expect(G(o).ghosts.every((x) => x.kind !== null)).toBe(true);

    o.moves.newRound();
    s = watcher.getState()!;
    expect(s.ctx.phase).toBe('setup');
    const g = s.G as GFState;
    expect([g.round, g.first, g.winner, g.ready]).toEqual([2, oid, null, { '0': false, '1': false }]);
    expect(g.ghosts.every((x) => x.pos !== null && !x.captured && !x.escaped)).toBe(true);
    expect(g.score[first as '0']).toBe(1);
    // И снова скрытая информация.
    expect(G(o).ghosts.filter((x) => x.owner === first).every((x) => x.kind === null)).toBe(true);
  });
});
