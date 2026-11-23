import React, { useCallback, useEffect, useRef } from 'react';
import {
  getCombinedBounds,
  getElementBounds,
  hitTestElement,
  hitTestHandle,
  isElementInMarquee,
  moveElement,
  resizeSingleElement,
  screenToWorld,
} from '../engine/geometry';
import { HoverCursor, renderWhiteboard } from '../engine/renderer';
import {
  Bounds,
  Camera,
  CanvasElement,
  GridStyle,
  Point,
  RemoteCursor,
  ResizeHandle,
  StickyElement,
  StrokeElement,
  TextElement,
  ThemeMode,
  ToolSettings,
  ToolType,
} from '../types/whiteboard';
import { STICKY_COLORS } from '../constants/palette';

interface WhiteboardCanvasProps {
  elements: CanvasElement[];
  remoteDraftElement?: CanvasElement | null;
  remoteCursor?: RemoteCursor | null;
  camera: Camera;
  gridStyle: GridStyle;
  theme: ThemeMode;
  activeTool: ToolType;
  settings: ToolSettings;
  selectedIds: string[];
  editingElementId: string | null;
  isReadOnly?: boolean;
  fingerDrawEnabled?: boolean;
  onCameraChange: (camera: Camera) => void;
  onElementsChange: (elements: CanvasElement[], pushHistory?: boolean) => void;
  onDraftChange?: (draft: CanvasElement | null) => void;
  onLocalCursorChange?: (cursor: RemoteCursor | null) => void;
  onCanvasInteract?: () => void;
  onFingerPanHint?: () => void;
  onUserPanOrZoom?: () => void;
  onSelectIds: (ids: string[]) => void;
  onStartEditText: (el: TextElement | StickyElement) => void;
  onSelectTool: (tool: ToolType) => void;
}

type InteractionMode =
  | { kind: 'none' }
  | {
      kind: 'pan';
      startScreen: Point;
      startCamera: Camera;
      pointerType: string;
      moved: boolean;
    }
  | { kind: 'pinch'; prevDist: number; prevMid: Point }
  | { kind: 'draw-stroke'; draft: StrokeElement; lastTime: number; lastPoint: Point }
  | { kind: 'draw-shape'; startWorld: Point; draft: CanvasElement }
  | {
      kind: 'erase';
      workingElements: CanvasElement[];
      erasedAny: boolean;
      trail: Point[];
    }
  | {
      kind: 'move';
      startWorld: Point;
      initialElements: CanvasElement[];
      moved: boolean;
    }
  | {
      kind: 'resize';
      handle: ResizeHandle;
      startWorld: Point;
      initialElements: CanvasElement[];
      initialBoundsMap: Map<string, Bounds>;
      resized: boolean;
    }
  | { kind: 'marquee'; startWorld: Point; box: Bounds };

interface TrackedPointer {
  point: Point;
  pointerType: string;
}

function isStylusEraserPressed(e: React.PointerEvent<HTMLCanvasElement>): boolean {
  const pt = e.pointerType as string;
  if (pt === 'eraser') return true;
  // W3C Pointer Events / Android Chromium maps S Pen barrel button to bit 32 (button 5)
  // and some browsers/OEM stacks map it to secondary button bit 2 (button 2).
  if ((e.buttons & 32) !== 0 || e.button === 5) return true;
  if (pt === 'pen' && ((e.buttons & 2) !== 0 || e.button === 2)) return true;
  return false;
}

