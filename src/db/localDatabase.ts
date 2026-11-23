import Dexie, { type Table } from 'dexie';
import type { Board, CanvasElement } from '../types/whiteboard';
import { areElementDocumentsEqual } from '../utils/elementDiff';
import type { ServerOperation, SyncOperation } from '../services/syncApi';

type BoardRecord = Omit<Board, 'elements'>;
interface ElementRecord {
  key: string;
  boardId: string;
  elementId: string;
  payload: CanvasElement;
  zIndex: number;
}
interface MetaRecord {
  key: string;
  value: number | string;
}
class StateflowLocalDatabase extends Dexie {
  boards!: Table<BoardRecord, string>;
  elements!: Table<ElementRecord, string>;
  outbox!: Table<SyncOperation, string>;
  meta!: Table<MetaRecord, string>;
  constructor(userId: string) {
    super('stateflow-local-' + userId.replace(/[^a-zA-Z0-9_-]/g, '_'));
    this.version(1).stores({
      boards: '&id, updatedAt',
      elements: '&key, boardId, zIndex',
      outbox: '&operationId, boardId, clientSequence, createdAt',
      meta: '&key',
    });
  }
}
const databases = new Map<string, StateflowLocalDatabase>();
function databaseFor(userId: string): StateflowLocalDatabase {
  let database = databases.get(userId);
  if (!database) {
    database = new StateflowLocalDatabase(userId);
    databases.set(userId, database);
  }
  return database;
}
function elementKey(boardId: string, elementId: string): string {
  return boardId + '::' + elementId;
}
function toBoardRecord(board: Board): BoardRecord {
  const { elements: _elements, ...record } = board;
  return record;
}
function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'op-' + Date.now() + '-' + Math.random().toString(36).slice(2);
}
async function nextClientSequence(db: StateflowLocalDatabase): Promise<number> {
  const current = await db.meta.get('clientSequence');
  const next = Number(current?.value ?? 0) + 1;
  await db.meta.put({ key: 'clientSequence', value: next });
  return next;
}
async function createOperation(
  db: StateflowLocalDatabase,
  deviceId: string,
  boardId: string,
  entityType: 'board' | 'element',
  entityId: string,
  action: 'upsert' | 'delete',
  payload?: Board | CanvasElement
): Promise<SyncOperation> {
  return {
    operationId: newId(),
    deviceId,
    boardId,
    entityType,
    entityId,
    action,
    clientSequence: await nextClientSequence(db),
    ...(payload ? { payload } : {}),
    createdAt: Date.now(),
  };
}
export async function listLocalBoards(userId: string): Promise<Board[]> {
  const db = databaseFor(userId);
  const [boardRecords, elementRecords] = await Promise.all([
    db.boards.toArray(),
    db.elements.toArray(),
  ]);
  const elementsByBoard = new Map<string, CanvasElement[]>();
  for (const record of elementRecords) {
    const list = elementsByBoard.get(record.boardId) ?? [];
    list.push(record.payload);
    elementsByBoard.set(record.boardId, list);
  }
  return boardRecords
    .map((board) => ({
      ...board,
      elements: (elementsByBoard.get(board.id) ?? []).sort((a, b) => a.zIndex - b.zIndex),
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
export async function saveNewLocalBoard(
  userId: string,
  deviceId: string,
  board: Board
): Promise<void> {
  const db = databaseFor(userId);
  await db.transaction('rw', db.boards, db.elements, db.outbox, db.meta, async () => {
    await db.boards.put(toBoardRecord(board));
    const existing = await db.elements.where('boardId').equals(board.id).primaryKeys();
    if (existing.length) await db.elements.bulkDelete(existing);
    if (board.elements.length) {
      await db.elements.bulkPut(board.elements.map((element) => ({
        key: elementKey(board.id, element.id),
        boardId: board.id,
        elementId: element.id,
        payload: element,
        zIndex: element.zIndex,
      })));
    }
    await db.outbox.put(await createOperation(db, deviceId, board.id, 'board', board.id, 'upsert', toBoardRecord(board) as Board));
    for (const element of board.elements) {
      await db.outbox.put(await createOperation(db, deviceId, board.id, 'element', element.id, 'upsert', element));
    }
  });
}
export async function persistBoardDiff(
  userId: string,
  deviceId: string,
  boardId: string,
  previous: CanvasElement[],
  next: CanvasElement[]
): Promise<number> {
  const db = databaseFor(userId);
  const previousById = new Map(previous.map((element) => [element.id, element]));
  const nextById = new Map(next.map((element) => [element.id, element]));
  const changes: Array<{ action: 'upsert' | 'delete'; elementId: string; element?: CanvasElement }> = [];
  for (const [elementId] of previousById) {
    if (!nextById.has(elementId)) changes.push({ action: 'delete', elementId });
  }
  for (const element of next) {
    const old = previousById.get(element.id);
    if (!old || !areElementDocumentsEqual(old, element)) {
      changes.push({ action: 'upsert', elementId: element.id, element });
    }
  }
  if (changes.length === 0) return db.outbox.count();
  await db.transaction('rw', db.elements, db.outbox, db.meta, async () => {
    for (const change of changes) {
      const key = elementKey(boardId, change.elementId);
      if (change.action === 'delete') {
        await db.elements.delete(key);
        await db.outbox.put(await createOperation(db, deviceId, boardId, 'element', change.elementId, 'delete'));
      } else if (change.element) {
        await db.elements.put({
          key,
          boardId,
          elementId: change.elementId,
          payload: change.element,
          zIndex: change.element.zIndex,
        });
        await db.outbox.put(await createOperation(db, deviceId, boardId, 'element', change.elementId, 'upsert', change.element));
      }
    }
  });
  return db.outbox.count();
}
export async function persistBoardRecord(
  userId: string,
  deviceId: string,
  board: Board
): Promise<void> {
  const db = databaseFor(userId);
  await db.transaction('rw', db.boards, db.outbox, db.meta, async () => {
    const record = toBoardRecord(board);
    await db.boards.put(record);
    await db.outbox.put(await createOperation(db, deviceId, board.id, 'board', board.id, 'upsert', record as Board));
  });
}
export async function deleteLocalBoard(
  userId: string,
  deviceId: string,
  boardId: string
): Promise<void> {
  const db = databaseFor(userId);
  await db.transaction('rw', db.boards, db.elements, db.outbox, db.meta, async () => {
    await db.outbox.put(await createOperation(db, deviceId, boardId, 'board', boardId, 'delete'));
    await db.boards.delete(boardId);
    await db.elements.where('boardId').equals(boardId).delete();
  });
}
export async function getLocalOutbox(userId: string, limit = 100): Promise<SyncOperation[]> {
  return databaseFor(userId).outbox.orderBy('clientSequence').limit(limit).toArray();
}
export async function acknowledgeLocalOutbox(userId: string, operationIds: string[]): Promise<void> {
  if (operationIds.length) await databaseFor(userId).outbox.bulkDelete(operationIds);
}
export async function applyRemoteOperations(userId: string, operations: ServerOperation[]): Promise<void> {
  if (!operations.length) return;
  const db = databaseFor(userId);
  await db.transaction('rw', db.boards, db.elements, db.outbox, async () => {
    // A pending local operation has priority over an older remote update for the
    // same entity. The local version will be pushed after connectivity returns.
    const pending = await db.outbox.toArray();
    const pendingEntities = new Set(
      pending.map((entry) => entry.entityType + '::' + entry.boardId + '::' + entry.entityId)
    );
    for (const operation of operations) {
      const entityKey = operation.entityType + '::' + operation.boardId + '::' + operation.entityId;
      if (pendingEntities.has(entityKey)) continue;
      if (operation.entityType === 'board') {
        if (operation.action === 'delete') {
          await db.boards.delete(operation.entityId);
          await db.elements.where('boardId').equals(operation.entityId).delete();
        } else if (operation.payload) {
          await db.boards.put(toBoardRecord(operation.payload as Board));
        }
      } else if (operation.action === 'delete') {
        await db.elements.delete(elementKey(operation.boardId, operation.entityId));
      } else if (operation.payload) {
        const element = operation.payload as CanvasElement;
        await db.elements.put({
          key: elementKey(operation.boardId, operation.entityId),
          boardId: operation.boardId,
          elementId: operation.entityId,
          payload: element,
          zIndex: element.zIndex,
        });
      }
    }
  });
}
export async function applyRemoteElementPatch(
  userId: string,
  boardId: string,
  upserts: CanvasElement[],
  deleteIds: string[]
): Promise<void> {
  const db = databaseFor(userId);
  await db.transaction('rw', db.elements, async () => {
    for (const id of deleteIds) await db.elements.delete(elementKey(boardId, id));
    for (const element of upserts) {
      await db.elements.put({
        key: elementKey(boardId, element.id),
        boardId,
        elementId: element.id,
        payload: element,
        zIndex: element.zIndex,
      });
    }
  });
}
export async function applyRemoteBoardMeta(
  userId: string,
  boardId: string,
  patch: Partial<Pick<Board, 'title' | 'gridStyle' | 'camera'>>
): Promise<void> {
  const db = databaseFor(userId);
  const board = await db.boards.get(boardId);
  if (board) await db.boards.put({ ...board, ...patch, updatedAt: Date.now() });
}
export async function replaceLocalDataFromSnapshot(
  userId: string,
  snapshot: {
    boards: Array<Omit<Board, 'elements'>>;
    elements: Array<{ boardId: string; element: CanvasElement }>;
    cursor: number;
  }
): Promise<void> {
  const db = databaseFor(userId);
  if (await db.outbox.count()) return;
  await db.transaction('rw', db.boards, db.elements, db.meta, async () => {
    if (await db.boards.count()) return;
    await db.boards.bulkPut(snapshot.boards);
    if (snapshot.elements.length) {
      await db.elements.bulkPut(snapshot.elements.map(({ boardId, element }) => ({
        key: elementKey(boardId, element.id),
        boardId,
        elementId: element.id,
        payload: element,
        zIndex: element.zIndex,
      })));
    }
    await db.meta.put({ key: 'syncCursor', value: snapshot.cursor });
  });
}
export async function getSyncCursor(userId: string): Promise<number> {
  const value = await databaseFor(userId).meta.get('syncCursor');
  return Number(value?.value ?? 0);
}
export async function setSyncCursor(userId: string, cursor: number): Promise<void> {
  await databaseFor(userId).meta.put({ key: 'syncCursor', value: cursor });
}
export async function getOutboxCount(userId: string): Promise<number> {
  return databaseFor(userId).outbox.count();
}
export async function saveActiveBoardId(userId: string, boardId: string): Promise<void> {
  await databaseFor(userId).meta.put({ key: 'activeBoardId', value: boardId });
}
export async function getActiveBoardId(userId: string): Promise<string | null> {
  const value = await databaseFor(userId).meta.get('activeBoardId');
  return typeof value?.value === 'string' ? value.value : null;
}
