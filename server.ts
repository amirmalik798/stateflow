import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { getSessionUserId, initializeDatabase, pool, registerApi } from './server/api';
import { startSocksTcpForwarder } from './server/socksTcpForwarder';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.get('/healthz', (_req, res) => res.status(200).json({ ok: true, service: 'stateflow' }));
app.set('trust proxy', 1);
app.use(express.json({ limit: '20mb' }));
const server = http.createServer(app);
let dbRetryTimer: NodeJS.Timeout | null = null;
let databaseReady = false;
let databaseInitialization: Promise<void> | null = null;

async function tryInitializeDatabase(): Promise<void> {
  if (!pool || databaseReady || databaseInitialization) return databaseInitialization ?? Promise.resolve();
  databaseInitialization = initializeDatabase()
    .then(() => {
      databaseReady = true;
      console.log('Stateflow PostgreSQL schema is ready.');
    })
    .catch((error) => {
      console.warn('PostgreSQL is unavailable. Stateflow remains available for local/offline work; synchronization will retry.', error instanceof Error ? error.message : error);
    })
    .finally(() => {
      databaseInitialization = null;
    });
  return databaseInitialization;
}
const wss = new WebSocketServer({
  noServer: true,
  perMessageDeflate: false,
  maxPayload: 2 * 1024 * 1024,
});

server.on('upgrade', (req, socket, head) => {
  const pathname = new URL(req.url || '/', 'http://localhost').pathname;
  if (pathname !== '/ws') {
    socket.destroy();
    return;
  }

  const origin = req.headers.origin;
  const forwardedProto = String(req.headers['x-forwarded-proto'] || (process.env.NODE_ENV === 'production' ? 'https' : 'http')).split(',')[0].trim();
  const host = req.headers.host;
  const expectedOrigin = process.env.APP_ORIGIN ? new URL(process.env.APP_ORIGIN).origin : (host ? forwardedProto + '://' + host : null);
  if (!origin || !expectedOrigin || new URL(origin).origin !== expectedOrigin) {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  void getSessionUserId(req.headers.cookie)
    .then((userId) => {
      if (!userId) {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        (ws as RelaySocket).uid = userId;
        wss.emit('connection', ws, req);
      });
    })
    .catch((error) => {
      console.error('WebSocket session authentication failed.', error);
      socket.destroy();
    });
});

// Disable Nagle's algorithm so live stroke packets flush immediately.
server.on('connection', (socket) => {
  socket.setNoDelay(true);
});

interface RelaySocket extends WebSocket {
  clientId?: string;
  uid?: string;
  isAlive?: boolean;
}

interface UidRelayCache {
  activeBoardId?: string;
  cameraByBoard: Map<string, { camera: unknown; viewport?: unknown }>;
}

const uidCaches = new Map<string, UidRelayCache>();

function getUidCache(uid: string): UidRelayCache {
  let cache = uidCaches.get(uid);
  if (!cache) {
    cache = { cameraByBoard: new Map() };
    uidCaches.set(uid, cache);
  }
  return cache;
}

function broadcastToUid(uid: string, rawMsg: string, excludeClientId?: string) {
  if (!uid) return;
  for (const client of wss.clients) {
    const target = client as RelaySocket;
    if (
      target.readyState === WebSocket.OPEN &&
      target.uid === uid &&
      (!excludeClientId || target.clientId !== excludeClientId)
    ) {
      target.send(rawMsg);
    }
  }
}

registerApi(app, (uid, message) => {
  broadcastToUid(uid, JSON.stringify({ ...message, clientId: 'sync-server' }));
});

