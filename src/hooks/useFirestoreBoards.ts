import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { createStarterElements } from '../constants/starter';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  Board,
  Camera,
  CanvasElement,
  GridStyle,
  Point,
} from '../types/whiteboard';

function toMillis(val: unknown): number {
  if (val instanceof Timestamp) return val.toMillis();
  if (typeof val === 'number') return val;
  return Date.now();
}

function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 120);
  return cleaned || `id-${Date.now()}`;
}

function clampCamera(cam: Camera): Camera {
  return {
    x: Number.isFinite(cam.x) ? cam.x : 0,
    y: Number.isFinite(cam.y) ? cam.y : 0,
    zoom: Number.isFinite(cam.zoom) ? Math.min(5, Math.max(0.1, cam.zoom)) : 1,
  };
}

function decimatePoints(points: Point[], maxPoints = 3500): Point[] {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  const out: Point[] = [];
  for (let i = 0; i < points.length; i += step) {
    const p = points[i];
    out.push({
      x: p.x,
      y: p.y,
      pressure: typeof p.pressure === 'number' ? p.pressure : 0.5,
    });
  }
  const last = points[points.length - 1];
  if (out[out.length - 1] !== last) {
    out.push({
      x: last.x,
      y: last.y,
      pressure: typeof last.pressure === 'number' ? last.pressure : 0.5,
    });
  }
  return out;
}

function serializeElementForFirestore(
  el: CanvasElement,
  ownerId: string,
  boardId: string,
  isCreate: boolean
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    ownerId,
    boardId,
    type: el.type,
    zIndex: el.zIndex,
    opacity: Math.min(1, Math.max(0, el.opacity ?? 1)),
    updatedAt: serverTimestamp(),
  };
  if (isCreate) {
    base.createdAt = serverTimestamp();
  }
  if (typeof el.locked === 'boolean') base.locked = el.locked;

  switch (el.type) {
    case 'pen':
    case 'highlighter': {
      const pts = decimatePoints(el.points).map((p) => ({
        x: p.x,
        y: p.y,
        pressure: typeof p.pressure === 'number' ? p.pressure : 0.5,
      }));
      base.points = pts.length > 0 ? pts : [{ x: 0, y: 0, pressure: 0.5 }];
      base.color = el.color.slice(0, 64);
      base.strokeWidth = el.strokeWidth;
      break;
    }
    case 'rectangle':
    case 'ellipse':
    case 'diamond':
      base.x = el.x;
      base.y = el.y;
      base.width = el.width;
      base.height = el.height;
      base.strokeColor = el.strokeColor.slice(0, 64);
      base.fillColor = el.fillColor.slice(0, 64);
      base.strokeWidth = el.strokeWidth;
      break;
    case 'line':
    case 'arrow':
      base.x1 = el.x1;
      base.y1 = el.y1;
      base.x2 = el.x2;
      base.y2 = el.y2;
      base.strokeColor = el.strokeColor.slice(0, 64);
      base.strokeWidth = el.strokeWidth;
      break;
    case 'sticky':
      base.x = el.x;
      base.y = el.y;
      base.width = el.width;
      base.height = el.height;
      base.text = el.text.slice(0, 8000);
      base.bgColor = el.bgColor.slice(0, 64);
      base.textColor = el.textColor.slice(0, 64);
      break;
    case 'text':
      base.x = el.x;
      base.y = el.y;
      base.width = el.width;
      base.height = el.height;
      base.text = el.text.slice(0, 8000);
      base.color = el.color.slice(0, 64);
      base.fontSize = el.fontSize;
      break;
    case 'image':
      base.x = el.x;
      base.y = el.y;
      base.width = el.width;
      base.height = el.height;
      base.dataUrl = el.dataUrl.slice(0, 700000);
      break;
  }

  return base;
}

/**
 * Compare the data that syncElementsDiff writes to Firestore.
 *
 * Timestamp fields are intentionally excluded: syncElementsDiff generates a new
 * updatedAt value only after this comparison has established a real content change.
 */
/**
 * Compare the persisted element fields rather than JavaScript object identity.
 * Keep in lockstep with serializeElementForFirestore; timestamps are metadata.
 */
