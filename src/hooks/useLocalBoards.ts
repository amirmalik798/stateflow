import { useCallback, useEffect, useRef, useState } from 'react';
import { createStarterBoard } from '../constants/starter';
import type { Board, Camera, CanvasElement, GridStyle } from '../types/whiteboard';
import type { ServerOperation } from '../services/syncApi';
import {
  acknowledgeSyncCursor,
  getDeviceId,
  pullSyncOperations,
  pushSyncOperations,
  registerDevice,
} from '../services/syncApi';
import {
  acknowledgeLocalOutbox,
  applyRemoteBoardMeta,
  applyRemoteElementPatch,
  applyRemoteOperations,
  deleteLocalBoard,
  getActiveBoardId,
  getLocalOutbox,
  getOutboxCount,
  getSyncCursor,
  listLocalBoards,
  persistBoardDiff,
  persistBoardRecord,
  replaceLocalDataFromSnapshot,
  saveActiveBoardId,
  saveNewLocalBoard,
  setSyncCursor,
} from '../db/localDatabase';
import { fetchSyncSnapshot } from '../services/syncApi';

export type StrokeSyncStatus = 'saved' | 'pending' | 'syncing' | 'offline' | 'error';

interface LocalUser {
  uid: string;
}

export function useLocalBoards(user: LocalUser | null, isReadOnly: boolean) {
  const [boards, setBoards] = useState<Board[]>([]);
  const [activeBoardId, setActiveBoardId] = useState('');
  const [activeElements, setActiveElements] = useState<CanvasElement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [pendingStrokeCount, setPendingStrokeCount] = useState(0);
  const [strokeSyncStatus, setStrokeSyncStatus] = useState<StrokeSyncStatus>('saved');

  const boardsRef = useRef<Board[]>([]);
  const activeBoardIdRef = useRef('');
  const syncInFlightRef = useRef<Promise<void> | null>(null);
  const syncTimerRef = useRef<number | null>(null);
  const cameraTimersRef = useRef<Map<string, number>>(new Map());
  const deviceIdRef = useRef<string | null>(null);
  const deviceRegisteredRef = useRef(false);

  boardsRef.current = boards;
  activeBoardIdRef.current = activeBoardId;

  const refreshLocalState = useCallback(async (userId: string) => {
    const nextBoards = await listLocalBoards(userId);
    boardsRef.current = nextBoards;
    setBoards(nextBoards);
    const preferredId = await getActiveBoardId(userId);
    const currentId = activeBoardIdRef.current;
    const nextActiveId =
      (preferredId && nextBoards.some((board) => board.id === preferredId) ? preferredId : '') ||
      (currentId && nextBoards.some((board) => board.id === currentId) ? currentId : '') ||
      nextBoards[0]?.id ||
      '';
    activeBoardIdRef.current = nextActiveId;
    setActiveBoardId(nextActiveId);
    const selected = nextBoards.find((board) => board.id === nextActiveId);
    setActiveElements(selected?.elements ?? []);
    setPendingStrokeCount(await getOutboxCount(userId));
  }, []);

  const runSync = useCallback((): Promise<void> => {
    if (!user) return Promise.resolve();
    if (syncInFlightRef.current) return syncInFlightRef.current;
    const userId = user.uid;
    const deviceId = deviceIdRef.current || getDeviceId(userId);
    deviceIdRef.current = deviceId;

    const task = (async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const count = await getOutboxCount(userId);
        setPendingStrokeCount(count);
        setStrokeSyncStatus(count > 0 ? 'offline' : 'saved');
        return;
      }
      setStrokeSyncStatus('syncing');
      try {
        if (!deviceRegisteredRef.current) {
          await registerDevice(deviceId);
          deviceRegisteredRef.current = true;
        }

        // Push local operations before pulling. Every operation has a stable ID,
        // so a lost response can be retried without duplicating the server change.
        while (true) {
          const batch = await getLocalOutbox(userId, 25);
          if (batch.length === 0) break;
          const result = await pushSyncOperations(deviceId, batch);
          await acknowledgeLocalOutbox(userId, result.acknowledgedOperationIds);
          setPendingStrokeCount(await getOutboxCount(userId));
        }

        // Pull durable changes in ordered pages. Persist the page before advancing
        // the local cursor; a crash can therefore only cause safe idempotent replay.
        let cursor = await getSyncCursor(userId);
        let hasMore = true;
        const appliedRemoteOperations: ServerOperation[] = [];
        while (hasMore) {
          const page = await pullSyncOperations(cursor, 500);
          if (page.operations.length) {
            appliedRemoteOperations.push(...await applyRemoteOperations(userId, page.operations));
          }
          if (page.nextCursor > cursor) {
            cursor = page.nextCursor;
            await setSyncCursor(userId, cursor);
          }
          hasMore = page.hasMore;
          if (page.operations.length === 0) break;
        }
        await acknowledgeSyncCursor(deviceId, cursor);
        applyOperationsToMemory(appliedRemoteOperations);
        setStrokeSyncStatus('saved');
      } catch (syncError) {
        const count = await getOutboxCount(userId).catch(() => 0);
        setPendingStrokeCount(count);
        setStrokeSyncStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'error');
        console.error('Stateflow synchronization paused; local changes remain queued.', syncError);
      }
    })();

    syncInFlightRef.current = task.finally(() => {
      syncInFlightRef.current = null;
    });
    return syncInFlightRef.current;
  }, [user]);

  const scheduleSync = useCallback(() => {
    if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = window.setTimeout(() => {
      syncTimerRef.current = null;
      void runSync();
    }, 350);
  }, [runSync]);

  const setWorkspaceActiveBoard = useCallback(async (boardId: string) => {
    if (!user || !boardId) return;
    activeBoardIdRef.current = boardId;
    setActiveBoardId(boardId);
    await saveActiveBoardId(user.uid, boardId);
    const selected = boardsRef.current.find((board) => board.id === boardId);
    setActiveElements(selected?.elements ?? []);
  }, [user]);

  const applyRemoteActiveBoardId = useCallback((boardId: string) => {
    if (!boardId) return;
    activeBoardIdRef.current = boardId;
    setActiveBoardId(boardId);
    const selected = boardsRef.current.find((board) => board.id === boardId);
    if (selected) setActiveElements(selected.elements);
    if (user) void saveActiveBoardId(user.uid, boardId);
  }, [user]);

  const syncElementsDiff = useCallback(async (
    boardId: string,
    previous: CanvasElement[],
    next: CanvasElement[]
  ) => {
    if (!user || isReadOnly) return;
    try {
      const count = await persistBoardDiff(user.uid, deviceIdRef.current || getDeviceId(user.uid), boardId, previous, next);
      setActiveElements(next);
      setBoards((current) => {
        const updated = current.map((board) => board.id === boardId ? { ...board, elements: next } : board);
        boardsRef.current = updated;
        return updated;
      });
      setPendingStrokeCount(count);
      setStrokeSyncStatus(count > 0 ? 'pending' : 'saved');
      if (count >= 25) void runSync();
      else scheduleSync();
    } catch (localError) {
      setStrokeSyncStatus('error');
      setError(localError instanceof Error ? localError : new Error('Unable to save changes locally.'));
      console.error('Local canvas transaction failed.', localError);
    }
  }, [user, isReadOnly, runSync, scheduleSync]);

  const applyRemoteElementsPatch = useCallback(async (
    boardId: string,
    upserts: CanvasElement[],
    deleteIds: string[]
  ) => {
    if (!user) return;
    const applied = await applyRemoteElementPatch(user.uid, boardId, upserts, deleteIds);
    const current = boardsRef.current.find((board) => board.id === boardId);
    if (!current || (applied.upserts.length === 0 && applied.deleteIds.length === 0)) return;
    const elements = new Map(current.elements.map((element) => [element.id, element]));
    applied.deleteIds.forEach((id) => elements.delete(id));
    applied.upserts.forEach((element) => elements.set(element.id, element));
    const nextElements = [...elements.values()].sort((a, b) => a.zIndex - b.zIndex);
    const nextBoards = boardsRef.current.map((board) =>
      board.id === boardId ? { ...board, elements: nextElements } : board
    );
    boardsRef.current = nextBoards;
    setBoards(nextBoards);
    if (activeBoardIdRef.current === boardId) setActiveElements(nextElements);
  }, [user]);

  const applyRemoteBoardMetadata = useCallback(async (
    boardId: string,
    patch: Partial<Pick<Board, 'title' | 'gridStyle' | 'camera'>>
  ) => {
    if (!user) return;
    const applied = await applyRemoteBoardMeta(user.uid, boardId, patch);
    if (!applied) return;
    const nextBoards = boardsRef.current.map((board) =>
      board.id === boardId ? { ...board, ...patch, updatedAt: Date.now() } : board
    );
    boardsRef.current = nextBoards;
    setBoards(nextBoards);
    const active = nextBoards.find((board) => board.id === activeBoardIdRef.current);
    if (active) setActiveElements(active.elements);
  }, [user]);

  const applyOperationsToMemory = useCallback((operations: ServerOperation[]) => {
    if (operations.length === 0) return;
    const nextById = new Map(boardsRef.current.map((board) => [board.id, board]));
    for (const operation of operations) {
      if (operation.entityType === 'board') {
        if (operation.action === 'delete') {
          nextById.delete(operation.entityId);
        } else if (operation.payload) {
          const payload = operation.payload as Omit<Board, 'elements'>;
          const existing = nextById.get(operation.entityId);
          nextById.set(operation.entityId, {
            ...payload,
            elements: existing?.elements ?? [],
          });
        }
        continue;
      }
      const board = nextById.get(operation.boardId);
      if (!board) continue;
      const elements = new Map(board.elements.map((element) => [element.id, element]));
      if (operation.action === 'delete') {
        elements.delete(operation.entityId);
      } else if (operation.payload) {
        const element = operation.payload as CanvasElement;
        elements.set(element.id, element);
      }
      nextById.set(operation.boardId, {
        ...board,
        elements: [...elements.values()].sort((a, b) => a.zIndex - b.zIndex),
      });
    }
    const nextBoards = [...nextById.values()].sort((a, b) => b.updatedAt - a.updatedAt);
    boardsRef.current = nextBoards;
    setBoards(nextBoards);
    const active = nextBoards.find((board) => board.id === activeBoardIdRef.current);
    if (active) setActiveElements(active.elements);
    else if (nextBoards.length > 0) {
      activeBoardIdRef.current = nextBoards[0].id;
      setActiveBoardId(nextBoards[0].id);
      setActiveElements(nextBoards[0].elements);
    } else {
      activeBoardIdRef.current = '';
      setActiveBoardId('');
      setActiveElements([]);
    }
  }, []);

  const refreshFromServer = useCallback(async () => {
    if (!user) return;
    await runSync();
  }, [user, runSync]);

  const savePendingStrokes = useCallback(() => runSync(), [runSync]);

  const updateBoardMeta = useCallback(async (
    boardId: string,
    patch: { title?: string; gridStyle?: GridStyle; camera?: Camera }
  ) => {
    if (!user || isReadOnly) return;
    const current = boardsRef.current.find((board) => board.id === boardId);
    if (!current) return;
    const next: Board = {
      ...current,
      ...patch,
      title: patch.title !== undefined ? (patch.title.trim().slice(0, 120) || 'Untitled Board') : current.title,
      updatedAt: Date.now(),
      elements: current.elements,
    };
    await persistBoardRecord(user.uid, deviceIdRef.current || getDeviceId(user.uid), next);
    const updated = boardsRef.current.map((board) => board.id === boardId ? next : board);
    boardsRef.current = updated;
    setBoards(updated);
    if (activeBoardIdRef.current === boardId) setActiveElements(next.elements);
    setPendingStrokeCount(await getOutboxCount(user.uid));
    setStrokeSyncStatus('pending');
    scheduleSync();
  }, [user, isReadOnly, scheduleSync]);

  const persistCameraDebounced = useCallback((boardId: string, camera: Camera) => {
    if (!user || isReadOnly) return;
    const timers = cameraTimersRef.current;
    const oldTimer = timers.get(boardId);
    if (oldTimer !== undefined) window.clearTimeout(oldTimer);
    const timer = window.setTimeout(() => {
      timers.delete(boardId);
      void updateBoardMeta(boardId, { camera });
    }, 250);
    timers.set(boardId, timer);
  }, [user, isReadOnly, updateBoardMeta]);

  const createBoard = useCallback(async (
    title: string,
    elements: CanvasElement[] = [],
    gridStyle: GridStyle = 'dots',
    camera: Camera = { x: 0, y: 0, zoom: 1 }
  ): Promise<string | null> => {
    if (!user || isReadOnly) return null;
    const now = Date.now();
    const boardId = 'board-' + now + '-' + Math.random().toString(36).slice(2, 8);
    const board: Board = {
      id: boardId,
      title: title.trim().slice(0, 120) || 'Untitled Board',
      gridStyle,
      camera,
      createdAt: now,
      updatedAt: now,
      elements,
    };
    try {
      await saveNewLocalBoard(user.uid, deviceIdRef.current || getDeviceId(user.uid), board);
      await refreshLocalState(user.uid);
      await setWorkspaceActiveBoard(boardId);
      scheduleSync();
      return boardId;
    } catch (localError) {
      setError(localError instanceof Error ? localError : new Error('Unable to create the board locally.'));
      return null;
    }
  }, [user, isReadOnly, refreshLocalState, setWorkspaceActiveBoard, scheduleSync]);

  const deleteBoard = useCallback(async (boardId: string) => {
    if (!user || isReadOnly || boardsRef.current.length <= 1) return;
    try {
      await deleteLocalBoard(user.uid, deviceIdRef.current || getDeviceId(user.uid), boardId);
      const remaining = boardsRef.current.filter((board) => board.id !== boardId);
      boardsRef.current = remaining;
      setBoards(remaining);
      if (activeBoardIdRef.current === boardId && remaining[0]) {
        await setWorkspaceActiveBoard(remaining[0].id);
      }
      setPendingStrokeCount(await getOutboxCount(user.uid));
      setStrokeSyncStatus('pending');
      scheduleSync();
    } catch (localError) {
      setError(localError instanceof Error ? localError : new Error('Unable to delete the board locally.'));
    }
  }, [user, isReadOnly, setWorkspaceActiveBoard, scheduleSync]);

  useEffect(() => {
    if (!user) {
      setBoards([]);
      setActiveBoardId('');
      setActiveElements([]);
      setPendingStrokeCount(0);
      setStrokeSyncStatus('saved');
      setLoading(false);
      return;
    }

    let cancelled = false;
    deviceIdRef.current = getDeviceId(user.uid);
    deviceRegisteredRef.current = false;
    void navigator.storage?.persist?.().then((granted) => {
      if (!granted) console.warn('Browser storage is not persistent. Export important boards regularly.');
    }).catch((storageError) => console.warn('Could not request persistent browser storage.', storageError));
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        // Load local state first so opening the app never waits for the network.
        let localBoards = await listLocalBoards(user.uid);
        if (!localBoards.length && navigator.onLine) {
          try {
            const snapshot = await fetchSyncSnapshot();
            await replaceLocalDataFromSnapshot(user.uid, snapshot);
            localBoards = await listLocalBoards(user.uid);
          } catch (snapshotError) {
            console.warn('Server snapshot unavailable; opening the local workspace.', snapshotError);
          }
        }
        if (!localBoards.length) {
          const starter = createStarterBoard();
          await saveNewLocalBoard(user.uid, deviceIdRef.current!, starter);
          localBoards = await listLocalBoards(user.uid);
        }
        if (cancelled) return;
        boardsRef.current = localBoards;
        setBoards(localBoards);
        const storedActiveId = await getActiveBoardId(user.uid);
        const selectedId =
          (storedActiveId && localBoards.some((board) => board.id === storedActiveId) ? storedActiveId : '') ||
          localBoards[0]?.id || '';
        activeBoardIdRef.current = selectedId;
        setActiveBoardId(selectedId);
        setActiveElements(localBoards.find((board) => board.id === selectedId)?.elements ?? []);
        setPendingStrokeCount(await getOutboxCount(user.uid));
        setLoading(false);
        void runSync();
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError : new Error('Unable to open local boards.'));
        setLoading(false);
      }
    })();

    const handleOnline = () => void runSync();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void runSync();
    };
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibility);
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) void runSync();
    }, 15000);

    return () => {
      cancelled = true;
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.clearInterval(interval);
      if (syncTimerRef.current !== null) {
        window.clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
    };
  }, [user, runSync]);

  useEffect(() => () => {
    for (const timer of cameraTimersRef.current.values()) window.clearTimeout(timer);
    cameraTimersRef.current.clear();
  }, []);

  if (error) throw error;

  return {
    boards,
    activeBoardId,
    activeElements,
    loading,
    pendingStrokeCount,
    strokeSyncStatus,
    savePendingStrokes,
    setWorkspaceActiveBoard,
    applyRemoteActiveBoardId,
    syncElementsDiff,
    applyRemoteElementsPatch,
    applyRemoteBoardMetadata,
    refreshFromServer,
    updateBoardMeta,
    persistCameraDebounced,
    createBoard,
    deleteBoard,
  };
}
