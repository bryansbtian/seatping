import { Component, type ReactNode } from "react";
import { isChunkLoadError } from "@/lib/lazyRoute";
import { Button } from "@/components/ui/button";

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
      description = "Reload the page to continue with the latest version.";
    }
    return (
      <div role="alert" className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="text-title text-ink">{title}</h1>
        <p className="mt-3 text-body text-ink-subtle">{description}</p>
        <Button type="button" className="mt-6" onClick={() => window.location.reload()}>
          Reload Page
        </Button>
        <Button asChild variant="link" className="ml-4">
          <a href="/">Back To Home</a>
        </Button>
      </div>
    );
  }
}
