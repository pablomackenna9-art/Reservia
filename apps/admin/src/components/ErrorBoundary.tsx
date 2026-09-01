import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Catches render crashes so the app shows a message instead of a silent blank page. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Reservia crashed:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen grid place-items-center bg-ground px-4">
          <div className="max-w-sm text-center">
            <h1 className="text-lg font-semibold text-ink mb-2">Algo se rompió</h1>
            <p className="text-sm text-ink-muted mb-4">{this.state.error.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg bg-accent text-accent-ink px-4 py-2 text-sm font-medium"
            >
              Recargar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
