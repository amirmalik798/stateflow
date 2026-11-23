import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { Board, StrokeElement } from '../types/whiteboard';
import {
  acknowledgeLocalOutbox,
  getLocalOutbox,
  getOutboxCount,
  listLocalBoards,
  persistBoardDiff,
  saveNewLocalBoard,
} from './localDatabase';

function makeStroke(id: string, x: number): StrokeElement {
  return {
    id,
    type: 'pen',
    points: [{ x, y: 20, pressure: 0.6 }, { x: x + 10, y: 25, pressure: 0.7 }],
    color: '#2563EB',
    strokeWidth: 3.5,
    opacity: 1,
    zIndex: 1,
  };
}

function makeBoard(id: string, elements: StrokeElement[]): Board {
  const now = Date.now();
  return {
    id,
    title: 'Local-first test',
    createdAt: now,
    updatedAt: now,
    gridStyle: 'dots',
    camera: { x: 0, y: 0, zoom: 1 },
    elements,
  };
}

describe('Stateflow local-first database', () => {
  it('commits board data and its outbox operations together', async () => {
    const userId = 'test-user-' + Date.now() + '-' + Math.random();
    const deviceId = 'test-device-' + Date.now();
    const board = makeBoard('board-test-' + Date.now(), [makeStroke('stroke-a', 10)]);

    await saveNewLocalBoard(userId, deviceId, board);

    const localBoards = await listLocalBoards(userId);
    expect(localBoards).toHaveLength(1);
    expect(localBoards[0].elements).toHaveLength(1);
    expect(localBoards[0].elements[0].id).toBe('stroke-a');

    const outbox = await getLocalOutbox(userId, 20);
    expect(outbox.map((operation) => operation.entityType)).toEqual(['board', 'element']);
    expect(outbox.every((operation) => operation.deviceId === deviceId)).toBe(true);
  });

  it('records only changed elements and retains operations until acknowledgment', async () => {
    const userId = 'test-user-' + Date.now() + '-' + Math.random();
    const deviceId = 'test-device-' + Date.now();
    const board = makeBoard('board-test-' + Date.now(), [
      makeStroke('stroke-a', 10),
      makeStroke('stroke-b', 30),
    ]);
    await saveNewLocalBoard(userId, deviceId, board);

    const revised = [
      makeStroke('stroke-a', 18),
    ];
    const count = await persistBoardDiff(userId, deviceId, board.id, board.elements, revised);
    const outbox = await getLocalOutbox(userId, 20);

    expect(outbox).toHaveLength(5);
    expect(outbox.slice(-2).map((operation) => operation.action)).toEqual(['delete', 'upsert']);
    expect(count).toBe(5);

    await acknowledgeLocalOutbox(userId, outbox.map((operation) => operation.operationId));
    expect(await getOutboxCount(userId)).toBe(0);
  });
});
