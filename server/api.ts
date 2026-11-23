import 'dotenv/config';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Express, NextFunction, Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { Pool, type PoolClient } from 'pg';
import { readFile } from 'node:fs/promises';

declare global {
  namespace Express {
    interface Request { stateflowUserId?: string; }
  }
}

export const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.PG_POOL_SIZE || 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      ...(process.env.PG_SSL === 'true' ? { ssl: { rejectUnauthorized: true } } : {}),
    })
  : null;

const SESSION_COOKIE = 'stateflow_session';
const OAUTH_STATE_COOKIE = 'stateflow_oauth_state';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const MAX_SYNC_OPERATIONS = 200;

export async function initializeDatabase(): Promise<void> {
  if (!pool) throw new Error('DATABASE_URL is required for the Stateflow sync backend.');
  const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
  await pool.query(schema);
}

function appOrigin(req: Request): string {
  if (process.env.APP_ORIGIN) return new URL(process.env.APP_ORIGIN).origin;
  const host = req.get('host');
  if (!host) throw new Error('APP_ORIGIN must be configured.');
  return req.protocol + '://' + host;
}

function secureCookie(req: Request): boolean {
  return process.env.NODE_ENV === 'production' ||
    (process.env.APP_ORIGIN?.startsWith('https://') ?? false) || req.secure;
}

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return null;
}

function setCookie(res: Response, req: Request, name: string, value: string, maxAge: number): void {
  const fields = [name + '=' + encodeURIComponent(value), 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=' + maxAge];
  if (secureCookie(req)) fields.push('Secure');
  res.append('Set-Cookie', fields.join('; '));
}

function clearCookie(res: Response, req: Request, name: string): void {
  setCookie(res, req, name, '', 0);
}

function hashToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export async function getSessionUserId(cookieHeader: string | undefined): Promise<string | null> {
  if (!pool) return null;
  const token = readCookie(cookieHeader, SESSION_COOKIE);
  if (!token || token.length < 32) return null;
  const result = await pool.query(
    'SELECT user_id FROM auth_sessions WHERE token_hash = $1 AND expires_at > now()',
    [hashToken(token)]
  );
  return result.rows[0]?.user_id ?? null;
}

function requireDatabase(_req: Request, res: Response, next: NextFunction): void {
  if (!pool) {
    res.status(503).json({ error: 'Stateflow backend is not configured. DATABASE_URL is missing.' });
    return;
  }
  next();
}

function requireSameOrigin(req: Request, res: Response, next: NextFunction): void {
  const origin = req.get('origin');
  try {
    if (!origin || new URL(origin).origin !== appOrigin(req)) {
      res.status(403).json({ error: 'Cross-origin request rejected.' });
      return;
    }
  } catch {
    res.status(403).json({ error: 'Invalid request origin.' });
    return;
  }
  next();
}

async function requireSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = await getSessionUserId(req.headers.cookie);
    if (!userId) {
      res.status(401).json({ error: 'Sign in to continue.' });
      return;
    }
    req.stateflowUserId = userId;
    next();
  } catch (error) {
    console.error('Session lookup failed.', error);
    res.status(503).json({ error: 'Unable to verify the current session.' });
  }
}

function oauthClient(req: Request): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !secret) throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured.');
  return new OAuth2Client(clientId, secret, appOrigin(req) + '/api/auth/google/callback');
}

function isSafeId(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 &&
    value.length <= 160 && /^[a-zA-Z0-9_-]+$/.test(value);
}

function dateFromMillis(value: unknown): Date {
  return new Date(typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : Date.now());
}

function boardFromRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    title: String(row.title),
    gridStyle: String(row.grid_style),
    camera: row.camera,
    createdAt: new Date(row.created_at as string | Date).getTime(),
    updatedAt: new Date(row.updated_at as string | Date).getTime(),
  };
}

