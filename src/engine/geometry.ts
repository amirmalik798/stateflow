import {
  Bounds,
  Camera,
  CanvasElement,
  LineElement,
  Point,
  ResizeHandle,
} from '../types/whiteboard';

export function screenToWorld(
  sx: number,
  sy: number,
  camera: Camera,
  viewportWidth: number,
  viewportHeight: number
): Point {
  return {
    x: (sx - viewportWidth / 2) / camera.zoom + camera.x,
    y: (sy - viewportHeight / 2) / camera.zoom + camera.y,
  };
}

export function worldToScreen(
  wx: number,
  wy: number,
  camera: Camera,
  viewportWidth: number,
  viewportHeight: number
): Point {
  return {
    x: (wx - camera.x) * camera.zoom + viewportWidth / 2,
    y: (wy - camera.y) * camera.zoom + viewportHeight / 2,
  };
}

export function getElementBounds(el: CanvasElement): Bounds {
  switch (el.type) {
    case 'pen':
    case 'highlighter': {
      if (el.points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const p of el.points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      const pad = el.strokeWidth / 2;
      return {
        x: minX - pad,
        y: minY - pad,
        width: Math.max(4, maxX - minX + pad * 2),
        height: Math.max(4, maxY - minY + pad * 2),
      };
    }
    case 'line':
    case 'arrow': {
      const minX = Math.min(el.x1, el.x2);
      const minY = Math.min(el.y1, el.y2);
      const maxX = Math.max(el.x1, el.x2);
      const maxY = Math.max(el.y1, el.y2);
      return {
        x: minX,
        y: minY,
        width: Math.max(4, maxX - minX),
        height: Math.max(4, maxY - minY),
      };
    }
    case 'rectangle':
    case 'ellipse':
    case 'diamond':
    case 'sticky':
    case 'text':
    case 'image':
      return {
        x: el.width < 0 ? el.x + el.width : el.x,
        y: el.height < 0 ? el.y + el.height : el.y,
        width: Math.abs(el.width),
        height: Math.abs(el.height),
      };
  }
}

export function getCombinedBounds(elements: CanvasElement[]): Bounds | null {
  if (elements.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of elements) {
    const b = getElementBounds(el);
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.width > maxX) maxX = b.x + b.width;
    if (b.y + b.height > maxY) maxY = b.y + b.height;
  }
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function hitTestElement(
  el: CanvasElement,
  wx: number,
  wy: number,
  zoom: number
): boolean {
  const tolerance = 14 / zoom;

  switch (el.type) {
    case 'pen':
    case 'highlighter': {
      const thresh = Math.max(tolerance, el.strokeWidth / 2 + 8 / zoom);
      if (el.points.length === 1) {
        return Math.hypot(wx - el.points[0].x, wy - el.points[0].y) <= thresh;
      }
      for (let i = 0; i < el.points.length - 1; i++) {
        const d = distToSegment(
          wx,
          wy,
          el.points[i].x,
          el.points[i].y,
          el.points[i + 1].x,
          el.points[i + 1].y
        );
        if (d <= thresh) return true;
      }
      return false;
    }
    case 'line':
    case 'arrow': {
      const d = distToSegment(wx, wy, el.x1, el.y1, el.x2, el.y2);
      return d <= Math.max(tolerance, el.strokeWidth / 2 + 8 / zoom);
    }
    case 'ellipse': {
      const b = getElementBounds(el);
      const rx = b.width / 2 + tolerance;
      const ry = b.height / 2 + tolerance;
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      if (rx <= 0 || ry <= 0) return false;
      const norm = ((wx - cx) ** 2) / (rx ** 2) + ((wy - cy) ** 2) / (ry ** 2);
      return norm <= 1;
    }
    case 'diamond': {
      const b = getElementBounds(el);
      const rx = b.width / 2 + tolerance;
      const ry = b.height / 2 + tolerance;
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      if (rx <= 0 || ry <= 0) return false;
      return Math.abs(wx - cx) / rx + Math.abs(wy - cy) / ry <= 1;
    }
    case 'rectangle':
    case 'sticky':
    case 'text':
    case 'image': {
      const b = getElementBounds(el);
      return (
        wx >= b.x - tolerance &&
        wx <= b.x + b.width + tolerance &&
        wy >= b.y - tolerance &&
        wy <= b.y + b.height + tolerance
      );
    }
  }
}

export function hitTestHandle(
  selectedElements: CanvasElement[],
  wx: number,
  wy: number,
  zoom: number
): ResizeHandle | null {
  if (selectedElements.length === 0) return null;
  const hitRadius = 18 / zoom;

  if (selectedElements.length === 1 && (selectedElements[0].type === 'line' || selectedElements[0].type === 'arrow')) {
    const line = selectedElements[0] as LineElement;
    if (Math.hypot(wx - line.x1, wy - line.y1) <= hitRadius) return 'start';
    if (Math.hypot(wx - line.x2, wy - line.y2) <= hitRadius) return 'end';
    return null;
  }

  const b = getCombinedBounds(selectedElements);
  if (!b) return null;

  const pad = 6 / zoom;
  const corners: { handle: ResizeHandle; x: number; y: number }[] = [
    { handle: 'nw', x: b.x - pad, y: b.y - pad },
    { handle: 'ne', x: b.x + b.width + pad, y: b.y - pad },
    { handle: 'sw', x: b.x - pad, y: b.y + b.height + pad },
    { handle: 'se', x: b.x + b.width + pad, y: b.y + b.height + pad },
  ];

  for (const c of corners) {
    if (Math.hypot(wx - c.x, wy - c.y) <= hitRadius) {
      return c.handle;
    }
  }
  return null;
}

export function isElementInMarquee(el: CanvasElement, marquee: Bounds): boolean {
  const b = getElementBounds(el);
  return !(
    b.x + b.width < marquee.x ||
    b.x > marquee.x + marquee.width ||
    b.y + b.height < marquee.y ||
    b.y > marquee.y + marquee.height
  );
}

export function moveElement(el: CanvasElement, dx: number, dy: number): CanvasElement {
  switch (el.type) {
    case 'pen':
    case 'highlighter':
      return {
        ...el,
        points: el.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })),
      };
    case 'line':
    case 'arrow':
      return {
        ...el,
        x1: el.x1 + dx,
        y1: el.y1 + dy,
        x2: el.x2 + dx,
        y2: el.y2 + dy,
      };
    default:
      return {
        ...el,
        x: el.x + dx,
        y: el.y + dy,
      };
  }
}

