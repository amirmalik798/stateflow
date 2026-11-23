import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Circle,
  Diamond,
  Eraser,
  Hand,
  Highlighter,
  ImagePlus,
  Minus,
  MousePointer2,
  PenTool,
  SlidersHorizontal,
  Square,
  StickyNote,
  Type,
  X,
} from 'lucide-react';
import {
  FONT_SIZES,
  HIGHLIGHTER_COLORS,
  HIGHLIGHTER_WIDTHS,
  INK_COLORS,
  STICKY_COLORS,
  STROKE_WIDTHS,
} from '../constants/palette';
import { ToolSettings, ToolType } from '../types/whiteboard';

interface BottomToolDockProps {
  activeTool: ToolType;
  selectedCount: number;
  canvasInteractTick: number;
  onSelectTool: (tool: ToolType) => void;
  settings: ToolSettings;
  onUpdateSettings: (patch: Partial<ToolSettings>) => void;
  onImportImage: (file: File) => void;
}

const SHAPE_OPTIONS: {
  id: ToolSettings['activeShape'];
  label: string;
  icon: React.FC<{ className?: string }>;
}[] = [
  { id: 'rectangle', label: 'Rectangle', icon: Square },
  { id: 'ellipse', label: 'Ellipse', icon: Circle },
  { id: 'diamond', label: 'Diamond', icon: Diamond },
  { id: 'arrow', label: 'Arrow', icon: ArrowUpRight },
  { id: 'line', label: 'Line', icon: Minus },
];

const QUICK_INK_COLORS = [
  { label: 'Obsidian', hex: '#0F172A' },
  { label: 'Chalk', hex: '#F8FAFC' },
  { label: 'Cobalt', hex: '#2563EB' },
  { label: 'Crimson', hex: '#F43F5E' },
  { label: 'Emerald', hex: '#10B981' },
];

