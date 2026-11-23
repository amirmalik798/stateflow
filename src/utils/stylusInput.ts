/**
 * Normalize the stylus buttons exposed by Pointer Events.
 *
 * The S Pen side/barrel button is the secondary button (bit 2 in `buttons`).
 * The dedicated pen eraser end is bit 32. Use the current buttons mask rather than
 * `button`, which reports the button whose state changed and can also describe a release.
 */
export function isStylusEraserActive(pointerType: string, buttons: number): boolean {
  if (pointerType === 'eraser') return true;
  if (pointerType !== 'pen') return false;
  return (buttons & 2) !== 0 || (buttons & 32) !== 0;
}

/**
 * A pen is only allowed to modify the canvas while its tip is touching the surface.
 * Holding the S Pen side button while hovering should show the eraser cursor, not erase
 * objects until the tip contacts the canvas.
 */
export function hasStylusContact(
  pointerType: string,
  buttons: number,
  pressure: number
): boolean {
  if (pointerType !== 'pen' && pointerType !== 'eraser') return true;
  return (buttons & 1) !== 0 || pressure > 0;
}