export function areElementDocumentsEqual(previous: CanvasElement, next: CanvasElement): boolean {
  if (
    previous.id !== next.id ||
    previous.type !== next.type ||
    previous.zIndex !== next.zIndex ||
    Math.min(1, Math.max(0, previous.opacity ?? 1)) !==
      Math.min(1, Math.max(0, next.opacity ?? 1)) ||
    previous.locked !== next.locked
  ) return false;

  const sameString = (a: string, b: string, max: number) =>
    a.slice(0, max) === b.slice(0, max);

  switch (next.type) {
    case 'pen':
    case 'highlighter': {
      if (
        previous.type !== next.type ||
        !sameString(previous.color, next.color, 64) ||
        previous.strokeWidth !== next.strokeWidth
      ) return false;
      const a = decimatePoints(previous.points);
      const b = decimatePoints(next.points);
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i += 1) {
        if (
          a[i].x !== b[i].x ||
          a[i].y !== b[i].y ||
          (typeof a[i].pressure === 'number' ? a[i].pressure : 0.5) !==
            (typeof b[i].pressure === 'number' ? b[i].pressure : 0.5)
        ) return false;
      }
      return true;
    }
    case 'rectangle':
    case 'ellipse':
    case 'diamond':
      return previous.type === next.type &&
        previous.x === next.x && previous.y === next.y &&
        previous.width === next.width && previous.height === next.height &&
        sameString(previous.strokeColor, next.strokeColor, 64) &&
        sameString(previous.fillColor, next.fillColor, 64) &&
        previous.strokeWidth === next.strokeWidth;
    case 'line':
    case 'arrow':
      return previous.type === next.type &&
        previous.x1 === next.x1 && previous.y1 === next.y1 &&
        previous.x2 === next.x2 && previous.y2 === next.y2 &&
        sameString(previous.strokeColor, next.strokeColor, 64) &&
        previous.strokeWidth === next.strokeWidth;
    case 'sticky':
      return previous.type === 'sticky' &&
        previous.x === next.x && previous.y === next.y &&
        previous.width === next.width && previous.height === next.height &&
        sameString(previous.text, next.text, 8000) &&
        sameString(previous.bgColor, next.bgColor, 64) &&
        sameString(previous.textColor, next.textColor, 64);
    case 'text':
      return previous.type === 'text' &&
        previous.x === next.x && previous.y === next.y &&
        previous.width === next.width && previous.height === next.height &&
        sameString(previous.text, next.text, 8000) &&
        sameString(previous.color, next.color, 64) &&
        previous.fontSize === next.fontSize;
    case 'image':
      return previous.type === 'image' &&
        previous.x === next.x && previous.y === next.y &&
        previous.width === next.width && previous.height === next.height &&
        sameString(previous.dataUrl, next.dataUrl, 700000);
  }
}

function docToElement(id: string, data: Record<string, unknown>): CanvasElement {
  const type = String(data.type) as CanvasElement['type'];
  const base = {
    id,
    zIndex: Number(data.zIndex ?? 1),
    opacity: Number(data.opacity ?? 1),
    ...(typeof data.locked === 'boolean' ? { locked: data.locked } : {}),
  };

  switch (type) {
    case 'pen':
    case 'highlighter':
      return {
        ...base,
        type,
        points: Array.isArray(data.points) ? (data.points as Point[]) : [],
        color: String(data.color ?? '#3B82F6'),
        strokeWidth: Number(data.strokeWidth ?? 3.5),
      };
    case 'rectangle':
    case 'ellipse':
    case 'diamond':
      return {
        ...base,
        type,
        x: Number(data.x ?? 0),
        y: Number(data.y ?? 0),
        width: Number(data.width ?? 100),
        height: Number(data.height ?? 100),
        strokeColor: String(data.strokeColor ?? '#3B82F6'),
        fillColor: String(data.fillColor ?? 'transparent'),
        strokeWidth: Number(data.strokeWidth ?? 2.5),
      };
    case 'line':
    case 'arrow':
      return {
        ...base,
        type,
        x1: Number(data.x1 ?? 0),
        y1: Number(data.y1 ?? 0),
        x2: Number(data.x2 ?? 0),
        y2: Number(data.y2 ?? 0),
        strokeColor: String(data.strokeColor ?? '#3B82F6'),
        strokeWidth: Number(data.strokeWidth ?? 2.5),
      };
    case 'sticky':
      return {
        ...base,
        type: 'sticky',
        x: Number(data.x ?? 0),
        y: Number(data.y ?? 0),
        width: Number(data.width ?? 210),
        height: Number(data.height ?? 180),
        text: String(data.text ?? ''),
        bgColor: String(data.bgColor ?? '#FEF08A'),
        textColor: String(data.textColor ?? '#1E293B'),
      };
    case 'text':
      return {
        ...base,
        type: 'text',
        x: Number(data.x ?? 0),
        y: Number(data.y ?? 0),
        width: Number(data.width ?? 260),
        height: Number(data.height ?? 44),
        text: String(data.text ?? ''),
        color: String(data.color ?? '#3B82F6'),
        fontSize: Number(data.fontSize ?? 22),
      };
    case 'image':
      return {
        ...base,
        type: 'image',
        x: Number(data.x ?? 0),
        y: Number(data.y ?? 0),
        width: Number(data.width ?? 240),
        height: Number(data.height ?? 180),
        dataUrl: String(data.dataUrl ?? ''),
      };
  }
}

