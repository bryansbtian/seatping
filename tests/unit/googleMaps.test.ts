import { afterEach, describe, expect, it, vi } from "vitest";

type MapsModule = typeof import("../../src/lib/googleMaps.js");

type Harness = {
  mod: MapsModule;
  win: Record<string, any>;
  scripts: Array<Record<string, any>>;
  appended: Array<Record<string, any>>;
};

async function loadMaps(apiKey?: string): Promise<Harness> {
  vi.resetModules();
  if (apiKey) {
    vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", apiKey);
  } else {
    vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "");
  }

  const win: Record<string, any> = {};
  const scripts: Array<Record<string, any>> = [];
  const appended: Array<Record<string, any>> = [];

  vi.stubGlobal("window", win);
  vi.stubGlobal("document", {
    createElement: () => {
      const script: Record<string, any> = {};
      scripts.push(script);
      return script;
    },
    head: {
      appendChild: (node: Record<string, any>) => {
        appended.push(node);
      },
    },
  });

  const mod = await import("../../src/lib/googleMaps.js");
  return { mod, win, scripts, appended };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("getMapsApiKey", () => {
  it("reads the configured key", async () => {
    const { mod } = await loadMaps("maps-key");

    expect(mod.getMapsApiKey()).toBe("maps-key");
  });

  it("reports nothing when the key is unset", async () => {
    const { mod } = await loadMaps();

    expect(mod.getMapsApiKey()).toBeFalsy();
  });
});

describe("loadGoogleMaps", () => {
  it("resolves immediately when the places library is already present", async () => {
    const { mod, win, appended } = await loadMaps("maps-key");
    win.google = { maps: { places: {} } };

    await expect(mod.loadGoogleMaps()).resolves.toBe(win.google);
    expect(appended).toHaveLength(0);
  });

  it("rejects when no api key is configured", async () => {
    const { mod } = await loadMaps();

    await expect(mod.loadGoogleMaps()).rejects.toThrow("VITE_GOOGLE_MAPS_API_KEY is not set");
  });

  it("injects a places script that resolves through the jsonp callback", async () => {
    const { mod, win, appended } = await loadMaps("maps-key");

    const pending = mod.loadGoogleMaps();

    expect(appended).toHaveLength(1);
    expect(appended[0].src).toContain("key=maps-key");
    expect(appended[0].src).toContain("libraries=places");
    expect(appended[0].async).toBe(true);

    win.google = { maps: { places: {} } };
    win.__seatping_gmaps_cb();

    await expect(pending).resolves.toBe(win.google);
  });

  it("reuses the in-flight load promise", async () => {
    const { mod, win, appended } = await loadMaps("maps-key");

    const first = mod.loadGoogleMaps();
    const second = mod.loadGoogleMaps();

    expect(appended).toHaveLength(1);
    win.google = { maps: { places: {} } };
    win.__seatping_gmaps_cb();

    await expect(first).resolves.toBe(win.google);
    await expect(second).resolves.toBe(win.google);
  });

  it("rejects and allows a retry when the script fails to load", async () => {
    const { mod, appended } = await loadMaps("maps-key");

    const pending = mod.loadGoogleMaps();
    appended[0].onerror();

    await expect(pending).rejects.toThrow("Failed to load Google Maps script");

    mod.loadGoogleMaps().catch(() => {});
    expect(appended).toHaveLength(2);
  });
});

describe("onMapsAuthFailure", () => {
  it("notifies subscribers when Google reports an auth failure", async () => {
    const { mod, win } = await loadMaps("maps-key");
    mod.loadGoogleMaps().catch(() => {});

    const seen: string[] = [];
    mod.onMapsAuthFailure(() => {
      seen.push("first");
    });

    win.gm_authFailure();

    expect(seen).toEqual(["first"]);
  });

  it("fires immediately for a subscriber added after the failure", async () => {
    const { mod, win } = await loadMaps("maps-key");
    mod.loadGoogleMaps().catch(() => {});
    win.gm_authFailure();

    const seen: string[] = [];
    mod.onMapsAuthFailure(() => {
      seen.push("late");
    });

    expect(seen).toEqual(["late"]);
  });

  it("stops notifying after unsubscribing", async () => {
    const { mod, win } = await loadMaps("maps-key");
    mod.loadGoogleMaps().catch(() => {});

    const seen: string[] = [];
    const off = mod.onMapsAuthFailure(() => {
      seen.push("hit");
    });
    off();

    win.gm_authFailure();

    expect(seen).toEqual([]);
  });

  it("installs the failure hook only once", async () => {
    const { mod, win } = await loadMaps("maps-key");

    mod.loadGoogleMaps().catch(() => {});
    const firstHook = win.gm_authFailure;
    win.google = { maps: { places: {} } };
    mod.loadGoogleMaps().catch(() => {});

    expect(win.gm_authFailure).toBe(firstHook);
  });
});

