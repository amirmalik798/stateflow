import React, { useEffect, useRef, useState } from 'react';
import {
  Download,
  Eye,
  CloudUpload,
  LoaderCircle,
  Fingerprint,
  FolderKanban,
  Hand,
  LocateFixed,
  Maximize,
  Minimize,
  MoreHorizontal,
  Moon,
  Redo2,
  Sun,
  Undo2,
} from 'lucide-react';
import { SyncStatus } from '../hooks/useBoardSync';
import type { StrokeSyncStatus } from '../hooks/useFirestoreBoards';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { ThemeMode } from '../types/whiteboard';

interface TopBarProps {
  boardTitle: string;
  isReadOnly: boolean;
  syncStatus: SyncStatus;
  strokeSyncStatus: StrokeSyncStatus;
  pendingChangeCount: number;
  onSaveNow: () => void;
  followPhone: boolean;
  onToggleFollowPhone: () => void;
  zenMode: boolean;
  onToggleZenMode: () => void;
  fingerDrawEnabled: boolean;
  onToggleFingerDraw: () => void;
  onRenameBoard: (title: string) => void;
  onOpenBoards: () => void;
  onOpenMenu: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  boardTitle,
  isReadOnly,
  syncStatus,
  strokeSyncStatus,
  pendingChangeCount,
  onSaveNow,
  followPhone,
  onToggleFollowPhone,
  zenMode,
  onToggleZenMode,
  fingerDrawEnabled,
  onToggleFingerDraw,
  onRenameBoard,
  onOpenBoards,
  onOpenMenu,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  theme,
  onToggleTheme,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(boardTitle);
  const inputRef = useRef<HTMLInputElement>(null);
  const { isInstallable, isInstalled, install } = usePWAInstall();

  useEffect(() => {
    setDraftTitle(boardTitle);
  }, [boardTitle]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const commitTitle = () => {
    setIsEditing(false);
    const trimmed = draftTitle.trim();
    if (trimmed && trimmed !== boardTitle) {
      onRenameBoard(trimmed);
    } else {
      setDraftTitle(boardTitle);
    }
  };

  if (isReadOnly && zenMode) {
    return (
      <div className="fixed top-3 right-3 z-30 pt-safe">
        <button
          type="button"
          onClick={onToggleZenMode}
          aria-label="Exit presentation mode"
          title="Exit presentation mode (F)"
          className="h-10 px-3 rounded-2xl bg-white/80 dark:bg-[#171A21]/80 backdrop-blur-xl border border-slate-200/70 dark:border-white/[0.08] text-slate-700 dark:text-slate-200 text-xs font-semibold shadow-md flex items-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity"
        >
          <Minimize className="w-3.5 h-3.5" />
          <span>Exit Zen</span>
        </button>
      </div>
    );
  }

  return (
    <header className="fixed top-2.5 left-3 right-3 z-30 flex items-center justify-between gap-2 pointer-events-none pt-safe">
      {/* Left Floating Island: Boards + Board Title */}
      <div className="pointer-events-auto flex items-center gap-1 h-11 px-1.5 rounded-2xl bg-white/90 dark:bg-[#171A21]/90 backdrop-blur-xl border border-slate-200/80 dark:border-white/[0.08] shadow-md shadow-slate-900/5 dark:shadow-black/30 min-w-0 flex-1 sm:flex-initial sm:max-w-md">
        <button
          type="button"
          onClick={onOpenBoards}
          aria-label="Open boards"
          title="Boards"
          className="min-h-[40px] min-w-[40px] sm:min-h-[36px] sm:min-w-[36px] flex items-center justify-center rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 active:scale-95 transition-transform focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          <FolderKanban className="w-[18px] h-[18px]" />
        </button>

        {!isReadOnly && isEditing ? (
          <input
            ref={inputRef}
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitTitle();
              if (e.key === 'Escape') {
                setDraftTitle(boardTitle);
                setIsEditing(false);
              }
            }}
            aria-label="Board title"
            className="w-full min-w-[90px] bg-slate-100 dark:bg-white/10 text-slate-900 dark:text-slate-100 text-sm font-semibold px-2 py-1 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
          />
        ) : isReadOnly ? (
          <div className="flex items-center gap-2 px-2 py-1 min-w-0">
            <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {boardTitle}
            </span>
            <span aria-hidden="true" className="text-slate-300 dark:text-slate-600 shrink-0">
              ·
            </span>
            <span className="flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
              <Eye className="w-3.5 h-3.5" />
              Read-only
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            title="Tap to rename board"
            className="px-2 py-1.5 rounded-lg text-left truncate text-sm font-semibold text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500"
          >
            {boardTitle}
          </button>
        )}
      </div>

