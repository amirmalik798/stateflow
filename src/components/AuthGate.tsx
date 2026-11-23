import React, { useState } from 'react';
import { ArrowRight, Layers, Monitor, Moon, PenTool, Smartphone, Sun, Zap } from 'lucide-react';
import { signInWithPassword } from '../auth';
import { ThemeMode } from '../types/whiteboard';

interface AuthGateProps {
  isReadOnly: boolean;
  theme: ThemeMode;
  onToggleTheme: () => void;
}

export const AuthGate: React.FC<AuthGateProps> = ({ isReadOnly, theme, onToggleTheme }) => {
  const [loginId, setLoginId] = useState('owner');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signInWithPassword(loginId, password);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign-in failed. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative h-dvh w-full overflow-y-auto bg-[#F8F9FB] dark:bg-[#0F1115] text-slate-900 dark:text-slate-100 flex flex-col justify-between selection:bg-blue-500/20">
      {/* Subtle SlateFlow Infinite Dot-Grid Backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 opacity-60 dark:opacity-45"
        style={{
          backgroundImage:
            theme === 'dark'
              ? 'radial-gradient(rgba(148, 163, 184, 0.2) 1px, transparent 1px)'
              : 'radial-gradient(rgba(100, 116, 139, 0.24) 1px, transparent 1px)',
          backgroundSize: '26px 26px',
        }}
      />

      {/* Quiet Ambient Light Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -top-40 left-1/2 -translate-x-1/2 w-[720px] h-[380px] rounded-full bg-blue-500/[0.08] dark:bg-blue-500/[0.11] blur-3xl"
      />

      {/* Top Brand Bar */}
      <header className="relative z-10 w-full max-w-6xl mx-auto px-5 sm:px-8 pt-5 pb-3 pt-safe flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 shrink-0">
          <img
            src="/icon.svg"
            alt="SlateFlow logo"
            className="w-9 h-9 rounded-xl border border-slate-200/80 dark:border-white/10 shadow-xs"
          />
          <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
            SlateFlow
          </span>
        </div>

        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-2xl bg-white/80 dark:bg-[#171A21]/80 backdrop-blur-md border border-slate-200/80 dark:border-white/[0.08] text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-[#1E222B] active:scale-95 transition-all focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          {theme === 'dark' ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
        </button>
      </header>

      {/* Main Responsive Stage */}
      <main className="relative z-10 w-full max-w-6xl mx-auto px-5 sm:px-8 py-6 sm:py-10 flex-1 flex items-center">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left Stage: Visual Canvas Preview + Editorial Overview */}
          <section className="lg:col-span-7 space-y-6">
            <div className="space-y-3">
              <p className="text-xs font-semibold tracking-wide text-blue-600 dark:text-blue-400">
                Infinite Whiteboard
              </p>
              <h1 className="text-3xl sm:text-4xl lg:text-[2.65rem] font-bold tracking-tight text-slate-900 dark:text-white leading-[1.14] text-balance max-w-xl">
                Sketch on your phone. Present live on desktop.
              </h1>
              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-lg">
                Write naturally with stylus or touch while your ideas stream at 60fps to your desktop screen and save reliably and synchronize across your devices.
              </p>
            </div>

            {/* Domain-Native Vector Canvas Illustration */}
            <div className="hidden sm:block relative rounded-3xl border border-slate-200/85 dark:border-white/[0.08] bg-white/85 dark:bg-[#151820]/90 backdrop-blur-sm p-4 shadow-lg shadow-slate-900/[0.04] dark:shadow-black/30 overflow-hidden">
              <svg
                viewBox="0 0 640 240"
                className="w-full h-auto block"
                role="img"
                aria-label="Illustration of SlateFlow flowchart, sticky note, and live stylus stroke"
              >
                {/* Flowchart Box */}
                <rect
                  x="28"
                  y="36"
                  width="156"
                  height="78"
                  rx="12"
                  fill="rgba(37, 99, 235, 0.08)"
                  stroke="#2563EB"
                  strokeWidth="2.2"
                />
                <text
                  x="48"
                  y="69"
                  fill={theme === 'dark' ? '#E2E8F0' : '#0F172A'}
                  fontSize="14"
                  fontWeight="700"
                  fontFamily="Plus Jakarta Sans, sans-serif"
                >
                  Phone Sketch
                </text>
                <text
                  x="48"
                  y="90"
                  fill={theme === 'dark' ? '#94A3B8' : '#64748B'}
                  fontSize="11.5"
                  fontWeight="500"
                  fontFamily="Plus Jakarta Sans, sans-serif"
                >
                  S Pen · Side-button erase
                </text>

                {/* Arrow Connector */}
                <line
                  x1="192"
                  y1="75"
                  x2="254"
                  y2="75"
                  stroke={theme === 'dark' ? '#64748B' : '#94A3B8'}
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
                <path
                  d="M245 68 L256 75 L245 82"
                  fill="none"
                  stroke={theme === 'dark' ? '#64748B' : '#94A3B8'}
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Diamond Node */}
                <polygon
                  points="324,26 392,75 324,124 256,75"
                  fill="rgba(16, 185, 129, 0.09)"
                  stroke="#10B981"
                  strokeWidth="2.2"
                  strokeLinejoin="round"
                />
                <text
                  x="324"
                  y="79"
                  textAnchor="middle"
                  fill="#10B981"
                  fontSize="13"
                  fontWeight="700"
                  fontFamily="Plus Jakarta Sans, sans-serif"
                >
                  60fps Live
                </text>

                {/* Warm Sun Sticky Note */}
                <g transform="translate(426, 26)">
                  <rect
                    x="0"
                    y="0"
                    width="184"
                    height="122"
                    rx="14"
                    fill="#FEF08A"
                  />
                  <text
                    x="18"
                    y="34"
                    fill="#1E293B"
                    fontSize="13.5"
                    fontWeight="700"
                    fontFamily="Plus Jakarta Sans, sans-serif"
                  >
                    Instant Sync
                  </text>
                  <text
                    x="18"
                    y="58"
                    fill="#334155"
                    fontSize="12"
                    fontWeight="500"
                    fontFamily="Plus Jakarta Sans, sans-serif"
                  >
                    Boards, shapes, stickies
                  </text>
                  <text
                    x="18"
                    y="76"
                    fill="#334155"
                    fontSize="12"
                    fontWeight="500"
                    fontFamily="Plus Jakarta Sans, sans-serif"
                  >
                    &amp; live cursor mirrored
                  </text>
                  <text
                    x="18"
                    y="94"
                    fill="#334155"
                    fontSize="12"
                    fontWeight="500"
                    fontFamily="Plus Jakarta Sans, sans-serif"
                  >
                    to desktop in real time.
                  </text>
                </g>

                {/* Expressive Handwritten Ink Curve */}
                <path
                  d="M36 184 C92 146, 148 214, 212 174 C264 142, 314 202, 376 176"
                  fill="none"
                  stroke="#F43F5E"
                  strokeWidth="4"
                  strokeLinecap="round"
                />

                {/* Dashed Phone Viewport Frame + Live Stylus Reticle */}
                <rect
                  x="276"
                  y="144"
                  width="148"
                  height="74"
                  rx="8"
                  fill="none"
                  stroke="rgba(59, 130, 246, 0.55)"
                  strokeWidth="1.5"
                  strokeDasharray="6 4"
                />
                <circle cx="376" cy="176" r="8" fill="rgba(59, 130, 246, 0.22)" />
                <circle cx="376" cy="176" r="4" fill="#2563EB" stroke="#FFFFFF" strokeWidth="1.5" />

                {/* Bottom Highlighter Accent */}
                <line
                  x1="448"
                  y1="184"
                  x2="594"
                  y2="184"
                  stroke="#FACC15"
                  strokeOpacity="0.45"
                  strokeWidth="18"
                  strokeLinecap="butt"
                />
                <text
                  x="456"
                  y="189"
                  fill={theme === 'dark' ? '#E2E8F0' : '#0F172A'}
                  fontSize="12.5"
                  fontWeight="600"
                  fontFamily="Plus Jakarta Sans, sans-serif"
                >
                  PNG · SVG · JSON Export
                </text>
              </svg>
            </div>

            {/* Clean Unboxed Workflow Highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1 border-t border-slate-200/80 dark:border-white/[0.08]">
              <div className="pt-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
                  <PenTool className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span>Stylus &amp; Touch</span>
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Finger pans camera while S Pen writes &amp; button-erases.
                </p>
              </div>

              <div className="pt-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
                  <Zap className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span>Live Streaming</span>
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Sub-frame ink, cursor, and camera sync to desktop.
                </p>
              </div>

              <div className="pt-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
                  <Layers className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span>Templates &amp; Sync</span>
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Kanban, meeting, and quadrant boards synchronized across devices.
                </p>
              </div>
            </div>
          </section>

          {/* Right Stage: Single-Elevation Sign-In Card */}
          <section className="lg:col-span-5 flex justify-center lg:justify-end">
            <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#171A21] border border-slate-200/85 dark:border-white/[0.08] shadow-2xl shadow-slate-900/10 dark:shadow-black/50 p-6 sm:p-8">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 pb-4 mb-5 border-b border-slate-200/70 dark:border-white/[0.08]">
                {isReadOnly ? (
                  <>
                    <Monitor className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span>Desktop · Read-Only Live Viewer</span>
                  </>
                ) : (
                  <>
                    <Smartphone className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span>Mobile · Full Touch &amp; Stylus Workspace</span>
                  </>
                )}
              </div>

              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                Sign in to your private workspace
              </h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Use your personal Stateflow login on both your phone and desktop to access the same private workspace.
              </p>

              {error && (
                <div
                  role="alert"
                  className="mt-5 rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/25 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300"
                >
                  {error}
                </div>
              )}

              <form onSubmit={handleSignIn} className="mt-6 space-y-4">
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold text-slate-700 dark:text-slate-200">Login ID</span>
                  <input type="text" name="username" autoComplete="username" value={loginId}
                    onChange={(event) => setLoginId(event.target.value)} required maxLength={120}
                    className="w-full min-h-[48px] px-4 rounded-xl bg-slate-50 dark:bg-[#101319] border border-slate-200 dark:border-white/10 text-sm text-slate-900 dark:text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    placeholder="Enter your login ID" />
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold text-slate-700 dark:text-slate-200">Password</span>
                  <input type="password" name="password" autoComplete="current-password" value={password}
                    onChange={(event) => setPassword(event.target.value)} required maxLength={1024}
                    className="w-full min-h-[48px] px-4 rounded-xl bg-slate-50 dark:bg-[#101319] border border-slate-200 dark:border-white/10 text-sm text-slate-900 dark:text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    placeholder="Enter your password" />
                </label>
                <button type="submit" disabled={loading || !loginId.trim() || !password}
                  className="w-full min-h-[50px] px-5 rounded-2xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-sm font-semibold flex items-center justify-center gap-3 shadow-md shadow-slate-900/15 dark:shadow-black/30 active:scale-[0.98] transition-all disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500">
                  <span className="whitespace-nowrap">{loading ? 'Signing in...' : 'Sign in to Stateflow'}</span>
                  {!loading && <ArrowRight className="w-4 h-4 opacity-70 shrink-0" />}
                </button>
              </form>

              <p className="mt-5 pt-4 border-t border-slate-200/70 dark:border-white/[0.08] text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Private single-user access. Sign in with the same credentials on your phone and desktop.
              </p>
            </div>
          </section>
        </div>
      </main>

      {/* Clean Footer with Developer Credit */}
      <footer className="relative z-10 w-full max-w-6xl mx-auto px-5 sm:px-8 py-4 pb-safe border-t border-slate-200/70 dark:border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span className="font-medium text-slate-700 dark:text-slate-300">
          Developed by: Amir Malik (2026)
        </span>
        <span>
          SlateFlow · Infinite Whiteboard
        </span>
      </footer>
    </div>
  );
};
