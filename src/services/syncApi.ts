import type { Board, CanvasElement } from '../types/whiteboard';
export type SyncEntityType = 'board' | 'element';
export type SyncAction = 'upsert' | 'delete';
export interface SyncOperation {
  operationId: string;
  deviceId: string;
  boardId: string;
  entityType: SyncEntityType;
  entityId: string;
  action: SyncAction;
  clientSequence: number;
  payload?: Board | CanvasElement;
  createdAt: number;
}
export interface ServerOperation {
  sequence: number;
  operationId: string;
  boardId: string;
  entityType: SyncEntityType;
  entityId: string;
  action: SyncAction;
  payload?: Board | CanvasElement;
  createdAt: string;
}
export interface SyncSnapshot {
  boards: Array<Omit<Board, 'elements'>>;
  elements: Array<{ boardId: string; element: CanvasElement }>;
  cursor: number;
}
async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error || ('Sync request failed (' + response.status + ')'));
  }
  return response.json() as Promise<T>;
}
export function getDeviceId(userId: string): string {
  const key = 'stateflow-device-id:' + userId;
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}
export async function registerDevice(deviceId: string): Promise<void> {
  await apiRequest<{ ok: true }>('/api/sync/devices', {
    method: 'POST',
    body: JSON.stringify({
      deviceId,
      name: navigator.userAgent.slice(0, 180) || 'Web device',
      platform: /Android|iPhone|iPad/i.test(navigator.userAgent) ? 'mobile-web' : 'desktop-web',
    }),
  });
}
export function fetchSyncSnapshot(): Promise<SyncSnapshot> {
  return apiRequest<SyncSnapshot>('/api/sync/snapshot');
}
export function pushSyncOperations(
  deviceId: string,
  operations: SyncOperation[]
): Promise<{ acknowledgedOperationIds: string[]; serverSequence: number }> {
  return apiRequest('/api/sync/push', {
    method: 'POST',
    body: JSON.stringify({ deviceId, operations }),
  });
}
export function pullSyncOperations(
  cursor: number,
  limit = 500
): Promise<{ operations: ServerOperation[]; nextCursor: number; hasMore: boolean }> {
  const query = new URLSearchParams({ cursor: String(cursor), limit: String(limit) });
  return apiRequest('/api/sync/pull?' + query.toString());
}
export function acknowledgeSyncCursor(deviceId: string, sequence: number): Promise<void> {
  return apiRequest('/api/sync/ack', {
    method: 'POST',
    body: JSON.stringify({ deviceId, sequence }),
  });
}