wss.on('connection', (ws: RelaySocket, req) => {
  req.socket.setNoDelay(true);
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (raw) => {
    try {
      const text = raw.toString();
      const msg = JSON.parse(text) as Record<string, unknown>;
      const clientId = typeof msg.clientId === 'string' ? msg.clientId : undefined;
      const uid = ws.uid;
      if (clientId) ws.clientId = clientId;
      // The authenticated cookie establishes identity. Never trust a client-supplied uid.
      if (!uid) return;

      const cache = getUidCache(uid);

      if (msg.type === 'relay:join') {
        if (cache.activeBoardId) {
          ws.send(JSON.stringify({
            type: 'board:switch',
            boardId: cache.activeBoardId,
            clientId: 'server-cache',
          }));
          const cachedCamera = cache.cameraByBoard.get(cache.activeBoardId);
          if (cachedCamera) {
            ws.send(JSON.stringify({
              type: 'board:camera',
              boardId: cache.activeBoardId,
              camera: cachedCamera.camera,
              viewport: cachedCamera.viewport,
              clientId: 'server-cache',
            }));
          }
        }
        return;
      }

      if (msg.type === 'board:camera' && typeof msg.boardId === 'string' && msg.camera) {
        cache.cameraByBoard.set(msg.boardId, {
          camera: msg.camera,
          viewport: msg.viewport,
        });
        broadcastToUid(uid, text, clientId);
        return;
      }

      if (msg.type === 'board:switch' && typeof msg.boardId === 'string') {
        cache.activeBoardId = msg.boardId;
        broadcastToUid(uid, text, clientId);
        return;
      }

      if (
        msg.type === 'board:draft' ||
        msg.type === 'board:draft-append' ||
        msg.type === 'board:elements-patch' ||
        msg.type === 'board:meta' ||
        msg.type === 'board:cursor' ||
        msg.type === 'board:catalog-changed'
      ) {
        const liveMessage = msg.type === 'board:elements-patch'
          ? JSON.stringify({ ...msg, committed: false })
          : text;
        broadcastToUid(uid, liveMessage, clientId);
      }
    } catch {
      // Ignore malformed websocket payloads.
    }
  });
});

const heartbeat = setInterval(() => {
  for (const client of wss.clients) {
    const target = client as RelaySocket;
    if (target.isAlive === false) {
      target.terminate();
      continue;
    }
    target.isAlive = false;
    target.ping();
  }
}, 25000);

wss.on('close', () => clearInterval(heartbeat));
server.on('close', () => {
  wss.close();
  if (dbRetryTimer) clearInterval(dbRetryTimer);
  void pool?.end();
});

async function start() {
  const isProd = process.env.NODE_ENV === 'production';

  const tailnetDatabaseHost = process.env.PG_TAILSCALE_TARGET_HOST?.trim();
  if (tailnetDatabaseHost) {
    await startSocksTcpForwarder({
      targetHost: tailnetDatabaseHost,
      targetPort: Number(process.env.PG_TAILSCALE_TARGET_PORT) || 5432,
      listenHost: '127.0.0.1',
      listenPort: Number(process.env.PG_TAILSCALE_LOCAL_PORT) || 15432,
      proxyHost: '127.0.0.1',
      proxyPort: Number(process.env.PG_TAILSCALE_SOCKS_PORT) || 1055,
    });
    console.log('Stateflow PostgreSQL Tailscale forwarder listening on loopback.');
  }

  if (pool) {
    void tryInitializeDatabase();
    dbRetryTimer = setInterval(() => void tryInitializeDatabase(), 10000);
    dbRetryTimer.unref();
  } else {
    console.warn('DATABASE_URL is not configured. The app shell can run, but login and synchronization are disabled.');
  }

  if (!isProd) {
    if (process.env.DISABLE_HMR === undefined) process.env.DISABLE_HMR = 'true';
    const { createServer: createViteServer } = await import('vite');
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: hmrDisabled ? false : true,
        ws: { server, path: '/vite-hmr' },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  server.listen(port, '0.0.0.0', () => {
    console.log('Stateflow server listening on http://0.0.0.0:' + port);
  });
}

start().catch((error) => {
  console.error('Stateflow server could not start.', error);
  process.exitCode = 1;
});
