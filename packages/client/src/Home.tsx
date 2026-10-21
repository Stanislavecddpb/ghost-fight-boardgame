import { useState } from 'react';
import { lobby, GAME_ID, saveSeat, savedName, rememberName } from './net';
import { Page } from './Page';

export function Home() {
  const [name, setName] = useState(savedName() || 'Игрок');
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createGame() {
    setBusy(true);
    setError(null);
    try {
      rememberName(name);
      const { matchID } = await lobby.createMatch(GAME_ID, { numPlayers: 2 });
      const { playerCredentials } = await lobby.joinMatch(GAME_ID, matchID, { playerID: '0', playerName: name });
      saveSeat(matchID, { playerID: '0', credentials: playerCredentials, name });
      location.hash = `#/m/${matchID}`;
    } catch {
      setError('Не удалось создать игру. Сервер запущен?');
    } finally {
      setBusy(false);
    }
  }

  // Принимаем и голый код, и вставленную ссылку на комнату.
  function joinByCode() {
    const code = joinCode.trim().replace(/^.*#\/m\//, '');
    if (code) location.hash = `#/m/${code}`;
  }

  return (
    <Page subtitle="Дуэль один на один: у каждого четыре добрых и четыре злых привидения, и только вы знаете, кто есть кто.">
      <div className="home">
        <section className="page-card">
          <h2>Создать комнату</h2>
          <label>Ваше имя
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} />
          </label>
          <button className="btn" disabled={busy} onClick={createGame}>{busy ? 'Создаём…' : 'Создать игру'}</button>
          {error && <div className="err">{error}</div>}
        </section>

        <section className="page-card">
          <h2>Войти в комнату</h2>
          <label>Код или ссылка от друга
            <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') joinByCode(); }} />
          </label>
          <button className="btn ghost-btn" disabled={!joinCode.trim()} onClick={joinByCode}>Войти — играть или смотреть</button>
        </section>

        <section className="page-card rules">
          <h2>Правила коротко</h2>
          <ul>
            <li>Поле 6×6. Перед раундом каждый тайно решает, какие 4 привидения добрые (синие), а какие 4 злые (красные).</li>
            <li>За ход одно привидение шагает на соседнюю клетку — вперёд, назад или вбок. Шагнули на чужое — съели его, и тогда его цвет открывается.</li>
            <li>Победа: съесть все 4 добрых привидения соперника, <b>или</b> заставить соперника съесть все 4 ваших злых, <b>или</b> вывести доброе привидение с поля через дальний угол.</li>
            <li>Зрители видят цвета всех привидений.</li>
          </ul>
        </section>
      </div>
    </Page>
  );
}
