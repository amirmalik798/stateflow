import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let displayMsg = error.message || 'An unexpected error occurred.';
    try {
      const parsed = JSON.parse(displayMsg) as { error?: string; operationType?: string; path?: string };
      if (parsed && parsed.error) {
        displayMsg = `Database sync error (${parsed.operationType || 'operation'}): ${parsed.error}`;
      }
    } catch {
      // plain error message
    }
    return { hasError: true, message: displayMsg };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-dvh w-full flex items-center justify-center bg-[#F8F9FB] dark:bg-[#0F1115] p-6">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#171A21] border border-slate-200 dark:border-white/[0.08] p-6 shadow-xl">
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">
              Sync Interrupted
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 w-full h-11 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
            >
              Reload SlateFlow
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
