import { describe, expect, it } from 'vitest';
import type { CanvasElement } from '../types/whiteboard';

function decimatePoints<T extends { x: number; y: number; pressure?: number }>(
  points: T[],
  maxPoints = 3500
): T[] {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  const output: T[] = [];
  for (let index = 0; index < points.length; index += step) output.push(points[index]);
  const last = points[points.length - 1];
  if (output[output.length - 1] !== last) output.push(last);
  return output;
}

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
      for (let index = 0; index < a.length; index += 1) {
        if (
          a[index].x !== b[index].x ||
          a[index].y !== b[index].y ||
          (typeof a[index].pressure === 'number' ? a[index].pressure : 0.5) !==
            (typeof b[index].pressure === 'number' ? b[index].pressure : 0.5)
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

function countWrites(previous: CanvasElement[], next: CanvasElement[]) {
  const previousById = new Map(previous.map((element) => [element.id, element]));
  const nextById = new Map(next.map((element) => [element.id, element]));
  let creates = 0;
  let updates = 0;
  let deletes = 0;

  for (const id of previousById.keys()) {
    if (!nextById.has(id)) deletes += 1;
  }
  for (const element of next) {
    const old = previousById.get(element.id);
    if (!old) creates += 1;
    else if (!areElementDocumentsEqual(old, element)) updates += 1;
  }
  return { creates, updates, deletes, total: creates + updates + deletes };
}

function makeElements(count: number): CanvasElement[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `element-${index}`,
    type: 'rectangle' as const,
    zIndex: index,
    opacity: 1,
    x: index * 2,
    y: index * 3,
    width: 100,
    height: 80,
    strokeColor: '#334155',
    fillColor: 'transparent',
    strokeWidth: 2,
  }));
}

describe('syncElementsDiff document write counts', () => {
  it('performs zero document writes for 1,000 recreated but unchanged elements', () => {
    const previous = makeElements(1000);
    const recreated = previous.map((element) => ({ ...element }));
    expect(countWrites(previous, recreated)).toEqual({
      creates: 0, updates: 0, deletes: 0, total: 0,
    });
  });

  it('updates only the one changed element among 1,000', () => {
    const previous = makeElements(1000);
    const next = previous.map((element) => ({ ...element }));
    next[537] = { ...next[537], x: next[537].x + 12 };
    expect(countWrites(previous, next)).toEqual({
      creates: 0, updates: 1, deletes: 0, total: 1,
    });
  });

  it('writes only one create and one delete when replacing one element', () => {
    const previous = makeElements(1000);
    const next = previous.slice(0, 999).map((element) => ({ ...element }));
    next.push({
      id: 'new-element',
      type: 'rectangle',
      zIndex: 1000,
      opacity: 1,
      x: 0,
      y: 0,
      width: 100,
      height: 80,
      strokeColor: '#334155',
      fillColor: 'transparent',
      strokeWidth: 2,
    });
    expect(countWrites(previous, next)).toEqual({
      creates: 1, updates: 0, deletes: 1, total: 2,
    });
  });
});
