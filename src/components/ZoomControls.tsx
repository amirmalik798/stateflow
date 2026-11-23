import React from 'react';
import { Maximize2, Minus, Plus } from 'lucide-react';

interface ZoomControlsProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onFitContent: () => void;
}

export const ZoomControls: React.FC<ZoomControlsProps> = ({
  zoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onFitContent,
}) => {
  const percent = Math.round(zoom * 100);

  return (
    <div className="fixed top-16 left-3 sm:top-auto sm:bottom-5 sm:left-4 z-20 flex items-center gap-0.5 h-10 px-1 rounded-2xl bg-white/88 dark:bg-[#171A21]/88 backdrop-blur-xl border border-slate-200/80 dark:border-white/[0.08] shadow-md shadow-slate-900/5 dark:shadow-black/30">
      <button
        type="button"
        onClick={onZoomOut}
        aria-label="Zoom out"
        title="Zoom out"
        className="min-h-[36px] min-w-[36px] hidden sm:flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 active:scale-95 transition-transform"
      >
        <Minus className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={onResetZoom}
        title="Tap to reset zoom to 100%"
        className="h-8 px-2.5 rounded-xl text-xs font-medium font-mono-tabular text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors whitespace-nowrap"
      >
        {percent}%
      </button>

      <button
        type="button"
        onClick={onZoomIn}
        aria-label="Zoom in"
        title="Zoom in"
        className="min-h-[36px] min-w-[36px] hidden sm:flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 active:scale-95 transition-transform"
      >
        <Plus className="w-4 h-4" />
      </button>

      <div className="w-px h-4 bg-slate-200 dark:bg-white/10 mx-0.5" aria-hidden="true" />

      <button
        type="button"
        onClick={onFitContent}
        aria-label="Fit board to screen"
        title="Fit all content"
        className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 active:scale-95 transition-transform"
      >
        <Maximize2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
