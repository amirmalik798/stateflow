import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Copy, Plus, Search, Trash2, X } from 'lucide-react';
import { BOARD_TEMPLATES } from '../constants/templates';
import { renderBoardThumbnail } from '../engine/renderer';
import { Board, BoardTemplateId, CanvasElement, ThemeMode } from '../types/whiteboard';

interface BoardsDrawerProps {
  open: boolean;
  isReadOnly: boolean;
  theme: ThemeMode;
  onClose: () => void;
  boards: Board[];
  activeBoardId: string;
  onSelectBoard: (id: string) => void;
  onCreateBoard: (templateId?: BoardTemplateId) => void;
  onDuplicateBoard: (id: string) => void;
  onDeleteBoard: (id: string) => void;
}

function formatRelativeTime(ts: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

const BoardThumbnail: React.FC<{ elements: CanvasElement[]; theme: ThemeMode }> = ({
  elements,
  theme,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderBoardThumbnail(canvas, elements, theme);
  }, [elements, theme]);

  return (
    <div className="relative w-16 h-11 rounded-xl overflow-hidden border border-slate-200/80 dark:border-white/10 shrink-0 bg-slate-100 dark:bg-[#0F1115]">
      <canvas ref={canvasRef} width={128} height={88} className="w-full h-full block" />
      {elements.length === 0 && (
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              theme === 'dark'
                ? 'radial-gradient(#94A3B8 1px, transparent 1px)'
                : 'radial-gradient(#64748B 1px, transparent 1px)',
            backgroundSize: '8px 8px',
          }}
        />
      )}
    </div>
  );
};

