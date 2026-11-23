import { describe, expect, it } from 'vitest';
import { hasStylusContact, isStylusEraserActive } from './stylusInput';

describe('S Pen Pointer Events', () => {
  it('recognizes the S Pen barrel button while hovering and while touching', () => {
    expect(isStylusEraserActive('pen', 2)).toBe(true);
    expect(isStylusEraserActive('pen', 3)).toBe(true);
  });

  it('recognizes the dedicated pen eraser button', () => {
    expect(isStylusEraserActive('pen', 32)).toBe(true);
  });

  it('does not treat a released barrel button as an active eraser', () => {
    expect(isStylusEraserActive('pen', 1)).toBe(false);
    expect(isStylusEraserActive('pen', 0)).toBe(false);
  });

  it('waits for S Pen tip contact before erasing', () => {
    expect(hasStylusContact('pen', 2, 0)).toBe(false);
    expect(hasStylusContact('pen', 3, 0.4)).toBe(true);
    expect(hasStylusContact('pen', 1, 0)).toBe(true);
  });

  it('accepts the dedicated eraser end only while it is touching', () => {
    expect(isStylusEraserActive('eraser', 0)).toBe(true);
    expect(hasStylusContact('eraser', 0, 0)).toBe(false);
    expect(hasStylusContact('eraser', 1, 0.5)).toBe(true);
  });

  it('does not convert mouse secondary-click into stylus erasing', () => {
    expect(isStylusEraserActive('mouse', 2)).toBe(false);
    expect(hasStylusContact('mouse', 2, 0)).toBe(true);
  });
});
