import React, { useRef, useState } from 'react';
import {
  Download,
  FileCode2,
  FileJson,
  FileUp,
  Fingerprint,
  Grid,
  Hand,
  Image as ImageIcon,
  LogOut,
  Smartphone,
  Trash2,
  X,
} from 'lucide-react';
import { GridStyle } from '../types/whiteboard';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface ExportMenuSheetProps {
  open: boolean;
  isReadOnly: boolean;
  fingerDrawEnabled: boolean;
  onToggleFingerDraw: () => void;
  userEmail: string | null;
  onSignOut: () => void;
  onClose: () => void;
  gridStyle: GridStyle;
  onChangeGrid: (style: GridStyle) => void;
  onExportPNG: (transparent: boolean) => void;
  onExportSVG: (transparent: boolean) => void;
  onExportJSON: () => void;
  onImportJSON: (file: File) => void;
  onClearBoard: () => void;
}

export const ExportMenuSheet: React.FC<ExportMenuSheetProps> = ({
  open,
  isReadOnly,
  fingerDrawEnabled,
  onToggleFingerDraw,
  userEmail,
  onSignOut,
  onClose,
  gridStyle,
  onChangeGrid,
  onExportPNG,
  onExportSVG,
  onExportJSON,
  onImportJSON,
  onClearBoard,
}) => {
  const [confirmClear, setConfirmClear] = useState(false);
  const [transparentExport, setTransparentExport] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) {
          setConfirmClear(false);
          onClose();
        }
      }}
    >
      <div className="w-full sm:max-w-md bg-white dark:bg-[#171A21] rounded-t-3xl sm:rounded-3xl border-t sm:border border-slate-200 dark:border-white/[0.08] shadow-2xl overflow-hidden pb-safe">
        <div className="sm:hidden w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3 mb-1" />

        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200/70 dark:border-white/[0.08]">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            {isReadOnly ? 'Live View & Export' : 'Canvas & Export'}
          </h2>
          <button
            type="button"
            onClick={() => {
              setConfirmClear(false);
              onClose();
            }}
            aria-label="Close menu"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-2xl text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[75dvh] overflow-y-auto">
          {/* Finger Input Mode + Grid Style (Phone Draw Mode) */}
          {!isReadOnly && (
            <>
              <div>
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                  Finger Touch Behavior
                </div>
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-slate-100 dark:bg-white/[0.06]">
                  <button
                    type="button"
                    onClick={() => {
                      if (fingerDrawEnabled) onToggleFingerDraw();
                    }}
                    className={`h-10 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                      !fingerDrawEnabled
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Hand className="w-3.5 h-3.5" />
                    <span>Pan Camera</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!fingerDrawEnabled) onToggleFingerDraw();
                    }}
                    className={`h-10 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                      fingerDrawEnabled
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Fingerprint className="w-3.5 h-3.5" />
                    <span>Finger Draws</span>
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                  <Grid className="w-3.5 h-3.5" />
                  <span>Canvas Background</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-slate-100 dark:bg-white/[0.06]">
                  {(['dots', 'grid', 'blank'] as GridStyle[]).map((style) => (
                    <button
                      key={style}
                      type="button"
                      onClick={() => onChangeGrid(style)}
                      className={`h-10 rounded-xl text-xs font-semibold capitalize transition-colors ${
                        gridStyle === style
                          ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {style}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Export Actions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Export & Backup
              </span>
              <button
                type="button"
                onClick={() => setTransparentExport((v) => !v)}
                className={`px-2.5 h-7 rounded-lg text-[11px] font-semibold transition-colors ${
                  transparentExport
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-300'
                }`}
              >
                {transparentExport ? 'Transparent BG' : 'Theme BG'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  onExportPNG(transparentExport);
                  onClose();
                }}
                className="h-12 px-4 rounded-2xl bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200/70 dark:hover:bg-white/10 text-slate-900 dark:text-white text-sm font-medium flex items-center gap-2.5 transition-colors"
              >
                <ImageIcon className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <span>Export PNG</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onExportSVG(transparentExport);
                  onClose();
                }}
                className="h-12 px-4 rounded-2xl bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200/70 dark:hover:bg-white/10 text-slate-900 dark:text-white text-sm font-medium flex items-center gap-2.5 transition-colors"
              >
                <FileCode2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Export SVG</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onExportJSON();
                  onClose();
                }}
                className="h-12 px-4 rounded-2xl bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200/70 dark:hover:bg-white/10 text-slate-900 dark:text-white text-sm font-medium flex items-center gap-2.5 transition-colors"
              >
                <FileJson className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>Save File</span>
              </button>

              {!isReadOnly && (
                <>
                  <button
                    type="button"
                    onClick={() => jsonInputRef.current?.click()}
                    className="h-12 px-4 rounded-2xl bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200/70 dark:hover:bg-white/10 text-slate-900 dark:text-white text-sm font-medium flex items-center gap-2.5 transition-colors"
                  >
                    <FileUp className="w-4 h-4 text-violet-600 dark:text-violet-400 shrink-0" />
                    <span>Open File</span>
                  </button>
                  <input
                    ref={jsonInputRef}
                    type="file"
                    accept=".json,.slateflow.json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        onImportJSON(file);
                        onClose();
                      }
                      e.target.value = '';
                    }}
                  />
                </>
              )}
            </div>
          </div>

          {/* Install Android / PWA App */}
          {!isReadOnly && !isInstalled && (isInstallable || isIOS) && (
            <div className="pt-2 border-t border-slate-200/70 dark:border-white/[0.08]">
              {isInstallable ? (
                <button
                  type="button"
                  onClick={async () => {
                    await install();
                    onClose();
                  }}
                  className="w-full h-12 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>Install SlateFlow on Device</span>
                </button>
              ) : (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowIOSGuide((v) => !v)}
                    className="w-full h-12 rounded-2xl bg-slate-100 dark:bg-white/[0.06] text-slate-900 dark:text-white text-sm font-semibold flex items-center justify-center gap-2"
                  >
                    <Smartphone className="w-4 h-4" />
                    <span>Add to Home Screen</span>
                  </button>
                  {showIOSGuide && (
                    <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed px-1">
                      Tap the browser Share icon, then choose <strong>Add to Home Screen</strong> to launch SlateFlow full-screen offline.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Controls Reference */}
          <div className="pt-2 border-t border-slate-200/70 dark:border-white/[0.08] text-xs text-slate-500 dark:text-slate-400 space-y-1">
            <div className="font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {isReadOnly ? 'Desktop Read-Only View' : 'Touch & Drawing Controls'}
            </div>
            {isReadOnly ? (
              <>
                <div>Drag anywhere · Pan freely (pauses Follow Phone)</div>
                <div>Scroll or Ctrl+Scroll · Zoom in and out</div>
                <div>Press F or Fullscreen button · Toggle Zen mode</div>
              </>
            ) : (
              <>
                <div>
                  {fingerDrawEnabled
                    ? 'Single-finger drag · Draw with active tool'
                    : 'Single-finger drag · Move camera (Stylus writes)'}
                </div>
                <div>Stylus / S Pen button · Hold while touching to erase</div>
                <div>Two-finger pinch · Zoom and pan anywhere</div>
                <div>Double-tap sticky or text · Edit text inline</div>
              </>
            )}
          </div>

          {/* Account / Sign Out */}
          {userEmail && (
            <div className="pt-2 border-t border-slate-200/70 dark:border-white/[0.08] flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Signed in for cloud sync
                </div>
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                  {userEmail}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onSignOut();
                }}
                className="h-10 px-3.5 rounded-xl bg-slate-100 dark:bg-white/[0.08] hover:bg-slate-200 dark:hover:bg-white/[0.14] text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign out</span>
              </button>
            </div>
          )}

          {/* Clear Board (Phone Draw Mode only) */}
          {!isReadOnly && (
            <div className="pt-2 border-t border-slate-200/70 dark:border-white/[0.08]">
              {!confirmClear ? (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="w-full h-11 rounded-2xl text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Clear Current Canvas</span>
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="flex-1 h-11 rounded-2xl bg-slate-100 dark:bg-white/[0.08] text-slate-700 dark:text-slate-200 text-sm font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClearBoard();
                      setConfirmClear(false);
                      onClose();
                    }}
                    className="flex-1 h-11 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold"
                  >
                    Confirm Clear
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