export const WhiteboardCanvas: React.FC<WhiteboardCanvasProps> = ({
  elements,
  remoteDraftElement = null,
  remoteCursor = null,
  camera,
  gridStyle,
  theme,
  activeTool,
  settings,
  selectedIds,
  editingElementId,
  isReadOnly = false,
  fingerDrawEnabled = false,
  onCameraChange,
  onElementsChange,
  onDraftChange,
  onLocalCursorChange,
  onCanvasInteract,
  onFingerPanHint,
  onUserPanOrZoom,
  onSelectIds,
  onStartEditText,
  onSelectTool,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointersRef = useRef<Map<number, TrackedPointer>>(new Map());
  const modeRef = useRef<InteractionMode>({ kind: 'none' });
  const draftRef = useRef<CanvasElement | null>(null);
  const marqueeRef = useRef<Bounds | null>(null);
  const eraserTrailRef = useRef<Point[]>([]);
  const hoverCursorRef = useRef<HoverCursor | null>(null);
  const spaceDownRef = useRef(false);
  const lastTapRef = useRef<{ time: number; id: string } | null>(null);
  const rafRef = useRef<number | null>(null);

  const propsRef = useRef({
    elements,
    remoteDraftElement,
    remoteCursor,
    camera,
    gridStyle,
    theme,
    activeTool,
    settings,
    selectedIds,
    editingElementId,
    isReadOnly,
    fingerDrawEnabled,
  });
  propsRef.current = {
    elements,
    remoteDraftElement,
    remoteCursor,
    camera,
    gridStyle,
    theme,
    activeTool,
    settings,
    selectedIds,
    editingElementId,
    isReadOnly,
    fingerDrawEnabled,
  };

  const scheduleRender = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width === 0 || height === 0) return;

      if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
      }

      const p = propsRef.current;
      renderWhiteboard(ctx, {
        width,
        height,
        dpr,
        camera: p.camera,
        elements: p.elements,
        draftElement: draftRef.current ?? p.remoteDraftElement ?? null,
        selectedIds: p.isReadOnly ? [] : p.selectedIds,
        marqueeBox: p.isReadOnly ? null : marqueeRef.current,
        eraserTrail: p.isReadOnly ? [] : eraserTrailRef.current,
        gridStyle: p.gridStyle,
        theme: p.theme,
        editingElementId: p.isReadOnly ? null : p.editingElementId,
        remoteCursor: p.isReadOnly ? p.remoteCursor : null,
        hoverCursor: p.isReadOnly ? null : hoverCursorRef.current,
        onImageLoaded: scheduleRender,
      });
    });
  }, []);

  useEffect(() => {
    scheduleRender();
  }, [
    elements,
    remoteDraftElement,
    remoteCursor,
    camera,
    gridStyle,
    theme,
    selectedIds,
    editingElementId,
    isReadOnly,
    scheduleRender,
  ]);

  useEffect(() => {
    const onResize = () => scheduleRender();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [scheduleRender]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isInputFocused()) {
        spaceDownRef.current = true;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceDownRef.current = false;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  function isInputFocused() {
    const tag = document.activeElement?.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA';
  }

  const nextZIndex = (els: CanvasElement[]) =>
    els.reduce((max, e) => Math.max(max, e.zIndex), 0) + 1;

  const makeId = (prefix: string) =>
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const currentKind = modeRef.current.kind;
    const activePenOrMouseGesture =
      currentKind === 'draw-stroke' ||
      currentKind === 'draw-shape' ||
      currentKind === 'erase' ||
      currentKind === 'move' ||
      currentKind === 'resize' ||
      currentKind === 'marquee';

    // Palm rejection: ignore touch events while actively drawing/editing with stylus or mouse
    if (e.pointerType === 'touch' && activePenOrMouseGesture) {
      return;
    }

    canvas.setPointerCapture(e.pointerId);

    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    pointersRef.current.set(e.pointerId, {
      point: { x: sx, y: sy },
      pointerType: e.pointerType,
    });

    const touchPts = Array.from(pointersRef.current.values())
      .filter((p) => p.pointerType === 'touch')
      .map((p) => p.point);

    if (touchPts.length === 2) {
      const dist = Math.hypot(touchPts[1].x - touchPts[0].x, touchPts[1].y - touchPts[0].y);
      const mid = {
        x: (touchPts[0].x + touchPts[1].x) / 2,
        y: (touchPts[0].y + touchPts[1].y) / 2,
      };
      draftRef.current = null;
      onDraftChange?.(null);
      marqueeRef.current = null;
      eraserTrailRef.current = [];
      modeRef.current = { kind: 'pinch', prevDist: Math.max(1, dist), prevMid: mid };
      scheduleRender();
      return;
    }

    if (pointersRef.current.size > 2) return;

    const {
      camera: cam,
      activeTool: tool,
      settings: cfg,
      elements: els,
      selectedIds: sel,
      isReadOnly: readOnly,
      fingerDrawEnabled: allowFingerDraw,
    } = propsRef.current;

    onCanvasInteract?.();

    const forcePanByTouch = e.pointerType === 'touch' && !allowFingerDraw;
    const stylusEraser = isStylusEraserPressed(e);
    const effectiveTool: ToolType = stylusEraser ? 'eraser' : tool;

    // When Finger Draw is OFF (default), finger touch dragging ALWAYS moves the camera
    // (never writes/draws/erases), alongside read-only mode, middle mouse, Spacebar, or Pan tool.
    if (readOnly || forcePanByTouch || e.button === 1 || spaceDownRef.current || effectiveTool === 'pan') {
      if (readOnly) onUserPanOrZoom?.();
      modeRef.current = {
        kind: 'pan',
        startScreen: { x: sx, y: sy },
        startCamera: { ...cam },
        pointerType: e.pointerType,
        moved: false,
      };
      return;
    }

    const world = screenToWorld(sx, sy, cam, rect.width, rect.height);
    onLocalCursorChange?.({
      x: world.x,
      y: world.y,
      color: effectiveTool === 'highlighter' ? cfg.highlighterColor : cfg.strokeColor,
      active: true,
      tool: effectiveTool,
    });

    if (effectiveTool === 'pen' || effectiveTool === 'highlighter') {
      const isPen = e.pointerType === 'pen';
      const pressure = isPen && e.pressure > 0 ? e.pressure : 0.5;
      const draft: StrokeElement = {
        id: makeId(effectiveTool),
        type: effectiveTool,
        points: [{ x: world.x, y: world.y, pressure }],
        color: effectiveTool === 'highlighter' ? cfg.highlighterColor : cfg.strokeColor,
        strokeWidth: effectiveTool === 'highlighter' ? cfg.highlighterWidth : cfg.strokeWidth,
        opacity: 1,
        zIndex: nextZIndex(els),
      };
      draftRef.current = draft;
      onDraftChange?.(draft);
      modeRef.current = {
        kind: 'draw-stroke',
        draft,
        lastTime: performance.now(),
        lastPoint: world,
      };
      scheduleRender();
      return;
    }

    if (effectiveTool === 'eraser') {
      const hit = [...els]
        .sort((a, b) => b.zIndex - a.zIndex)
        .find((el) => !el.locked && hitTestElement(el, world.x, world.y, cam.zoom));
      let workingElements = els;
      let erasedAny = false;
      if (hit) {
        erasedAny = true;
        workingElements = els.filter((el) => el.id !== hit.id);
        onElementsChange(workingElements, false);
      }
      hoverCursorRef.current = {
        x: world.x,
        y: world.y,
        radius: 14 / cam.zoom,
        isEraser: true,
        color: cfg.strokeColor,
      };
      eraserTrailRef.current = [world];
      modeRef.current = {
        kind: 'erase',
        workingElements,
        erasedAny,
        trail: [world],
      };
      scheduleRender();
      return;
    }

    if (
      effectiveTool === 'rectangle' ||
      effectiveTool === 'ellipse' ||
      effectiveTool === 'diamond' ||
      effectiveTool === 'line' ||
      effectiveTool === 'arrow'
    ) {
      let draft: CanvasElement;
      if (effectiveTool === 'line' || effectiveTool === 'arrow') {
        draft = {
          id: makeId(effectiveTool),
          type: effectiveTool,
          x1: world.x,
          y1: world.y,
          x2: world.x,
          y2: world.y,
          strokeColor: cfg.strokeColor,
          strokeWidth: cfg.strokeWidth,
          opacity: 1,
          zIndex: nextZIndex(els),
        };
      } else {
      const fill =
          cfg.fillColor === 'tinted' ? `${cfg.strokeColor}1A` : 'transparent';
        draft = {
          id: makeId(effectiveTool),
          type: effectiveTool,
          x: world.x,
          y: world.y,
          width: 0,
          height: 0,
          strokeColor: cfg.strokeColor,
          fillColor: fill,
          strokeWidth: cfg.strokeWidth,
          opacity: 1,
          zIndex: nextZIndex(els),
        };
      }
      draftRef.current = draft;
      onDraftChange?.(draft);
      modeRef.current = { kind: 'draw-shape', startWorld: world, draft };
      scheduleRender();
      return;
    }

    if (effectiveTool === 'sticky') {
      const paletteEntry =
        STICKY_COLORS.find((c) => c.bg === cfg.stickyColor) ?? STICKY_COLORS[0];
      const sticky: StickyElement = {
        id: makeId('sticky'),
        type: 'sticky',
        x: world.x - 105,
        y: world.y - 90,
        width: 210,
        height: 180,
        text: '',
        bgColor: paletteEntry.bg,
        textColor: paletteEntry.text,
        opacity: 1,
        zIndex: nextZIndex(els),
      };
      onElementsChange([...els, sticky], true);
      onSelectIds([sticky.id]);
      onStartEditText(sticky);
      onSelectTool('select');
      return;
    }

    if (effectiveTool === 'text') {
      const textEl: TextElement = {
        id: makeId('text'),
        type: 'text',
        x: world.x,
        y: world.y - cfg.fontSize / 2,
        width: 260,
        height: Math.max(44, cfg.fontSize * 1.6),
        text: '',
        color: cfg.strokeColor,
        fontSize: cfg.fontSize,
        opacity: 1,
        zIndex: nextZIndex(els),
      };
      onElementsChange([...els, textEl], true);
      onSelectIds([textEl.id]);
      onStartEditText(textEl);
      onSelectTool('select');
      return;
    }

    if (effectiveTool === 'select') {
      const selectedEls = els.filter((el) => sel.includes(el.id));
      const handle = hitTestHandle(selectedEls, world.x, world.y, cam.zoom);

      if (handle && selectedEls.length > 0) {
        const boundsMap = new Map<string, Bounds>();
        selectedEls.forEach((el) => boundsMap.set(el.id, getElementBounds(el)));
        modeRef.current = {
          kind: 'resize',
          handle,
          startWorld: world,
          initialElements: els,
          initialBoundsMap: boundsMap,
          resized: false,
        };
        return;
      }

      const hit = [...els]
        .sort((a, b) => b.zIndex - a.zIndex)
        .find((el) => hitTestElement(el, world.x, world.y, cam.zoom));

      if (hit) {
        const now = Date.now();
        if (
          (hit.type === 'text' || hit.type === 'sticky') &&
          lastTapRef.current &&
          lastTapRef.current.id === hit.id &&
          now - lastTapRef.current.time < 360
        ) {
          lastTapRef.current = null;
          onSelectIds([hit.id]);
          onStartEditText(hit);
          return;
        }
        lastTapRef.current = { time: now, id: hit.id };

        let nextSel = sel;
        if (e.shiftKey) {
          nextSel = sel.includes(hit.id)
            ? sel.filter((id) => id !== hit.id)
            : [...sel, hit.id];
          onSelectIds(nextSel);
        } else if (!sel.includes(hit.id)) {
          nextSel = [hit.id];
          onSelectIds(nextSel);
        }

        modeRef.current = {
          kind: 'move',
          startWorld: world,
          initialElements: els,
          moved: false,
        };
        return;
      }

      onSelectIds([]);
      const box = { x: world.x, y: world.y, width: 0, height: 0 };
      marqueeRef.current = box;
      modeRef.current = { kind: 'marquee', startWorld: world, box };
      scheduleRender();
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const {
      camera: cam,
      elements: els,
      selectedIds: sel,
      isReadOnly: readOnly,
      activeTool: tool,
      settings: cfg,
    } = propsRef.current;

    const stylusEraser = isStylusEraserPressed(e);
    const hoverTool: ToolType = stylusEraser ? 'eraser' : tool;

    // Hover preview & live cursor streaming for stylus / mouse even before pressing down
    if (!readOnly && e.pointerType !== 'touch') {
      const hoverWorld = screenToWorld(sx, sy, cam, rect.width, rect.height);
      const isActiveDown = pointersRef.current.has(e.pointerId);
      onLocalCursorChange?.({
        x: hoverWorld.x,
        y: hoverWorld.y,
        color: hoverTool === 'highlighter' ? cfg.highlighterColor : cfg.strokeColor,
        active: isActiveDown,
        tool: hoverTool,
      });

      if (hoverTool === 'pen' || hoverTool === 'highlighter' || hoverTool === 'eraser') {
        hoverCursorRef.current = {
          x: hoverWorld.x,
          y: hoverWorld.y,
          radius:
            hoverTool === 'eraser'
              ? 14 / cam.zoom
              : (hoverTool === 'highlighter' ? cfg.highlighterWidth : cfg.strokeWidth) / 2,
          isEraser: hoverTool === 'eraser',
          color: hoverTool === 'highlighter' ? cfg.highlighterColor : cfg.strokeColor,
        };
        if (!isActiveDown) scheduleRender();
      } else if (hoverCursorRef.current) {
        hoverCursorRef.current = null;
        if (!isActiveDown) scheduleRender();
      }
    }

    const tracked = pointersRef.current.get(e.pointerId);
    if (!tracked) return;

    pointersRef.current.set(e.pointerId, {
      point: { x: sx, y: sy },
      pointerType: tracked.pointerType,
    });

    const mode = modeRef.current;

    if (mode.kind === 'pinch') {
      const touchPts = Array.from(pointersRef.current.values())
        .filter((p) => p.pointerType === 'touch')
        .map((p) => p.point);
      if (touchPts.length !== 2) return;

      if (readOnly) onUserPanOrZoom?.();

      const dist = Math.max(1, Math.hypot(touchPts[1].x - touchPts[0].x, touchPts[1].y - touchPts[0].y));
      const mid = {
        x: (touchPts[0].x + touchPts[1].x) / 2,
        y: (touchPts[0].y + touchPts[1].y) / 2,
      };

      const scaleFactor = dist / mode.prevDist;
      const newZoom = Math.min(5, Math.max(0.1, cam.zoom * scaleFactor));

      const worldBefore = screenToWorld(mode.prevMid.x, mode.prevMid.y, cam, rect.width, rect.height);
      const newCamX = worldBefore.x - (mid.x - rect.width / 2) / newZoom;
      const newCamY = worldBefore.y - (mid.y - rect.height / 2) / newZoom;

      mode.prevDist = dist;
      mode.prevMid = mid;
      onCameraChange({ x: newCamX, y: newCamY, zoom: newZoom });
      return;
    }

    if (mode.kind === 'pan') {
      const dxScreen = sx - mode.startScreen.x;
      const dyScreen = sy - mode.startScreen.y;
      const threshold = mode.pointerType === 'touch' ? 5 : 0;
      if (!mode.moved) {
        if (Math.hypot(dxScreen, dyScreen) < threshold) return;
        mode.moved = true;
        if (threshold > 0) {
          mode.startScreen = { x: sx, y: sy };
          return;
        }
      }
      if (readOnly) onUserPanOrZoom?.();
      const dx = dxScreen / mode.startCamera.zoom;
      const dy = dyScreen / mode.startCamera.zoom;
      onCameraChange({
        ...mode.startCamera,
        x: mode.startCamera.x - dx,
        y: mode.startCamera.y - dy,
      });
      return;
    }

    if (readOnly) return;

    const world = screenToWorld(sx, sy, cam, rect.width, rect.height);
    if (e.pointerType === 'touch') {
      onLocalCursorChange?.({
        x: world.x,
        y: world.y,
        color: tool === 'highlighter' ? cfg.highlighterColor : cfg.strokeColor,
        active: true,
        tool,
      });
    }

    if (mode.kind === 'draw-stroke') {
      // Handle S Pen barrel button pressed just after tip touched screen
      if (stylusEraser) {
        let workingElements = els;
        if (mode.draft.points.length > 6) {
          workingElements = [...els, mode.draft];
          onElementsChange(workingElements, true);
        }
        draftRef.current = null;
        onDraftChange?.(null);

        const remaining = workingElements.filter(
          (el) => el.locked || !hitTestElement(el, world.x, world.y, cam.zoom)
        );
        const erasedAny = remaining.length !== workingElements.length;
        if (erasedAny) {
          onElementsChange(remaining, false);
        }
        hoverCursorRef.current = {
          x: world.x,
          y: world.y,
          radius: 14 / cam.zoom,
          isEraser: true,
          color: cfg.strokeColor,
        };
        eraserTrailRef.current = [world];
        modeRef.current = {
          kind: 'erase',
          workingElements: remaining,
          erasedAny,
          trail: [world],
        };
        scheduleRender();
        return;
      }

      const dist = Math.hypot(world.x - mode.lastPoint.x, world.y - mode.lastPoint.y);
      if (dist < 1.5 / cam.zoom) return;

      const now = performance.now();
      const dt = Math.max(1, now - mode.lastTime);
      const velocity = dist / dt;
      let pressure = 0.5;
      if (e.pointerType === 'pen' && e.pressure > 0 && e.pressure !== 0.5) {
        pressure = e.pressure;
      } else {
        const target = Math.max(0.25, Math.min(0.85, 0.78 - velocity * 0.16));
        const prevP = mode.draft.points[mode.draft.points.length - 1]?.pressure ?? 0.5;
        pressure = prevP * 0.65 + target * 0.35;
      }

      mode.draft.points.push({ x: world.x, y: world.y, pressure });
      mode.lastTime = now;
      mode.lastPoint = world;
      draftRef.current = mode.draft;
      onDraftChange?.(mode.draft);
      scheduleRender();
      return;
    }

    if (mode.kind === 'draw-shape') {
      const d = mode.draft;
      if (d.type === 'line' || d.type === 'arrow') {
        d.x2 = world.x;
        d.y2 = world.y;
      } else if (d.type === 'rectangle' || d.type === 'ellipse' || d.type === 'diamond') {
        d.x = Math.min(mode.startWorld.x, world.x);
        d.y = Math.min(mode.startWorld.y, world.y);
        d.width = Math.abs(world.x - mode.startWorld.x);
        d.height = Math.abs(world.y - mode.startWorld.y);
      }
      const nextDraft = { ...d };
      draftRef.current = nextDraft;
      onDraftChange?.(nextDraft);
      scheduleRender();
      return;
    }

    if (mode.kind === 'erase') {
      mode.trail.push(world);
      if (mode.trail.length > 14) mode.trail.shift();
      eraserTrailRef.current = [...mode.trail];
      hoverCursorRef.current = {
        x: world.x,
        y: world.y,
        radius: 14 / cam.zoom,
        isEraser: true,
        color: cfg.strokeColor,
      };

      const remaining = mode.workingElements.filter(
        (el) => el.locked || !hitTestElement(el, world.x, world.y, cam.zoom)
      );
      if (remaining.length !== mode.workingElements.length) {
        mode.erasedAny = true;
        mode.workingElements = remaining;
        onElementsChange(remaining, false);
      }
      scheduleRender();
      return;
    }

    if (mode.kind === 'move') {
      const dx = world.x - mode.startWorld.x;
      const dy = world.y - mode.startWorld.y;
      if (!mode.moved && Math.hypot(dx, dy) < 2 / cam.zoom) return;
      mode.moved = true;
      const updated = mode.initialElements.map((el) =>
        sel.includes(el.id) ? moveElement(el, dx, dy) : el
      );
      onElementsChange(updated, false);
      return;
    }

    if (mode.kind === 'resize') {
      const dx = world.x - mode.startWorld.x;
      const dy = world.y - mode.startWorld.y;
      mode.resized = true;

      if (sel.length === 1) {
        const updated = mode.initialElements.map((el) => {
          if (!sel.includes(el.id)) return el;
          const b = mode.initialBoundsMap.get(el.id);
          if (!b) return el;
          return resizeSingleElement(el, mode.handle, b, dx, dy);
        });
        onElementsChange(updated, false);
      } else {
        const selectedInitial = mode.initialElements.filter((e) => sel.includes(e.id));
        const combined = getCombinedBounds(selectedInitial);
        if (combined) {
          const updated = mode.initialElements.map((el) => {
            if (!sel.includes(el.id)) return el;
            const b = mode.initialBoundsMap.get(el.id);
            if (!b) return el;
            return resizeSingleElement(el, mode.handle, b, dx, dy);
          });
          onElementsChange(updated, false);
        }
      }
      return;
    }

    if (mode.kind === 'marquee') {
      const box: Bounds = {
        x: Math.min(mode.startWorld.x, world.x),
        y: Math.min(mode.startWorld.y, world.y),
        width: Math.abs(world.x - mode.startWorld.x),
        height: Math.abs(world.y - mode.startWorld.y),
      };
      mode.box = box;
      marqueeRef.current = box;
      const ids = els.filter((el) => isElementInMarquee(el, box)).map((el) => el.id);
      onSelectIds(ids);
      scheduleRender();
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.delete(e.pointerId);

    const mode = modeRef.current;
    const {
      elements: els,
      camera: cam,
      activeTool: tool,
      settings: cfg,
      isReadOnly: readOnly,
      fingerDrawEnabled: allowFingerDraw,
    } = propsRef.current;

    if (pointersRef.current.size === 0) {
      if (mode.kind === 'pan' && !mode.moved && mode.pointerType === 'touch' && !readOnly && !allowFingerDraw) {
        const canvas = canvasRef.current;
        if (canvas && (tool === 'sticky' || tool === 'text' || tool === 'select')) {
          const rect = canvas.getBoundingClientRect();
          const sx = e.clientX - rect.left;
          const sy = e.clientY - rect.top;
          const world = screenToWorld(sx, sy, cam, rect.width, rect.height);

          if (tool === 'sticky') {
            const paletteEntry =
              STICKY_COLORS.find((c) => c.bg === cfg.stickyColor) ?? STICKY_COLORS[0];
            const sticky: StickyElement = {
              id: makeId('sticky'),
              type: 'sticky',
              x: world.x - 105,
              y: world.y - 90,
              width: 210,
              height: 180,
              text: '',
              bgColor: paletteEntry.bg,
              textColor: paletteEntry.text,
              opacity: 1,
              zIndex: nextZIndex(els),
            };
            onElementsChange([...els, sticky], true);
            onSelectIds([sticky.id]);
            onStartEditText(sticky);
            onSelectTool('select');
          } else if (tool === 'text') {
            const textEl: TextElement = {
              id: makeId('text'),
              type: 'text',
              x: world.x,
              y: world.y - cfg.fontSize / 2,
              width: 260,
              height: Math.max(44, cfg.fontSize * 1.6),
              text: '',
              color: cfg.strokeColor,
              fontSize: cfg.fontSize,
              opacity: 1,
              zIndex: nextZIndex(els),
            };
            onElementsChange([...els, textEl], true);
            onSelectIds([textEl.id]);
            onStartEditText(textEl);
            onSelectTool('select');
          } else if (tool === 'select') {
            const hit = [...els]
              .sort((a, b) => b.zIndex - a.zIndex)
              .find((el) => hitTestElement(el, world.x, world.y, cam.zoom));

            if (hit) {
              const now = Date.now();
              if (
                (hit.type === 'text' || hit.type === 'sticky') &&
                lastTapRef.current &&
                lastTapRef.current.id === hit.id &&
                now - lastTapRef.current.time < 360
              ) {
                lastTapRef.current = null;
                onSelectIds([hit.id]);
                onStartEditText(hit);
              } else {
                lastTapRef.current = { time: now, id: hit.id };
                onSelectIds([hit.id]);
              }
            } else {
              onSelectIds([]);
            }
          }
        } else if (tool !== 'pan') {
          onFingerPanHint?.();
        }
      } else if (mode.kind === 'draw-stroke') {
        draftRef.current = null;
        if (mode.draft.points.length > 0) {
          onElementsChange([...els, mode.draft], true);
        }
        onDraftChange?.(null);
      } else if (mode.kind === 'draw-shape') {
        draftRef.current = null;
        const d = mode.draft;
        let valid = false;
        if (d.type === 'line' || d.type === 'arrow') {
          valid = Math.hypot(d.x2 - d.x1, d.y2 - d.y1) > 8;
        } else if (d.type === 'rectangle' || d.type === 'ellipse' || d.type === 'diamond') {
          valid = d.width > 8 && d.height > 8;
        }
        if (valid) {
          onElementsChange([...els, d], true);
          onSelectIds([d.id]);
        }
        onDraftChange?.(null);
      } else if (mode.kind === 'erase') {
        eraserTrailRef.current = [];
        if (mode.erasedAny) {
          onElementsChange(mode.workingElements, true);
        }
      } else if (mode.kind === 'move' && mode.moved) {
        onElementsChange(els, true);
      } else if (mode.kind === 'resize' && mode.resized) {
        onElementsChange(els, true);
      } else if (mode.kind === 'marquee') {
        marqueeRef.current = null;
      }

      if (!readOnly) {
        if (e.pointerType === 'touch') {
          onLocalCursorChange?.(null);
        } else {
          const canvas = canvasRef.current;
          if (canvas) {
            const rect = canvas.getBoundingClientRect();
            const world = screenToWorld(
              e.clientX - rect.left,
              e.clientY - rect.top,
              cam,
              rect.width,
              rect.height
            );
            const upTool: ToolType = isStylusEraserPressed(e) ? 'eraser' : tool;
            if (upTool === 'pen' || upTool === 'highlighter' || upTool === 'eraser') {
              hoverCursorRef.current = {
                x: world.x,
                y: world.y,
                radius:
                  upTool === 'eraser'
                    ? 14 / cam.zoom
                    : (upTool === 'highlighter' ? cfg.highlighterWidth : cfg.strokeWidth) / 2,
                isEraser: upTool === 'eraser',
                color: upTool === 'highlighter' ? cfg.highlighterColor : cfg.strokeColor,
              };
            }
            onLocalCursorChange?.({
              x: world.x,
              y: world.y,
              color: upTool === 'highlighter' ? cfg.highlighterColor : cfg.strokeColor,
              active: false,
              tool: upTool,
            });
          }
        }
      }

      modeRef.current = { kind: 'none' };
      scheduleRender();
    } else if (pointersRef.current.size === 1 && mode.kind === 'pinch') {
      const remaining = Array.from(pointersRef.current.values())[0];
      modeRef.current = {
        kind: 'pan',
        startScreen: { ...remaining.point },
        startCamera: { ...cam },
        pointerType: remaining.pointerType,
        moved: true,
      };
    }
  };

  const handlePointerLeave = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType !== 'touch') {
      if (hoverCursorRef.current) {
        hoverCursorRef.current = null;
        scheduleRender();
      }
      onLocalCursorChange?.(null);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const cam = propsRef.current.camera;
    if (propsRef.current.isReadOnly) onUserPanOrZoom?.();

    if (e.ctrlKey || e.metaKey) {
      const factor = Math.exp(-e.deltaY * 0.004);
      const newZoom = Math.min(5, Math.max(0.1, cam.zoom * factor));
      const worldBefore = screenToWorld(sx, sy, cam, rect.width, rect.height);
      const newCamX = worldBefore.x - (sx - rect.width / 2) / newZoom;
      const newCamY = worldBefore.y - (sy - rect.height / 2) / newZoom;
      onCameraChange({ x: newCamX, y: newCamY, zoom: newZoom });
    } else {
      onCameraChange({
        ...cam,
        x: cam.x + e.deltaX / cam.zoom,
        y: cam.y + e.deltaY / cam.zoom,
      });
    }
  };

  const cursorClass =
    isReadOnly || activeTool === 'pan'
      ? 'cursor-grab active:cursor-grabbing'
      : activeTool === 'select'
      ? 'cursor-default'
      : activeTool === 'text'
      ? 'cursor-text'
      : 'cursor-crosshair';

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onWheel={handleWheel}
      onContextMenu={(e) => e.preventDefault()}
      style={{ touchAction: 'none' }}
      className={`block w-full h-full ${cursorClass}`}
    />
  );
};
