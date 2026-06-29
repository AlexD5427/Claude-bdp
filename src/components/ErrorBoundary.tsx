import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * A defensive boundary so a single malformed record can never blank the whole
 * dashboard — the dock stays usable and the user sees a recoverable message.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Dashboard error boundary:", error, info);
  }

  private reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="glass mx-auto flex max-w-md flex-col items-center gap-4 rounded-3xl px-8 py-12 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-rose-500 to-red-600 shadow-glass ring-1 ring-white/30">
            <AlertTriangle className="h-7 w-7 text-white drop-shadow-md" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-ink">
              Ocurrió un error inesperado
            </h3>
            <p className="mt-1 text-sm text-ink-soft">
              {this.state.error.message}
            </p>
          </div>
          <button
            type="button"
            onClick={this.reset}
            className="rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-5 py-2.5 text-sm font-bold text-white shadow-glass ring-1 ring-white/30 transition-all duration-500 ease-spring hover:-translate-y-1 hover:scale-[1.03] active:scale-95"
          >
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
