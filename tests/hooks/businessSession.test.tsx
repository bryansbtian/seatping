import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BusinessSessionProvider from "../../src/components/BusinessSessionProvider.js";
import {
  BusinessSessionContext,
  LOCATION_STORAGE_KEY,
  locationLabel,
  useBusinessSession,
} from "../../src/lib/businessSession.js";

const apiMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => {
  return { api: apiMock };
});

function location(id: string, displayName: string) {
  return { id, displayName, name: displayName, address: `${displayName} Street` };
}

function businessMe(locations: ReturnType<typeof location>[]) {
  return {
    user: {
      id: "biz-1",
      name: "Demo Restaurant",
      username: "demo",
      email: "owner@demo.test",
      locations,
    },
  };
}

function expectRenderToThrow(run: () => void, message?: string) {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  const swallow = (event: ErrorEvent) => event.preventDefault();
  window.addEventListener("error", swallow);
  try {
    expect(run).toThrow(message);
  } finally {
    window.removeEventListener("error", swallow);
    consoleError.mockRestore();
  }
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <BusinessSessionProvider>{children}</BusinessSessionProvider>;
}

beforeEach(() => {
  localStorage.clear();
  apiMock.mockReset();
  apiMock.mockResolvedValue(
    businessMe([location("loc-1", "PIK Avenue"), location("loc-2", "SCBD")]),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useBusinessSession", () => {
  it("throws when used outside a provider", () => {
    expectRenderToThrow(
      () => renderHook(() => useBusinessSession()),
      "useBusinessSession must be used within a BusinessSessionProvider",
    );
  });

  it("throws when the context value is explicitly null", () => {
    expectRenderToThrow(() =>
      renderHook(() => useBusinessSession(), {
        wrapper: ({ children }) => (
          <BusinessSessionContext.Provider value={null}>{children}</BusinessSessionContext.Provider>
        ),
      }),
    );
  });

  it("returns the session value when rendered inside a provider", async () => {
    const { result } = renderHook(() => useBusinessSession(), { wrapper });

    await waitFor(() => expect(result.current.me).not.toBeNull());

    expect(result.current.me?.name).toBe("Demo Restaurant");
    expect(result.current.locations).toHaveLength(2);
    expect(result.current.currentLocation?.id).toBe("loc-1");
    expect(result.current.currentLocationIndex).toBe(0);
    expect(typeof result.current.setMe).toBe("function");
    expect(typeof result.current.refreshMe).toBe("function");
  });
});

describe("BusinessSessionProvider location context", () => {
  it("defaults to the first location and persists it", async () => {
    const { result } = renderHook(() => useBusinessSession(), { wrapper });

    await waitFor(() => expect(result.current.selectedLocationId).toBe("loc-1"));
    expect(localStorage.getItem(LOCATION_STORAGE_KEY)).toBe("loc-1");
  });

  it("restores a previously selected location across mounts", async () => {
    localStorage.setItem(LOCATION_STORAGE_KEY, "loc-2");

    const { result } = renderHook(() => useBusinessSession(), { wrapper });

    await waitFor(() => expect(result.current.currentLocation?.id).toBe("loc-2"));
    expect(result.current.currentLocationIndex).toBe(1);
  });

  it("falls back to the first location when the stored id is not owned by the business", async () => {
    localStorage.setItem(LOCATION_STORAGE_KEY, "loc-from-another-account");

    const { result } = renderHook(() => useBusinessSession(), { wrapper });

    await waitFor(() => expect(result.current.currentLocation?.id).toBe("loc-1"));
    expect(localStorage.getItem(LOCATION_STORAGE_KEY)).toBe("loc-1");
  });

  it("switches location and persists the choice", async () => {
    const { result } = renderHook(() => useBusinessSession(), { wrapper });

    await waitFor(() => expect(result.current.currentLocation?.id).toBe("loc-1"));

    act(() => {
      result.current.selectLocation("loc-2");
    });

    expect(result.current.currentLocation?.id).toBe("loc-2");
    expect(result.current.currentLocationIndex).toBe(1);
    expect(localStorage.getItem(LOCATION_STORAGE_KEY)).toBe("loc-2");
  });

  it("reports no current location when the business has none", async () => {
    apiMock.mockResolvedValue(businessMe([]));

    const { result } = renderHook(() => useBusinessSession(), { wrapper });

    await waitFor(() => expect(result.current.me).not.toBeNull());

    expect(result.current.locations).toEqual([]);
    expect(result.current.currentLocation).toBeNull();
    expect(result.current.currentLocationIndex).toBe(-1);
  });

  it("keeps a null session when the request fails", async () => {
    apiMock.mockRejectedValue(new Error("Unauthorized"));

    const { result } = renderHook(() => useBusinessSession(), { wrapper });

    await waitFor(() => expect(apiMock).toHaveBeenCalled());

    expect(result.current.me).toBeNull();
    expect(result.current.locations).toEqual([]);
    expect(result.current.currentLocation).toBeNull();
  });

  it("tolerates a session payload without a locations array", async () => {
    apiMock.mockResolvedValue({ user: { name: "Demo Restaurant" } });

    const { result } = renderHook(() => useBusinessSession(), { wrapper });

    await waitFor(() => expect(result.current.me).not.toBeNull());

    expect(result.current.locations).toEqual([]);
    expect(result.current.currentLocation).toBeNull();
  });

  it("refreshes the session on demand", async () => {
    const { result } = renderHook(() => useBusinessSession(), { wrapper });

    await waitFor(() => expect(result.current.me).not.toBeNull());
    const initialCalls = apiMock.mock.calls.length;

    apiMock.mockResolvedValue(businessMe([location("loc-1", "PIK Avenue Renamed")]));

    await act(async () => {
      await result.current.refreshMe();
    });

    expect(apiMock.mock.calls.length).toBeGreaterThan(initialCalls);
    expect(result.current.currentLocation?.displayName).toBe("PIK Avenue Renamed");
  });

  it("lets consumers update the session directly through setMe", async () => {
    const { result } = renderHook(() => useBusinessSession(), { wrapper });

    await waitFor(() => expect(result.current.me).not.toBeNull());

    act(() => {
      result.current.setMe((previous) => {
        return { ...previous, name: "Renamed Restaurant" };
      });
    });

    expect(result.current.me?.name).toBe("Renamed Restaurant");
  });

  it("shares one session between sibling consumers", async () => {
    function LocationName() {
      const { currentLocation, currentLocationIndex } = useBusinessSession();
      return <span data-testid="name">{locationLabel(currentLocation, currentLocationIndex)}</span>;
    }

    function LocationSwitcher() {
      const { selectLocation } = useBusinessSession();
      return (
        <button type="button" onClick={() => selectLocation("loc-2")}>
          Switch
        </button>
      );
    }

    render(
      <BusinessSessionProvider>
        <LocationName />
        <LocationSwitcher />
      </BusinessSessionProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("name").textContent).toBe("PIK Avenue"));

    act(() => {
      screen.getByRole("button", { name: "Switch" }).click();
    });

    expect(screen.getByTestId("name").textContent).toBe("SCBD");
  });
});
