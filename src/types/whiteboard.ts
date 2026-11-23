export type ToolType =
  | 'select'
  | 'pan'
  | 'pen'
  | 'highlighter'
  | 'eraser'
  | 'rectangle'
  | 'ellipse'
  | 'diamond'
  | 'arrow'
  | 'line'
  | 'sticky'
  | 'text';

export type GridStyle = 'dots' | 'grid' | 'blank';

export type ThemeMode = 'light' | 'dark';

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface Point {
  x: number;
  y: number;
  pressure?: number;
}

export interface BaseElement {
  id: string;
  zIndex: number;
  opacity: number;
  /** Client-only metadata from Firestore, used to make local stroke retries idempotent. */
  createdAtMs?: number;
  locked?: boolean;
}

export interface StrokeElement extends BaseElement {
  type: 'pen' | 'highlighter';
  points: Point[];
  color: string;
  strokeWidth: number;
}

export interface ShapeElement extends BaseElement {
  type: 'rectangle' | 'ellipse' | 'diamond';
  x: number;
  y: number;
  width: number;
  height: number;
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
}

export interface LineElement extends BaseElement {
  type: 'line' | 'arrow';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  strokeColor: string;
  strokeWidth: number;
}

export interface StickyElement extends BaseElement {
  type: 'sticky';
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  bgColor: string;
  textColor: string;
}

export interface TextElement extends BaseElement {
  type: 'text';
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: string;
  fontSize: number;
}

export interface ImageElement extends BaseElement {
  type: 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  dataUrl: string;
}

export type CanvasElement =
  | StrokeElement
  | ShapeElement
  | LineElement
  | StickyElement
  | TextElement
  | ImageElement;

export interface Board {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  gridStyle: GridStyle;
  camera: Camera;
  elements: CanvasElement[];
}

export interface ToolSettings {
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  highlighterColor: string;
  highlighterWidth: number;
  stickyColor: string;
  fontSize: number;
  activeShape: 'rectangle' | 'ellipse' | 'diamond' | 'arrow' | 'line';
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se' | 'start' | 'end';

export interface RemoteCursor {
  x: number;
  y: number;
  color: string;
  active: boolean;
  tool: ToolType;
}

export interface PhoneViewportFrame {
  camera: Camera;
  width: number;
  height: number;
}

export type BoardTemplateId = 'blank' | 'kanban' | 'meeting' | 'quadrant';