const TemplateGlyph: React.FC<{ id: BoardTemplateId; theme: ThemeMode }> = ({ id, theme }) => {
  const isDark = theme === 'dark';
  const stroke = isDark ? '#475569' : '#CBD5E1';

  if (id === 'blank') {
    return (
      <div
        className="w-full h-14 rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-50 dark:bg-[#0F1115] relative overflow-hidden"
        style={{
          backgroundImage: isDark
            ? 'radial-gradient(rgba(148,163,184,0.3) 1px, transparent 1px)'
            : 'radial-gradient(rgba(100,116,139,0.32) 1px, transparent 1px)',
          backgroundSize: '8px 8px',
        }}
      />
    );
  }

  if (id === 'kanban') {
    return (
      <svg
        viewBox="0 0 120 56"
        className="w-full h-14 rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-50 dark:bg-[#0F1115]"
        aria-hidden="true"
      >
        <rect x="8" y="8" width="32" height="40" rx="4" fill="none" stroke={stroke} strokeWidth="1.2" />
        <rect x="44" y="8" width="32" height="40" rx="4" fill="none" stroke="#2563EB" strokeOpacity="0.65" strokeWidth="1.2" />
        <rect x="80" y="8" width="32" height="40" rx="4" fill="none" stroke="#10B981" strokeOpacity="0.65" strokeWidth="1.2" />
        <rect x="12" y="15" width="24" height="12" rx="2" fill="#FEF08A" />
        <rect x="48" y="15" width="24" height="12" rx="2" fill="#BAE6FD" />
        <rect x="84" y="15" width="24" height="12" rx="2" fill="#BBF7D0" />
      </svg>
    );
  }

  if (id === 'meeting') {
    return (
      <svg
        viewBox="0 0 120 56"
        className="w-full h-14 rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-50 dark:bg-[#0F1115]"
        aria-hidden="true"
      >
        <rect x="10" y="7" width="36" height="4" rx="2" fill="#2563EB" fillOpacity="0.85" />
        <rect x="10" y="15" width="48" height="18" rx="3" fill="none" stroke="#3B82F6" strokeOpacity="0.6" strokeWidth="1.2" />
        <rect x="62" y="15" width="48" height="18" rx="3" fill="none" stroke="#7C3AED" strokeOpacity="0.6" strokeWidth="1.2" />
        <rect x="10" y="36" width="100" height="13" rx="3" fill="none" stroke="#10B981" strokeOpacity="0.6" strokeWidth="1.2" />
        <rect x="14" y="20" width="18" height="9" rx="1.5" fill="#BAE6FD" />
        <rect x="66" y="20" width="18" height="9" rx="1.5" fill="#FEF08A" />
        <rect x="14" y="39" width="22" height="7" rx="1.5" fill="#BBF7D0" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 120 56"
      className="w-full h-14 rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-50 dark:bg-[#0F1115]"
      aria-hidden="true"
    >
      <line x1="12" y1="28" x2="108" y2="28" stroke={stroke} strokeWidth="1.5" />
      <line x1="60" y1="6" x2="60" y2="50" stroke={stroke} strokeWidth="1.5" />
      <rect x="24" y="11" width="22" height="11" rx="2" fill="#BBF7D0" />
      <rect x="74" y="11" width="22" height="11" rx="2" fill="#BAE6FD" />
      <rect x="24" y="34" width="22" height="11" rx="2" fill="#FEF08A" />
      <rect x="74" y="34" width="22" height="11" rx="2" fill="#FECDD3" />
    </svg>
  );
};

export const BoardsDrawer: React.FC<BoardsDrawerProps> = ({
  open,
  isReadOnly,
  theme,
  onClose,
  boards,
  activeBoardId,
  onSelectBoard,
  onCreateBoard,
  onDuplicateBoard,
  onDeleteBoard,
}) => {
  const [query, setQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);

  useEffect(() => {
    if (!open) {
      setConfirmDeleteId(null);
      setShowTemplates(false);
    }
  }, [open]);

  if (!open) return null;

  const filtered = boards.filter((b) =>
    b.title.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-start bg-black/50 backdrop-blur-xs"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside className="w-full sm:w-96 max-h-[85dvh] sm:max-h-full bg-white dark:bg-[#171A21] rounded-t-3xl sm:rounded-none sm:rounded-r-3xl border-t sm:border-r border-slate-200 dark:border-white/[0.08] shadow-2xl flex flex-col overflow-hidden pb-safe">
        <div className="sm:hidden w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3 mb-1" />

        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200/70 dark:border-white/[0.08]">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
              SlateFlow Boards
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {boards.length} {boards.length === 1 ? 'board' : 'boards'} · Cloud synced
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close boards drawer"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-2xl text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 py-3 flex items-center gap-2">
          {showTemplates ? (
            <div className="flex items-center justify-between w-full">
              <button
                type="button"
                onClick={() => setShowTemplates(false)}
                className="h-9 px-2.5 -ml-1 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>All Boards</span>
              </button>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Choose a Starter Template
              </span>
            </div>
          ) : (
            <>
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search boards..."
                  className="w-full h-11 pl-10 pr-3 rounded-2xl bg-slate-100 dark:bg-white/[0.06] text-sm text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={() => setShowTemplates(true)}
                  className="h-11 px-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 active:scale-95 transition-transform"
                >
                  <Plus className="w-4 h-4" />
                  New
                </button>
              )}
            </>
          )}
        </div>

        {showTemplates && !isReadOnly ? (
          <div className="flex-1 overflow-y-auto px-4 pb-5">
            <div className="grid grid-cols-2 gap-2.5">
              {BOARD_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => {
                    onCreateBoard(tpl.id);
                    setShowTemplates(false);
                    onClose();
                  }}
                  className="group text-left p-2.5 rounded-2xl border border-slate-200/80 dark:border-white/[0.08] bg-slate-50/60 dark:bg-white/[0.03] hover:border-blue-500/60 hover:bg-blue-50/40 dark:hover:bg-blue-500/10 active:scale-[0.98] transition-all"
                >
                  <TemplateGlyph id={tpl.id} theme={theme} />
                  <div className="mt-2 text-xs font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate">
                    {tpl.label}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {tpl.description}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (

        <div className="flex-1 overflow-y-auto px-3 pb-4 divide-y divide-slate-100 dark:divide-white/[0.06]">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
              No boards match "{query}".
            </div>
          ) : (
            filtered.map((board) => {
              const isActive = board.id === activeBoardId;
              const confirmingDelete = confirmDeleteId === board.id;

              return (
                <div
                  key={board.id}
                  className={`flex items-center justify-between gap-2.5 px-2.5 py-2.5 rounded-2xl my-1 transition-colors ${
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-500/15'
                      : 'hover:bg-slate-50 dark:hover:bg-white/[0.04]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectBoard(board.id);
                      onClose();
                    }}
                    className="flex-1 min-w-0 flex items-center gap-3 text-left py-0.5"
                  >
                    <BoardThumbnail elements={board.elements} theme={theme} />
                    <div className="min-w-0 flex-1">
                      <div
                        className={`text-sm font-semibold truncate ${
                          isActive
                            ? 'text-blue-700 dark:text-blue-400'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {board.title}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono-tabular">
                        <span>{board.elements.length} items</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatRelativeTime(board.updatedAt)}</span>
                      </div>
                    </div>
                  </button>

                  {!isReadOnly && (
                    <div className="flex items-center gap-1 shrink-0">
                      {confirmingDelete ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="h-9 px-2.5 rounded-xl bg-slate-200/80 dark:bg-white/10 text-slate-700 dark:text-slate-200 text-xs font-semibold"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmDeleteId(null);
                              onDeleteBoard(board.id);
                            }}
                            className="h-9 px-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold"
                          >
                            Delete
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => onDuplicateBoard(board.id)}
                            aria-label={`Duplicate ${board.title}`}
                            title="Duplicate board"
                            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-white/10"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          {boards.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(board.id)}
                              aria-label={`Delete ${board.title}`}
                              title="Delete board"
                              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/15"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
        )}
      </aside>
    </div>
  );
};
