import { describe, expect, it } from "vitest";
import { BUSINESS_NAV_GROUPS, isActiveNavPath } from "../../src/lib/businessNav.js";
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
