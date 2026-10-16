import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BusinessBootstrap from "../../src/components/BusinessBootstrap.js";
import { queryClient } from "../../src/lib/queryClient.js";
import { useBusinessSession } from "../../src/lib/businessSession.js";

function Dashboard() {
  const { me } = useBusinessSession();
  return <h1>{me?.name ?? "Private Dashboard"}</h1>;
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
