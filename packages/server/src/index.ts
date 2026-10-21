import path from 'path';
import serve from 'koa-static';
import { addPlatformRoutes } from './platform';
import { FlatFile, Server } from 'boardgame.io/server';
import { GhostFightGame } from '@gf/engine';

const PORT = Number(process.env.PORT ?? 3001);
// Партии сохраняются на диск и переживают перезапуск сервера (папка — переменная MATCHES_DIR).
const MATCHES_DIR = process.env.MATCHES_DIR ?? path.resolve(__dirname, '../../../data/matches');

// Любой источник: сервер раздаёт и клиент, и сокеты, а за туннелем (ngrok) домен произвольный.
const server = Server({
  games: [GhostFightGame],
  origins: [/.*/],
  db: new FlatFile({ dir: MATCHES_DIR }),
});

// Собранный клиент с того же порта → для игры по сети достаточно одного туннеля.
const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');
server.app.use(serve(CLIENT_DIST));

// Служебные маршруты платформы Zarya (при заданном PLATFORM_SECRET).
addPlatformRoutes(server);

server.run(PORT, () => {
  console.log(`Бой привидений: http://localhost:${PORT}  (клиент + сервер на одном порту)`);
});