interface IncomingOperation {
  operationId: string;
  deviceId: string;
  boardId: string;
  entityType: 'board' | 'element';
  entityId: string;
  action: 'upsert' | 'delete';
  clientSequence: number;
  payload?: Record<string, unknown>;
}
type Broadcast = (userId: string, message: Record<string, unknown>) => void;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateElementPayload(value: unknown, expectedId: string): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const element = value as Record<string, unknown>;
  if (element.id !== expectedId || typeof element.type !== 'string') return false;
  if (!isFiniteNumber(element.zIndex) || !isFiniteNumber(element.opacity) ||
      element.opacity < 0 || element.opacity > 1) return false;
  const optionalColorKeys = ['color', 'strokeColor', 'fillColor', 'bgColor', 'textColor'];
  if (optionalColorKeys.some((key) => key in element &&
      (typeof element[key] !== 'string' || (element[key] as string).length > 64))) return false;
  if (element.type === 'pen' || element.type === 'highlighter') {
    if (!Array.isArray(element.points) || element.points.length < 1 || element.points.length > 4000) return false;
    if (typeof element.color !== 'string' || !isFiniteNumber(element.strokeWidth)) return false;
    return element.points.every((point) =>
      Boolean(point) && isFiniteNumber((point as Record<string, unknown>).x) &&
      isFiniteNumber((point as Record<string, unknown>).y) &&
      (!('pressure' in (point as Record<string, unknown>)) ||
        isFiniteNumber((point as Record<string, unknown>).pressure))
    );
  }
  if (element.type === 'image') {
    return typeof element.dataUrl === 'string' && element.dataUrl.length <= 700000 &&
      isFiniteNumber(element.x) && isFiniteNumber(element.y) &&
      isFiniteNumber(element.width) && isFiniteNumber(element.height);
  }
  if (element.type === 'sticky' || element.type === 'text') {
    return typeof element.text === 'string' && element.text.length <= 8000 &&
      isFiniteNumber(element.x) && isFiniteNumber(element.y) &&
      isFiniteNumber(element.width) && isFiniteNumber(element.height);
  }
  if (element.type === 'rectangle' || element.type === 'ellipse' || element.type === 'diamond') {
    return isFiniteNumber(element.x) && isFiniteNumber(element.y) &&
      isFiniteNumber(element.width) && isFiniteNumber(element.height) &&
      isFiniteNumber(element.strokeWidth);
  }
  if (element.type === 'line' || element.type === 'arrow') {
    return isFiniteNumber(element.x1) && isFiniteNumber(element.y1) &&
      isFiniteNumber(element.x2) && isFiniteNumber(element.y2) &&
      isFiniteNumber(element.strokeWidth);
  }
  return false;
}

