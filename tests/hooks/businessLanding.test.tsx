import { render, screen, within } from "@testing-library/react";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProductWorkflowSection } from "../../src/components/landing/ProductWorkflow.js";
import AnimatedBentoFeatureGrid from "../../src/components/landing/AnimatedBentoFeatureGrid.js";

function renderInRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

const FIRST_STATE = ["01", "02", "03", "04"];
const SECOND_STATE = ["05", "06", "07", "08"];

const ALL_STEP_TITLES = [
  "Guest Discovers Your Restaurant",
  "They Join the Queue or Reserve",
  "SeatPing Matches a Table",
  "Staff Confirm the Seating",
  "The Live Floor Updates",
  "The Visit Updates Guest CRM",
  "Performance Insights Build Up",
  "Campaigns Bring Guests Back",
];

let observerCallbacks: IntersectionObserverCallback[] = [];
let observerOptions: IntersectionObserverInit[] = [];

function stubIntersectionObserver() {
  observerCallbacks = [];
  observerOptions = [];
  class Stub {
    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
      observerCallbacks.push(callback);
      observerOptions.push(options ?? {});
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("IntersectionObserver", Stub);
}

function enterSecondState(intersecting: boolean) {
  act(() => {
    observerCallbacks.forEach((callback) => {
      callback(
        [{ isIntersecting: intersecting } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });
  });
}

function activeSteps(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("li[data-step]"))
    .filter((step) => step.getAttribute("data-active") === "true")
    .map((step) => step.getAttribute("data-step") ?? "");
}

describe("product workflow section", () => {
  beforeEach(() => {
    stubIntersectionObserver();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps every step of the journey in the document at all times", () => {
    const { container } = renderInRouter(<ProductWorkflowSection />);

    const steps = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(steps).toHaveLength(8);

    for (const title of ALL_STEP_TITLES) {
      expect(screen.getByRole("heading", { level: 3, name: title })).toBeTruthy();
    }

    enterSecondState(true);

    for (const title of ALL_STEP_TITLES) {
      expect(screen.getByRole("heading", { level: 3, name: title })).toBeTruthy();
    }
    expect(container.querySelectorAll("li[data-step]")).toHaveLength(8);
  });

  it("shows steps 01 to 04 before the second scroll state activates", () => {
    const { container } = renderInRouter(<ProductWorkflowSection />);

    expect(activeSteps(container)).toEqual(FIRST_STATE);
  });

  it("switches to steps 05 to 08 once the midpoint sentinel is reached", () => {
    const { container } = renderInRouter(<ProductWorkflowSection />);

    enterSecondState(true);

    expect(activeSteps(container)).toEqual(SECOND_STATE);
  });

  it("returns to steps 01 to 04 when the reader scrolls back up", () => {
    const { container } = renderInRouter(<ProductWorkflowSection />);

    enterSecondState(true);
    enterSecondState(false);

    expect(activeSteps(container)).toEqual(FIRST_STATE);
  });

  it("drives the state from the viewport midpoint rather than a scroll handler", () => {
    const scrollSpy = vi.spyOn(window, "addEventListener");
    renderInRouter(<ProductWorkflowSection />);

    expect(observerOptions[0].rootMargin).toBe("0px 0px -95% 0px");
    expect(scrollSpy.mock.calls.some(([type]) => type === "scroll")).toBe(false);
    scrollSpy.mockRestore();
  });

  it("keeps a longer pinned runway before the next section enters", () => {
    const { container } = renderInRouter(<ProductWorkflowSection />);
    const pinnedRunway = container.querySelector("section > div");

    expect(pinnedRunway?.className).toContain("lg:h-[calc(100vh+32rem)]");
  });

  it("guards its transitions behind prefers-reduced-motion", () => {
    const { container } = renderInRouter(<ProductWorkflowSection />);
    const step = container.querySelector("li[data-step='01']");

    expect(step?.className).toContain("transition-[opacity,transform]");
    expect(step?.className).toContain("motion-reduce:transition-none");
    expect(step?.className).toContain("motion-safe:lg:translate-y-0");
    expect(step?.className).not.toContain("lg:translate-y-4");
  });

  it("hides the decorative orbit from assistive technology", () => {
    const { container } = renderInRouter(<ProductWorkflowSection />);
    const svg = container.querySelector("[data-testid='workflow-curve']");
    const orbit = container.querySelector("[data-testid='workflow-orbit']");

    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(orbit?.getAttribute("aria-hidden")).toBe("true");
  });

  it("draws the path as a half-circle arc rather than the old full circle", () => {
    const { container } = renderInRouter(<ProductWorkflowSection />);
    const svg = container.querySelector("[data-testid='workflow-curve']");
    const orbit = container.querySelector("[data-testid='workflow-orbit']");

    expect(orbit?.getAttribute("data-arc-layout")).toBe("half");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 300 520");
    expect(svg?.querySelectorAll("circle")).toHaveLength(0);

    const paths = Array.from(svg?.querySelectorAll("path") ?? []);
    expect(paths.length).toBeGreaterThanOrEqual(2);
    for (const path of paths) {
      expect(path.getAttribute("d")).toContain("A ");
    }
  });

  it("places the first four markers along the visible half-circle arc", () => {
    const { container } = renderInRouter(<ProductWorkflowSection />);
    const markers = Array.from(container.querySelectorAll("[data-orbit-step]"));

    expect(markers.map((marker) => marker.getAttribute("data-orbit-step"))).toEqual([
      ...FIRST_STATE,
      ...SECOND_STATE,
    ]);

    const firstStateMarkers = markers.slice(0, FIRST_STATE.length).map((marker) => {
      const style = (marker as HTMLElement).style;
      return {
        left: Number.parseFloat(style.left),
        top: Number.parseFloat(style.top),
      };
    });

    expect(firstStateMarkers[0].left).toBeCloseTo(43.284, 2);
    expect(firstStateMarkers[0].top).toBeCloseTo(8.67, 2);
    expect(firstStateMarkers[1].left).toBeCloseTo(88.82, 2);
    expect(firstStateMarkers[1].top).toBeCloseTo(32.323, 2);
    expect(firstStateMarkers[2].left).toBeCloseTo(88.82, 2);
    expect(firstStateMarkers[2].top).toBeCloseTo(67.677, 2);
    expect(firstStateMarkers[3].left).toBeCloseTo(43.284, 2);
    expect(firstStateMarkers[3].top).toBeCloseTo(91.33, 2);
  });

  it("advances the half-circle system so 05 to 08 land where 01 to 04 were", () => {
    const { container } = renderInRouter(<ProductWorkflowSection />);
    const orbit = container.querySelector("[data-testid='workflow-orbit']");
    const positionOf = (step: string) => {
      const marker = container.querySelector(`[data-orbit-step='${step}']`) as HTMLElement;
      return [marker.style.left, marker.style.top];
    };

    expect(orbit?.getAttribute("data-rotation")).toBe("0");

    const firstSlots = FIRST_STATE.map(positionOf);
    const secondSlots = SECOND_STATE.map(positionOf);
    const arcOriginLeft = 20;
    const arcOriginTop = 50;

    for (let index = 0; index < firstSlots.length; index += 1) {
      const [firstLeft, firstTop] = firstSlots[index];
      const [secondLeft, secondTop] = secondSlots[index];
      expect(Number.parseFloat(secondLeft)).toBeCloseTo(
        arcOriginLeft * 2 - Number.parseFloat(firstLeft),
        4,
      );
      expect(Number.parseFloat(secondTop)).toBeCloseTo(
        arcOriginTop * 2 - Number.parseFloat(firstTop),
        4,
      );
    }

    enterSecondState(true);

    expect(
      container.querySelector("[data-testid='workflow-orbit']")?.getAttribute("data-rotation"),
    ).toBe("180");
    expect(
      (container.querySelector("[data-testid='workflow-orbit-markers']") as HTMLElement).style
        .transform,
    ).toBe("rotate(180deg)");
    expect(
      (container.querySelector("[data-testid='workflow-orbit-markers']") as HTMLElement).style
        .transformOrigin,
    ).toBe("20% 50%");
  });

  it("keeps the marker numbers upright while the orbit rotates", () => {
    const { container } = renderInRouter(<ProductWorkflowSection />);

    enterSecondState(true);

    const label = container.querySelector("[data-orbit-step='05'] span") as HTMLElement;
    expect(label.style.transform).toBe("rotate(-180deg)");
  });

  it("emphasizes only the visible markers on the orbit", () => {
    const { container } = renderInRouter(<ProductWorkflowSection />);
    const activeMarkers = () =>
      Array.from(container.querySelectorAll("[data-orbit-step]"))
        .filter((marker) => marker.getAttribute("data-active") === "true")
        .map((marker) => marker.getAttribute("data-orbit-step"));

    expect(activeMarkers()).toEqual(FIRST_STATE);

    enterSecondState(true);

    expect(activeMarkers()).toEqual(SECOND_STATE);
  });

  it("moves the highlighted arc as the half-circle progresses", () => {
    const { container } = renderInRouter(<ProductWorkflowSection />);
    const arc = () =>
      container.querySelector("[data-testid='workflow-curve'] path[stroke-dasharray='0.78 1']");

    expect(arc()?.getAttribute("stroke-dashoffset")).toBe("0.11");

    enterSecondState(true);

    expect(arc()?.getAttribute("stroke-dashoffset")).toBe("-0.11");
  });

  it("numbers the markers 01 through 08 without duplicates", () => {
    const { container } = renderInRouter(<ProductWorkflowSection />);
    const numbers = Array.from(container.querySelectorAll("li[data-step]")).map((step) =>
      step.getAttribute("data-step"),
    );

    expect(numbers).toEqual([...FIRST_STATE, ...SECOND_STATE]);
  });
});

describe("business bento feature grid", () => {
  it("keeps every product area represented", () => {
    renderInRouter(<AnimatedBentoFeatureGrid animated={false} />);

    const titles = screen.getAllByRole("heading", { level: 3 }).map((el) => el.textContent);

    expect(titles).toEqual([
      "Floor Management",
      "Live Queue",
      "Guest CRM",
      "Reservation Management",
      "Guest Campaigns",
      "Performance",
    ]);
  });

  it("ties the queue and reservation copy to table matching", () => {
    renderInRouter(<AnimatedBentoFeatureGrid animated={false} />);

    expect(screen.getByText(/recommended table for each waiting party/)).toBeTruthy();
    expect(
      screen.getByText(/Smart Table Assignment pair each booking with a table that fits/),
    ).toBeTruthy();
  });
});
