import { useEffect, useState } from 'react';
import { Home } from './Home';
import { GameRoom } from './GameRoom';

function useHashRoute() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export function App() {
  const hash = useHashRoute();
  const match = hash.match(/^#\/m\/([^/]+)(\/watch)?$/);
  if (match) return <GameRoom key={hash} matchID={match[1]} watch={!!match[2]} />;
  return <Home />;
}
