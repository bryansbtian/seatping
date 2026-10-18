import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ListSkeleton from "../../src/components/ListSkeleton.js";

let resizeCallback: (() => void) | undefined;
const observe = vi.fn();
const disconnect = vi.fn();
let availableHeight = 600;
let measuredRowHeight = 40;

function setupMeasurements() {
  availableHeight = 600;
  measuredRowHeight = 40;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
    let height = measuredRowHeight;
    if (this.getAttribute("aria-hidden") === "true") {
      height = availableHeight;
    }
    return { height } as DOMRect;
  });
}

function setupObserver() {
  class Observer {
    constructor(callback: () => void) {
      resizeCallback = callback;
    }
    observe = observe;
    disconnect = disconnect;
  }
  vi.stubGlobal("ResizeObserver", Observer);
}

function renderedRows(): number {
  return screen.getByRole("status").firstElementChild?.childElementCount ?? 0;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  observe.mockClear();
  disconnect.mockClear();
  resizeCallback = undefined;
});

describe("ListSkeleton", () => {
  it("preserves the default row count and normal document layout", () => {
    setupObserver();
    render(<ListSkeleton label="Loading Results" />);

    expect(screen.getByRole("status", { name: "Loading Results" })).toBeTruthy();
    expect(renderedRows()).toBe(4);
    expect(screen.getByRole("status").className).not.toContain("overflow-hidden");
    expect(screen.getByRole("status").firstElementChild?.className).not.toContain("absolute");
    expect(observe).not.toHaveBeenCalled();
  });

  it("uses the requested row count without fill", () => {
    render(<ListSkeleton rows={2} />);

    expect(renderedRows()).toBe(2);
  });

  it("fills available height and responds to larger and smaller observer measurements", () => {
    setupMeasurements();
    setupObserver();
    render(<ListSkeleton fill />);

    expect(renderedRows()).toBe(11);
    expect(observe).toHaveBeenCalledWith(screen.getByRole("status").firstElementChild);
    expect(screen.getByRole("status").className).toContain("overflow-hidden");
    expect(screen.getByRole("status").firstElementChild?.className).toContain("absolute");

    availableHeight = 1000;
    act(() => resizeCallback?.());
    expect(renderedRows()).toBe(18);

    availableHeight = 100;
    act(() => resizeCallback?.());
    expect(renderedRows()).toBe(2);
  });

  it("accounts for inherited padding and measured row height", () => {
    setupMeasurements();
    setupObserver();
    measuredRowHeight = 80;
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      paddingTop: "24px",
      paddingBottom: "24px",
    } as CSSStyleDeclaration);
    render(<ListSkeleton fill />);

    expect(renderedRows()).toBe(5);
    const inner = screen.getByRole("status").firstElementChild;
    expect(inner?.getAttribute("style")).toBe("padding: inherit;");
  });

  it("renders only complete rows while retaining caller padding overrides", () => {
    setupMeasurements();
    setupObserver();
    availableHeight = 100;
    render(<ListSkeleton fill rows={8} className="p-0 md:p-0" />);

    expect(renderedRows()).toBe(2);
    expect(screen.getByRole("status").className).toContain("p-0 md:p-0");
    expect(screen.getByRole("status").className).not.toContain("p-4");
  });

  it("measures and responds to window resize without ResizeObserver", () => {
    setupMeasurements();
    vi.stubGlobal("ResizeObserver", undefined);
    const removeEventListener = vi.spyOn(window, "removeEventListener");
    const view = render(<ListSkeleton fill />);

    expect(renderedRows()).toBe(11);
    availableHeight = 1000;
    act(() => window.dispatchEvent(new Event("resize")));
    expect(renderedRows()).toBe(18);

    view.unmount();
    expect(removeEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
  });

  it("disconnects its observer when unmounted", () => {
    setupMeasurements();
    setupObserver();
    const view = render(<ListSkeleton fill />);

    view.unmount();

    expect(disconnect).toHaveBeenCalledOnce();
  });
});
