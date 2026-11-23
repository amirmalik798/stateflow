import {
  Bounds,
  Camera,
  CanvasElement,
  GridStyle,
  LineElement,
  Point,
  RemoteCursor,
  ThemeMode,
} from '../types/whiteboard';
import { getCombinedBounds, getElementBounds } from './geometry';

const imageCache = new Map<string, HTMLImageElement>();

function getCachedImage(dataUrl: string, onLoad: () => void): HTMLImageElement | null {
  const existing = imageCache.get(dataUrl);
  if (existing) {
    return existing.complete ? existing : null;
  }
  const img = new Image();
  img.onload = onLoad;
  img.src = dataUrl;
  imageCache.set(dataUrl, img);
  return img.complete ? img : null;
}

export function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const paragraphs = text.split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    if (para === '') {
      lines.push('');
      continue;
    }
    const words = para.split(' ');
    let currentLine = words[0] ?? '';

    for (let i = 1; i < words.length; i++) {
      const testLine = currentLine + ' ' + words[i];
      if (ctx.measureText(testLine).width <= maxWidth) {
        currentLine = testLine;
      } else {
        lines.push(currentLine);
        currentLine = words[i];
      }
    }
    lines.push(currentLine);
  }
  return lines;
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  camera: Camera,
  gridStyle: GridStyle,
  theme: ThemeMode
) {
  if (gridStyle === 'blank') return;

  // Adaptive grid spacing so dots/lines remain crisp at all zoom levels
  let baseSpacing = 32;
  while (baseSpacing * camera.zoom < 18) baseSpacing *= 2;
  while (baseSpacing * camera.zoom > 72) baseSpacing /= 2;

  const worldLeft = camera.x - width / (2 * camera.zoom);
  const worldRight = camera.x + width / (2 * camera.zoom);
  const worldTop = camera.y - height / (2 * camera.zoom);
  const worldBottom = camera.y + height / (2 * camera.zoom);

  const startX = Math.floor(worldLeft / baseSpacing) * baseSpacing;
  const startY = Math.floor(worldTop / baseSpacing) * baseSpacing;

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);

  if (gridStyle === 'dots') {
    ctx.fillStyle = theme === 'dark' ? 'rgba(148, 163, 184, 0.22)' : 'rgba(100, 116, 139, 0.28)';
    const dotRadius = Math.max(1.1, 1.4) / camera.zoom;
    for (let x = startX; x <= worldRight; x += baseSpacing) {
      for (let y = startY; y <= worldBottom; y += baseSpacing) {
        ctx.beginPath();
        ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (gridStyle === 'grid') {
    ctx.strokeStyle = theme === 'dark' ? 'rgba(148, 163, 184, 0.08)' : 'rgba(15, 23, 42, 0.06)';
    ctx.lineWidth = 1 / camera.zoom;
    ctx.beginPath();
    for (let x = startX; x <= worldRight; x += baseSpacing) {
      ctx.moveTo(x, worldTop);
      ctx.lineTo(x, worldBottom);
    }
    for (let y = startY; y <= worldBottom; y += baseSpacing) {
      ctx.moveTo(worldLeft, y);
      ctx.lineTo(worldRight, y);
    }
    ctx.stroke();

    // Major lines every 4 cells
    const major = baseSpacing * 4;
    const mStartX = Math.floor(worldLeft / major) * major;
    const mStartY = Math.floor(worldTop / major) * major;
    ctx.strokeStyle = theme === 'dark' ? 'rgba(148, 163, 184, 0.16)' : 'rgba(15, 23, 42, 0.11)';
    ctx.beginPath();
    for (let x = mStartX; x <= worldRight; x += major) {
      ctx.moveTo(x, worldTop);
      ctx.lineTo(x, worldBottom);
    }
    for (let y = mStartY; y <= worldBottom; y += major) {
      ctx.moveTo(worldLeft, y);
      ctx.lineTo(worldRight, y);
    }
    ctx.stroke();
  }

  ctx.restore();
}

export function drawStrokePath(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  color: string,
  strokeWidth: number,
  isHighlighter: boolean
) {
  if (points.length === 0) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.fillStyle = color;

  if (isHighlighter) {
    ctx.globalAlpha = 0.34;
    ctx.lineCap = 'butt';
  }

  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, strokeWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  // Check if pressure varies significantly (e.g. stylus or velocity)
  const hasPressure =
    !isHighlighter &&
    points.some((p) => p.pressure !== undefined && Math.abs(p.pressure - 0.5) > 0.08);

  if (!hasPressure) {
    ctx.lineWidth = strokeWidth;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length - 1; i++) {
      const midX = (points[i].x + points[i + 1].x) / 2;
      const midY = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  } else {
    // Variable-width quadratic segments for authentic stylus feel
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const pNext = points[i + 2];
      const pressure = ((p0.pressure ?? 0.5) + (p1.pressure ?? 0.5)) * 0.5;
      const w = Math.max(1.2, strokeWidth * (0.45 + pressure * 0.95));

      ctx.lineWidth = w;
      ctx.beginPath();
      if (i === 0) {
        ctx.moveTo(p0.x, p0.y);
      } else {
        const prev = points[i - 1];
        ctx.moveTo((prev.x + p0.x) / 2, (prev.y + p0.y) / 2);
      }
      if (pNext) {
        ctx.quadraticCurveTo(p0.x, p0.y, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2);
      } else {
        ctx.lineTo(p1.x, p1.y);
      }
      ctx.stroke();
    }
  }

  ctx.restore();
}

export function drawElement(
  ctx: CanvasRenderingContext2D,
  el: CanvasElement,
  theme: ThemeMode,
  onImageLoaded?: () => void
) {
  ctx.save();
  ctx.globalAlpha = el.opacity;

  switch (el.type) {
    case 'pen':
    case 'highlighter': {
      drawStrokePath(ctx, el.points, el.color, el.strokeWidth, el.type === 'highlighter');
      break;
    }
    case 'rectangle': {
      const b = getElementBounds(el);
      const r = Math.min(12, b.width * 0.12, b.height * 0.12);
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.width, b.height, r);
      if (el.fillColor && el.fillColor !== 'transparent') {
        ctx.fillStyle = el.fillColor;
        ctx.fill();
      }
      ctx.strokeStyle = el.strokeColor;
      ctx.lineWidth = el.strokeWidth;
      ctx.stroke();
      break;
    }
    case 'ellipse': {
      const b = getElementBounds(el);
      ctx.beginPath();
      ctx.ellipse(
        b.x + b.width / 2,
        b.y + b.height / 2,
        Math.max(1, b.width / 2),
        Math.max(1, b.height / 2),
        0,
        0,
        Math.PI * 2
      );
      if (el.fillColor && el.fillColor !== 'transparent') {
        ctx.fillStyle = el.fillColor;
        ctx.fill();
      }
      ctx.strokeStyle = el.strokeColor;
      ctx.lineWidth = el.strokeWidth;
      ctx.stroke();
      break;
    }
    case 'diamond': {
      const b = getElementBounds(el);
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      ctx.beginPath();
      ctx.moveTo(cx, b.y);
      ctx.lineTo(b.x + b.width, cy);
      ctx.lineTo(cx, b.y + b.height);
      ctx.lineTo(b.x, cy);
      ctx.closePath();
      if (el.fillColor && el.fillColor !== 'transparent') {
        ctx.fillStyle = el.fillColor;
        ctx.fill();
      }
      ctx.strokeStyle = el.strokeColor;
      ctx.lineWidth = el.strokeWidth;
      ctx.lineJoin = 'round';
      ctx.stroke();
      break;
    }
    case 'line':
    case 'arrow': {
      ctx.strokeStyle = el.strokeColor;
      ctx.fillStyle = el.strokeColor;
      ctx.lineWidth = el.strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(el.x1, el.y1);
      ctx.lineTo(el.x2, el.y2);
      ctx.stroke();

      if (el.type === 'arrow') {
        const angle = Math.atan2(el.y2 - el.y1, el.x2 - el.x1);
        const headLen = Math.max(12, el.strokeWidth * 4.2);
        const spread = Math.PI / 6.5;
        ctx.beginPath();
        ctx.moveTo(el.x2, el.y2);
        ctx.lineTo(
          el.x2 - headLen * Math.cos(angle - spread),
          el.y2 - headLen * Math.sin(angle - spread)
        );
        ctx.moveTo(el.x2, el.y2);
        ctx.lineTo(
          el.x2 - headLen * Math.cos(angle + spread),
          el.y2 - headLen * Math.sin(angle + spread)
        );
        ctx.stroke();
      }
      break;
    }
    case 'sticky': {
      const b = getElementBounds(el);
      const r = 14;
      ctx.save();
      ctx.shadowColor = theme === 'dark' ? 'rgba(0,0,0,0.42)' : 'rgba(15, 23, 42, 0.14)';
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 6;
      ctx.fillStyle = el.bgColor;
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.width, b.height, r);
      ctx.fill();
      ctx.restore();

      // Subtle inner border for crisp edge
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.width, b.height, r);
      ctx.stroke();

      // Text
      if (el.text) {
        const pad = 16;
        const fontSize = 15;
        ctx.font = `500 ${fontSize}px "Plus Jakarta Sans", sans-serif`;
        ctx.fillStyle = el.textColor;
        ctx.textBaseline = 'top';
        const lines = wrapTextLines(ctx, el.text, Math.max(40, b.width - pad * 2));
        const lineHeight = fontSize * 1.45;
        lines.forEach((line, idx) => {
          const ly = b.y + pad + idx * lineHeight;
          if (ly + lineHeight <= b.y + b.height - 8) {
            ctx.fillText(line, b.x + pad, ly);
          }
        });
      }
      break;
    }
    case 'text': {
      const b = getElementBounds(el);
      if (el.text) {
        ctx.font = `600 ${el.fontSize}px "Plus Jakarta Sans", sans-serif`;
        ctx.fillStyle = el.color;
        ctx.textBaseline = 'top';
        const lines = wrapTextLines(ctx, el.text, Math.max(40, b.width));
        const lineHeight = el.fontSize * 1.35;
        lines.forEach((line, idx) => {
          ctx.fillText(line, b.x, b.y + idx * lineHeight);
        });
      }
      break;
    }
    case 'image': {
      const b = getElementBounds(el);
      const img = getCachedImage(el.dataUrl, () => onImageLoaded?.());
      if (img) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(b.x, b.y, b.width, b.height, 12);
        ctx.clip();
        ctx.drawImage(img, b.x, b.y, b.width, b.height);
        ctx.restore();
        ctx.strokeStyle = theme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(b.x, b.y, b.width, b.height, 12);
        ctx.stroke();
      } else {
        ctx.fillStyle = theme === 'dark' ? '#1E293B' : '#E2E8F0';
        ctx.beginPath();
        ctx.roundRect(b.x, b.y, b.width, b.height, 12);
        ctx.fill();
      }
      break;
    }
  }

  ctx.restore();
}

