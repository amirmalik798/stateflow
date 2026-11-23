import React, { useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { worldToScreen } from '../engine/geometry';
import { Camera, StickyElement, TextElement } from '../types/whiteboard';

interface TextEditorOverlayProps {
  element: TextElement | StickyElement | null;
  camera: Camera;
  viewport: { width: number; height: number };
  onLiveChange?: (id: string, text: string) => void;
  onCommit: (id: string, text: string) => void;
  onCancel: () => void;
}

export const TextEditorOverlay: React.FC<TextEditorOverlayProps> = ({
  element,
  camera,
  viewport,
  onLiveChange,
  onCommit,
  onCancel,
}) => {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (element) {
      setText(element.text);
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
        textareaRef.current?.select();
      });
    }
  }, [element?.id]);

  if (!element) return null;

  const pos = worldToScreen(element.x, element.y, camera, viewport.width, viewport.height);
  const w = Math.min(Math.max(200, element.width * camera.zoom), viewport.width - 24);
  const h = Math.max(88, element.height * camera.zoom);

  const left = Math.max(12, Math.min(viewport.width - w - 12, pos.x));
  const top = Math.max(64, Math.min(viewport.height - 210, pos.y));

  const isSticky = element.type === 'sticky';
  const fontSize = isSticky ? 15 * camera.zoom : element.fontSize * camera.zoom;

  return (
    <div
      className="fixed inset-0 z-40"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) {
          onCommit(element.id, text);
        }
      }}
    >
      <div
        style={{
          position: 'fixed',
          left: `${left}px`,
          top: `${top}px`,
          width: `${w}px`,
        }}
        className="flex flex-col gap-2"
      >
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            const val = e.target.value;
            setText(val);
            onLiveChange?.(element.id, val);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              onCancel();
            } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onCommit(element.id, text);
            }
          }}
          placeholder={isSticky ? 'Write a note...' : 'Type text...'}
          style={{
            width: '100%',
            minHeight: `${h}px`,
            fontSize: `${Math.max(14, Math.min(48, fontSize))}px`,
            lineHeight: isSticky ? 1.45 : 1.35,
            backgroundColor: isSticky ? element.bgColor : 'rgba(255, 255, 255, 0.96)',
            color: isSticky ? element.textColor : '#0F172A',
          }}
          className={`resize-none outline-none shadow-2xl ring-2 ring-blue-500 ${
            isSticky
              ? 'rounded-[14px] p-4 font-medium'
              : 'rounded-xl px-3 py-2 font-semibold dark:bg-slate-900/95 dark:text-white'
          }`}
        />

        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[40px] px-3 rounded-xl bg-white/95 dark:bg-[#171A21]/95 backdrop-blur-md border border-slate-200/80 dark:border-white/10 text-slate-700 dark:text-slate-200 text-xs font-semibold shadow-md flex items-center gap-1 active:scale-95 transition-transform"
          >
            <X className="w-3.5 h-3.5" />
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onCommit(element.id, text)}
            className="min-h-[40px] px-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-md flex items-center gap-1 active:scale-95 transition-transform"
          >
            <Check className="w-3.5 h-3.5" />
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
