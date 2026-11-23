import { createStarterElements } from '../constants/starter';
import { Board } from '../types/whiteboard';

const DB_NAME = 'slateflow-whiteboard-db';
const DB_VERSION = 1;
const STORE_BOARDS = 'boards';
const META_KEY = 'slateflow-meta-v1';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_BOARDS)) {
        db.createObjectStore(STORE_BOARDS, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export { createStarterElements };

export function createNewBoard(title = 'Untitled Board', withStarter = false): Board {
  const now = Date.now();
  return {
    id: `board-${now}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    createdAt: now,
    updatedAt: now,
    gridStyle: 'dots',
    camera: { x: 0, y: 0, zoom: 1 },
    elements: withStarter ? createStarterElements() : [],
  };
}

export async function loadAllBoards(): Promise<Board[]> {
  try {
    const db = await openDB();
    return await new Promise<Board[]>((resolve, reject) => {
      const tx = db.transaction(STORE_BOARDS, 'readonly');
      const store = tx.objectStore(STORE_BOARDS);
      const req = store.getAll();
      req.onsuccess = () => {
        const boards = (req.result as Board[]) || [];
        boards.sort((a, b) => b.updatedAt - a.updatedAt);
        resolve(boards);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    try {
      const raw = localStorage.getItem('slateflow-boards-fallback');
      if (raw) {
        const parsed = JSON.parse(raw) as Board[];
        return parsed.sort((a, b) => b.updatedAt - a.updatedAt);
      }
    } catch {
      // ignore
    }
    return [];
  }
}

export async function saveBoard(board: Board): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_BOARDS, 'readwrite');
      const store = tx.objectStore(STORE_BOARDS);
      const req = store.put(board);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    try {
      const existing = await loadAllBoards();
      const filtered = existing.filter((b) => b.id !== board.id);
      filtered.unshift(board);
      localStorage.setItem('slateflow-boards-fallback', JSON.stringify(filtered));
    } catch {
      // ignore quota errors
    }
  }
}

export async function deleteBoardFromDB(boardId: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_BOARDS, 'readwrite');
      const store = tx.objectStore(STORE_BOARDS);
      const req = store.delete(boardId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    try {
      const raw = localStorage.getItem('slateflow-boards-fallback');
      if (raw) {
        const parsed = (JSON.parse(raw) as Board[]).filter((b) => b.id !== boardId);
        localStorage.setItem('slateflow-boards-fallback', JSON.stringify(parsed));
      }
    } catch {
      // ignore
    }
  }
}

export function loadActiveBoardId(): string | null {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return null;
    return JSON.parse(raw).activeBoardId ?? null;
  } catch {
    return null;
  }
}

export function saveActiveBoardId(boardId: string): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify({ activeBoardId: boardId }));
  } catch {
    // ignore
  }
}
