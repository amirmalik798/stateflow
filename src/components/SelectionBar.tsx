import React from 'react';
import { ArrowDownToLine, ArrowUpToLine, Copy, Trash2 } from 'lucide-react';
import { INK_COLORS } from '../constants/palette';

interface SelectionBarProps {
  selectedCount: number;
  onDuplicate: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onDelete: () => void;
  onApplyColor: (hex: string) => void;
}

export const SelectionBar: React.FC<SelectionBarProps> = ({
  selectedCount,
  onDuplicate,
  onBringToFront,
  onSendToBack,
  onDelete,
  onApplyColor,
}) => {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 px-2 py-1.5 rounded-2xl bg-white/95 dark:bg-[#171A21]/95 backdrop-blur-xl border border-slate-200/80 dark:border-white/[0.1] shadow-xl shadow-slate-900/10 dark:shadow-black/40 max-w-[94vw] overflow-x-auto no-scrollbar">
      <span className="px-2 text-xs font-semibold font-mono-tabular text-slate-600 dark:text-slate-300 whitespace-nowrap shrink-0">
        {selectedCount} selected
      </span>

      <div className="w-px h-5 bg-slate-200 dark:bg-white/10 mx-0.5 shrink-0" aria-hidden="true" />

      <div className="flex items-center gap-1 px-1 shrink-0">
        {INK_COLORS.slice(0, 6).map((c) => (
          <button
            key={c.hex}
            type="button"
            onClick={() => onApplyColor(c.hex)}
            aria-label={`Color ${c.label}`}
            title={c.label}
            className="w-6 h-6 rounded-full border border-black/15 dark:border-white/20 hover:scale-110 active:scale-95 transition-transform shrink-0"
            style={{ backgroundColor: c.hex }}
          />
        ))}
      </div>

      <div className="w-px h-5 bg-slate-200 dark:bg-white/10 mx-0.5 shrink-0" aria-hidden="true" />

      <button
        type="button"
        onClick={onDuplicate}
        aria-label="Duplicate selection"
        title="Duplicate (Ctrl+D)"
        className="min-h-[40px] min-w-[40px] sm:min-h-[36px] sm:min-w-[36px] flex items-center justify-center rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 active:scale-95 transition-transform shrink-0"
      >
        <Copy className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={onBringToFront}
        aria-label="Bring to front"
        title="Bring to front"
        className="min-h-[40px] min-w-[40px] sm:min-h-[36px] sm:min-w-[36px] flex items-center justify-center rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 active:scale-95 transition-transform shrink-0"
      >
        <ArrowUpToLine className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={onSendToBack}
        aria-label="Send to back"
        title="Send to back"
        className="min-h-[40px] min-w-[40px] sm:min-h-[36px] sm:min-w-[36px] flex items-center justify-center rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 active:scale-95 transition-transform shrink-0"
      >
        <ArrowDownToLine className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete selection"
        title="Delete"
        className="min-h-[40px] min-w-[40px] sm:min-h-[36px] sm:min-w-[36px] flex items-center justify-center rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/15 active:scale-95 transition-transform shrink-0"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
};
