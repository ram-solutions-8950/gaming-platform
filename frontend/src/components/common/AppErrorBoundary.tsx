import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Last line of defence around the whole app.
 *
 * Without it, any error thrown while React renders unmounts the entire tree:
 * the player is left staring at a black screen and has to force-close the app.
 * With it they get a readable message and a way back in.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surfaces in `adb logcat` / remote WebView debugging for a crashing device.
    console.error('[AppErrorBoundary]', error, info.componentStack);
  }

  private handleReload = () => {
    window.location.href = '/';
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="fixed inset-0 z-[99999] flex flex-col items-center justify-center gap-4 bg-slate-950 p-6 text-center">
        <h1 className="m-0 text-xl font-black tracking-wide text-white">Something went wrong</h1>
        <p className="m-0 max-w-sm text-sm leading-relaxed text-slate-300">
          The game ran into an unexpected error. Your balance is safe — reload to continue playing.
        </p>
        <button
          type="button"
          onClick={this.handleReload}
          className="rounded-2xl bg-gradient-to-r from-amber-400 to-amber-600 px-6 py-3 text-sm font-black tracking-wide text-slate-950 shadow-lg shadow-amber-500/30 transition active:scale-95"
        >
          Reload
        </button>
      </div>
    );
  }
}
