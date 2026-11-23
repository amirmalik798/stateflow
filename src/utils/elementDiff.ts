import type { CanvasElement, Point } from '../types/whiteboard';

/** Keep stroke-point normalization identical to Firestore element serialization. */
export function decimatePoints(points: Point[], maxPoints = 3500): Point[] {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  const output: Point[] = [];
  for (let index = 0; index < points.length; index += step) {
    const point = points[index];
    output.push({
      x: point.x,
      y: point.y,
      pressure: typeof point.pressure === 'number' ? point.pressure : 0.5,
    });
  }
  const last = points[points.length - 1];
  if (output[output.length - 1] !== last) {
    output.push({
      x: last.x,
      y: last.y,
      pressure: typeof last.pressure === 'number' ? last.pressure : 0.5,
    });
  }
  return output;
}

/**
 * Compare the data actually stored for an element, not object identity.
 * Keep these fields aligned with serializeElementForFirestore.
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

      const previousPoints = decimatePoints(previous.points);
      const nextPoints = decimatePoints(next.points);
      if (previousPoints.length !== nextPoints.length) return false;

      for (let index = 0; index < previousPoints.length; index += 1) {
        const a = previousPoints[index];
        const b = nextPoints[index];
        if (
          a.x !== b.x ||
          a.y !== b.y ||
          (typeof a.pressure === 'number' ? a.pressure : 0.5) !==
            (typeof b.pressure === 'number' ? b.pressure : 0.5)
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
