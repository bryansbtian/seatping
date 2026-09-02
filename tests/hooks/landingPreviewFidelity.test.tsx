import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import {
  CampaignPreview,
  GuestProfilePreview,
  QueuePreview,
  ReservationPreview,
} from "../../src/components/landing/BentoProductPreviews.js";
import {
  FloorBentoPreview,
  PerformanceBentoPreview,
} from "../../src/components/landing/FloorProductPreviews.js";
import { HeroDashboardPreview } from "../../src/components/landing/HeroDashboardPreview.js";
import { BUSINESS_NAV_GROUPS } from "../../src/lib/businessNav.js";
import { LIVE_STATUSES, statusStyle } from "../../src/lib/floorLive.js";
import { translate, type TKey } from "../../src/lib/i18n.js";

function en(key: TKey, params?: Record<string, string | number>) {
  return translate("en", key, params);
}

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
});

describe("queue preview fidelity", () => {
  it("uses the Queue Management header the operator actually sees", () => {
    render(<QueuePreview animated={false} />);

    expect(screen.getByText(en("dash.queue.title"))).toBeTruthy();
    expect(screen.getByText(en("dash.queue.customerMany", { n: 2 }))).toBeTruthy();
  });

  it("formats the joined time and guest count the way the queue row does", () => {
    const { container } = render(<QueuePreview animated={false} />);

    expect(
      screen.getByText(en("dash.queue.joined", { time: en("dash.minAgo", { n: 8 }) })),
    ).toBeTruthy();
    expect(screen.getByText(en("dash.guestMany", { n: 2 }))).toBeTruthy();
    expect(container.textContent).not.toMatch(/mins ago/);
  });

  it("only shows wait estimates the queue engine can produce", () => {
    render(<QueuePreview animated={false} />);

    expect(
      screen.getByText(en("dash.queue.estimatedWait", { text: "Less Than 5 Minutes" })),
    ).toBeTruthy();
    expect(
      screen.getByText(en("dash.queue.estimatedWait", { text: "10-15 Minutes" })),
    ).toBeTruthy();
  });

  it("labels the row actions with the real button copy", () => {
    render(<QueuePreview animated={false} />);

    expect(screen.getAllByText(en("dash.admit")).length).toBeGreaterThan(0);
    expect(screen.getAllByText(en("dash.remove")).length).toBeGreaterThan(0);
  });

  it("shows the admit toast exactly as the dashboard raises it", () => {
    render(<QueuePreview animated={false} />);

    expect(screen.getByText(en("dash.toast.admitted.title"))).toBeTruthy();
  });
});

describe("reservation preview fidelity", () => {
  it("uses the real tab labels", () => {
    render(<ReservationPreview animated={false} />);

    for (const key of [
      "res.tab.today",
      "res.tab.upcoming",
      "res.tab.past",
      "res.tab.cancelled",
      "res.tab.noShows",
    ] as TKey[]) {
      expect(screen.getByText(en(key))).toBeTruthy();
    }
  });

  it("offers every action a confirmed booking really exposes", () => {
    render(<ReservationPreview animated={false} />);

    expect(screen.getAllByText(en("res.action.markArrived")).length).toBeGreaterThan(0);
    expect(screen.getAllByText(en("res.action.noShow")).length).toBeGreaterThan(0);
    expect(screen.getAllByText(en("res.action.cancel")).length).toBeGreaterThan(0);
    expect(screen.getAllByText(en("res.action.markCompleted")).length).toBeGreaterThan(0);
  });

  it("uses the Overview stat card labels for the floating metrics", () => {
    render(<ReservationPreview animated={false} />);

    expect(screen.getByText(en("dash.stat.reservationsToday"))).toBeTruthy();
    expect(screen.getByText(en("dash.stat.servedToday"))).toBeTruthy();
    expect(screen.getByText(en("dash.stat.leftToday"))).toBeTruthy();
  });
});

describe("guest preview fidelity", () => {
  it("uses the real guest search placeholder", () => {
    render(<GuestProfilePreview animated={false} />);

    expect(screen.getByText(en("guests.search.placeholder"))).toBeTruthy();
  });

  it("uses the real visit summary wording", () => {
    render(<GuestProfilePreview animated={false} />);

    expect(screen.getAllByText(en("guests.visitsWord")).length).toBeGreaterThan(0);
    expect(screen.getByText(en("guests.upcomingCount", { n: 1 }))).toBeTruthy();
  });
});

describe("campaign preview fidelity", () => {
  it("keeps the send result wording the campaign history shows", () => {
    const { container } = render(<CampaignPreview animated={false} />);

    expect(container.textContent).toContain("189 Sent");
    expect(container.textContent).toContain("0 Failed");
    expect(container.textContent).toContain("0 Skipped");
    expect(container.textContent).toContain("134 Matched · 6 Excluded");
  });
});