export interface HoverCursor {
  x: number;
  y: number;
  radius: number;
  isEraser: boolean;
  color: string;
}

export interface RenderOptions {
  width: number;
  height: number;
  dpr: number;
  camera: Camera;
  elements: CanvasElement[];
  draftElement: CanvasElement | null;
  selectedIds: string[];
  marqueeBox: Bounds | null;
  eraserTrail: Point[];
  gridStyle: GridStyle;
  theme: ThemeMode;
  editingElementId: string | null;
  remoteCursor?: RemoteCursor | null;
  hoverCursor?: HoverCursor | null;
  onImageLoaded?: () => void;
}

export function renderWhiteboard(ctx: CanvasRenderingContext2D, opts: RenderOptions) {
  const {
    width,
    height,
    dpr,
    camera,
    elements,
    draftElement,
    selectedIds,
    marqueeBox,
    eraserTrail,
    gridStyle,
    theme,
    editingElementId,
    remoteCursor,
    hoverCursor,
    onImageLoaded,
  } = opts;

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Canvas background
  ctx.fillStyle = theme === 'dark' ? '#0F1115' : '#F8F9FB';
  ctx.fillRect(0, 0, width, height);

  // Adaptive grid
  drawGrid(ctx, width, height, camera, gridStyle, theme);

  // World transform
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);

  // Draw elements sorted by zIndex
  const sorted = [...elements].sort((a, b) => a.zIndex - b.zIndex);
  for (const el of sorted) {
    if (el.id === editingElementId) continue;
    drawElement(ctx, el, theme, onImageLoaded);
  }

  if (draftElement) {
    drawElement(ctx, draftElement, theme, onImageLoaded);
  }

  // Selection overlay
  if (selectedIds.length > 0) {
    const selected = sorted.filter((e) => selectedIds.includes(e.id));
    if (selected.length === 1 && (selected[0].type === 'line' || selected[0].type === 'arrow')) {
      const line = selected[0] as LineElement;
      const r = 7 / camera.zoom;
      for (const pt of [
        { x: line.x1, y: line.y1 },
        { x: line.x2, y: line.y2 },
      ]) {
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#2563EB';
        ctx.lineWidth = 2 / camera.zoom;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    } else {
      const b = getCombinedBounds(selected);
      if (b) {
        const pad = 6 / camera.zoom;
        ctx.strokeStyle = '#3B82F6';
        ctx.lineWidth = 1.5 / camera.zoom;
        ctx.setLineDash([5 / camera.zoom, 4 / camera.zoom]);
        ctx.strokeRect(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2);
        ctx.setLineDash([]);

        // Touch-friendly corner handles
        const r = 6 / camera.zoom;
        const corners = [
          { x: b.x - pad, y: b.y - pad },
          { x: b.x + b.width + pad, y: b.y - pad },
          { x: b.x - pad, y: b.y + b.height + pad },
          { x: b.x + b.width + pad, y: b.y + b.height + pad },
        ];
        for (const c of corners) {
          ctx.fillStyle = '#FFFFFF';
          ctx.strokeStyle = '#2563EB';
          ctx.lineWidth = 2 / camera.zoom;
          ctx.beginPath();
          ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
    }
  }

  // Marquee selection box
  if (marqueeBox) {
    ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
    ctx.strokeStyle = '#3B82F6';
    ctx.lineWidth = 1.5 / camera.zoom;
    ctx.fillRect(marqueeBox.x, marqueeBox.y, marqueeBox.width, marqueeBox.height);
    ctx.strokeRect(marqueeBox.x, marqueeBox.y, marqueeBox.width, marqueeBox.height);
  }

  // Eraser trail
  if (eraserTrail.length > 1) {
    ctx.strokeStyle = theme === 'dark' ? 'rgba(248, 113, 113, 0.55)' : 'rgba(239, 68, 68, 0.45)';
    ctx.lineWidth = 14 / camera.zoom;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(eraserTrail[0].x, eraserTrail[0].y);
    for (let i = 1; i < eraserTrail.length; i++) {
      ctx.lineTo(eraserTrail[i].x, eraserTrail[i].y);
    }
    ctx.stroke();
  }

  // Live stylus pointer on desktop
  if (remoteCursor) {
    const r = (remoteCursor.active ? 5.5 : 4.5) / camera.zoom;
    ctx.save();
    ctx.fillStyle = remoteCursor.tool === 'eraser' ? '#EF4444' : remoteCursor.color;
    ctx.globalAlpha = remoteCursor.active ? 0.92 : 0.72;
    ctx.beginPath();
    ctx.arc(remoteCursor.x, remoteCursor.y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.8 / camera.zoom;
    ctx.stroke();

    if (remoteCursor.active) {
      ctx.beginPath();
      ctx.arc(remoteCursor.x, remoteCursor.y, r * 1.9, 0, Math.PI * 2);
      ctx.strokeStyle = remoteCursor.tool === 'eraser' ? '#EF4444' : remoteCursor.color;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 1.5 / camera.zoom;
      ctx.stroke();
    }
    ctx.restore();
  }

  // Local hover cursor preview for pen/eraser
  if (hoverCursor) {
    ctx.save();
    const r = Math.max(2 / camera.zoom, hoverCursor.radius);
    ctx.beginPath();
    ctx.arc(hoverCursor.x, hoverCursor.y, r, 0, Math.PI * 2);
    if (hoverCursor.isEraser) {
      ctx.strokeStyle = theme === 'dark' ? 'rgba(248, 113, 113, 0.8)' : 'rgba(239, 68, 68, 0.75)';
      ctx.fillStyle = 'rgba(239, 68, 68, 0.12)';
      ctx.lineWidth = 1.5 / camera.zoom;
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.strokeStyle = hoverCursor.color;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1.25 / camera.zoom;
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.restore();
  ctx.restore();
}

export function renderBoardThumbnail(
  canvas: HTMLCanvasElement,
  elements: CanvasElement[],
  theme: ThemeMode
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = theme === 'dark' ? '#0F1115' : '#F8F9FB';
  ctx.fillRect(0, 0, width, height);

  if (elements.length === 0) {
    ctx.restore();
    return;
  }

  const b = getCombinedBounds(elements);
  if (!b) {
    ctx.restore();
    return;
  }

  const pad = 10;
  const scale = Math.min(
    (width - pad * 2) / Math.max(40, b.width),
    (height - pad * 2) / Math.max(40, b.height),
    1.5
  );

  ctx.translate(width / 2, height / 2);
  ctx.scale(scale, scale);
  ctx.translate(-(b.x + b.width / 2), -(b.y + b.height / 2));

  const sorted = [...elements].sort((a, b2) => a.zIndex - b2.zIndex);
  for (const el of sorted) {
    drawElement(ctx, el, theme);
  }
  ctx.restore();
}