      {/* Right Floating Island */}
      <div className="pointer-events-auto shrink-0 flex items-center gap-0.5 h-11 px-1.5 rounded-2xl bg-white/90 dark:bg-[#171A21]/90 backdrop-blur-xl border border-slate-200/80 dark:border-white/[0.08] shadow-md shadow-slate-900/5 dark:shadow-black/30">
        {!isReadOnly ? (
          <>
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              aria-label="Undo"
              title="Undo (Ctrl+Z)"
              className="min-h-[38px] min-w-[36px] sm:min-h-[36px] sm:min-w-[36px] flex items-center justify-center rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none active:scale-95 transition-transform focus-visible:outline-2 focus-visible:outline-blue-500"
            >
              <Undo2 className="w-[18px] h-[18px]" />
            </button>
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              aria-label="Redo"
              title="Redo (Ctrl+Shift+Z)"
              className="min-h-[38px] min-w-[36px] sm:min-h-[36px] sm:min-w-[36px] flex items-center justify-center rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none active:scale-95 transition-transform focus-visible:outline-2 focus-visible:outline-blue-500"
            >
              <Redo2 className="w-[18px] h-[18px]" />
            </button>
            <div className="w-px h-5 bg-slate-200 dark:bg-white/10 mx-0.5" aria-hidden="true" />
            <button
              type="button"
              onClick={onToggleFingerDraw}
              aria-label={fingerDrawEnabled ? 'Finger draws (tap for finger pan)' : 'Finger pans (tap to draw with finger)'}
              aria-pressed={fingerDrawEnabled}
              title={
                fingerDrawEnabled
                  ? 'Finger drawing ON (tap so finger only moves camera)'
                  : 'Finger pans camera (tap to draw with finger)'
              }
              className={`min-h-[38px] min-w-[36px] sm:min-h-[36px] sm:min-w-[36px] flex items-center justify-center rounded-xl active:scale-95 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 ${
                fingerDrawEnabled
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10'
              }`}
            >
              {fingerDrawEnabled ? (
                <Fingerprint className="w-[18px] h-[18px]" />
              ) : (
                <Hand className="w-[18px] h-[18px]" />
              )}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onToggleFollowPhone}
              aria-pressed={followPhone}
              title={
                followPhone
                  ? 'Following phone camera (click to explore freely)'
                  : 'Free explore mode (click to snap & follow phone)'
              }
              className={`h-8 px-2.5 mx-0.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors active:scale-95 ${
                followPhone
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-white/[0.08] text-slate-700 dark:text-slate-200 hover:bg-slate-200/80 dark:hover:bg-white/15'
              }`}
            >
              <LocateFixed className="w-3.5 h-3.5" />
              <span>{followPhone ? 'Follow' : 'Snap'}</span>
            </button>

            <button
              type="button"
              onClick={onToggleZenMode}
              aria-label="Presentation mode"
              title="Presentation mode (F)"
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 active:scale-95 transition-transform"
            >
              <Maximize className="w-[17px] h-[17px]" />
            </button>
          </>
        )}

        {!isReadOnly && (
          <button
            type="button"
            onClick={onSaveNow}
            disabled={pendingChangeCount === 0 || strokeSyncStatus === 'syncing' || strokeSyncStatus === 'offline'}
            aria-label={pendingChangeCount > 0 ? `Save ${pendingChangeCount} pending changes to the server` : 'All changes are synchronized'}
            title={
              strokeSyncStatus === 'syncing'
                ? 'Saving changes to Stateflow…'
                : strokeSyncStatus === 'offline'
                ? `Offline — ${pendingChangeCount} changes saved on this device`
                : strokeSyncStatus === 'error'
                ? `Synchronization failed — ${pendingChangeCount} changes remain on this device. Retry now.`
                : pendingChangeCount > 0
                ? `${pendingChangeCount} changes waiting to sync. Save now.`
                : 'All changes are synchronized'
            }
            className="h-8 px-2 sm:px-2.5 mx-0.5 rounded-xl flex items-center gap-1.5 text-[11px] font-semibold whitespace-nowrap shrink-0 transition-colors disabled:opacity-60 disabled:cursor-not-allowed bg-slate-100/85 dark:bg-white/[0.06] text-slate-700 dark:text-slate-200 hover:bg-slate-200/80 dark:hover:bg-white/10"
          >
            {strokeSyncStatus === 'syncing' ? (
              <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CloudUpload className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">
              {strokeSyncStatus === 'syncing' ? 'Saving' : 'Save'}
            </span>
            {pendingChangeCount > 0 && (
              <span className="tabular-nums">{pendingChangeCount}</span>
            )}
          </button>
        )}

        {/* Live WebSocket Sync Badge */}
        <div
          role="status"
          aria-label={
            syncStatus === 'connected'
              ? 'Live WebSocket sync connected'
              : syncStatus === 'connecting'
              ? 'Syncing real-time connection'
              : 'Offline mode'
          }
          title={
            syncStatus === 'connected'
              ? 'Live · Real-time WebSocket sync active'
              : syncStatus === 'connecting'
              ? 'Syncing real-time connection...'
              : 'Offline — changes queued locally'
          }
          className="flex items-center gap-1.5 px-2 mx-0.5 h-8 rounded-xl bg-slate-100/85 dark:bg-white/[0.06] text-[11px] font-semibold whitespace-nowrap shrink-0 select-none"
        >
          <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
            {syncStatus === 'connecting' && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            )}
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                syncStatus === 'connected'
                  ? 'bg-emerald-500 ring-2 ring-emerald-500/25'
                  : syncStatus === 'connecting'
                  ? 'bg-amber-500'
                  : 'bg-rose-500'
              }`}
            />
          </span>
          <span
            className={
              syncStatus === 'connected'
                ? 'text-emerald-700 dark:text-emerald-400'
                : syncStatus === 'connecting'
                ? 'text-amber-700 dark:text-amber-400'
                : 'text-rose-700 dark:text-rose-400'
            }
          >
            {syncStatus === 'connected' ? (
              <>
                <span className="sm:hidden">Live</span>
                <span className="hidden sm:inline">Live · WS</span>
              </>
            ) : syncStatus === 'connecting' ? (
              'Syncing'
            ) : (
              'Offline'
            )}
          </span>
        </div>

        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light canvas' : 'Switch to dark canvas'}
          title={theme === 'dark' ? 'Light canvas' : 'Dark canvas'}
          className="min-h-[38px] min-w-[36px] sm:min-h-[36px] sm:min-w-[36px] flex items-center justify-center rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 active:scale-95 transition-transform focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          {theme === 'dark' ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
        </button>

        {!isReadOnly && isInstallable && !isInstalled && (
          <button
            type="button"
            onClick={install}
            aria-label="Install SlateFlow app"
            className="hidden sm:flex items-center gap-1.5 h-8 px-3 mx-0.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold whitespace-nowrap shrink-0 active:scale-95 transition-transform"
          >
            <Download className="w-3.5 h-3.5" />
            Install App
          </button>
        )}

        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Canvas options and export"
          title="Canvas options & export"
          className="min-h-[40px] min-w-[40px] sm:min-h-[36px] sm:min-w-[36px] flex items-center justify-center rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 active:scale-95 transition-transform focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          <MoreHorizontal className="w-[18px] h-[18px]" />
        </button>
      </div>
    </header>
  );
};
