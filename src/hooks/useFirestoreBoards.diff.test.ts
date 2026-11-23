import { describe, expect, it } from 'vitest';
import type { CanvasElement } from '../types/whiteboard';
import { countElementDocumentWrites } from './useFirestoreBoards';

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
  it('writes zero documents for 1,000 recreated but unchanged elements', () => {
    const previous = makeElements(1000);
    const recreated = previous.map((element) => ({ ...element }));
    expect(countElementDocumentWrites(previous, recreated)).toEqual({
      creates: 0, updates: 0, deletes: 0, total: 0,
    });
  });

  it('writes only the one changed element among 1,000', () => {
    const previous = makeElements(1000);
    const next = previous.map((element) => ({ ...element }));
    next[537] = { ...next[537], x: next[537].x + 12 };
    expect(countElementDocumentWrites(previous, next)).toEqual({
      creates: 0, updates: 1, deletes: 0, total: 1,
    });
  });

  it('counts additions and removals without rewriting unchanged documents', () => {
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
    expect(countElementDocumentWrites(previous, next)).toEqual({
      creates: 1, updates: 0, deletes: 1, total: 2,
    });
  });
});