export function useFirestoreBoards(user: User | null, isReadOnly: boolean) {
  const [boards, setBoards] = useState<Board[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string>('');
  const [activeElements, setActiveElements] = useState<CanvasElement[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const elementsMapRef = useRef<Map<string, CanvasElement[]>>(new Map());
  const cameraSaveTimerRef = useRef<number | null>(null);
  const seededRef = useRef<boolean>(false);

  // Throw async listener errors inside render so ErrorBoundary catches them
  if (error) {
    throw error;
  }

  // Subscribe to workspaces/{uid} and boards collection
  useEffect(() => {
    if (!user) {
      setBoards([]);
      setActiveBoardId('');
      setActiveElements([]);
      setLoading(false);
      seededRef.current = false;
      return;
    }

    setLoading(true);
    const uid = user.uid;

    const workspacePath = `workspaces/${uid}`;
    const unsubWorkspace = onSnapshot(
      doc(db, 'workspaces', uid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const remoteActiveId = String(data.activeBoardId || '');
          if (remoteActiveId) {
            setActiveBoardId((prev) => {
              if (isReadOnly || !prev) return remoteActiveId;
              return prev;
            });
          }
        }
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.GET, workspacePath);
        } catch (wrapped) {
          setError(wrapped as Error);
        }
      }
    );

    const boardsQuery = query(collection(db, 'boards'), where('ownerId', '==', uid));
    const unsubBoards = onSnapshot(
      boardsQuery,
      async (snapshot) => {
        if (snapshot.empty) {
          if (!seededRef.current) {
            seededRef.current = true;
            try {
              const starterId = sanitizeId(`board-${Date.now()}-starter`);
              await setDoc(doc(db, 'boards', starterId), {
                ownerId: uid,
                title: 'Product Flow',
                gridStyle: 'dots',
                camera: { x: 0, y: 0, zoom: 1 },
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
              const starterEls = createStarterElements();
              const batch = writeBatch(db);
              for (const el of starterEls) {
                const elId = sanitizeId(el.id);
                batch.set(
                  doc(db, 'boards', starterId, 'elements', elId),
                  serializeElementForFirestore(el, uid, starterId, true)
                );
              }
              await batch.commit();
              await setDoc(doc(db, 'workspaces', uid), {
                ownerId: uid,
                activeBoardId: starterId,
                updatedAt: serverTimestamp(),
              });
            } catch (err) {
              try {
                handleFirestoreError(err, OperationType.CREATE, 'boards');
              } catch (wrapped) {
                setError(wrapped as Error);
              }
            }
          }
          return;
        }

        const list: Board[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            title: String(data.title ?? 'Untitled Board'),
            gridStyle: (data.gridStyle as GridStyle) || 'dots',
            camera: clampCamera((data.camera as Camera) || { x: 0, y: 0, zoom: 1 }),
            createdAt: toMillis(data.createdAt),
            updatedAt: toMillis(data.updatedAt),
            elements: elementsMapRef.current.get(d.id) ?? [],
          };
        });
        list.sort((a, b) => b.updatedAt - a.updatedAt);

        setBoards(list);
        setActiveBoardId((curr) => {
          if (curr && list.some((b) => b.id === curr)) return curr;
          return list[0]?.id ?? '';
        });
        setLoading(false);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'boards');
        } catch (wrapped) {
          setError(wrapped as Error);
        }
      }
    );

    return () => {
      unsubWorkspace();
      unsubBoards();
      if (cameraSaveTimerRef.current !== null) {
        window.clearTimeout(cameraSaveTimerRef.current);
      }
    };
  }, [user, isReadOnly]);

  // Subscribe to elements subcollection of activeBoardId
  useEffect(() => {
    if (!user || !activeBoardId) {
      setActiveElements([]);
      return;
    }
    const uid = user.uid;
    const elementsPath = `boards/${activeBoardId}/elements`;
    const q = query(
      collection(db, 'boards', activeBoardId, 'elements'),
      where('ownerId', '==', uid)
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const els: CanvasElement[] = snapshot.docs.map((d) =>
          docToElement(d.id, d.data() as Record<string, unknown>)
        );
        els.sort((a, b) => a.zIndex - b.zIndex);
        elementsMapRef.current.set(activeBoardId, els);
        setActiveElements(els);
        setBoards((prev) =>
          prev.map((b) => (b.id === activeBoardId ? { ...b, elements: els } : b))
        );
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, elementsPath);
        } catch (wrapped) {
          setError(wrapped as Error);
        }
      }
    );

    return () => unsub();
  }, [user, activeBoardId]);

  const setWorkspaceActiveBoard = useCallback(
    async (boardId: string) => {
      setActiveBoardId(boardId);
      if (!user || isReadOnly) return;
      const cleanId = sanitizeId(boardId);
      const path = `workspaces/${user.uid}`;
      try {
        await setDoc(
          doc(db, 'workspaces', user.uid),
          {
            ownerId: user.uid,
            activeBoardId: cleanId,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, path);
      }
    },
    [user, isReadOnly]
  );

  const syncElementsDiff = useCallback(
    async (boardId: string, prevEls: CanvasElement[], nextEls: CanvasElement[]) => {
      if (!user || isReadOnly) return;
      const uid = user.uid;
      const prevMap = new Map(prevEls.map((e) => [e.id, e]));
      const nextMap = new Map(nextEls.map((e) => [e.id, e]));

      const toDelete: string[] = [];
      for (const id of prevMap.keys()) {
        if (!nextMap.has(id)) toDelete.push(id);
      }

      const toWrite: { el: CanvasElement; isCreate: boolean }[] = [];
      for (const el of nextEls) {
        const old = prevMap.get(el.id);
        if (!old) {
          toWrite.push({ el, isCreate: true });
        } else if (!areElementDocumentsEqual(old, el)) {
          toWrite.push({ el, isCreate: false });
        }
      }

      if (toDelete.length === 0 && toWrite.length === 0) return;

      const ops: Array<() => void> = [];
      const batch = writeBatch(db);

      for (const id of toDelete) {
        const ref = doc(db, 'boards', boardId, 'elements', sanitizeId(id));
        ops.push(() => batch.delete(ref));
      }
      for (const item of toWrite) {
        const ref = doc(db, 'boards', boardId, 'elements', sanitizeId(item.el.id));
        const payload = serializeElementForFirestore(item.el, uid, boardId, item.isCreate);
        if (item.isCreate) {
          ops.push(() => batch.set(ref, payload));
        } else {
          ops.push(() => batch.update(ref, payload));
        }
      }

      // Apply in chunks of 450 ops max
      if (ops.length <= 450) {
        ops.forEach((fn) => fn());
        try {
          await batch.commit();
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `boards/${boardId}/elements`);
        }
      } else {
        for (let i = 0; i < toDelete.length; i += 400) {
          const b = writeBatch(db);
          toDelete.slice(i, i + 400).forEach((id) =>
            b.delete(doc(db, 'boards', boardId, 'elements', sanitizeId(id)))
          );
          try {
            await b.commit();
          } catch (err) {
            handleFirestoreError(err, OperationType.DELETE, `boards/${boardId}/elements`);
          }
        }
        for (let i = 0; i < toWrite.length; i += 400) {
          const b = writeBatch(db);
          toWrite.slice(i, i + 400).forEach((item) => {
            const ref = doc(db, 'boards', boardId, 'elements', sanitizeId(item.el.id));
            const payload = serializeElementForFirestore(item.el, uid, boardId, item.isCreate);
            if (item.isCreate) b.set(ref, payload);
            else b.update(ref, payload);
          });
          try {
            await b.commit();
          } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, `boards/${boardId}/elements`);
          }
        }
      }
    },
    [user, isReadOnly]
  );

  const updateBoardMeta = useCallback(
    async (boardId: string, patch: { title?: string; gridStyle?: GridStyle }) => {
      if (!user || isReadOnly) return;
      const path = `boards/${boardId}`;
      try {
        await updateDoc(doc(db, 'boards', boardId), {
          ...(patch.title !== undefined
            ? { title: patch.title.trim().slice(0, 120) || 'Untitled Board' }
            : {}),
          ...(patch.gridStyle !== undefined ? { gridStyle: patch.gridStyle } : {}),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    },
    [user, isReadOnly]
  );

  const persistCameraDebounced = useCallback(
    (boardId: string, cam: Camera) => {
      if (!user || isReadOnly) return;
      if (cameraSaveTimerRef.current !== null) {
        window.clearTimeout(cameraSaveTimerRef.current);
      }
      cameraSaveTimerRef.current = window.setTimeout(async () => {
        cameraSaveTimerRef.current = null;
        const path = `boards/${boardId}`;
        try {
          await updateDoc(doc(db, 'boards', boardId), {
            camera: clampCamera(cam),
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, path);
        }
      }, 250);
    },
    [user, isReadOnly]
  );

  const applyRemoteActiveBoardId = useCallback((boardId: string) => {
    if (!boardId) return;
    setActiveBoardId((prev) => (prev === boardId ? prev : boardId));
  }, []);

  const createBoardInFirestore = useCallback(
    async (title: string, elements: CanvasElement[] = [], gridStyle: GridStyle = 'dots', camera: Camera = { x: 0, y: 0, zoom: 1 }) => {
      if (!user || isReadOnly) return null;
      const uid = user.uid;
      const boardId = sanitizeId(`board-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
      const path = `boards/${boardId}`;
      try {
        await setDoc(doc(db, 'boards', boardId), {
          ownerId: uid,
          title: title.trim().slice(0, 120) || 'Untitled Board',
          gridStyle,
          camera: clampCamera(camera),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        if (elements.length > 0) {
          for (let i = 0; i < elements.length; i += 400) {
            const batch = writeBatch(db);
            elements.slice(i, i + 400).forEach((el) => {
              const elId = sanitizeId(el.id);
              batch.set(
                doc(db, 'boards', boardId, 'elements', elId),
                serializeElementForFirestore(el, uid, boardId, true)
              );
            });
            await batch.commit();
          }
        }
        await setWorkspaceActiveBoard(boardId);
        return boardId;
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }
    },
    [user, isReadOnly, setWorkspaceActiveBoard]
  );

  const deleteBoardInFirestore = useCallback(
    async (boardId: string) => {
      if (!user || isReadOnly || boards.length <= 1) return;
      const uid = user.uid;
      try {
        const snap = await getDocs(
          query(collection(db, 'boards', boardId, 'elements'), where('ownerId', '==', uid))
        );
        if (!snap.empty) {
          for (let i = 0; i < snap.docs.length; i += 400) {
            const batch = writeBatch(db);
            snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
            await batch.commit();
          }
        }
        await deleteDoc(doc(db, 'boards', boardId));
        const remaining = boards.filter((b) => b.id !== boardId);
        if (activeBoardId === boardId && remaining[0]) {
          await setWorkspaceActiveBoard(remaining[0].id);
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `boards/${boardId}`);
      }
    },
    [user, isReadOnly, boards, activeBoardId, setWorkspaceActiveBoard]
  );

  return {
    boards,
    activeBoardId,
    activeElements,
    loading,
    setWorkspaceActiveBoard,
    applyRemoteActiveBoardId,
    syncElementsDiff,
    updateBoardMeta,
    persistCameraDebounced,
    createBoardInFirestore,
    deleteBoardInFirestore,
  };
}
