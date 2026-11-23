import { Board, CanvasElement, ThemeMode } from '../types/whiteboard';
import { getCombinedBounds, getElementBounds } from './geometry';
import { drawElement } from './renderer';

export function exportBoardToPNG(
  board: Board,
  theme: ThemeMode,
  transparent = false
): void {
  const elements = [...board.elements].sort((a, b) => a.zIndex - b.zIndex);
  const bounds = getCombinedBounds(elements);
  const pad = 64;

  const width = bounds ? Math.max(800, Math.ceil(bounds.width + pad * 2)) : 1200;
  const height = bounds ? Math.max(600, Math.ceil(bounds.height + pad * 2)) : 800;

  const canvas = document.createElement('canvas');
  const scale = 2;
  canvas.width = width * scale;
  canvas.height = height * scale;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.scale(scale, scale);
  if (!transparent) {
    ctx.fillStyle = theme === 'dark' ? '#0F1115' : '#F8F9FB';
    ctx.fillRect(0, 0, width, height);
  }

  if (bounds) {
    ctx.translate(
      (width - bounds.width) / 2 - bounds.x,
      (height - bounds.height) / 2 - bounds.y
    );
  }

  for (const el of elements) {
    drawElement(ctx, el, theme);
  }

  const link = document.createElement('a');
  const safeName = (board.title || 'slateflow-board').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  link.download = `${safeName}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function elementToSVG(el: CanvasElement): string {
  const opacity = el.opacity !== 1 ? ` opacity="${el.opacity}"` : '';
  switch (el.type) {
    case 'pen':
    case 'highlighter': {
      if (el.points.length === 0) return '';
      const op = el.type === 'highlighter' ? ` opacity="0.34"` : opacity;
      const cap = el.type === 'highlighter' ? 'butt' : 'round';
      if (el.points.length === 1) {
        return `<circle cx="${el.points[0].x}" cy="${el.points[0].y}" r="${el.strokeWidth / 2}" fill="${el.color}"${op} />`;
      }
      let d = `M ${el.points[0].x.toFixed(1)} ${el.points[0].y.toFixed(1)}`;
      for (let i = 1; i < el.points.length - 1; i++) {
        const mx = (el.points[i].x + el.points[i + 1].x) / 2;
        const my = (el.points[i].y + el.points[i + 1].y) / 2;
        d += ` Q ${el.points[i].x.toFixed(1)} ${el.points[i].y.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
      }
      const last = el.points[el.points.length - 1];
      d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
      return `<path d="${d}" fill="none" stroke="${el.color}" stroke-width="${el.strokeWidth}" stroke-linecap="${cap}" stroke-linejoin="round"${op} />`;
    }
    case 'rectangle': {
      const b = getElementBounds(el);
      const r = Math.min(12, b.width * 0.12, b.height * 0.12);
      const fill = el.fillColor && el.fillColor !== 'transparent' ? el.fillColor : 'none';
      return `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="${r}" fill="${fill}" stroke="${el.strokeColor}" stroke-width="${el.strokeWidth}"${opacity} />`;
    }
    case 'ellipse': {
      const b = getElementBounds(el);
      const fill = el.fillColor && el.fillColor !== 'transparent' ? el.fillColor : 'none';
      return `<ellipse cx="${b.x + b.width / 2}" cy="${b.y + b.height / 2}" rx="${b.width / 2}" ry="${b.height / 2}" fill="${fill}" stroke="${el.strokeColor}" stroke-width="${el.strokeWidth}"${opacity} />`;
    }
    case 'diamond': {
      const b = getElementBounds(el);
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      const fill = el.fillColor && el.fillColor !== 'transparent' ? el.fillColor : 'none';
      return `<polygon points="${cx},${b.y} ${b.x + b.width},${cy} ${cx},${b.y + b.height} ${b.x},${cy}" fill="${fill}" stroke="${el.strokeColor}" stroke-width="${el.strokeWidth}" stroke-linejoin="round"${opacity} />`;
    }
    case 'line':
    case 'arrow': {
      const base = `<line x1="${el.x1}" y1="${el.y1}" x2="${el.x2}" y2="${el.y2}" stroke="${el.strokeColor}" stroke-width="${el.strokeWidth}" stroke-linecap="round"${opacity} />`;
      if (el.type === 'line') return base;
      const angle = Math.atan2(el.y2 - el.y1, el.x2 - el.x1);
      const headLen = Math.max(12, el.strokeWidth * 4.2);
      const spread = Math.PI / 6.5;
      const ax1 = el.x2 - headLen * Math.cos(angle - spread);
      const ay1 = el.y2 - headLen * Math.sin(angle - spread);
      const ax2 = el.x2 - headLen * Math.cos(angle + spread);
      const ay2 = el.y2 - headLen * Math.sin(angle + spread);
      return `<g${opacity}>${base}<path d="M ${ax1} ${ay1} L ${el.x2} ${el.y2} L ${ax2} ${ay2}" fill="none" stroke="${el.strokeColor}" stroke-width="${el.strokeWidth}" stroke-linecap="round" stroke-linejoin="round" /></g>`;
    }
    case 'sticky': {
      const b = getElementBounds(el);
      const lines = el.text.split('\n');
      const tspans = lines
        .map((line, i) => `<tspan x="${b.x + 16}" dy="${i === 0 ? 0 : 21}">${escapeXml(line)}</tspan>`)
        .join('');
      return `<g${opacity}><rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="14" fill="${el.bgColor}" stroke="rgba(15,23,42,0.08)" /><text x="${b.x + 16}" y="${b.y + 30}" fill="${el.textColor}" font-family="Plus Jakarta Sans, sans-serif" font-size="15" font-weight="500">${tspans}</text></g>`;
    }
    case 'text': {
      const b = getElementBounds(el);
      const lines = el.text.split('\n');
      const lh = el.fontSize * 1.35;
      const tspans = lines
        .map((line, i) => `<tspan x="${b.x}" dy="${i === 0 ? 0 : lh}">${escapeXml(line)}</tspan>`)
        .join('');
      return `<text x="${b.x}" y="${b.y + el.fontSize}" fill="${el.color}" font-family="Plus Jakarta Sans, sans-serif" font-size="${el.fontSize}" font-weight="600"${opacity}>${tspans}</text>`;
    }
    case 'image': {
      const b = getElementBounds(el);
      return `<image href="${el.dataUrl}" x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" preserveAspectRatio="none"${opacity} />`;
    }
  }
}

export function exportBoardToSVG(
  board: Board,
  theme: ThemeMode,
  transparent = false
): void {
  const elements = [...board.elements].sort((a, b) => a.zIndex - b.zIndex);
  const bounds = getCombinedBounds(elements);
  const pad = 64;
  const vx = bounds ? bounds.x - pad : -400;
  const vy = bounds ? bounds.y - pad : -300;
  const vw = bounds ? bounds.width + pad * 2 : 800;
  const vh = bounds ? bounds.height + pad * 2 : 600;
  const bg = theme === 'dark' ? '#0F1115' : '#F8F9FB';

  const bgRect = transparent ? '' : `\n  <rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="${bg}" />`;
  const body = elements.map(elementToSVG).join('\n  ');
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${vw} ${vh}" width="${Math.ceil(vw)}" height="${Math.ceil(vh)}">${bgRect}
  ${body}
</svg>`;

  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeName = (board.title || 'slateflow-board').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  link.download = `${safeName}.svg`;
  link.href = url;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportBoardToJSON(board: Board): void {
  const blob = new Blob([JSON.stringify(board, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeName = (board.title || 'slateflow-board').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  link.download = `${safeName}.slateflow.json`;
  link.href = url;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
