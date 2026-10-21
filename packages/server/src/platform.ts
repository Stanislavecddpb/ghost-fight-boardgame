import type { IncomingMessage } from 'http';
import type { Server } from 'boardgame.io/server';

type GameServer = ReturnType<typeof Server>;

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch {
        resolve({});
      }
    });
  });
}

/**
 * Служебные маршруты для платформы Zarya Boardgames (включаются переменной PLATFORM_SECRET):
 *  POST   /platform/matches/:id/leave  { playerName } — освободить место игрока;
 *  DELETE /platform/matches/:id                        — удалить партию.
 * Без секрета маршрутов нет: лобби-API boardgame.io не умеет ни того, ни другого без учётных данных игрока.
 */
export function addPlatformRoutes(server: GameServer) {
  const secret = process.env.PLATFORM_SECRET;
  if (!secret) return;
  const { router, db } = server;

  router.post('/platform/matches/:id/leave', async (ctx) => {
    if (ctx.get('x-platform-secret') !== secret) return void (ctx.status = 403);
    const name = String((await readJson(ctx.req)).playerName ?? '').toLowerCase();
    const { metadata } = await db.fetch(ctx.params.id, { metadata: true });
    if (!metadata) return void (ctx.status = 404);
    let left = 0;
    for (const p of Object.values(metadata.players)) {
      if (name && p.name?.toLowerCase() === name) {
        delete p.name;
        delete p.credentials;
        delete p.data;
        left++;
      }
    }
    if (left) {
      metadata.updatedAt = Date.now();
      await db.setMetadata(ctx.params.id, metadata);
    }
    ctx.body = { left };
  });

  router.delete('/platform/matches/:id', async (ctx) => {
    if (ctx.get('x-platform-secret') !== secret) return void (ctx.status = 403);
    await db.wipe(ctx.params.id);
    ctx.body = { ok: true };
  });
}
