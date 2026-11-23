import { useCallback, useEffect, useRef, useState } from 'react';
import { getCurrentSessionUser, onSessionChanged, signOutUser, type SessionUser } from './auth';
import { AuthGate } from './components/AuthGate';
import { BottomToolDock } from './components/BottomToolDock';
import { BoardsDrawer } from './components/BoardsDrawer';
import { ExportMenuSheet } from './components/ExportMenuSheet';
import { SelectionBar } from './components/SelectionBar';
import { TextEditorOverlay } from './components/TextEditorOverlay';
import { TopBar } from './components/TopBar';
import { WhiteboardCanvas } from './components/WhiteboardCanvas';
import { ZoomControls } from './components/ZoomControls';
import { BOARD_TEMPLATES } from './constants/templates';
import { exportBoardToJSON, exportBoardToPNG, exportBoardToSVG } from './engine/export';
import { getCombinedBounds, moveElement } from './engine/geometry';
import { useBoardSync } from './hooks/useBoardSync';
import { useDeviceMode } from './hooks/useDeviceMode';
import { useLocalBoards } from './hooks/useLocalBoards';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import {
  Board,
  BoardTemplateId,
  Camera,
  CanvasElement,
  GridStyle,
  PhoneViewportFrame,
  RemoteCursor,
  StickyElement,
  TextElement,
  ThemeMode,
  ToolSettings,
  ToolType,
} from './types/whiteboard';

