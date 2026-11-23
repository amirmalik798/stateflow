import type { StrokeElement } from '../types/whiteboard';

const JOURNAL_DB_NAME = 'stateflow-stroke-journal';
const JOURNAL_DB_VERSION = 1;
const JOURNAL_STORE = 'operations';

export type StrokeJournalOperation = 'upsert' | 'delete';

export interface StrokeJournalEntry {
  key: string;
  uid: string;
  boardId: string;
  elementId: string;
  operation: StrokeJournalOperation;
  element?: StrokeElement;
  createdAtMs: number;
  /** True when a pending local create may or may not have reached Firestore yet. */
  requiresCreate: boolean;
  revision: string;
  queuedAt: number;
}

export type StrokeJournalChange =
  | { operation: 'upsert'; element: StrokeElement }
  | { operation: 'delete'; elementId: string };

function makeRevision(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function makeKey(uid: string, boardId: string, elementId: string): string {
  return `${uid}::${boardId}::${elementId}`;
}

/** Pure coalescing logic, exported so create/delete/undo transitions can be tested. */
export function coalesceStrokeJournalEntry(
  current: StrokeJournalEntry | undefined,
  uid: string,
  boardId: string,
  change: StrokeJournalChange,
  revision = makeRevision(),
  queuedAt = Date.now()
): StrokeJournalEntry | null {
  const elementId = change.operation === 'upsert' ? change.element.id : change.elementId;
  const key = makeKey(uid, boardId, elementId);

  if (change.operation === 'delete') {
    if (current?.operation === 'delete') return current;
    return {
      key,
      uid,
      boardId,
      elementId,
      operation: 'delete',
      createdAtMs: current?.createdAtMs ?? queuedAt,
      requiresCreate: current?.operation === 'upsert',
      revision,
      queuedAt,
    };
  }

  if (current?.operation === 'delete') {
    // Undoing a delete of a previously synced stroke simply cancels the tombstone.
    if (!current.requiresCreate) return null;
    // A create may have reached Firestore before its acknowledgement was interrupted.
    // Recreate with the same stable creation timestamp so retries remain idempotent.
    return {
      key,
      uid,
      boardId,
      elementId,
      operation: 'upsert',
      element: change.element,
      createdAtMs: current.createdAtMs,
      requiresCreate: false,
      revision,
      queuedAt,
    };
  }

  return {
    key,
    uid,
    boardId,
    elementId,
    operation: 'upsert',
    element: change.element,
    createdAtMs: current?.createdAtMs ?? queuedAt,
    requiresCreate: false,
    revision,
    queuedAt,
  };
}

export function applyStrokeJournalEntries(
  remoteElements: StrokeElement[],
  entries: StrokeJournalEntry[]
): StrokeElement[] {
  const elements = new Map(remoteElements.map((element) => [element.id, element]));
  for (const entry of entries) {
    if (entry.operation === 'delete') {
      elements.delete(entry.elementId);
    } else if (entry.element) {
      elements.set(entry.elementId, entry.element);
    }
  }
  return [...elements.values()].sort((a, b) => a.zIndex - b.zIndex);
}

function openJournalDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable; the handwriting journal cannot be made durable.'));
      return;
    }

    const request = indexedDB.open(JOURNAL_DB_NAME, JOURNAL_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(JOURNAL_STORE)) {
        const store = database.createObjectStore(JOURNAL_STORE, { keyPath: 'key' });
        store.createIndex('uid', 'uid', { unique: false });
        store.createIndex('uidBoard', ['uid', 'boardId'], { unique: false });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => reject(request.error ?? new Error('Unable to open the handwriting journal.'));
    request.onblocked = () => reject(new Error('The handwriting journal is blocked by another open tab.'));
  });
}

export async function listStrokeJournalEntries(
  uid: string,
  boardId?: string
): Promise<StrokeJournalEntry[]> {
  const database = await openJournalDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(JOURNAL_STORE, 'readonly');
    const index = transaction.objectStore(JOURNAL_STORE).index(boardId ? 'uidBoard' : 'uid');
    const request = index.getAll(boardId ? [uid, boardId] : uid);
    let entries: StrokeJournalEntry[] = [];

    request.onsuccess = () => {
      entries = (request.result as StrokeJournalEntry[]).sort(
        (a, b) => a.queuedAt - b.queuedAt || a.elementId.localeCompare(b.elementId)
      );
    };
    request.onerror = () => reject(request.error ?? new Error('Unable to read pending handwriting.'));
    transaction.oncomplete = () => {
      database.close();
      resolve(entries);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error('Unable to read pending handwriting.'));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error('Handwriting journal read was interrupted.'));
    };
  });
}

export async function applyStrokeJournalChanges(
  uid: string,
  boardId: string,
  changes: StrokeJournalChange[]
): Promise<void> {
  if (changes.length === 0) return;
  const database = await openJournalDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(JOURNAL_STORE, 'readwrite');
    const store = transaction.objectStore(JOURNAL_STORE);

    for (const change of changes) {
      const elementId = change.operation === 'upsert' ? change.element.id : change.elementId;
      const key = makeKey(uid, boardId, elementId);
      const request = store.get(key);
      request.onsuccess = () => {
        const next = coalesceStrokeJournalEntry(
          request.result as StrokeJournalEntry | undefined,
          uid,
          boardId,
          change
        );
        if (next) store.put(next);
        else store.delete(key);
      };
      request.onerror = () => transaction.abort();
    }

    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error('Unable to save handwriting locally.'));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error('Local handwriting save was interrupted.'));
    };
  });
}

export async function acknowledgeStrokeJournalEntries(
  acknowledged: StrokeJournalEntry[]
): Promise<void> {
  if (acknowledged.length === 0) return;
  const database = await openJournalDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(JOURNAL_STORE, 'readwrite');
    const store = transaction.objectStore(JOURNAL_STORE);

    for (const entry of acknowledged) {
      const request = store.get(entry.key);
      request.onsuccess = () => {
        const current = request.result as StrokeJournalEntry | undefined;
        // Do not erase a newer operation that arrived while a batch was committing.
        if (current?.revision === entry.revision) store.delete(entry.key);
      };
      request.onerror = () => transaction.abort();
    }

    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error('Unable to acknowledge synchronized handwriting.'));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error('Handwriting acknowledgement was interrupted.'));
    };
  });
}
