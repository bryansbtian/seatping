import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useElementWidth } from "../../src/hooks/use-element-width.js";

type ObserverEntry = { contentRect: { width: number } };
type ObserverCallback = (entries: ObserverEntry[]) => void;

const disconnects: ReturnType<typeof vi.fn>[] = [];
let callbacks: ObserverCallback[] = [];

function stubResizeObserver() {
  callbacks = [];
  class Stub {
    disconnect: ReturnType<typeof vi.fn>;
    constructor(callback: ObserverCallback) {
      callbacks.push(callback);
      this.disconnect = vi.fn();
      disconnects.push(this.disconnect);
    }
    observe() {}
    unobserve() {}
  }
  vi.stubGlobal("ResizeObserver", Stub);
}

function mockMeasuredWidth(width: number) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width,
  } as DOMRect);
}

function Probe({ attached = true }: { attached?: boolean }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  return (
    <div>
      {attached && <div ref={ref} data-testid="target" />}
      <span data-testid="width">{String(width)}</span>
    </div>
  );
}

afterEach(() => {
  disconnects.length = 0;
  callbacks = [];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useElementWidth", () => {
  it("measures the node as soon as the ref is attached", () => {
    stubResizeObserver();
    mockMeasuredWidth(640);

    render(<Probe />);

    expect(screen.getByTestId("width").textContent).toBe("640");
  });

  it("stays null while no node has been attached", () => {
    stubResizeObserver();
    mockMeasuredWidth(640);

    render(<Probe attached={false} />);

    expect(screen.getByTestId("width").textContent).toBe("null");
    expect(callbacks).toHaveLength(0);
  });

  it("follows the width reported by the observer", () => {
    stubResizeObserver();
    mockMeasuredWidth(640);

    render(<Probe />);

    act(() => {
      callbacks[0]([{ contentRect: { width: 320 } }]);
    });

    expect(screen.getByTestId("width").textContent).toBe("320");
  });

  it("takes the last entry when the observer reports several", () => {
    stubResizeObserver();
    mockMeasuredWidth(640);

    render(<Probe />);

    act(() => {
      callbacks[0]([{ contentRect: { width: 320 } }, { contentRect: { width: 480 } }]);
    });

    expect(screen.getByTestId("width").textContent).toBe("480");
  });

  it("disconnects the observer when the node goes away", () => {
    stubResizeObserver();
    mockMeasuredWidth(640);

    const view = render(<Probe />);
    expect(disconnects).toHaveLength(1);

    view.unmount();

    expect(disconnects[0]).toHaveBeenCalled();
  });

  it("falls back to a single measurement where ResizeObserver is missing", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    mockMeasuredWidth(512);

    render(<Probe />);

    expect(screen.getByTestId("width").textContent).toBe("512");
  });
});