async function applyOperation(
  client: PoolClient,
  userId: string,
  operation: IncomingOperation,
  authorizedBoards: Set<string>
): Promise<number> {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [operation.operationId]);
  const duplicate = await client.query(
    'SELECT sequence FROM board_operations WHERE operation_id = $1',
    [operation.operationId]
  );
  if (duplicate.rows[0]) return Number(duplicate.rows[0].sequence);

  if (operation.entityType === 'board') {
    if (operation.boardId !== operation.entityId || !isSafeId(operation.entityId)) {
      throw new Error('Board operation identifiers do not match.');
    }
    if (operation.action === 'delete') {
      await client.query(
        'UPDATE boards SET deleted_at = COALESCE(deleted_at, now()), version = version + 1, updated_at = now() WHERE id = $1 AND user_id = $2',
        [operation.entityId, userId]
      );
      authorizedBoards.delete(operation.boardId);
    } else {
      const payload = operation.payload;
      if (!payload || payload.id !== operation.entityId || !isSafeId(operation.entityId)) {
        throw new Error('Invalid board upsert payload.');
      }
      const title = typeof payload.title === 'string' ? payload.title.trim().slice(0, 120) : '';
      const gridStyle = ['dots', 'grid', 'blank'].includes(String(payload.gridStyle)) ? String(payload.gridStyle) : 'dots';
      const camera = payload.camera && typeof payload.camera === 'object' ? payload.camera as Record<string, unknown> : { x: 0, y: 0, zoom: 1 };
      if (!isFiniteNumber(camera.x) || !isFiniteNumber(camera.y) || !isFiniteNumber(camera.zoom) || camera.zoom <= 0 || camera.zoom > 10) {
        throw new Error('Invalid board camera payload.');
      }
      const saved = await client.query(
        'INSERT INTO boards (id, user_id, title, grid_style, camera, created_at, updated_at, deleted_at) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, NULL) ' +
        'ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, grid_style = EXCLUDED.grid_style, camera = EXCLUDED.camera, updated_at = EXCLUDED.updated_at, version = boards.version + 1, deleted_at = NULL ' +
        'WHERE boards.user_id = EXCLUDED.user_id RETURNING id',
        [operation.entityId, userId, title || 'Untitled Board', gridStyle, JSON.stringify(camera), dateFromMillis(payload.createdAt), dateFromMillis(payload.updatedAt)]
      );
      if (!saved.rowCount) throw new Error('Board is not owned by this account.');
      authorizedBoards.add(operation.entityId);
    }
  } else {
    if (!isSafeId(operation.boardId) || !isSafeId(operation.entityId)) throw new Error('Invalid board or element identifier.');
    if (!authorizedBoards.has(operation.boardId)) {
      const board = await client.query(
        'SELECT id FROM boards WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
        [operation.boardId, userId]
      );
      if (!board.rowCount) throw new Error('Board is not available to this account.');
      authorizedBoards.add(operation.boardId);
    }
    if (operation.action === 'delete') {
      await client.query(
        'INSERT INTO board_elements (board_id, element_id, payload, deleted_at, updated_at) VALUES ($1, $2, NULL, now(), now()) ' +
        'ON CONFLICT (board_id, element_id) DO UPDATE SET deleted_at = now(), updated_at = now(), version = board_elements.version + 1',
        [operation.boardId, operation.entityId]
      );
    } else {
      const payload = operation.payload;
      if (!validateElementPayload(payload, operation.entityId)) {
        throw new Error('Invalid element upsert payload.');
      }
      await client.query(
        'INSERT INTO board_elements (board_id, element_id, payload, deleted_at, updated_at) VALUES ($1, $2, $3::jsonb, NULL, now()) ' +
        'ON CONFLICT (board_id, element_id) DO UPDATE SET payload = EXCLUDED.payload, deleted_at = NULL, updated_at = now(), version = board_elements.version + 1',
        [operation.boardId, operation.entityId, JSON.stringify(payload)]
      );
    }
  }

  const inserted = await client.query(
    'INSERT INTO board_operations (operation_id, user_id, device_id, board_id, entity_type, entity_id, action, payload, client_sequence, created_at) ' +
    'VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, now()) RETURNING sequence',
    [
      operation.operationId, userId, operation.deviceId, operation.boardId,
      operation.entityType, operation.entityId, operation.action,
      operation.payload ? JSON.stringify(operation.payload) : null,
      operation.clientSequence,
    ]
  );
  return Number(inserted.rows[0].sequence);
}

