import { useEffect, useMemo, useState } from 'react';
import type { BoardProps } from 'boardgame.io/react';
import {
  SIZE, cell, other, isPlayer, targets, canEscape, exitsOf, eaten, startCells,
  type GFState, type Ghost, type Kind, type PlayerID, type WinReason,
} from '@gf/engine';
import { GhostIcon, OWNER_COLOR, OWNER_NAME } from './Ghost';

const REASON: Record<WinReason, string> = {
  'ate-good': 'съедены все добрые привидения соперника',
  'gave-evil': 'соперник съел всех четырёх злых привидений',
  escaped: 'доброе привидение ускользнуло через угол',
  'no-moves': 'у соперника не осталось ходов',
};

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function Table({ G, ctx, moves, playerID, matchData }: BoardProps<GFState>) {
  const me: PlayerID | null = isPlayer(playerID) ? playerID : null;
  const spectator = me === null;
  // Свои привидения — внизу. Зритель смотрит со стороны первого места.
  const bottom: PlayerID = me ?? '0';
  const top = other(bottom);
  const flip = bottom === '1';
  const phase = ctx.phase as 'setup' | 'play' | 'over';

  const nameOf = (pid: PlayerID) => matchData?.[Number(pid)]?.name ?? (matchData ? '—' : `Игрок ${Number(pid) + 1}`);
  const joined = (pid: PlayerID) => !matchData || !!matchData[Number(pid)]?.name;
  const online = (pid: PlayerID) => !matchData || matchData[Number(pid)]?.isConnected !== false;

  // --- Расстановка: какие из моих привидений добрые (локально, до «Готово»).
  const myGhosts = me ? G.ghosts.filter((g) => g.owner === me) : [];
  const [good, setGood] = useState<Set<string>>(new Set());
  useEffect(() => {
    // Новый раунд (или переподключение) — берём расстановку, пришедшую с сервера.
    setGood(new Set(myGhosts.filter((g) => g.kind === 'good').map((g) => g.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [G.round, me]);
  const arranging = phase === 'setup' && me !== null && !G.ready[me];

  function toggle(id: string) {
    setGood((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 4) next.add(id);
      else {
        // Уже 4 добрых — меняем местами с первым попавшимся добрым, чтобы клик всегда что-то делал.
        next.delete([...next][0]);
        next.add(id);
      }
      return next;
    });
  }

  // --- Ходы.
  const [selected, setSelected] = useState<string | null>(null);
  const myTurn = phase === 'play' && me !== null && ctx.currentPlayer === me;
  useEffect(() => setSelected(null), [ctx.turn, phase]);
  const sel = selected ? G.ghosts.find((g) => g.id === selected) ?? null : null;
  const reachable = useMemo(() => new Set(sel && myTurn ? targets(G, sel) : []), [G, sel, myTurn]);
  const escapable = !!(sel && myTurn && canEscape(sel));

  function kindShown(g: Ghost): Kind | null {
    if (arranging && g.owner === me) return good.has(g.id) ? 'good' : 'evil';
    // Зрителю не показываем черновую расстановку, пока игрок её не подтвердил.
    if (phase === 'setup' && spectator && !G.ready[g.owner]) return null;
    return g.kind;
  }

  function onCell(pos: number) {
    const g = G.ghosts.find((x) => x.pos === pos);
    if (arranging) {
      if (g && g.owner === me) toggle(g.id);
      return;
    }
    if (!myTurn) return;
    if (sel && reachable.has(pos)) {
      moves.move(sel.id, pos);
      setSelected(null);
    } else if (g && g.owner === me) {
      setSelected(g.id === selected ? null : g.id);
    } else {
      setSelected(null);
    }
  }

  const last = G.lastMove;
  const zone = new Set(arranging && me ? startCells(me) : []);
  const exitOwner = (pos: number): PlayerID | null =>
    exitsOf('0').includes(pos) ? '0' : exitsOf('1').includes(pos) ? '1' : null;

  const cells = [];
  for (let vr = 0; vr < SIZE; vr++) {
    for (let vc = 0; vc < SIZE; vc++) {
      const pos = flip ? cell(SIZE - 1 - vr, SIZE - 1 - vc) : cell(vr, vc);
      const g = G.ghosts.find((x) => x.pos === pos);
      const exit = exitOwner(pos);
      const cls = [
        'cell',
        (vr + vc) % 2 ? 'dark' : 'light',
        reachable.has(pos) ? (g ? 'target capture' : 'target') : '',
        last && (last.from === pos || last.to === pos) ? 'last' : '',
        zone.has(pos) ? 'zone' : '',
        g && g.id === selected ? 'selected' : '',
        (arranging && g?.owner === me) || (myTurn && g?.owner === me) || reachable.has(pos) ? 'clickable' : '',
      ].join(' ');
      cells.push(
        <div key={pos} className={cls} onClick={() => onCell(pos)} data-pos={pos}>
          {exit && (
            <span className={`exit ${vr === 0 ? 'top' : 'bottom'} ${vc === 0 ? 'left' : 'right'}`}
              style={{ color: OWNER_COLOR[exit] }} title={`Выход для: ${nameOf(exit)}`}>
              {vr === 0 ? (vc === 0 ? '↖' : '↗') : vc === 0 ? '↙' : '↘'}
            </span>
          )}
          {g && <GhostIcon kind={kindShown(g)} owner={g.owner} size={56} />}
          {escapable && sel!.pos === pos && (
            <button className="escape-btn" onClick={(e) => { e.stopPropagation(); moves.escape(sel!.id); }}>
              Выйти с поля
            </button>
          )}
        </div>,
      );
    }
  }

  const strip = (pid: PlayerID) => {
    const victims = G.ghosts.filter((g) => g.owner === other(pid) && g.captured);
    const active = (phase === 'play' && ctx.currentPlayer === pid) || (phase === 'setup' && !G.ready[pid]);
    return (
      <div className={`strip ${active ? 'active' : ''}`} style={{ ['--owner' as any]: OWNER_COLOR[pid] }}>
        <div className="strip-who">
          <span className={`dot ${online(pid) ? 'on' : ''}`} title={online(pid) ? 'в сети' : 'не в сети'} />
          <b>{joined(pid) ? nameOf(pid) : 'ждём соперника…'}</b>
          {pid === me && <span className="you">вы</span>}
          <span className="side">{OWNER_NAME[pid]}</span>
        </div>
        <div className="strip-eaten" title="Съеденные этим игроком привидения соперника">
          <span className="label">съел:</span>
          {victims.length === 0 && <span className="none">никого</span>}
          {victims.map((g) => <GhostIcon key={g.id} kind={g.kind} owner={g.owner} size={26} />)}
          <span className="counts">
            <i className="good">{eaten(G, other(pid), 'good')}/4</i>
            <i className="evil">{eaten(G, other(pid), 'evil')}/4</i>
          </span>
        </div>
      </div>
    );
  };

  let status: JSX.Element;
  if (phase === 'setup') {
    const opp = me ? other(me) : null;
    if (arranging) {
      status = (
        <>
          <h3>Расстановка</h3>
          <p>Нажимайте на своих привидений, чтобы выбрать 4 добрых (синие). Остальные станут злыми. Соперник цветов не увидит.</p>
          <p className="count">Добрых: <b>{good.size}</b> / 4</p>
          <div className="actions">
            <button className="btn ghost-btn" onClick={() => setGood(new Set(shuffle(myGhosts.map((g) => g.id)).slice(0, 4)))}>Случайно</button>
            <button className="btn" disabled={good.size !== 4} onClick={() => moves.arrange([...good])}>Готово</button>
          </div>
        </>
      );
    } else if (me && opp) {
      status = (
        <>
          <h3>Расстановка</h3>
          <p>{joined(opp) ? `Ждём, пока ${nameOf(opp)} расставит привидений…` : 'Ждём соперника — нажмите «Позвать соперника» вверху и отправьте ссылку.'}</p>
        </>
      );
    } else {
      status = (
        <>
          <h3>Расстановка</h3>
          {(['0', '1'] as PlayerID[]).map((p) => (
            <p key={p}>{joined(p) ? nameOf(p) : 'Место свободно'}: {G.ready[p] ? 'готов' : 'расставляет…'}</p>
          ))}
        </>
      );
    }
  } else if (phase === 'play') {
    status = myTurn ? (
      <>
        <h3>Ваш ход</h3>
        <p>{sel ? (escapable ? 'Можно шагнуть или вывести это привидение с поля.' : 'Выберите клетку, куда шагнуть.') : 'Выберите своё привидение.'}</p>
      </>
    ) : (
      <>
        <h3>Ходит {nameOf(ctx.currentPlayer as PlayerID)}</h3>
        <p>{spectator ? 'Вы смотрите партию.' : 'Ждём хода соперника…'}</p>
      </>
    );
  } else {
    const w = G.winner!;
    status = (
      <>
        <h3 className={w === me ? 'win' : me ? 'lose' : ''}>
          {w === me ? 'Вы победили!' : me ? 'Вы проиграли' : `Побеждает ${nameOf(w)}`}
        </h3>
        <p>Раунд {G.round}: {REASON[G.reason!]}. Все цвета открыты.</p>
        {me ? (
          <div className="actions">
            <button className="btn" onClick={() => moves.newRound()}>Новый раунд</button>
          </div>
        ) : (
          <p className="muted">Ждём, пока игроки начнут следующий раунд.</p>
        )}
      </>
    );
  }

  return (
    <div className={`table ${spectator ? 'spectating' : ''}`}>
      <div className="board-col">
        {strip(top)}
        <div className="board" role="grid" aria-label="Игровое поле">{cells}</div>
        {strip(bottom)}
      </div>
      <aside className="side-col">
        <div className="score">
          <span style={{ color: OWNER_COLOR['0'] }}>{nameOf('0')}</span>
          <b>{G.score['0']} : {G.score['1']}</b>
          <span style={{ color: OWNER_COLOR['1'] }}>{nameOf('1')}</span>
          <small>раунд {G.round}</small>
        </div>
        <div className={`status ${phase}`}>{status}</div>
        {G.history.length > 0 && (
          <div className="panel">
            <h4>Раунды</h4>
            <ol className="history">
              {G.history.map((h) => (
                <li key={h.round}>
                  <span className="r">{h.round}</span>
                  <b style={{ color: OWNER_COLOR[h.winner] }}>{nameOf(h.winner)}</b>
                  <span className="muted">{REASON[h.reason]}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
        <div className="panel log">
          <h4>Ходы</h4>
          <ul>
            {[...G.log].reverse().slice(0, 40).map((e, i) => (
              <li key={G.log.length - i}>
                <b style={{ color: OWNER_COLOR[e.player] }}>{nameOf(e.player)}</b> {e.text}
              </li>
            ))}
            {G.log.length === 0 && <li className="muted">Пока пусто</li>}
          </ul>
        </div>
      </aside>
    </div>
  );
}