describe("floor preview fidelity", () => {
  it("uses the Live Floor panel titles and party wording", () => {
    render(<FloorBentoPreview animated={false} />);

    expect(screen.getByText(en("floor.live.waitingTitle"))).toBeTruthy();
    expect(screen.getByText(en("floor.live.admittedTitle"))).toBeTruthy();
    expect(screen.getByText(en("floor.live.reservationsTitle"))).toBeTruthy();
    expect(screen.getByText(en("floor.live.holdingTable", { table: "T2" }))).toBeTruthy();
    expect(screen.getByText(en("floor.live.arrivalLeft", { time: "3:12" }))).toBeTruthy();
  });

  it("draws a floor plan that covers every live table status", () => {
    const { container } = render(<FloorBentoPreview animated={false} />);

    for (const status of LIVE_STATUSES) {
      expect(container.querySelectorAll(`[data-status="${status}"]`).length).toBeGreaterThan(0);
    }
  });

  it("draws the whole plan as one scalable svg", () => {
    const { container } = render(<FloorBentoPreview animated={false} />);
    const svg = container.querySelector("[data-testid='floor-canvas']");

    expect(svg?.getAttribute("viewBox")).toBe("0 0 800 450");
    expect(svg?.querySelectorAll("[data-status]")).toHaveLength(9);
    expect(container.querySelectorAll("[data-status]")).toHaveLength(9);
  });

  it("paints every table with the colours the Live Floor uses for that status", () => {
    const { container } = render(<FloorBentoPreview animated={false} />);

    for (const status of LIVE_STATUSES) {
      const node = container.querySelector(`[data-status="${status}"]`);
      const shape = node?.querySelector("rect, circle");
      const label = node?.querySelector("text");
      const real = statusStyle(status).node;

      for (const token of real.split(" ")) {
        const [prefix, ...rest] = token.split("-");
        const colour = rest.join("-");
        if (prefix === "border") {
          expect(shape?.getAttribute("class")).toContain(`stroke-${colour}`);
        }
        if (prefix === "bg") {
          expect(shape?.getAttribute("class")).toContain(`fill-${colour}`);
        }
        if (prefix === "text") {
          expect(label?.getAttribute("class")).toContain(`fill-${colour}`);
        }
      }
    }
  });

  it("counts the legend against the tables it draws", () => {
    const { container } = render(<FloorBentoPreview animated={false} />);
    const labels = ["Available", "Reserved", "Occupied", "Cleaning", "Blocked"];

    for (const [index, status] of LIVE_STATUSES.entries()) {
      const drawn = container.querySelectorAll(`[data-status="${status}"]`).length;
      const row = screen.getByText(labels[index]).parentElement;

      expect(row?.textContent).toBe(`${labels[index]}${drawn}`);
    }
  });
});

describe("performance preview fidelity", () => {
  it("uses the real Performance metric and rate labels", () => {
    render(<PerformanceBentoPreview animated={false} />);

    expect(screen.getByText(en("perf.hero.coversSeated"))).toBeTruthy();
    expect(screen.getByText(en("perf.rates.title"))).toBeTruthy();
    expect(screen.getByText(en("perf.metric.abandonment"))).toBeTruthy();
    expect(screen.getByText(en("perf.metric.noShowRate"))).toBeTruthy();
    expect(screen.getByText(en("perf.metric.utilization"))).toBeTruthy();
    expect(screen.getByText(en("perf.mix.title"))).toBeTruthy();
    expect(screen.getByText(en("perf.mix.reservations", { n: 114 }))).toBeTruthy();
    expect(screen.getByText(en("perf.mix.walkIns", { n: 70 }))).toBeTruthy();
  });

  it("keeps the covers total consistent with the reservation and walk in split", () => {
    const { container } = render(<PerformanceBentoPreview animated={false} />);

    expect(container.textContent).toContain(en("perf.hero.totalCovers", { n: 184 }));
    expect(114 + 70).toBe(184);
  });
});

describe("hero dashboard fidelity", () => {
  it("shows the real business navigation, Floor included", () => {
    render(<HeroDashboardPreview />);

    for (const group of BUSINESS_NAV_GROUPS) {
      expect(screen.getAllByText(en(group.labelKey)).length).toBeGreaterThan(0);
      for (const item of group.items) {
        expect(screen.getAllByText(en(item.labelKey)).length).toBeGreaterThan(0);
      }
    }
  });

  it("opens on the Overview page it claims to show", () => {
    render(<HeroDashboardPreview />);

    expect(screen.getByText(en("dash.dailyStat"))).toBeTruthy();
    expect(screen.getByText(en("dash.perf.title"))).toBeTruthy();
    expect(screen.getByText(en("dash.perf.desc"))).toBeTruthy();
    expect(screen.getByText(en("dash.daily"))).toBeTruthy();
    expect(screen.getByText(en("dash.weekly"))).toBeTruthy();
  });

  it("uses the Overview stat cards and chart series the dashboard renders", () => {
    render(<HeroDashboardPreview />);

    for (const key of [
      "dash.stat.currentQueue",
      "dash.stat.reservationsToday",
      "dash.stat.avgQueueWaitTime",
      "dash.stat.servedToday",
      "dash.stat.leftToday",
      "dash.legend.served",
      "dash.legend.avgWait",
      "dash.legend.noShows",
    ] as TKey[]) {
      expect(screen.getByText(en(key))).toBeTruthy();
    }
  });

  it("never invents a header the business dashboard does not render", () => {
    const { container } = render(<HeroDashboardPreview />);

    expect(container.textContent).not.toMatch(/Managing queue for/);
    expect(container.textContent).not.toMatch(/Bookings for/);
  });
});