export function registerApi(app: Express, broadcast: Broadcast): void {
  app.get('/api/health', async (_req, res) => {
    if (!pool) {
      res.status(503).json({ ok: false, database: 'not-configured' });
      return;
    }
    try {
      await pool.query('SELECT 1');
      res.json({ ok: true, database: 'connected' });
    } catch {
      res.status(503).json({ ok: false, database: 'unavailable' });
    }
  });

  app.get('/api/auth/google', (req, res) => {
    try {
      if (!pool) {
        res.status(503).send('Stateflow database is not configured.');
        return;
      }
      const state = randomBytes(32).toString('base64url');
      setCookie(res, req, OAUTH_STATE_COOKIE, state, 600);
      res.redirect(oauthClient(req).generateAuthUrl({
        access_type: 'online',
        prompt: 'select_account',
        scope: ['openid', 'email', 'profile'],
        state,
      }));
    } catch (error) {
      res.status(503).send(error instanceof Error ? error.message : 'Google sign-in is unavailable.');
    }
  });

  app.get('/api/auth/google/callback', async (req, res) => {
    try {
      if (!pool) {
        res.status(503).send('Stateflow database is not configured.');
        return;
      }
      const expectedState = readCookie(req.headers.cookie, OAUTH_STATE_COOKIE);
      const receivedState = typeof req.query.state === 'string' ? req.query.state : '';
      clearCookie(res, req, OAUTH_STATE_COOKIE);
      if (!expectedState || !receivedState) throw new Error('Google sign-in state is missing.');
      const expected = Buffer.from(expectedState);
      const received = Buffer.from(receivedState);
      if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
        throw new Error('Google sign-in state did not match.');
      }
      const code = typeof req.query.code === 'string' ? req.query.code : '';
      if (!code) throw new Error('Google did not return an authorization code.');
      const client = oauthClient(req);
      const { tokens } = await client.getToken(code);
      if (!tokens.id_token) throw new Error('Google did not return an identity token.');
      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      const profile = ticket.getPayload();
      if (!profile?.sub || !profile.email || profile.email_verified !== true) {
        throw new Error('Google account identity or verified email is missing.');
      }
      await pool.query(
        'INSERT INTO users (id, email, display_name, picture_url) VALUES ($1, $2, $3, $4) ' +
        'ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, display_name = EXCLUDED.display_name, picture_url = EXCLUDED.picture_url, updated_at = now()',
        [profile.sub, profile.email, profile.name ?? null, profile.picture ?? null]
      );
      const token = randomBytes(32).toString('base64url');
      await pool.query(
        'INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
        [hashToken(token), profile.sub, new Date(Date.now() + SESSION_TTL_SECONDS * 1000)]
      );
      setCookie(res, req, SESSION_COOKIE, token, SESSION_TTL_SECONDS);
      res.redirect('/');
    } catch (error) {
      console.error('Google sign-in failed.', error);
      res.status(401).send('Google sign-in failed. Return to Stateflow and try again.');
    }
  });

  app.get('/api/auth/me', requireDatabase, async (req, res) => {
    try {
      if (!pool) return;
      const userId = await getSessionUserId(req.headers.cookie);
      if (!userId) {
        res.json({ user: null });
        return;
      }
      const result = await pool.query(
        'SELECT id, email, display_name, picture_url FROM users WHERE id = $1',
        [userId]
      );
      const row = result.rows[0];
      res.setHeader('Cache-Control', 'no-store');
      res.json({ user: row ? {
        uid: row.id, email: row.email, displayName: row.display_name, photoURL: row.picture_url,
      } : null });
    } catch (error) {
      console.error('Unable to read current session.', error);
      res.status(503).json({ error: 'Unable to read the current session.' });
    }
  });

  app.post('/api/auth/logout', requireDatabase, requireSameOrigin, async (req, res) => {
    try {
      if (!pool) return;
      const token = readCookie(req.headers.cookie, SESSION_COOKIE);
      if (token) await pool.query('DELETE FROM auth_sessions WHERE token_hash = $1', [hashToken(token)]);
      clearCookie(res, req, SESSION_COOKIE);
      res.json({ ok: true });
    } catch {
      res.status(503).json({ error: 'Unable to sign out right now.' });
    }
  });

  app.post('/api/sync/devices', requireDatabase, requireSameOrigin, requireSession, async (req, res) => {
    try {
      if (!pool || !req.stateflowUserId) return;
      const body = req.body as Record<string, unknown>;
      if (!isSafeId(body.deviceId)) {
        res.status(400).json({ error: 'Invalid device identifier.' });
        return;
      }
      const result = await pool.query(
        'INSERT INTO devices (id, user_id, name, platform, last_seen_at) VALUES ($1, $2, $3, $4, now()) ' +
        'ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, platform = EXCLUDED.platform, last_seen_at = now() ' +
        'WHERE devices.user_id = EXCLUDED.user_id AND devices.revoked_at IS NULL RETURNING id',
        [
          body.deviceId, req.stateflowUserId,
          typeof body.name === 'string' ? body.name.slice(0, 180) : 'Web device',
          typeof body.platform === 'string' ? body.platform.slice(0, 40) : 'web',
        ]
      );
      if (!result.rowCount) {
        res.status(409).json({ error: 'This device ID is already registered or revoked.' });
        return;
      }
      res.json({ ok: true });
    } catch (error) {
      console.error('Device registration failed.', error);
      res.status(500).json({ error: 'Unable to register this device.' });
    }
  });

  app.get('/api/sync/snapshot', requireDatabase, requireSession, async (req, res) => {
    if (!pool || !req.stateflowUserId) return;
    const client = await pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const boards = await client.query(
        'SELECT id, title, grid_style, camera, created_at, updated_at FROM boards WHERE user_id = $1 AND deleted_at IS NULL ORDER BY updated_at DESC',
        [req.stateflowUserId]
      );
      const elements = await client.query(
        'SELECT e.board_id, e.payload FROM board_elements e JOIN boards b ON b.id = e.board_id ' +
        'WHERE b.user_id = $1 AND b.deleted_at IS NULL AND e.deleted_at IS NULL ORDER BY e.board_id, e.element_id',
        [req.stateflowUserId]
      );
      const cursor = await client.query(
        'SELECT COALESCE(MAX(sequence), 0) AS cursor FROM board_operations WHERE user_id = $1',
        [req.stateflowUserId]
      );
      await client.query('COMMIT');
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        boards: boards.rows.map(boardFromRow),
        elements: elements.rows.filter((row) => row.payload).map((row) => ({
          boardId: row.board_id, element: row.payload,
        })),
        cursor: Number(cursor.rows[0]?.cursor ?? 0),
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      console.error('Initial snapshot failed.', error);
      res.status(500).json({ error: 'Unable to load the server snapshot.' });
    } finally {
      client.release();
    }
  });

  app.post('/api/sync/push', requireDatabase, requireSameOrigin, requireSession, async (req, res) => {
    if (!pool || !req.stateflowUserId) return;
    const body = req.body as { deviceId?: unknown; operations?: unknown };
    if (!isSafeId(body.deviceId) || !Array.isArray(body.operations) ||
        body.operations.length < 1 || body.operations.length > MAX_SYNC_OPERATIONS) {
      res.status(400).json({ error: 'A valid device and between 1 and ' + MAX_SYNC_OPERATIONS + ' operations are required.' });
      return;
    }
    const client = await pool.connect();
    const acknowledged: string[] = [];
    const elementBroadcasts = new Map<string, { upserts: Record<string, unknown>[]; deleteIds: string[] }>();
    const boardBroadcasts = new Map<string, Record<string, unknown>>();
    try {
      await client.query('BEGIN');
      const device = await client.query(
        'SELECT id FROM devices WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL FOR UPDATE',
        [body.deviceId, req.stateflowUserId]
      );
      if (!device.rowCount) throw new Error('Device is not registered or has been revoked.');
      const authorizedBoards = new Set<string>();
      for (const raw of body.operations) {
        const op = raw as IncomingOperation;
        if (!op || !isSafeId(op.operationId) || op.deviceId !== body.deviceId ||
            !isSafeId(op.boardId) || !isSafeId(op.entityId) ||
            !['board', 'element'].includes(op.entityType) ||
            !['upsert', 'delete'].includes(op.action) ||
            !Number.isSafeInteger(op.clientSequence) || op.clientSequence < 1) {
          throw new Error('A synchronization operation failed validation.');
        }
        await applyOperation(client, req.stateflowUserId, op, authorizedBoards);
        acknowledged.push(op.operationId);
        if (op.entityType === 'element') {
          const patch = elementBroadcasts.get(op.boardId) ?? { upserts: [], deleteIds: [] };
          if (op.action === 'upsert' && op.payload) patch.upserts.push(op.payload);
          if (op.action === 'delete') patch.deleteIds.push(op.entityId);
          elementBroadcasts.set(op.boardId, patch);
        } else {
          if (op.action === 'delete') {
            boardBroadcasts.set(op.boardId, { type: 'board:catalog-changed', boardId: op.boardId });
          } else if (op.payload) {
            boardBroadcasts.set(op.boardId, {
              type: 'board:meta', boardId: op.boardId,
              title: op.payload.title, gridStyle: op.payload.gridStyle, camera: op.payload.camera,
            });
          }
        }
      }
      const max = await client.query(
        'SELECT COALESCE(MAX(sequence), 0) AS sequence FROM board_operations WHERE user_id = $1',
        [req.stateflowUserId]
      );
      await client.query('UPDATE devices SET last_seen_at = now() WHERE id = $1', [body.deviceId]);
      await client.query('COMMIT');
      for (const [boardId, patch] of elementBroadcasts) {
        broadcast(req.stateflowUserId, { type: 'board:elements-patch', boardId, committed: true, ...patch });
      }
      for (const [boardId, message] of boardBroadcasts) {
        broadcast(req.stateflowUserId, message);
        if (message.type === 'board:meta') broadcast(req.stateflowUserId, { type: 'board:catalog-changed', boardId });
      }
      res.json({
        acknowledgedOperationIds: acknowledged,
        serverSequence: Number(max.rows[0]?.sequence ?? 0),
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      const message = error instanceof Error ? error.message : 'Synchronization failed.';
      console.error('Push rejected.', message);
      res.status(message.includes('not registered') ? 403 : 400).json({ error: message });
    } finally {
      client.release();
    }
  });

  app.get('/api/sync/pull', requireDatabase, requireSession, async (req, res) => {
    if (!pool || !req.stateflowUserId) return;
    const cursor = Number(req.query.cursor ?? 0);
    const requestedLimit = Number(req.query.limit ?? 500);
    if (!Number.isSafeInteger(cursor) || cursor < 0 ||
        !Number.isSafeInteger(requestedLimit) || requestedLimit < 1) {
      res.status(400).json({ error: 'Invalid synchronization cursor or limit.' });
      return;
    }
    const limit = Math.min(1000, requestedLimit);
    try {
      const result = await pool.query(
        'SELECT sequence, operation_id, board_id, entity_type, entity_id, action, payload, created_at ' +
        'FROM board_operations WHERE user_id = $1 AND sequence > $2 ORDER BY sequence ASC LIMIT $3',
        [req.stateflowUserId, cursor, limit + 1]
      );
      const hasMore = result.rows.length > limit;
      const rows = result.rows.slice(0, limit);
      const nextCursor = rows.length ? Number(rows[rows.length - 1].sequence) : cursor;
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        operations: rows.map((row) => ({
          sequence: Number(row.sequence),
          operationId: row.operation_id,
          boardId: row.board_id,
          entityType: row.entity_type,
          entityId: row.entity_id,
          action: row.action,
          ...(row.payload ? { payload: row.payload } : {}),
          createdAt: row.created_at,
        })),
        nextCursor,
        hasMore,
      });
    } catch (error) {
      console.error('Pull failed.', error);
      res.status(500).json({ error: 'Unable to download pending changes.' });
    }
  });

  app.post('/api/sync/ack', requireDatabase, requireSameOrigin, requireSession, async (req, res) => {
    if (!pool || !req.stateflowUserId) return;
    const body = req.body as { deviceId?: unknown; sequence?: unknown };
    if (!isSafeId(body.deviceId) || !Number.isSafeInteger(body.sequence) || Number(body.sequence) < 0) {
      res.status(400).json({ error: 'Invalid synchronization acknowledgment.' });
      return;
    }
    try {
      const result = await pool.query(
        'INSERT INTO device_sync_cursors (device_id, user_id, last_sequence) ' +
        'SELECT id, user_id, $3 FROM devices WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL ' +
        'ON CONFLICT (device_id) DO UPDATE SET last_sequence = GREATEST(device_sync_cursors.last_sequence, EXCLUDED.last_sequence), updated_at = now() ' +
        'RETURNING device_id',
        [body.deviceId, req.stateflowUserId, body.sequence]
      );
      if (!result.rowCount) {
        res.status(403).json({ error: 'Device is not registered.' });
        return;
      }
      res.json({ ok: true });
    } catch (error) {
      console.error('Sync acknowledgment failed.', error);
      res.status(500).json({ error: 'Unable to acknowledge synchronization.' });
    }
  });
}
