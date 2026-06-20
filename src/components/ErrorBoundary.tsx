/** Catches render errors so a single failing view degrades to a message rather
 *  than crashing the whole window to a blank screen. */
import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ugit render error:", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-bg px-6 text-center text-ink">
        <p className="text-md font-medium">ugit hit an unexpected error</p>
        <p className="max-w-[60ch] font-mono text-sm leading-relaxed text-muted">
          {this.state.error.message}
        </p>
        <button
          type="button"
          onClick={this.reset}
          className="ease-out-quint rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink transition-colors hover:bg-raised"
        >
          Dismiss
        </button>
      </div>
    );
  }
}