export default function App() {
  const { isReadOnly } = useDeviceMode();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let active = true;
    const unsubscribe = onSessionChanged((sessionUser) => {
      if (!active) return;
      setUser(sessionUser);
      setAuthReady(true);
    });
    void getCurrentSessionUser()
      .then((sessionUser) => {
        if (!active) return;
        setUser(sessionUser);
        setAuthReady(true);
      })
      .catch((sessionError) => {
        console.error('Unable to restore Stateflow session.', sessionError);
        if (active) setAuthReady(true);
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const {
    boards,
    activeBoardId,
    activeElements,
    loading: boardsLoading,
    pendingStrokeCount,
    strokeSyncStatus,
    savePendingStrokes,
    setWorkspaceActiveBoard,
    applyRemoteActiveBoardId,
    syncElementsDiff,
    updateBoardMeta,
    persistCameraDebounced,
    createBoard,
    deleteBoard,
    applyRemoteElementsPatch,
    applyRemoteBoardMetadata,
    refreshFromServer,
  } = useLocalBoards(user, isReadOnly);

  // Optimistic local state for 60fps interaction (dragging/moving/pinching/live WS sync)
  const [optimisticElements, setOptimisticElements] = useState<CanvasElement[] | null>(null);
  const [optimisticCamera, setOptimisticCamera] = useState<{
    boardId: string;
    camera: Camera;
  } | null>(null);
  const [optimisticMeta, setOptimisticMeta] = useState<{
    boardId: string;
    title?: string;
    gridStyle?: GridStyle;
  } | null>(null);
  const [remoteDraft, setRemoteDraft] = useState<{
    boardId: string;
    element: CanvasElement | null;
  } | null>(null);
  const [remoteCursor, setRemoteCursor] = useState<{
    boardId: string;
    cursor: RemoteCursor | null;
  } | null>(null);

  const [followPhone, setFollowPhone] = useState<boolean>(true);
  const followPhoneRef = useRef<boolean>(true);
  followPhoneRef.current = followPhone;

  const [zenMode, setZenMode] = useState<boolean>(false);
  const [fingerDrawEnabled, setFingerDrawEnabled] = useState<boolean>(() => {
    return localStorage.getItem('slateflow-finger-draw') === 'true';
  });
  const [fingerHintVisible, setFingerHintVisible] = useState<boolean>(false);
  const fingerHintShownRef = useRef<boolean>(false);
  const fingerHintTimerRef = useRef<number | null>(null);
  const [canvasInteractTick, setCanvasInteractTick] = useState<number>(0);

  const lastWsCameraAtRef = useRef<number>(0);
  const lastWsElementsAtRef = useRef<number>(0);
  const lastLocalEditAtRef = useRef<number>(0);
  const wsSettleTimerRef = useRef<number | null>(null);
  const remoteCursorTimerRef = useRef<number | null>(null);
  const lastRemoteViewportRef = useRef<{ boardId: string; frame: PhoneViewportFrame } | null>(null);
  const lastBroadcastElsRef = useRef<CanvasElement[]>([]);
  const activeBoardIdRef = useRef<string>(activeBoardId);
  activeBoardIdRef.current = activeBoardId;
  const activeElementsRef = useRef<CanvasElement[]>(activeElements);
  activeElementsRef.current = activeElements;
  const optimisticElementsRef = useRef<CanvasElement[] | null>(optimisticElements);
  optimisticElementsRef.current = optimisticElements;

  // Clear optimistic overrides when Firestore snapshot updates (unless a live WS/local edit burst happened very recently)
  useEffect(() => {
    if (
      Date.now() - lastWsElementsAtRef.current >= 1400 &&
      Date.now() - lastLocalEditAtRef.current >= 1400
    ) {
      lastBroadcastElsRef.current = activeElements;
      setOptimisticElements(null);
    }
  }, [activeElements]);

  useEffect(() => {
    setOptimisticElements(null);
    setOptimisticCamera(null);
    setOptimisticMeta(null);
    setRemoteDraft(null);
    setRemoteCursor(null);
    lastWsElementsAtRef.current = 0;
    lastWsCameraAtRef.current = 0;
    if (wsSettleTimerRef.current !== null) {
      window.clearTimeout(wsSettleTimerRef.current);
      wsSettleTimerRef.current = null;
    }
  }, [activeBoardId]);

  useEffect(() => {
    return () => {
      if (wsSettleTimerRef.current !== null) {
        window.clearTimeout(wsSettleTimerRef.current);
      }
      if (remoteCursorTimerRef.current !== null) {
        window.clearTimeout(remoteCursorTimerRef.current);
      }
      if (fingerHintTimerRef.current !== null) {
        window.clearTimeout(fingerHintTimerRef.current);
      }
    };
  }, []);

  const {
    syncStatus,
    sendDraft,
    sendElementsPatch,
    sendCamera,
    sendCursor,
    sendSwitchBoard,
    sendBoardMeta,
  } = useBoardSync(user?.uid ?? null, {
    onRemoteDraft: (boardId, draftElement) => {
      setRemoteDraft((prev) => {
        if (draftElement) return { boardId, element: draftElement };
        if (prev && prev.boardId !== boardId) return prev;
        return null;
      });
    },
    onRemoteDraftAppend: (boardId, id, points) => {
      setRemoteDraft((prev) => {
        if (!prev || prev.boardId !== boardId || !prev.element) return prev;
        if (prev.element.id !== id) return prev;
        if (prev.element.type !== 'pen' && prev.element.type !== 'highlighter') return prev;
        return {
          boardId,
          element: {
            ...prev.element,
            points: [...prev.element.points, ...points],
          },
        };
      });
    },
    onRemoteElementsPatch: (boardId, patch) => {
      if (patch.committed) void applyRemoteElementsPatch(boardId, patch.upserts, patch.deleteIds);
      if (boardId !== activeBoardIdRef.current) return;
      lastWsElementsAtRef.current = Date.now();

      const base = optimisticElementsRef.current ?? activeElementsRef.current;
      let next: CanvasElement[];
      if (patch.clearAll) {
        next = [];
      } else {
        const deleteSet = new Set(patch.deleteIds);
        const upsertMap = new Map(patch.upserts.map((el) => [el.id, el]));
        next = [];
        for (const el of base) {
          if (deleteSet.has(el.id)) continue;
          const replacement = upsertMap.get(el.id);
          if (replacement) {
            next.push(replacement);
            upsertMap.delete(el.id);
          } else {
            next.push(el);
          }
        }
        for (const added of upsertMap.values()) {
          next.push(added);
        }
        next.sort((a, b) => a.zIndex - b.zIndex);
      }

      optimisticElementsRef.current = next;
      setOptimisticElements(next);

      // Atomically clear matching remoteDraft so finished stroke never flickers
      if (patch.upserts.length > 0) {
        const upsertIds = new Set(patch.upserts.map((u) => u.id));
        setRemoteDraft((prev) =>
          prev && prev.boardId === boardId && prev.element && upsertIds.has(prev.element.id)
            ? null
            : prev
        );
      }

      if (wsSettleTimerRef.current !== null) {
        window.clearTimeout(wsSettleTimerRef.current);
      }
      wsSettleTimerRef.current = window.setTimeout(() => {
        wsSettleTimerRef.current = null;
        if (Date.now() - lastWsElementsAtRef.current >= 1350) {
          setOptimisticElements(null);
        }
      }, 1400);
    },
    onRemoteCamera: (boardId, camera, viewport) => {
      if (!isReadOnly) return;
      lastWsCameraAtRef.current = Date.now();
      if (viewport && viewport.width > 0 && viewport.height > 0) {
        const frame: PhoneViewportFrame = {
          camera,
          width: viewport.width,
          height: viewport.height,
        };
        lastRemoteViewportRef.current = { boardId, frame };
      }
      if (followPhoneRef.current) {
        setOptimisticCamera({ boardId, camera });
      }
    },
    onRemoteCursor: (boardId, cursor) => {
      if (!isReadOnly) return;
      if (remoteCursorTimerRef.current !== null) {
        window.clearTimeout(remoteCursorTimerRef.current);
        remoteCursorTimerRef.current = null;
      }
      setRemoteCursor(cursor ? { boardId, cursor } : null);
      if (cursor) {
        remoteCursorTimerRef.current = window.setTimeout(() => {
          remoteCursorTimerRef.current = null;
          setRemoteCursor(null);
        }, 4000);
      }
    },
    onRemoteSwitchBoard: (boardId) => {
      if (!isReadOnly) return;
      applyRemoteActiveBoardId(boardId);
    },
    onRemoteBoardMeta: (boardId, patch) => {
      if (!isReadOnly) return;
      void applyRemoteBoardMetadata(boardId, patch);
      setOptimisticMeta((prev) => ({
        boardId,
        ...(prev && prev.boardId === boardId ? prev : {}),
        ...patch,
      }));
    },
    onRemoteCatalogChange: () => {
      void refreshFromServer();
    },
    onConnected: () => {
      if (!isReadOnly && activeBoardId) sendSwitchBoard(activeBoardId);
      void refreshFromServer();
    },
  });

  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('slateflow-theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return 'dark';
  });

  const [activeTool, setActiveTool] = useState<ToolType>('pen');
  const [settings, setSettings] = useState<ToolSettings>({
    strokeColor: '#3B82F6',
    fillColor: 'tinted',
    strokeWidth: 3.5,
    highlighterColor: '#FACC15',
    highlighterWidth: 24,
    stickyColor: '#FEF08A',
    fontSize: 22,
    activeShape: 'rectangle',
  });

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingElementId, setEditingElementId] = useState<string | null>(null);
  const [boardsOpen, setBoardsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const historyRef = useRef<{ past: CanvasElement[][]; future: CanvasElement[][] }>({
    past: [],
    future: [],
  });
  const [historyTick, setHistoryTick] = useState(0);
  const committedSnapshotRef = useRef<CanvasElement[]>([]);
  const isOnline = useOnlineStatus();

  useEffect(() => {
    committedSnapshotRef.current = activeElements;
  }, [activeElements]);

  // Sync Tailwind .dark class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('slateflow-theme', theme);
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', theme === 'dark' ? '#0F1115' : '#F8F9FB');
    }
  }, [theme]);

  const activeBoardMeta = boards.find((b) => b.id === activeBoardId) ?? boards[0] ?? null;

  // Enter desktop viewing in Follow mode whenever the device switches into read-only mode.
  // Manual panning/zooming still exits Follow until the next desktop-mode entry.
  useEffect(() => {
    if (!isReadOnly) return;
    setFollowPhone(true);
    const latestFrame = lastRemoteViewportRef.current;
    if (latestFrame && latestFrame.boardId === activeBoardIdRef.current) {
      setOptimisticCamera({ boardId: latestFrame.boardId, camera: latestFrame.frame.camera });
    }
  }, [isReadOnly]);

  // Reset desktop optimistic camera from Firestore only when following phone & no recent WS camera arrived
  useEffect(() => {
    if (isReadOnly && activeBoardMeta) {
      if (!followPhoneRef.current) return;
      if (Date.now() - lastWsCameraAtRef.current < 1500) return;
      setOptimisticCamera({ boardId: activeBoardMeta.id, camera: activeBoardMeta.camera });
    }
  }, [isReadOnly, activeBoardMeta?.id, activeBoardMeta?.camera.x, activeBoardMeta?.camera.y, activeBoardMeta?.camera.zoom]);

  const currentElements = optimisticElements ?? activeElements;
  const currentCamera =
    optimisticCamera && activeBoardMeta && optimisticCamera.boardId === activeBoardMeta.id
      ? optimisticCamera.camera
      : activeBoardMeta?.camera ?? { x: 0, y: 0, zoom: 1 };

  const activeBoard: Board | null = activeBoardMeta
    ? {
        ...activeBoardMeta,
        ...(optimisticMeta && optimisticMeta.boardId === activeBoardMeta.id
          ? {
              ...(optimisticMeta.title !== undefined ? { title: optimisticMeta.title } : {}),
              ...(optimisticMeta.gridStyle !== undefined
                ? { gridStyle: optimisticMeta.gridStyle }
                : {}),
            }
          : {}),
        camera: currentCamera,
        elements: currentElements,
      }
    : null;

  const handleElementsChange = useCallback(
    (newElements: CanvasElement[], pushHistory = false) => {
      if (isReadOnly || !activeBoard) return;

      // Stamp newly completed strokes locally before either the journal or WebSocket
      // sees them. This immutable timestamp makes immediate undo/redo safe even if
      // the Firestore snapshot acknowledgement has not arrived yet.
      const previousById = new Map(activeBoard.elements.map((element) => [element.id, element]));
      const normalizedElements = newElements.map((element) => {
        if (element.type !== 'pen' && element.type !== 'highlighter') return element;
        const previous = previousById.get(element.id);
        const previousCreatedAt =
          previous && (previous.type === 'pen' || previous.type === 'highlighter')
            ? previous.createdAtMs
            : undefined;
        const createdAtMs = element.createdAtMs ?? previousCreatedAt ?? Date.now();
        return element.createdAtMs === createdAtMs ? element : { ...element, createdAtMs };
      });

      lastLocalEditAtRef.current = Date.now();
      setOptimisticElements(normalizedElements);
      const prevBroadcast = lastBroadcastElsRef.current;
      lastBroadcastElsRef.current = normalizedElements;
      sendElementsPatch(activeBoard.id, prevBroadcast, normalizedElements, pushHistory);
      if (pushHistory) {
        const previousCommitted = committedSnapshotRef.current;
        historyRef.current.past.push(previousCommitted);
        if (historyRef.current.past.length > 60) historyRef.current.past.shift();
        historyRef.current.future = [];
        setHistoryTick((t) => t + 1);
        committedSnapshotRef.current = normalizedElements;
        void syncElementsDiff(activeBoard.id, previousCommitted, normalizedElements);
      }
    },
    [isReadOnly, activeBoard, sendElementsPatch, syncElementsDiff]
  );

  const handleDraftChange = useCallback(
    (draft: CanvasElement | null) => {
      if (isReadOnly || !activeBoard) return;
      sendDraft(activeBoard.id, draft);
    },
    [isReadOnly, activeBoard, sendDraft]
  );

  const handleUndo = useCallback(() => {
    if (isReadOnly || !activeBoard || historyRef.current.past.length === 0) return;
    lastLocalEditAtRef.current = Date.now();
    const previous = historyRef.current.past.pop()!;
    const current = committedSnapshotRef.current;
    historyRef.current.future.push(current);
    setHistoryTick((t) => t + 1);
    setSelectedIds([]);
    setOptimisticElements(previous);
    lastBroadcastElsRef.current = previous;
    sendElementsPatch(activeBoard.id, current, previous, true);
    committedSnapshotRef.current = previous;
    void syncElementsDiff(activeBoard.id, current, previous);
  }, [isReadOnly, activeBoard, sendElementsPatch, syncElementsDiff]);

  const handleRedo = useCallback(() => {
    if (isReadOnly || !activeBoard || historyRef.current.future.length === 0) return;
    lastLocalEditAtRef.current = Date.now();
    const next = historyRef.current.future.pop()!;
    const current = committedSnapshotRef.current;
    historyRef.current.past.push(current);
    setHistoryTick((t) => t + 1);
    setSelectedIds([]);
    setOptimisticElements(next);
    lastBroadcastElsRef.current = next;
    sendElementsPatch(activeBoard.id, current, next, true);
    committedSnapshotRef.current = next;
    void syncElementsDiff(activeBoard.id, current, next);
  }, [isReadOnly, activeBoard, sendElementsPatch, syncElementsDiff]);

  const handleCameraChange = useCallback(
    (cam: Camera) => {
      if (!activeBoard) return;
      setOptimisticCamera({ boardId: activeBoard.id, camera: cam });
      if (!isReadOnly) {
        sendCamera(activeBoard.id, cam, {
          width: window.innerWidth,
          height: window.innerHeight,
        });
        persistCameraDebounced(activeBoard.id, cam);
      }
    },
    [activeBoard, isReadOnly, sendCamera, persistCameraDebounced]
  );

  const handleLiveTextChange = useCallback(
    (id: string, text: string) => {
      if (isReadOnly || !activeBoard) return;
      const updated = activeBoard.elements.map((e) => {
        if (e.id !== id) return e;
        if (e.type === 'sticky' || e.type === 'text') {
          return { ...e, text };
        }
        return e;
      });
      handleElementsChange(updated, false);
    },
    [isReadOnly, activeBoard, handleElementsChange]
  );

  const handleCommitText = useCallback(
    (id: string, text: string) => {
      setEditingElementId(null);
      if (isReadOnly || !activeBoard) return;
      const trimmed = text.trim();
      const target = activeBoard.elements.find((e) => e.id === id);
      if (!target) return;

      if (target.type === 'text' && trimmed === '') {
        handleElementsChange(
          activeBoard.elements.filter((e) => e.id !== id),
          true
        );
        setSelectedIds([]);
        return;
      }

      const updated = activeBoard.elements.map((e) => {
        if (e.id !== id) return e;
        if (e.type === 'sticky' || e.type === 'text') {
          return { ...e, text };
        }
        return e;
      });
      handleElementsChange(updated, true);
    },
    [isReadOnly, activeBoard, handleElementsChange]
  );

  const handleDeleteSelection = useCallback(() => {
    if (isReadOnly || !activeBoard || selectedIds.length === 0) return;
    const next = activeBoard.elements.filter((e) => !selectedIds.includes(e.id));
    setSelectedIds([]);
    handleElementsChange(next, true);
  }, [isReadOnly, activeBoard, selectedIds, handleElementsChange]);

  const handleDuplicateSelection = useCallback(() => {
    if (isReadOnly || !activeBoard || selectedIds.length === 0) return;
    const maxZ = activeBoard.elements.reduce((m, e) => Math.max(m, e.zIndex), 0);
    const clones: CanvasElement[] = [];
    selectedIds.forEach((id, idx) => {
      const orig = activeBoard.elements.find((e) => e.id === id);
      if (!orig) return;
      const moved = moveElement(orig, 28, 28);
      clones.push({
        ...moved,
        id: `${orig.type}-${Date.now()}-${idx}`,
        zIndex: maxZ + idx + 1,
      });
    });
    if (clones.length > 0) {
      handleElementsChange([...activeBoard.elements, ...clones], true);
      setSelectedIds(clones.map((c) => c.id));
    }
  }, [isReadOnly, activeBoard, selectedIds, handleElementsChange]);

  const handleBringToFront = useCallback(() => {
    if (isReadOnly || !activeBoard || selectedIds.length === 0) return;
    let maxZ = activeBoard.elements.reduce((m, e) => Math.max(m, e.zIndex), 0);
    const next = activeBoard.elements.map((e) =>
      selectedIds.includes(e.id) ? { ...e, zIndex: ++maxZ } : e
    );
    handleElementsChange(next, true);
  }, [isReadOnly, activeBoard, selectedIds, handleElementsChange]);

  const handleSendToBack = useCallback(() => {
    if (isReadOnly || !activeBoard || selectedIds.length === 0) return;
    let minZ = activeBoard.elements.reduce((m, e) => Math.min(m, e.zIndex), 0);
    const next = activeBoard.elements.map((e) =>
      selectedIds.includes(e.id) ? { ...e, zIndex: --minZ } : e
    );
    handleElementsChange(next, true);
  }, [isReadOnly, activeBoard, selectedIds, handleElementsChange]);

  const handleApplyColorToSelection = useCallback(
    (hex: string) => {
      if (isReadOnly || !activeBoard || selectedIds.length === 0) return;
      const next = activeBoard.elements.map((el) => {
        if (!selectedIds.includes(el.id)) return el;
        if (el.type === 'pen' || el.type === 'highlighter' || el.type === 'text') {
          return { ...el, color: hex };
        }
        if (el.type === 'line' || el.type === 'arrow') {
          return { ...el, strokeColor: hex };
        }
        if (el.type === 'rectangle' || el.type === 'ellipse' || el.type === 'diamond') {
          return {
            ...el,
            strokeColor: hex,
            fillColor: el.fillColor !== 'transparent' ? `${hex}1A` : 'transparent',
          };
        }
        return el;
      });
      handleElementsChange(next, true);
    },
    [isReadOnly, activeBoard, selectedIds, handleElementsChange]
  );

  const handleImportImage = useCallback(
    (file: File) => {
      if (isReadOnly || !activeBoard) return;
      const reader = new FileReader();
      reader.onload = () => {
        const rawUrl = reader.result as string;
        const img = new Image();
        img.onload = () => {
          // Compress for fast Firestore persistence well under 1MB document limit
          const maxExportDim = 640;
          const compScale = Math.min(1, maxExportDim / Math.max(img.width, img.height));
          const cw = Math.max(64, Math.round(img.width * compScale));
          const ch = Math.max(64, Math.round(img.height * compScale));
          const offscreen = document.createElement('canvas');
          offscreen.width = cw;
          offscreen.height = ch;
          const octx = offscreen.getContext('2d');
          let compactUrl = rawUrl;
          if (octx) {
            octx.drawImage(img, 0, 0, cw, ch);
            compactUrl = offscreen.toDataURL('image/jpeg', 0.78);
          }

          const maxDim = 360;
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const w = Math.max(80, Math.round(img.width * scale));
          const h = Math.max(80, Math.round(img.height * scale));
          const maxZ = activeBoard.elements.reduce((m, e) => Math.max(m, e.zIndex), 0);
          const el: CanvasElement = {
            id: `image-${Date.now()}`,
            type: 'image',
            x: activeBoard.camera.x - w / 2,
            y: activeBoard.camera.y - h / 2,
            width: w,
            height: h,
            dataUrl: compactUrl,
            opacity: 1,
            zIndex: maxZ + 1,
          };
          handleElementsChange([...activeBoard.elements, el], true);
          setSelectedIds([el.id]);
          setActiveTool('select');
        };
        img.src = rawUrl;
      };
      reader.readAsDataURL(file);
    },
    [isReadOnly, activeBoard, handleElementsChange]
  );

  const handleFitContent = useCallback(() => {
    if (!activeBoard) return;
    if (activeBoard.elements.length === 0) {
      handleCameraChange({ x: 0, y: 0, zoom: 1 });
      return;
    }
    const b = getCombinedBounds(activeBoard.elements);
    if (!b) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pad = 120;
    const zoom = Math.min(
      2,
      Math.max(
        0.15,
        Math.min((vw - pad) / Math.max(100, b.width), (vh - pad * 1.4) / Math.max(100, b.height))
      )
    );
    handleCameraChange({
      x: b.x + b.width / 2,
      y: b.y + b.height / 2,
      zoom,
    });
  }, [activeBoard, handleCameraChange]);

  const handleFingerPanHint = useCallback(() => {
    if (fingerHintShownRef.current) return;
    fingerHintShownRef.current = true;
    setFingerHintVisible(true);
    if (fingerHintTimerRef.current !== null) {
      window.clearTimeout(fingerHintTimerRef.current);
    }
    fingerHintTimerRef.current = window.setTimeout(() => {
      fingerHintTimerRef.current = null;
      setFingerHintVisible(false);
    }, 4200);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (isReadOnly) {
        if (e.key.toLowerCase() === 'f') {
          e.preventDefault();
          setZenMode((z) => !z);
        } else if (e.key === 'Escape') {
          setZenMode(false);
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        handleDuplicateSelection();
      } else if ((e.key === 'Backspace' || e.key === 'Delete') && selectedIds.length > 0) {
        e.preventDefault();
        handleDeleteSelection();
      } else if (e.key === 'v') setActiveTool('select');
      else if (e.key === 'h') setActiveTool('pan');
      else if (e.key === 'p') setActiveTool('pen');
      else if (e.key === 'e') setActiveTool('eraser');
      else if (e.key === 'r') setActiveTool('rectangle');
      else if (e.key === 'o') setActiveTool('ellipse');
      else if (e.key === 'a') setActiveTool('arrow');
      else if (e.key === 't') setActiveTool('text');
      else if (e.key === 's') setActiveTool('sticky');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    isReadOnly,
    handleUndo,
    handleRedo,
    handleDuplicateSelection,
    handleDeleteSelection,
    selectedIds.length,
  ]);

  const switchBoard = (id: string) => {
    setSelectedIds([]);
    setEditingElementId(null);
    historyRef.current = { past: [], future: [] };
    setHistoryTick((t) => t + 1);
    if (!isReadOnly) sendSwitchBoard(id);
    void setWorkspaceActiveBoard(id);
  };

  const handleCreateBoard = async (
    templateId: BoardTemplateId = 'blank',
    requestedTitle?: string
  ) => {
    if (isReadOnly) return;
    const num = boards.length + 1;
    const tpl = BOARD_TEMPLATES.find((t) => t.id === templateId) ?? BOARD_TEMPLATES[0];
    const baseTitle = templateId === 'blank' ? `Board ${num}` : tpl.defaultTitle;
    const existingTitles = new Set(boards.map((board) => board.title.trim().toLocaleLowerCase()));
    let defaultTitle = baseTitle;
    if (existingTitles.has(defaultTitle.toLocaleLowerCase())) {
      let suffix = 2;
      while (existingTitles.has(`${baseTitle} ${suffix}`.toLocaleLowerCase())) suffix += 1;
      defaultTitle = `${baseTitle} ${suffix}`;
    }
    const title = requestedTitle?.trim().slice(0, 120) || defaultTitle;

    const newId = await createBoard(
      title,
      tpl.createElements(),
      tpl.gridStyle,
      tpl.camera
    );
    if (newId) switchBoard(newId);
  };

  const handleDuplicateBoard = async (id: string) => {
    if (isReadOnly) return;
    const orig = boards.find((b) => b.id === id);
    if (!orig) return;
    const els = id === activeBoardId ? activeElements : orig.elements;
    const newId = await createBoard(
      `${orig.title} (Copy)`,
      els.map((e, idx) => ({ ...e, id: `${e.type}-${Date.now()}-${idx}` })),
      orig.gridStyle,
      orig.camera
    );
    if (newId) switchBoard(newId);
  };

  const handleDeleteBoard = async (id: string) => {
    if (isReadOnly || boards.length <= 1) return;
    await deleteBoard(id);
  };

  const handleImportJSON = (file: File) => {
    if (isReadOnly) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(reader.result as string) as Board;
        if (!Array.isArray(parsed.elements)) return;
        const newId = await createBoard(
          parsed.title || 'Imported Board',
          parsed.elements,
          parsed.gridStyle || 'dots',
          parsed.camera || { x: 0, y: 0, zoom: 1 }
        );
        if (newId) switchBoard(newId);
      } catch {
        // Ignore malformed files
      }
    };
    reader.readAsText(file);
  };

  if (!authReady) {
    return (
      <div className="h-dvh w-full flex items-center justify-center bg-[#F8F9FB] dark:bg-[#0F1115] text-slate-600 dark:text-slate-300 text-sm font-medium">
        Loading SlateFlow...
      </div>
    );
  }

  if (!user) {
    return (
      <AuthGate
        isReadOnly={isReadOnly}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      />
    );
  }

  if (boardsLoading || !activeBoard) {
    return (
      <div className="h-dvh w-full flex items-center justify-center bg-[#F8F9FB] dark:bg-[#0F1115] text-slate-600 dark:text-slate-300 text-sm font-medium">
        Syncing your cloud boards...
      </div>
    );
  }

  const editingElement =
    !isReadOnly && editingElementId
      ? (activeBoard.elements.find(
          (e) => e.id === editingElementId && (e.type === 'text' || e.type === 'sticky')
        ) as TextElement | StickyElement | undefined) ?? null
      : null;

  const activeRemoteDraft =
    remoteDraft && remoteDraft.boardId === activeBoard.id ? remoteDraft.element : null;
  const activeRemoteCursor =
    remoteCursor && remoteCursor.boardId === activeBoard.id ? remoteCursor.cursor : null;

  const toggleFingerDraw = () => {
    setFingerDrawEnabled((prev) => {
      const next = !prev;
      localStorage.setItem('slateflow-finger-draw', String(next));
      return next;
    });
    setFingerHintVisible(false);
  };

  const handleToggleFollowPhone = () => {
    setFollowPhone((prev) => {
      const next = !prev;
      if (next && activeBoard) {
        const snapCam =
          lastRemoteViewportRef.current &&
          lastRemoteViewportRef.current.boardId === activeBoard.id
            ? lastRemoteViewportRef.current.frame.camera
            : activeBoardMeta?.camera ?? activeBoard.camera;
        setOptimisticCamera({ boardId: activeBoard.id, camera: snapCam });
      }
      return next;
    });
  };

  const effectiveSyncStatus = isOnline
    ? syncStatus === 'connected'
      ? 'connected'
      : 'connecting'
    : 'offline';

  void historyTick;

  return (
    <main className="relative w-full h-dvh overflow-hidden bg-[#F8F9FB] dark:bg-[#0F1115]">
      <TopBar
        boardTitle={activeBoard.title}
        isReadOnly={isReadOnly}
        syncStatus={effectiveSyncStatus}
        strokeSyncStatus={strokeSyncStatus}
        pendingChangeCount={pendingStrokeCount}
        onSaveNow={() => void savePendingStrokes().catch(() => undefined)}
        followPhone={followPhone}
        onToggleFollowPhone={handleToggleFollowPhone}
        zenMode={zenMode}
        onToggleZenMode={() => setZenMode((z) => !z)}
        fingerDrawEnabled={fingerDrawEnabled}
        onToggleFingerDraw={toggleFingerDraw}
        onRenameBoard={(title) => {
          if (isReadOnly) return;
          sendBoardMeta(activeBoard.id, { title });
          void updateBoardMeta(activeBoard.id, { title });
        }}
        onOpenBoards={() => setBoardsOpen(true)}
        onOpenMenu={() => setMenuOpen(true)}
        canUndo={historyRef.current.past.length > 0}
        canRedo={historyRef.current.future.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      />

      <WhiteboardCanvas
        elements={activeBoard.elements}
        remoteDraftElement={activeRemoteDraft}
        remoteCursor={activeRemoteCursor}
        camera={activeBoard.camera}
        gridStyle={activeBoard.gridStyle}
        theme={theme}
        activeTool={isReadOnly ? 'pan' : activeTool}
        settings={settings}
        selectedIds={isReadOnly ? [] : selectedIds}
        editingElementId={isReadOnly ? null : editingElementId}
        isReadOnly={isReadOnly}
        fingerDrawEnabled={fingerDrawEnabled}
        onCameraChange={handleCameraChange}
        onElementsChange={handleElementsChange}
        onDraftChange={handleDraftChange}
        onLocalCursorChange={(cursor) => {
          if (!isReadOnly && activeBoard) sendCursor(activeBoard.id, cursor);
        }}
        onCanvasInteract={() => setCanvasInteractTick((t) => t + 1)}
        onFingerPanHint={handleFingerPanHint}
        onUserPanOrZoom={() => {
          if (isReadOnly && followPhoneRef.current) {
            setFollowPhone(false);
          }
        }}
        onSelectIds={setSelectedIds}
        onStartEditText={(el) => {
          if (!isReadOnly) setEditingElementId(el.id);
        }}
        onSelectTool={setActiveTool}
      />

      {!(isReadOnly && zenMode) && (
        <ZoomControls
          zoom={activeBoard.camera.zoom}
          onZoomIn={() => {
            if (isReadOnly) setFollowPhone(false);
            handleCameraChange({
              ...activeBoard.camera,
              zoom: Math.min(5, activeBoard.camera.zoom * 1.25),
            });
          }}
          onZoomOut={() => {
            if (isReadOnly) setFollowPhone(false);
            handleCameraChange({
              ...activeBoard.camera,
              zoom: Math.max(0.1, activeBoard.camera.zoom / 1.25),
            });
          }}
          onResetZoom={() => {
            if (isReadOnly) setFollowPhone(false);
            handleCameraChange({ x: 0, y: 0, zoom: 1 });
          }}
          onFitContent={() => {
            if (isReadOnly) setFollowPhone(false);
            handleFitContent();
          }}
        />
      )}

      {!isReadOnly && (
        <>
          <SelectionBar
            selectedCount={selectedIds.length}
            onDuplicate={handleDuplicateSelection}
            onBringToFront={handleBringToFront}
            onSendToBack={handleSendToBack}
            onDelete={handleDeleteSelection}
            onApplyColor={handleApplyColorToSelection}
          />

          <BottomToolDock
            activeTool={activeTool}
            selectedCount={selectedIds.length}
            canvasInteractTick={canvasInteractTick}
            onSelectTool={(tool) => {
              setActiveTool(tool);
              if (tool !== 'select') setSelectedIds([]);
            }}
            settings={settings}
            onUpdateSettings={(patch) => setSettings((s) => ({ ...s, ...patch }))}
            onImportImage={handleImportImage}
          />

          <TextEditorOverlay
            element={editingElement}
            camera={activeBoard.camera}
            viewport={{ width: window.innerWidth, height: window.innerHeight }}
            onLiveChange={handleLiveTextChange}
            onCommit={handleCommitText}
            onCancel={() => {
              if (
                editingElement &&
                editingElement.type === 'text' &&
                editingElement.text === ''
              ) {
                handleElementsChange(
                  activeBoard.elements.filter((e) => e.id !== editingElement.id),
                  false
                );
              }
              setEditingElementId(null);
            }}
          />
        </>
      )}

      <BoardsDrawer
        open={boardsOpen}
        isReadOnly={isReadOnly}
        theme={theme}
        onClose={() => setBoardsOpen(false)}
        boards={boards.map((b) =>
          b.id === activeBoard.id ? { ...b, elements: activeBoard.elements } : b
        )}
        activeBoardId={activeBoard.id}
        onSelectBoard={switchBoard}
        onCreateBoard={handleCreateBoard}
        onDuplicateBoard={handleDuplicateBoard}
        onDeleteBoard={handleDeleteBoard}
      />

      <ExportMenuSheet
        open={menuOpen}
        isReadOnly={isReadOnly}
        fingerDrawEnabled={fingerDrawEnabled}
        onToggleFingerDraw={toggleFingerDraw}
        userEmail={user.email}
        onSignOut={() => void signOutUser()}
        onClose={() => setMenuOpen(false)}
        gridStyle={activeBoard.gridStyle}
        onChangeGrid={(gridStyle: GridStyle) => {
          if (isReadOnly) return;
          sendBoardMeta(activeBoard.id, { gridStyle });
          void updateBoardMeta(activeBoard.id, { gridStyle });
        }}
        onExportPNG={(transparent) => exportBoardToPNG(activeBoard, theme, transparent)}
        onExportSVG={(transparent) => exportBoardToSVG(activeBoard, theme, transparent)}
        onExportJSON={() => exportBoardToJSON(activeBoard)}
        onImportJSON={handleImportJSON}
        onClearBoard={() => {
          if (isReadOnly) return;
          setSelectedIds([]);
          handleElementsChange([], true);
        }}
      />

      {!isReadOnly && fingerHintVisible && (
        <div
          role="status"
          className="fixed top-16 right-3 z-30 max-w-[270px] px-3 py-2 rounded-2xl bg-slate-900/90 dark:bg-white/95 text-white dark:text-slate-900 text-xs font-medium shadow-lg pointer-events-auto flex items-center gap-2"
        >
          <span>Finger moves camera. Tap the hand icon above to draw with finger.</span>
          <button
            type="button"
            onClick={() => setFingerHintVisible(false)}
            className="text-blue-400 dark:text-blue-600 font-semibold shrink-0"
          >
            OK
          </button>
        </div>
      )}

      {!isOnline && (
        <div
          role="status"
          className="fixed top-16 left-1/2 -translate-x-1/2 z-30 px-3 py-1.5 rounded-xl bg-amber-500 text-white text-xs font-semibold shadow-lg pointer-events-none"
        >
          Offline Mode — Changes queued for sync
        </div>
      )}
    </main>
  );
}
