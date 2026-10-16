import { Component, type ReactNode } from "react";
import { isChunkLoadError } from "@/lib/lazyRoute";

type Props = { children: ReactNode; resetKey?: string };
type State = { error: Error | null; resetKey?: string };

export default class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Pick<State, "error"> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): State | null {
    if (props.resetKey !== state.resetKey) {
      return { error: null, resetKey: props.resetKey };
    }
    return null;
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }
    let title = "This Page Could Not Load";
    let description = "Please reload the page and try again.";
    if (isChunkLoadError(this.state.error)) {
      title = "This Page Needs An Update";
      description = "A new version may be available. Reload the page to continue.";
    }
    return (
      <div role="alert" className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="text-title text-ink">{title}</h1>
        <p className="mt-3 text-body text-ink-subtle">{description}</p>
        <button
          type="button"
          className="mt-6 rounded-control bg-slate-900 px-4 py-3 text-label text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          onClick={() => window.location.reload()}
        >
          Reload Page
        </button>
        <a href="/" className="ml-4 text-label text-ink underline">
          Back To Home
        </a>
      </div>
    );
  }
}
