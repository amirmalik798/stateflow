import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({
  noServer: true,
  perMessageDeflate: false,
});

server.on('upgrade', (req, socket, head) => {
  const pathname = new URL(req.url || '/', 'http://localhost').pathname;
  if (pathname === '/ws') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  }
});

// Disable Nagle's algorithm so small live stroke & camera packets flush immediately
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
    const c = client as RelaySocket;
    if (
      c.readyState === WebSocket.OPEN &&
      c.uid === uid &&
      (!excludeClientId || c.clientId !== excludeClientId)
    ) {
      c.send(rawMsg);
    }
  }
}

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
      const uid = typeof msg.uid === 'string' ? msg.uid : ws.uid;
      if (clientId) ws.clientId = clientId;
      if (uid) ws.uid = uid;
      if (!uid) return;

      const cache = getUidCache(uid);

      if (msg.type === 'relay:join') {
        if (cache.activeBoardId) {
          ws.send(
            JSON.stringify({
              type: 'board:switch',
              boardId: cache.activeBoardId,
              uid,
              clientId: 'server-cache',
            })
          );
          const cachedCam = cache.cameraByBoard.get(cache.activeBoardId);
          if (cachedCam) {
            ws.send(
              JSON.stringify({
                type: 'board:camera',
                boardId: cache.activeBoardId,
                camera: cachedCam.camera,
                viewport: cachedCam.viewport,
                uid,
                clientId: 'server-cache',
              })
            );
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
        msg.type === 'board:cursor'
      ) {
        broadcastToUid(uid, text, clientId);
      }
    } catch {
      // Ignore malformed websocket payloads
    }
  });
});

const heartbeat = setInterval(() => {
  for (const client of wss.clients) {
    const c = client as RelaySocket;
    if (c.isAlive === false) {
      c.terminate();
      continue;
    }
    c.isAlive = false;
    c.ping();
  }
}, 25000);

wss.on('close', () => clearInterval(heartbeat));
server.on('close', () => wss.close());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

async function start() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    if (process.env.DISABLE_HMR === undefined) {
      process.env.DISABLE_HMR = 'true';
    }
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
    console.log(`SlateFlow server listening on http://0.0.0.0:${port}`);
  });
}

start();
