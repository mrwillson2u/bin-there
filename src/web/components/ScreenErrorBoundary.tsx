import { Component, type ReactNode } from "react";

/**
 * If a screen crashes, show what happened and a Reload button, with the navigation still
 * there, instead of a black page. Goes away on its own when you open another screen.
 */
export class ScreenErrorBoundary extends Component<{ resetKey: string; children: ReactNode }, { error: Error | null; at: string | null }> {
  state = { error: null as Error | null, at: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  static getDerivedStateFromProps(props: { resetKey: string }, state: { error: Error | null; at: string | null }) {
    // Remember which screen failed; opening a different one clears it.
    if (state.error && state.at === null) return { at: props.resetKey };
    if (state.error && state.at !== props.resetKey) return { error: null, at: null };
    return null;
  }

  componentDidCatch(error: Error) {
    console.error("Screen crashed:", error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-danger/40 bg-danger/10 p-4">
        <p className="font-semibold text-danger">This screen hit a problem</p>
        <p className="text-sm text-muted">Nothing you saved is lost. Reload to carry on, or pick another screen.</p>
        <p className="break-all font-mono text-xs text-muted">{this.state.error.message}</p>
        <button onClick={() => window.location.reload()} className="inline-flex min-h-11 items-center self-start rounded-xl bg-accent px-4 font-semibold text-accent-fg">
          Reload
        </button>
      </div>
    );
  }
}
