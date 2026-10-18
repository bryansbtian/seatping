import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BusinessBootstrap from "../../src/components/BusinessBootstrap.js";
import { queryClient } from "../../src/lib/queryClient.js";
import { useBusinessSession } from "../../src/lib/businessSession.js";

function Dashboard() {
  const { me, currentLocation, refreshMe } = useBusinessSession();
  return (
    <>
      <h1>{me?.name ?? "Private Dashboard"}</h1>
      <p>{currentLocation?.displayName ?? "No Location"}</p>
      <button type="button" onClick={() => void refreshMe()}>
        Refresh Account
      </button>
    </>
  );
}

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={["/business/overview"]}>
      <Routes>
        <Route
          path="/business/overview"
          element={
            <BusinessBootstrap>
              <Dashboard />
            </BusinessBootstrap>
          }
        />
        <Route path="/business/login" element={<h1>Business Login</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  queryClient.clear();
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  queryClient.clear();
});

describe("business initialization", () => {
  it("keeps account placeholders hidden when authentication finishes before the account request", async () => {
    let finishAccount = (_value: Response) => {};
    vi.stubGlobal(
      "fetch",
      vi.fn((path: RequestInfo | URL) => {
        if (String(path) === "/auth/business/me") {
          return new Promise<Response>((resolve) => {
            finishAccount = resolve;
          });
        }
        if (String(path) === "/auth/session") {
          return Promise.resolve(
            new Response(JSON.stringify({ customer: null, business: { name: "Business" } })),
          );
        }
        return Promise.resolve(new Response(JSON.stringify({ language: "en" })));
      }),
    );
    renderDashboard();

    await waitFor(() => expect(queryClient.getQueryData(["private", "session"])).toBeTruthy());
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Private Dashboard" })).toBeNull();
    expect(screen.queryByText("No Location")).toBeNull();

    await act(async () => {
      finishAccount(
        new Response(
          JSON.stringify({
            user: {
              id: "business-fixture",
              name: "Loaded Business",
              locations: [{ id: "location-fixture", displayName: "Selected Location" }],
            },
          }),
        ),
      );
    });
    expect(await screen.findByRole("heading", { name: "Loaded Business" })).toBeTruthy();
    expect(screen.getByText("Selected Location")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows an initial account error and retries without rendering incomplete dashboard data", async () => {
    let finishRetry = (_value: Response) => {};
    let accountCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((path: RequestInfo | URL) => {
        if (String(path) === "/auth/business/me") {
          accountCalls++;
          if (accountCalls === 1) {
            return Promise.resolve(
              new Response(JSON.stringify({ error: "Account unavailable" }), { status: 503 }),
            );
          }
          return new Promise<Response>((resolve) => {
            finishRetry = resolve;
          });
        }
        if (String(path) === "/auth/session") {
          return Promise.resolve(
            new Response(JSON.stringify({ customer: null, business: { name: "Business" } })),
          );
        }
        return Promise.resolve(new Response(JSON.stringify({ language: "en" })));
      }),
    );
    renderDashboard();

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText("No Location")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Private Dashboard" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("status")).toBeTruthy();
    await act(async () => {
      finishRetry(
        new Response(
          JSON.stringify({ user: { id: "business-fixture", name: "Recovered Business" } }),
        ),
      );
    });
    expect(await screen.findByRole("heading", { name: "Recovered Business" })).toBeTruthy();
    expect(accountCalls).toBe(2);
  });

  it("keeps loaded dashboard data visible while a refresh is pending or fails", async () => {
    let finishRefresh = (_value: Response) => {};
    let accountCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((path: RequestInfo | URL) => {
        if (String(path) === "/auth/business/me") {
          accountCalls++;
          if (accountCalls === 1) {
            return Promise.resolve(
              new Response(
                JSON.stringify({ user: { id: "business-fixture", name: "Loaded Business" } }),
              ),
            );
          }
          return new Promise<Response>((resolve) => {
            finishRefresh = resolve;
          });
        }
        if (String(path) === "/auth/session") {
          return Promise.resolve(
            new Response(JSON.stringify({ customer: null, business: { name: "Business" } })),
          );
        }
        return Promise.resolve(new Response(JSON.stringify({ language: "en" })));
      }),
    );
    renderDashboard();
    await screen.findByRole("heading", { name: "Loaded Business" });

    fireEvent.click(screen.getByRole("button", { name: "Refresh Account" }));
    expect(screen.getByRole("heading", { name: "Loaded Business" })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    await act(async () => {
      finishRefresh(new Response(JSON.stringify({ error: "Unavailable" }), { status: 503 }));
    });
    expect(screen.getByRole("heading", { name: "Loaded Business" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("starts business and language data while session verification is pending", async () => {
    let finish = (_value: Response) => {};
    const fetchMock = vi.fn((path: RequestInfo | URL) => {
      if (String(path) === "/auth/session") {
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      }
      if (String(path) === "/auth/business/me") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              user: { id: "business-1", name: "Verified Business", locations: [] },
            }),
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(new Response(JSON.stringify({ language: "en" }), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    renderDashboard();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls.map(([path]) => String(path))).toEqual(
      expect.arrayContaining(["/auth/session", "/auth/business/me", "/auth/business/language"]),
    );
    expect(screen.queryByRole("heading", { name: "Verified Business" })).toBeNull();
    expect(screen.getByRole("status")).toBeTruthy();
    await act(async () => {
      finish(
        new Response(JSON.stringify({ customer: null, business: { name: "Verified Business" } }), {
          status: 200,
        }),
      );
    });
    expect(await screen.findByRole("heading", { name: "Verified Business" })).toBeTruthy();
    expect(
      fetchMock.mock.calls.filter(([path]) => String(path) === "/auth/business/me"),
    ).toHaveLength(1);
  });

  it("keeps dashboard content protected when all bootstrap requests are unauthorized", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((path: RequestInfo | URL) => {
        if (String(path) === "/auth/session") {
          return Promise.resolve(
            new Response(JSON.stringify({ customer: null, business: null }), { status: 200 }),
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
        );
      }),
    );
    renderDashboard();
    expect(await screen.findByRole("heading", { name: "Business Login" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Private Dashboard" })).toBeNull();
  });
});
