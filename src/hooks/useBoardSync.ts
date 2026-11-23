import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CanvasElement, GridStyle, Point, RemoteCursor } from '../types/whiteboard';

export type SyncStatus = 'connecting' | 'connected' | 'offline';

export interface ElementsPatch {
  upserts: CanvasElement[];
  deleteIds: string[];
  clearAll?: boolean;
}

interface UseLiveRelayOptions {
  onRemoteDraft: (boardId: string, draftElement: CanvasElement | null) => void;
  onRemoteDraftAppend: (boardId: string, id: string, points: Point[]) => void;
  onRemoteElementsPatch: (boardId: string, patch: ElementsPatch) => void;
  onRemoteCamera: (
    boardId: string,
    camera: Camera,
    viewport?: { width: number; height: number }
  ) => void;
  onRemoteCursor: (boardId: string, cursor: RemoteCursor | null) => void;
  onRemoteSwitchBoard: (boardId: string) => void;
  onRemoteBoardMeta: (boardId: string, patch: { title?: string; gridStyle?: GridStyle }) => void;
}

const STREAM_INTERVAL_MS = 16;

export function useBoardSync(uid: string | null, options: UseLiveRelayOptions) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('connecting');
  const wsRef = useRef<WebSocket | null>(null);
  const clientIdRef = useRef<string>(
    `client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const reconnectTimerRef = useRef<number | null>(null);
  const attemptRef = useRef(0);

  // Draft streaming state (60fps + point delta append)
  const lastDraftSentAtRef = useRef(0);
  const lastDraftIdRef = useRef<string | null>(null);
  const lastSentPointsCountRef = useRef(0);
  const pendingDraftRef = useRef<{ boardId: string; draftElement: CanvasElement } | null>(null);
  const draftFlushTimerRef = useRef<number | null>(null);

  // Camera streaming state (60fps leading + trailing flush)
  const lastCameraSentAtRef = useRef(0);
  const pendingCameraRef = useRef<{
    boardId: string;
    camera: Camera;
    viewport?: { width: number; height: number };
  } | null>(null);
  const cameraFlushTimerRef = useRef<number | null>(null);

  // Cursor streaming state (60fps)
  const lastCursorSentAtRef = useRef(0);

  // Elements delta streaming state (60fps live drag/erase + immediate commit)
  const lastPatchSentAtRef = useRef(0);
  const pendingPatchBaseRef = useRef<{ boardId: string; baseEls: CanvasElement[]; nextEls: CanvasElement[] } | null>(null);
  const patchFlushTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!uid) {
      setSyncStatus('offline');
      return;
    }

    let disposed = false;

    const connect = () => {
      if (disposed) return;
      if (
        wsRef.current &&
        (wsRef.current.readyState === WebSocket.OPEN ||
          wsRef.current.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }
      setSyncStatus('connecting');
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) return;
        attemptRef.current = 0;
        setSyncStatus('connected');
        ws.send(
          JSON.stringify({
            type: 'relay:join',
            uid,
            clientId: clientIdRef.current,
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as Record<string, unknown>;
          if (msg.clientId === clientIdRef.current) return;
          const boardId = String(msg.boardId || '');

          if (msg.type === 'board:draft') {
            optionsRef.current.onRemoteDraft(
              boardId,
              (msg.draftElement as CanvasElement | null) ?? null
            );
          } else if (msg.type === 'board:draft-append') {
            const id = String(msg.id || '');
            const points = Array.isArray(msg.points) ? (msg.points as Point[]) : [];
            if (id && points.length > 0) {
              optionsRef.current.onRemoteDraftAppend(boardId, id, points);
            }
          } else if (msg.type === 'board:elements-patch') {
            optionsRef.current.onRemoteElementsPatch(boardId, {
              upserts: Array.isArray(msg.upserts) ? (msg.upserts as CanvasElement[]) : [],
              deleteIds: Array.isArray(msg.deleteIds) ? (msg.deleteIds as string[]) : [],
              clearAll: Boolean(msg.clearAll),
            });
          } else if (msg.type === 'board:camera' && msg.camera) {
            optionsRef.current.onRemoteCamera(
              boardId,
              msg.camera as Camera,
              msg.viewport as { width: number; height: number } | undefined
            );
          } else if (msg.type === 'board:cursor') {
            optionsRef.current.onRemoteCursor(
              boardId,
              (msg.cursor as RemoteCursor | null) ?? null
            );
          } else if (msg.type === 'board:switch' && boardId) {
            optionsRef.current.onRemoteSwitchBoard(boardId);
          } else if (msg.type === 'board:meta' && boardId) {
            optionsRef.current.onRemoteBoardMeta(boardId, {
              ...(typeof msg.title === 'string' ? { title: msg.title } : {}),
              ...(typeof msg.gridStyle === 'string'
                ? { gridStyle: msg.gridStyle as GridStyle }
                : {}),
            });
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (disposed) return;
        setSyncStatus('offline');
        wsRef.current = null;
        const delay = Math.min(5000, 300 * Math.pow(1.6, attemptRef.current++));
        reconnectTimerRef.current = window.setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    const handleWake = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
          if (reconnectTimerRef.current !== null) {
            window.clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
          }
          attemptRef.current = 0;
          connect();
        }
      }
    };

    connect();
    window.addEventListener('online', handleWake);
    document.addEventListener('visibilitychange', handleWake);

    return () => {
      disposed = true;
      window.removeEventListener('online', handleWake);
      document.removeEventListener('visibilitychange', handleWake);
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      if (draftFlushTimerRef.current !== null) {
        window.clearTimeout(draftFlushTimerRef.current);
      }
      if (cameraFlushTimerRef.current !== null) {
        window.clearTimeout(cameraFlushTimerRef.current);
      }
      if (patchFlushTimerRef.current !== null) {
        window.clearTimeout(patchFlushTimerRef.current);
      }
      wsRef.current?.close();
    };
  }, [uid]);

  const sendWS = useCallback(
    (payload: Record<string, unknown>): boolean => {
      if (!uid) return false;
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ ...payload, uid, clientId: clientIdRef.current }));
        return true;
      }
      return false;
    },
    [uid]
  );

  const flushDraftNow = useCallback(
    (boardId: string, draftElement: CanvasElement) => {
      lastDraftSentAtRef.current = performance.now();
      const isStroke = draftElement.type === 'pen' || draftElement.type === 'highlighter';
      if (
        isStroke &&
        lastDraftIdRef.current === draftElement.id &&
        draftElement.points.length >= lastSentPointsCountRef.current
      ) {
        const deltaPoints = draftElement.points.slice(lastSentPointsCountRef.current);
        if (deltaPoints.length > 0) {
          lastSentPointsCountRef.current = draftElement.points.length;
          sendWS({
            type: 'board:draft-append',
            boardId,
            id: draftElement.id,
            points: deltaPoints,
          });
        }
        return;
      }

      lastDraftIdRef.current = draftElement.id;
      lastSentPointsCountRef.current = isStroke ? draftElement.points.length : 0;
      sendWS({ type: 'board:draft', boardId, draftElement });
    },
    [sendWS]
  );

  const sendDraft = useCallback(
    (boardId: string, draftElement: CanvasElement | null) => {
      if (draftElement === null) {
        if (draftFlushTimerRef.current !== null) {
          window.clearTimeout(draftFlushTimerRef.current);
          draftFlushTimerRef.current = null;
        }
        pendingDraftRef.current = null;
        lastDraftIdRef.current = null;
        lastSentPointsCountRef.current = 0;
        lastDraftSentAtRef.current = performance.now();
        sendWS({ type: 'board:draft', boardId, draftElement: null });
        return;
      }

      const now = performance.now();
      const elapsed = now - lastDraftSentAtRef.current;
      if (elapsed >= STREAM_INTERVAL_MS || lastDraftIdRef.current !== draftElement.id) {
        if (draftFlushTimerRef.current !== null) {
          window.clearTimeout(draftFlushTimerRef.current);
          draftFlushTimerRef.current = null;
        }
        pendingDraftRef.current = null;
        flushDraftNow(boardId, draftElement);
      } else {
        pendingDraftRef.current = { boardId, draftElement };
        if (draftFlushTimerRef.current === null) {
          draftFlushTimerRef.current = window.setTimeout(() => {
            draftFlushTimerRef.current = null;
            const pending = pendingDraftRef.current;
            if (pending) {
              pendingDraftRef.current = null;
              flushDraftNow(pending.boardId, pending.draftElement);
            }
          }, STREAM_INTERVAL_MS - elapsed);
        }
      }
    },
    [flushDraftNow, sendWS]
  );

  const flushElementsPatch = useCallback(
    (boardId: string, prevEls: CanvasElement[], nextEls: CanvasElement[]) => {
      lastPatchSentAtRef.current = performance.now();
      if (nextEls.length === 0 && prevEls.length > 0) {
        sendWS({
          type: 'board:elements-patch',
          boardId,
          upserts: [],
          deleteIds: [],
          clearAll: true,
        });
        return;
      }

      const prevMap = new Map(prevEls.map((e) => [e.id, e]));
      const nextMap = new Map(nextEls.map((e) => [e.id, e]));

      const deleteIds: string[] = [];
      for (const id of prevMap.keys()) {
        if (!nextMap.has(id)) deleteIds.push(id);
      }

      const upserts: CanvasElement[] = [];
      for (const el of nextEls) {
        const old = prevMap.get(el.id);
        if (!old || old !== el) {
          upserts.push(el);
        }
      }

      if (upserts.length === 0 && deleteIds.length === 0) return;

      sendWS({
        type: 'board:elements-patch',
        boardId,
        upserts,
        deleteIds,
      });
    },
    [sendWS]
  );

  const sendElementsPatch = useCallback(
    (
      boardId: string,
      prevEls: CanvasElement[],
      nextEls: CanvasElement[],
      immediate: boolean
    ) => {
      if (immediate) {
        if (patchFlushTimerRef.current !== null) {
          window.clearTimeout(patchFlushTimerRef.current);
          patchFlushTimerRef.current = null;
        }
        const pendingBase =
          pendingPatchBaseRef.current && pendingPatchBaseRef.current.boardId === boardId
            ? pendingPatchBaseRef.current.baseEls
            : prevEls;
        pendingPatchBaseRef.current = null;
        flushElementsPatch(boardId, pendingBase, nextEls);
        return;
      }

      const now = performance.now();
      const elapsed = now - lastPatchSentAtRef.current;
      if (elapsed >= STREAM_INTERVAL_MS) {
        if (patchFlushTimerRef.current !== null) {
          window.clearTimeout(patchFlushTimerRef.current);
          patchFlushTimerRef.current = null;
        }
        const base =
          pendingPatchBaseRef.current && pendingPatchBaseRef.current.boardId === boardId
            ? pendingPatchBaseRef.current.baseEls
            : prevEls;
        pendingPatchBaseRef.current = null;
        flushElementsPatch(boardId, base, nextEls);
      } else {
        if (!pendingPatchBaseRef.current || pendingPatchBaseRef.current.boardId !== boardId) {
          pendingPatchBaseRef.current = { boardId, baseEls: prevEls, nextEls };
        } else {
          pendingPatchBaseRef.current.nextEls = nextEls;
        }
        if (patchFlushTimerRef.current === null) {
          patchFlushTimerRef.current = window.setTimeout(() => {
            patchFlushTimerRef.current = null;
            const pending = pendingPatchBaseRef.current;
            if (pending) {
              pendingPatchBaseRef.current = null;
              flushElementsPatch(pending.boardId, pending.baseEls, pending.nextEls);
            }
          }, STREAM_INTERVAL_MS - elapsed);
        }
      }
    },
    [flushElementsPatch]
  );

  const sendCamera = useCallback(
    (boardId: string, camera: Camera, viewport?: { width: number; height: number }) => {
      const now = performance.now();
      const elapsed = now - lastCameraSentAtRef.current;
      if (elapsed >= STREAM_INTERVAL_MS) {
        lastCameraSentAtRef.current = now;
        pendingCameraRef.current = null;
        if (cameraFlushTimerRef.current !== null) {
          window.clearTimeout(cameraFlushTimerRef.current);
          cameraFlushTimerRef.current = null;
        }
        sendWS({ type: 'board:camera', boardId, camera, viewport });
      } else {
        pendingCameraRef.current = { boardId, camera, viewport };
        if (cameraFlushTimerRef.current === null) {
          cameraFlushTimerRef.current = window.setTimeout(() => {
            cameraFlushTimerRef.current = null;
            const pending = pendingCameraRef.current;
            if (pending) {
              pendingCameraRef.current = null;
              lastCameraSentAtRef.current = performance.now();
              sendWS({
                type: 'board:camera',
                boardId: pending.boardId,
                camera: pending.camera,
                viewport: pending.viewport,
              });
            }
          }, STREAM_INTERVAL_MS - elapsed);
        }
      }
    },
    [sendWS]
  );

  const sendCursor = useCallback(
    (boardId: string, cursor: RemoteCursor | null) => {
      const now = performance.now();
      if (cursor !== null && now - lastCursorSentAtRef.current < STREAM_INTERVAL_MS) {
        return;
      }
      lastCursorSentAtRef.current = now;
      sendWS({ type: 'board:cursor', boardId, cursor });
    },
    [sendWS]
  );

  const sendSwitchBoard = useCallback(
    (boardId: string) => {
      sendWS({ type: 'board:switch', boardId });
    },
    [sendWS]
  );

  const sendBoardMeta = useCallback(
    (boardId: string, patch: { title?: string; gridStyle?: GridStyle }) => {
      sendWS({ type: 'board:meta', boardId, ...patch });
    },
    [sendWS]
  );

  return {
    syncStatus,
    sendDraft,
    sendElementsPatch,
    sendCamera,
    sendCursor,
    sendSwitchBoard,
    sendBoardMeta,
  };
}
