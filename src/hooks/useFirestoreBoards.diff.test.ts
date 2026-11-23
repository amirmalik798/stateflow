import { describe, expect, it } from 'vitest';
import type { CanvasElement } from '../types/whiteboard';
import { areElementDocumentsEqual } from '../utils/elementDiff';

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
    const changedElement = next[537];
    if (changedElement.type !== 'rectangle') throw new Error('Expected rectangle fixture');
    next[537] = { ...changedElement, x: changedElement.x + 12 };
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