describe("parsePlace", () => {
  function place(overrides: Record<string, unknown> = {}) {
    return {
      formatted_address: "1 Test Street",
      address_components: [],
      ...overrides,
    };
  }

  it("prefers sublocality_level_1 for the area", async () => {
    const { mod } = await loadMaps("maps-key");

    const parsed = mod.parsePlace(
      place({
        address_components: [
          { long_name: "Kebayoran", types: ["sublocality_level_1"] },
          { long_name: "Other", types: ["neighborhood"] },
        ],
      }),
    );

    expect(parsed.area).toBe("Kebayoran");
  });

  it("falls back through sublocality and neighborhood", async () => {
    const { mod } = await loadMaps("maps-key");

    expect(
      mod.parsePlace(
        place({
          address_components: [{ long_name: "Senayan", types: ["sublocality"] }],
        }),
      ).area,
    ).toBe("Senayan");
    expect(
      mod.parsePlace(
        place({
          address_components: [{ long_name: "Midtown", types: ["neighborhood"] }],
        }),
      ).area,
    ).toBe("Midtown");
  });

  it("falls back through the administrative areas for the city", async () => {
    const { mod } = await loadMaps("maps-key");

    expect(
      mod.parsePlace(
        place({
          address_components: [{ long_name: "Regency", types: ["administrative_area_level_2"] }],
        }),
      ).city,
    ).toBe("Regency");
    expect(
      mod.parsePlace(
        place({
          address_components: [{ long_name: "Province", types: ["administrative_area_level_1"] }],
        }),
      ).city,
    ).toBe("Province");
  });

  it("builds a maps url from the place id", async () => {
    const { mod } = await loadMaps("maps-key");

    const parsed = mod.parsePlace(place({ place_id: "place-9" }));

    expect(parsed.googleMapsUrl).toContain("query_place_id=place-9");
  });

  it("builds a maps url from coordinates when there is no place id", async () => {
    const { mod } = await loadMaps("maps-key");

    const parsed = mod.parsePlace(
      place({
        geometry: {
          location: {
            lat: () => {
              return -6.2;
            },
            lng: () => {
              return 106.8;
            },
          },
        },
      }),
    );

    expect(parsed.googleMapsUrl).toBe("https://www.google.com/maps/search/?api=1&query=-6.2,106.8");
  });

  it("leaves the maps url unset when there is neither a place id nor coordinates", async () => {
    const { mod } = await loadMaps("maps-key");

    expect(mod.parsePlace(place()).googleMapsUrl).toBeUndefined();
  });

  it("prefers the url supplied by Google", async () => {
    const { mod } = await loadMaps("maps-key");

    const parsed = mod.parsePlace(
      place({ place_id: "place-9", url: "https://maps.app.goo.gl/short" }),
    );

    expect(parsed.googleMapsUrl).toBe("https://maps.app.goo.gl/short");
  });

  it("uses the place name when there is no formatted address", async () => {
    const { mod } = await loadMaps("maps-key");

    expect(mod.parsePlace({ name: "Test Bistro", formatted_address: "" }).address).toBe(
      "Test Bistro",
    );
    expect(mod.parsePlace({}).address).toBe("");
  });

  it("nulls the coordinates when the geometry accessors are missing", async () => {
    const { mod } = await loadMaps("maps-key");

    const parsed = mod.parsePlace(place({ geometry: { location: {} } }));

    expect(parsed.latitude).toBeNull();
    expect(parsed.longitude).toBeNull();
  });
});