export function resizeSingleElement(
  el: CanvasElement,
  handle: ResizeHandle,
  startBounds: Bounds,
  dx: number,
  dy: number
): CanvasElement {
  if (el.type === 'line' || el.type === 'arrow') {
    if (handle === 'start') {
      return { ...el, x1: el.x1 + dx, y1: el.y1 + dy };
    }
    if (handle === 'end') {
      return { ...el, x2: el.x2 + dx, y2: el.y2 + dy };
    }
    return el;
  }

  let newX = startBounds.x;
  let newY = startBounds.y;
  let newW = startBounds.width;
  let newH = startBounds.height;

  const minSize = 24;

  if (handle === 'nw' || handle === 'sw') {
    const proposedW = startBounds.width - dx;
    if (proposedW >= minSize) {
      newX = startBounds.x + dx;
      newW = proposedW;
    } else {
      newX = startBounds.x + startBounds.width - minSize;
      newW = minSize;
    }
  }
  if (handle === 'ne' || handle === 'se') {
    newW = Math.max(minSize, startBounds.width + dx);
  }
  if (handle === 'nw' || handle === 'ne') {
    const proposedH = startBounds.height - dy;
    if (proposedH >= minSize) {
      newY = startBounds.y + dy;
      newH = proposedH;
    } else {
      newY = startBounds.y + startBounds.height - minSize;
      newH = minSize;
    }
  }
  if (handle === 'sw' || handle === 'se') {
    newH = Math.max(minSize, startBounds.height + dy);
  }

  if (el.type === 'pen' || el.type === 'highlighter') {
    const scaleX = startBounds.width > 0 ? newW / startBounds.width : 1;
    const scaleY = startBounds.height > 0 ? newH / startBounds.height : 1;
    return {
      ...el,
      points: el.points.map((p) => ({
        ...p,
        x: newX + (p.x - startBounds.x) * scaleX,
        y: newY + (p.y - startBounds.y) * scaleY,
      })),
    };
  }

  if (el.type === 'text') {
    const scaleY = startBounds.height > 0 ? newH / startBounds.height : 1;
    return {
      ...el,
      x: newX,
      y: newY,
      width: newW,
      height: newH,
      fontSize: Math.max(12, Math.min(96, Math.round(el.fontSize * scaleY))),
    };
  }

  switch (el.type) {
    case 'rectangle':
    case 'ellipse':
    case 'diamond':
    case 'sticky':
    case 'image':
      return {
        ...el,
        x: newX,
        y: newY,
        width: newW,
        height: newH,
      };
  }
}
