import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BUSINESS_NAV_GROUPS,
  SIDEBAR_COLLAPSED_KEY,
  isActiveNavPath,
  persistSidebarCollapsed,
  readSidebarCollapsed,
} from "../../src/lib/businessNav.js";
import { LOCATION_STORAGE_KEY, locationLabel } from "../../src/lib/businessSession.js";

describe("business navigation config", () => {
  it("groups every business destination under Operations, Customers, Insights, and Other", () => {
    const groupKeys = BUSINESS_NAV_GROUPS.map((group) => group.labelKey);
    expect(groupKeys).toEqual([
      "nav.group.operations",
      "nav.group.customers",
      "nav.group.insights",
      "nav.group.other",
    ]);

    const paths = BUSINESS_NAV_GROUPS.flatMap((group) => group.items.map((item) => item.to));
    expect(paths).toEqual([
      "/business/overview",
      "/business/queue",
      "/business/reservations",
      "/business/floor",
      "/business/guests",
      "/business/reviews",
      "/business/campaigns",
      "/business/performance",
      "/business/settings",
    ]);
  });

  it("gives every navigation item a label key and an icon", () => {
    for (const group of BUSINESS_NAV_GROUPS) {
      for (const item of group.items) {
        expect(item.labelKey.startsWith("nav.")).toBe(true);
        expect(item.icon).toBeTruthy();
      }
    }
  });

  it("puts Reviews under Customers between Guests and Campaigns", () => {
    const customers = BUSINESS_NAV_GROUPS.find((group) => group.labelKey === "nav.group.customers");

    expect(customers?.items.map((item) => item.to)).toEqual([
      "/business/guests",
      "/business/reviews",
      "/business/campaigns",
    ]);
    const reviews = customers?.items.find((item) => item.to === "/business/reviews");
    expect(reviews?.labelKey).toBe("nav.reviews");
    expect(reviews?.icon).toBeTruthy();
  });

  it("does not repeat a destination across groups", () => {
    const paths = BUSINESS_NAV_GROUPS.flatMap((group) => group.items.map((item) => item.to));
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe("isActiveNavPath", () => {
  it("matches the exact path", () => {
    expect(isActiveNavPath("/business/queue", "/business/queue")).toBe(true);
  });

  it("matches nested paths under the destination", () => {
    expect(isActiveNavPath("/business/guests/abc123", "/business/guests")).toBe(true);
  });

  it("does not match a sibling path with a shared prefix", () => {
    expect(isActiveNavPath("/business/queue-archive", "/business/queue")).toBe(false);
    expect(isActiveNavPath("/business/overview", "/business/queue")).toBe(false);
  });
});

describe("locationLabel", () => {
  it("prefers the display name", () => {
    const label = locationLabel(
      { id: "1", displayName: "PIK Avenue", name: "PIK", address: "Jalan Pantai" },
      0,
    );
    expect(label).toBe("PIK Avenue");
  });

  it("falls back to name, then address, then a positional label", () => {
    expect(locationLabel({ id: "1", name: "PIK", address: "Jalan Pantai" }, 0)).toBe("PIK");
    expect(locationLabel({ id: "1", address: "Jalan Pantai" }, 0)).toBe("Jalan Pantai");
    expect(locationLabel({ id: "1" }, 2)).toBe("Location 3");
  });

  it("returns an empty string when no location is selected", () => {
    expect(locationLabel(null, 0)).toBe("");
  });
});

describe("location persistence key", () => {
  it("is namespaced separately from the business language key", () => {
    expect(LOCATION_STORAGE_KEY).toBe("seatping.business.locationId");
  });
});

describe("sidebar collapse persistence", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to expanded when nothing is stored", () => {
    expect(readSidebarCollapsed()).toBe(false);
  });

  it("round trips a collapsed sidebar", () => {
    persistSidebarCollapsed(true);
    expect(store.get(SIDEBAR_COLLAPSED_KEY)).toBe("true");
    expect(readSidebarCollapsed()).toBe(true);

    persistSidebarCollapsed(false);
    expect(readSidebarCollapsed()).toBe(false);
  });

  it("treats any other stored value as expanded", () => {
    store.set(SIDEBAR_COLLAPSED_KEY, "yes");
    expect(readSidebarCollapsed()).toBe(false);
  });

  it("stays expanded when storage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(readSidebarCollapsed()).toBe(false);
    expect(() => persistSidebarCollapsed(true)).not.toThrow();
  });

  it("uses a key separate from the location and language keys", () => {
    expect(SIDEBAR_COLLAPSED_KEY).toBe("seatping.business.sidebarCollapsed");
  });
});
