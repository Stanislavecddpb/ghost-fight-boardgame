import { useCallback, useEffect, useState } from 'react';
import { Page } from './Page';
import { lobby, GAME_ID, NetClient, loadSeat, saveSeat, forgetSeat, savedName, rememberName, type Seat } from './net';

interface MatchPlayer {
  id: number;
  name?: string;
}

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (key: string, text: string) =>
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  return { copied, copy };
}

export function GameRoom({ matchID, watch }: { matchID: string; watch: boolean }) {
  const [players, setPlayers] = useState<MatchPlayer[] | null>(null);
  const [seat, setSeat] = useState<Seat | null>(loadSeat(matchID));
  const [name, setName] = useState(savedName() || 'Игрок');
  const [error, setError] = useState<string | null>(null);
  const { copied, copy } = useCopy();

  const refresh = useCallback(async () => {
    try {
      const m = await lobby.getMatch(GAME_ID, matchID);
      setPlayers(m.players as MatchPlayer[]);
      // Место освободили снаружи (платформа) — сохранённый вход больше не действует.
      const mine = loadSeat(matchID);
      if (mine && (m.players as MatchPlayer[])[Number(mine.playerID)]?.name !== mine.name) {
        forgetSeat(matchID);
        setSeat(null);
      }
      setError(null);
    } catch {
      setError('Комната не найдена. Проверьте код.');
    }
  }, [matchID]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 2500);
    return () => clearInterval(t);
  }, [refresh]);

  async function take(seatId: number) {
    try {
      rememberName(name);
      const { playerCredentials } = await lobby.joinMatch(GAME_ID, matchID, { playerID: String(seatId), playerName: name });
      const s: Seat = { playerID: String(seatId), credentials: playerCredentials, name };
      saveSeat(matchID, s);
      setSeat(s);
      refresh();
    } catch {
      setError('Не удалось занять место (возможно, уже занято).');
    }
  }

  const base = `${location.origin}${location.pathname}${location.search}`;
  const playUrl = `${base}#/m/${matchID}`;
  const watchUrl = `${base}#/m/${matchID}/watch`;
  const joined = players?.filter((p) => p.name).length ?? 0;

  const bar = (
    <div className="room-bar">
      <a href="#/" className="back">← выход</a>
      <span>Комната <b>{matchID}</b></span>
      {!watch && joined < 2 && (
        <button onClick={() => copy('play', playUrl)}>{copied === 'play' ? 'Скопировано!' : 'Позвать соперника'}</button>
      )}
      <button onClick={() => copy('watch', watchUrl)}>{copied === 'watch' ? 'Скопировано!' : 'Ссылка для зрителей'}</button>
      {watch && <span className="badge">режим зрителя — цвета всех привидений открыты</span>}
    </div>
  );

  // Зритель: клиент без playerID — сервер отдаёт ему состояние без скрытия цветов.
  if (watch) {
    return (
      <div className="room">
        {bar}
        <NetClient matchID={matchID} />
      </div>
    );
  }

  if (seat) {
    return (
      <div className="room">
        {bar}
        <NetClient matchID={matchID} playerID={seat.playerID} credentials={seat.credentials} />
      </div>
    );
  }

  const full = joined === 2;
  return (
    <Page title="Комната" subtitle={full ? `Комната ${matchID}: оба места заняты — можно посмотреть.` : `Комната ${matchID}: займите место.`}>
      {error && <div className="err">{error}</div>}
      <section className="page-card">
        <h2>Места</h2>
        {!full && (
          <label>Ваше имя
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} />
          </label>
        )}
        <div className="seat-list">
          {players?.map((p) => (
            <div key={p.id} className={`seat ${p.name ? 'taken' : ''}`}>
              <span className="seat-num">{p.id + 1}</span>
              <span className="seat-name">{p.name ? <b>{p.name}</b> : <i>свободно</i>}</span>
              {!p.name && <button className="btn small" onClick={() => take(p.id)}>Занять</button>}
            </div>
          ))}
          {!players && !error && <div className="page-note">Загрузка…</div>}
        </div>
      </section>
      <section className="page-card">
        <h2>Посмотреть</h2>
        <p className="page-note">Зрители видят партию целиком, включая цвета всех привидений.</p>
        <a className={`btn ${full ? '' : 'ghost-btn'}`} href={`#/m/${matchID}/watch`}>Смотреть как зритель</a>
      </section>
      <a className="page-link" href="#/">← На главную</a>
    </Page>
  );
}
