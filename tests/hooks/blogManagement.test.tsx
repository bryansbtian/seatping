import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import BlogManagement from "../../src/components/blog/BlogManagement";

const empty = {
  posts: [],
  stats: { total: 0, drafts: 0, published: 0 },
  filters: { categories: [], authors: [], tags: [] },
};

function view() {
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <BlogManagement />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Blog Management Counts", () => {
  it("keeps skeletons until an empty response resolves and then shows three zero counts", async () => {
    let resolve = (_response: Response) => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((done) => {
            resolve = done;
          }),
      ),
    );
    view();
    expect(screen.getByRole("status", { name: "Loading Blog Posts" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "No Blogs Yet" })).toBeNull();
    expect(screen.queryByText("0")).toBeNull();

    await act(async () => {
      resolve(Response.json(empty));
    });

    expect(await screen.findByRole("heading", { name: "No Blogs Yet" })).toBeTruthy();
    const overview = screen.getByRole("region", { name: "Blog Overview" });
    expect(within(overview).getAllByText("0")).toHaveLength(3);
    expect(within(overview).queryByText("Unavailable")).toBeNull();
    expect(screen.queryByRole("status", { name: "Loading Blog Posts" })).toBeNull();
  });

  it("shows zero counts with the load error and allows retrying", async () => {
    const fetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          Response.json({ error: "Admin access is not configured" }, { status: 503 }),
        ),
      );
    vi.stubGlobal("fetch", fetch);
    view();
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Admin access is not configured")).toBeTruthy();
    const overview = screen.getByRole("region", { name: "Blog Overview" });
    expect(within(overview).getAllByText("0")).toHaveLength(3);
    expect(within(overview).queryByText("Unavailable")).toBeNull();
    expect(screen.queryByRole("heading", { name: "No Blogs Yet" })).toBeNull();

    fetch.mockImplementation(() => Promise.resolve(Response.json(empty)));
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("heading", { name: "No Blogs Yet" })).toBeTruthy();
    expect(screen.getAllByText("0")).toHaveLength(3);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("Unavailable")).toBeNull();
  });
});