export const BottomToolDock: React.FC<BottomToolDockProps> = ({
  activeTool,
  selectedCount,
  canvasInteractTick,
  onSelectTool,
  settings,
  onUpdateSettings,
  onImportImage,
}) => {
  const [sheetOpen, setSheetOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (canvasInteractTick > 0) {
      setSheetOpen(false);
    }
  }, [canvasInteractTick]);

  const isShapeActive =
    activeTool === 'rectangle' ||
    activeTool === 'ellipse' ||
    activeTool === 'diamond' ||
    activeTool === 'arrow' ||
    activeTool === 'line';

  const ActiveShapeIcon =
    SHAPE_OPTIONS.find((s) => s.id === settings.activeShape)?.icon ?? Square;

  const activeIndicatorColor =
    activeTool === 'highlighter'
      ? settings.highlighterColor
      : activeTool === 'sticky'
      ? settings.stickyColor
      : settings.strokeColor;

  const toolButtons: {
    id: ToolType;
    label: string;
    icon: React.FC<{ className?: string }>;
    isActive: boolean;
    onClick: () => void;
  }[] = [
    {
      id: 'select',
      label: 'Select',
      icon: MousePointer2,
      isActive: activeTool === 'select',
      onClick: () => onSelectTool('select'),
    },
    {
      id: 'pan',
      label: 'Pan',
      icon: Hand,
      isActive: activeTool === 'pan',
      onClick: () => onSelectTool('pan'),
    },
    {
      id: 'pen',
      label: 'Pen',
      icon: PenTool,
      isActive: activeTool === 'pen',
      onClick: () => {
        if (activeTool === 'pen') setSheetOpen((v) => !v);
        else onSelectTool('pen');
      },
    },
    {
      id: 'highlighter',
      label: 'Marker',
      icon: Highlighter,
      isActive: activeTool === 'highlighter',
      onClick: () => {
        if (activeTool === 'highlighter') setSheetOpen((v) => !v);
        else onSelectTool('highlighter');
      },
    },
    {
      id: settings.activeShape,
      label: 'Shapes',
      icon: ActiveShapeIcon,
      isActive: isShapeActive,
      onClick: () => {
        if (isShapeActive) {
          setSheetOpen((v) => !v);
        } else {
          onSelectTool(settings.activeShape);
          setSheetOpen(true);
        }
      },
    },
    {
      id: 'sticky',
      label: 'Sticky',
      icon: StickyNote,
      isActive: activeTool === 'sticky',
      onClick: () => {
        if (activeTool === 'sticky') setSheetOpen((v) => !v);
        else onSelectTool('sticky');
      },
    },
    {
      id: 'text',
      label: 'Text',
      icon: Type,
      isActive: activeTool === 'text',
      onClick: () => {
        if (activeTool === 'text') setSheetOpen((v) => !v);
        else onSelectTool('text');
      },
    },
    {
      id: 'eraser',
      label: 'Eraser',
      icon: Eraser,
      isActive: activeTool === 'eraser',
      onClick: () => onSelectTool('eraser'),
    },
  ];

  const showQuickSwatches =
    !sheetOpen &&
    selectedCount === 0 &&
    (activeTool === 'pen' || activeTool === 'highlighter' || isShapeActive);

  return (
    <div className="fixed bottom-3 left-0 right-0 z-30 flex flex-col items-center pointer-events-none pb-safe px-3">
      {/* Compact Quick Swatch Strip */}
      {showQuickSwatches && (
        <div className="pointer-events-auto mb-2 flex items-center gap-1.5 px-2.5 py-1 rounded-2xl bg-white/90 dark:bg-[#171A21]/90 backdrop-blur-xl border border-slate-200/80 dark:border-white/[0.08] shadow-md shadow-slate-900/5 dark:shadow-black/30">
          {activeTool === 'highlighter'
            ? HIGHLIGHTER_COLORS.slice(0, 4).map((c) => {
                const active = settings.highlighterColor === c.hex;
                return (
                  <button
                    key={c.hex}
                    type="button"
                    onClick={() => onUpdateSettings({ highlighterColor: c.hex })}
                    aria-label={c.label}
                    title={c.label}
                    className={`w-6 h-6 rounded-full border transition-transform ${
                      active
                        ? 'ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-[#171A21] scale-110 border-black/20'
                        : 'border-black/15 hover:scale-105'
                    }`}
                    style={{ backgroundColor: c.hex }}
                  />
                );
              })
            : QUICK_INK_COLORS.map((c) => {
                const active = settings.strokeColor === c.hex;
                return (
                  <button
                    key={c.hex}
                    type="button"
                    onClick={() => onUpdateSettings({ strokeColor: c.hex })}
                    aria-label={c.label}
                    title={c.label}
                    className={`w-6 h-6 rounded-full border transition-transform ${
                      active
                        ? 'ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-[#171A21] scale-110 border-black/20'
                        : 'border-black/15 dark:border-white/20 hover:scale-105'
                    }`}
                    style={{ backgroundColor: c.hex }}
                  />
                );
              })}
          <div className="w-px h-4 bg-slate-200 dark:bg-white/10 mx-0.5" aria-hidden="true" />
          <button
            type="button"
            onClick={() => {
              if (activeTool === 'highlighter') {
                const idx = HIGHLIGHTER_WIDTHS.indexOf(settings.highlighterWidth);
                const next = HIGHLIGHTER_WIDTHS[(idx + 1) % HIGHLIGHTER_WIDTHS.length];
                onUpdateSettings({ highlighterWidth: next });
              } else {
                const quickWidths = [2, 3.5, 6, 10];
                const idx = quickWidths.indexOf(settings.strokeWidth);
                const next = quickWidths[(idx + 1) % quickWidths.length];
                onUpdateSettings({ strokeWidth: next });
              }
            }}
            aria-label="Cycle stroke size"
            title="Tap to cycle stroke size"
            className="h-7 px-2 rounded-xl bg-slate-100 dark:bg-white/[0.08] text-[11px] font-mono-tabular font-semibold text-slate-700 dark:text-slate-200 active:scale-95 transition-transform"
          >
            {activeTool === 'highlighter' ? settings.highlighterWidth : settings.strokeWidth}px
          </button>
        </div>
      )}

      {/* Expandable Properties Sheet */}
      {sheetOpen && (
        <div className="pointer-events-auto mb-2.5 w-full max-w-md rounded-3xl bg-white/95 dark:bg-[#171A21]/95 backdrop-blur-xl border border-slate-200/80 dark:border-white/[0.08] shadow-2xl shadow-slate-900/15 dark:shadow-black/50 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {activeTool === 'highlighter'
                ? 'Highlighter Options'
                : activeTool === 'sticky'
                ? 'Sticky Note Color'
                : activeTool === 'text'
                ? 'Text Style'
                : isShapeActive
                ? 'Shape & Style'
                : 'Ink & Stroke'}
            </span>
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              aria-label="Close properties"
              className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Shape Type Selector */}
          {isShapeActive && (
            <div className="grid grid-cols-5 gap-1.5 mb-4 p-1 rounded-2xl bg-slate-100 dark:bg-white/[0.06]">
              {SHAPE_OPTIONS.map((s) => {
                const Icon = s.icon;
                const active = activeTool === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      onUpdateSettings({ activeShape: s.id });
                      onSelectTool(s.id);
                    }}
                    title={s.label}
                    aria-label={s.label}
                    className={`min-h-[40px] flex items-center justify-center rounded-xl transition-colors ${
                      active
                        ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                );
              })}
            </div>
          )}

          {/* Color Palette */}
          {activeTool === 'sticky' ? (
            <div className="flex items-center justify-between gap-2">
              {STICKY_COLORS.map((c) => {
                const active = settings.stickyColor === c.bg;
                return (
                  <button
                    key={c.bg}
                    type="button"
                    onClick={() => onUpdateSettings({ stickyColor: c.bg })}
                    aria-label={c.label}
                    title={c.label}
                    className={`w-10 h-10 rounded-2xl border transition-transform ${
                      active
                        ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-[#171A21] scale-105 border-black/15'
                        : 'border-black/10 hover:scale-105'
                    }`}
                    style={{ backgroundColor: c.bg }}
                  />
                );
              })}
            </div>
          ) : activeTool === 'highlighter' ? (
            <>
              <div className="flex items-center justify-between gap-2 mb-4">
                {HIGHLIGHTER_COLORS.map((c) => {
                  const active = settings.highlighterColor === c.hex;
                  return (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => onUpdateSettings({ highlighterColor: c.hex })}
                      aria-label={c.label}
                      title={c.label}
                      className={`w-9 h-9 rounded-full border transition-transform ${
                        active
                          ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-[#171A21] scale-110 border-black/20'
                          : 'border-black/10 hover:scale-105'
                      }`}
                      style={{ backgroundColor: c.hex }}
                    />
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400 w-12 shrink-0">Size</span>
                <div className="flex-1 flex items-center gap-2">
                  {HIGHLIGHTER_WIDTHS.map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => onUpdateSettings({ highlighterWidth: w })}
                      className={`flex-1 h-9 rounded-xl font-mono-tabular text-xs font-medium transition-colors ${
                        settings.highlighterWidth === w
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 dark:bg-white/[0.06] text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {w}px
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-8 gap-1.5 mb-4">
                {INK_COLORS.map((c) => {
                  const active = settings.strokeColor === c.hex;
                  return (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => onUpdateSettings({ strokeColor: c.hex })}
                      aria-label={c.label}
                      title={c.label}
                      className={`w-9 h-9 rounded-full border transition-transform justify-self-center ${
                        active
                          ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-[#171A21] scale-110 border-black/20'
                          : 'border-black/15 dark:border-white/20 hover:scale-105'
                      }`}
                      style={{ backgroundColor: c.hex }}
                    />
                  );
                })}
              </div>

              {activeTool === 'text' ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 dark:text-slate-400 w-12 shrink-0">Size</span>
                  <div className="flex-1 grid grid-cols-4 gap-1.5">
                    {FONT_SIZES.map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => onUpdateSettings({ fontSize: sz })}
                        className={`h-9 rounded-xl font-mono-tabular text-xs font-medium transition-colors ${
                          settings.fontSize === sz
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 dark:bg-white/[0.06] text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {sz}px
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 dark:text-slate-400 w-12 shrink-0">Stroke</span>
                    <div className="flex-1 grid grid-cols-5 gap-1.5">
                      {STROKE_WIDTHS.map((w) => (
                        <button
                          key={w}
                          type="button"
                          onClick={() => onUpdateSettings({ strokeWidth: w })}
                          aria-label={`Stroke ${w}px`}
                          className={`h-9 rounded-xl flex items-center justify-center transition-colors ${
                            settings.strokeWidth === w
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-100 dark:bg-white/[0.06] text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <span
                            className="rounded-full bg-current"
                            style={{
                              width: `${Math.min(18, Math.max(4, w + 2))}px`,
                              height: `${Math.min(18, Math.max(4, w + 2))}px`,
                            }}
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  {(activeTool === 'rectangle' || activeTool === 'ellipse' || activeTool === 'diamond') && (
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-200/70 dark:border-white/[0.08]">
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                        Soft Fill Tint
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSettings({
                            fillColor:
                              settings.fillColor === 'transparent' ? 'tinted' : 'transparent',
                          })
                        }
                        className={`px-3 h-8 rounded-xl text-xs font-semibold transition-colors ${
                          settings.fillColor !== 'transparent'
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {settings.fillColor !== 'transparent' ? 'Filled' : 'Outline Only'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Main Thumb-Zone Floating Tool Dock */}
      <nav
        aria-label="Whiteboard tools"
        className="pointer-events-auto flex items-center gap-0.5 sm:gap-1 p-1.5 rounded-3xl bg-white/92 dark:bg-[#171A21]/92 backdrop-blur-xl border border-slate-200/80 dark:border-white/[0.08] shadow-xl shadow-slate-900/10 dark:shadow-black/45 max-w-full overflow-x-auto no-scrollbar"
      >
        {toolButtons.map((btn) => {
          const Icon = btn.icon;
          return (
            <button
              key={btn.label}
              type="button"
              onClick={btn.onClick}
              aria-label={btn.label}
              aria-pressed={btn.isActive}
              title={btn.label}
              className={`min-h-[44px] min-w-[44px] flex flex-col items-center justify-center rounded-2xl transition-all active:scale-95 shrink-0 focus-visible:outline-2 focus-visible:outline-blue-500 ${
                btn.isActive
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10'
              }`}
            >
              <Icon className="w-[19px] h-[19px]" />
            </button>
          );
        })}

        <div className="w-px h-6 bg-slate-200 dark:bg-white/10 mx-0.5 shrink-0" aria-hidden="true" />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Add image"
          title="Import Image"
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-2xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 active:scale-95 transition-all shrink-0 focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          <ImagePlus className="w-[19px] h-[19px]" />
        </button>

        <button
          type="button"
          onClick={() => setSheetOpen((v) => !v)}
          aria-label="Color and stroke settings"
          aria-expanded={sheetOpen}
          title="Style & Colors"
          className={`min-h-[44px] min-w-[44px] flex items-center justify-center gap-1 rounded-2xl transition-all active:scale-95 shrink-0 focus-visible:outline-2 focus-visible:outline-blue-500 ${
            sheetOpen
              ? 'bg-slate-200 dark:bg-white/15 text-slate-900 dark:text-white'
              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10'
          }`}
        >
          <span
            className="w-5 h-5 rounded-full border border-black/20 dark:border-white/25 shadow-inner"
            style={{ backgroundColor: activeIndicatorColor }}
          />
          <SlidersHorizontal className="w-3.5 h-3.5 opacity-60 hidden sm:block" />
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onImportImage(file);
            e.target.value = '';
          }}
        />
      </nav>
    </div>
  );
};
