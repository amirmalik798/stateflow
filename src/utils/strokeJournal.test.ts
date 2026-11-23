import { describe, expect, it } from 'vitest';
import type { StrokeElement } from '../types/whiteboard';
import {
  applyStrokeJournalEntries,
  coalesceStrokeJournalEntry,
  type StrokeJournalEntry,
} from './strokeJournal';

const stroke = (id: string, x = 1): StrokeElement => ({
  id,
  type: 'pen',
  points: [{ x, y: 2, pressure: 0.5 }],
  color: '#2563EB',
  strokeWidth: 3,
  opacity: 1,
  zIndex: 1,
});

const entry = (
  operation: 'upsert' | 'delete',
  options: Partial<StrokeJournalEntry> = {}
): StrokeJournalEntry => ({
  key: 'user::board::stroke-1',
  uid: 'user',
  boardId: 'board',
  elementId: 'stroke-1',
  operation,
  ...(operation === 'upsert' ? { element: stroke('stroke-1') } : {}),
  createdAtMs: 100,
  requiresCreate: false,
  revision: 'r1',
  queuedAt: 100,
  ...options,
});

describe('stroke journal coalescing', () => {
  it('turns deletion of a pending local create into a retry-safe tombstone', () => {
    const pendingCreate = entry('upsert');
    const result = coalesceStrokeJournalEntry(
      pendingCreate,
      'user',
      'board',
      { operation: 'delete', elementId: 'stroke-1' },
      'r2',
      200
    );

    expect(result?.operation).toBe('delete');
    expect(result?.requiresCreate).toBe(true);
    expect(result?.createdAtMs).toBe(100);
  });

  it('restores a deleted synced stroke with its original creation timestamp', () => {
    const pendingDelete = entry('delete', { requiresCreate: false });
    const result = coalesceStrokeJournalEntry(
      pendingDelete,
      'user',
      'board',
      { operation: 'upsert', element: stroke('stroke-1') },
      'r2',
      200
    );

    expect(result?.operation).toBe('upsert');
    expect(result?.createdAtMs).toBe(100);
  });

  it('restores a pending create after undo/redo without changing its creation timestamp', () => {
    const pendingDelete = entry('delete', { requiresCreate: true });
    const result = coalesceStrokeJournalEntry(
      pendingDelete,
      'user',
      'board',
      { operation: 'upsert', element: stroke('stroke-1', 12) },
      'r2',
      200
    );

    expect(result?.operation).toBe('upsert');
    expect(result?.createdAtMs).toBe(100);
    expect(result?.element?.points[0].x).toBe(12);
  });

  it('updates a queued stroke in place while preserving its first creation timestamp', () => {
    const pendingCreate = entry('upsert');
    const result = coalesceStrokeJournalEntry(
      pendingCreate,
      'user',
      'board',
      { operation: 'upsert', element: stroke('stroke-1', 99) },
      'r2',
      200
    );

    expect(result?.createdAtMs).toBe(100);
    expect(result?.element?.points[0].x).toBe(99);
    expect(result?.revision).toBe('r2');
  });
});

describe('local journal overlay', () => {
  it('restores pending local strokes and hides pending deletions over a remote snapshot', () => {
    const remote = [stroke('stroke-1'), stroke('stroke-2')];
    const pending = [
      entry('delete', { elementId: 'stroke-1', key: 'user::board::stroke-1' }),
      entry('upsert', {
        elementId: 'stroke-3',
        key: 'user::board::stroke-3',
        element: stroke('stroke-3', 30),
        revision: 'r3',
      }),
    ];

    const merged = applyStrokeJournalEntries(remote, pending);
    expect(merged.map((element) => element.id)).toEqual(['stroke-2', 'stroke-3']);
  });
});
