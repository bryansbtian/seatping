import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import BlogManagement from "../../src/components/blog/BlogManagement";
import BlogCard from "../../src/components/blog/BlogCard";
import { newBlogFields } from "../../shared/blog";

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
  vi.restoreAllMocks();
});

describe("Blog Management Counts", () => {
  it("keeps admin dates and public publication dates in UTC near midnight", async () => {
    const post = {
      ...newBlogFields(),
      id: "article",
      title: "Restaurant Reservations",
      slug: "restaurant-reservations",
      status: "PUBLISHED",
      revision: 1,
      createdAt: "2026-11-11T01:30:00.000Z",
      updatedAt: "2026-11-13T01:30:00.000Z",
      publishedAt: "2026-11-12T01:30:00.000Z",
    };
    const original = Date.prototype.toLocaleDateString;
    vi.spyOn(Date.prototype, "toLocaleDateString").mockImplementation(function (
      this: Date,
      locales,
      options,
    ) {
      return original.call(this, locales, { timeZone: "America/New_York", ...options });
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          ...empty,
          posts: [post],
          stats: { total: 1, drafts: 0, published: 1 },
        }),
      ),
    );
    view();
    const table = await screen.findByRole("region", { name: "Blog Posts Table" });
    expect(within(table).getByText("Nov 11, 2026")).toBeTruthy();
    expect(within(table).getByText("Nov 13, 2026")).toBeTruthy();
    expect(within(table).getByRole("columnheader", { name: "Published (UTC)" })).toBeTruthy();
    const adminDate = within(table).getByText("Nov 12, 2026");

    const card = render(
      <MemoryRouter>
        <BlogCard post={{ ...post, readingMinutes: 1 }} />
      </MemoryRouter>,
    );
    expect(card.container.querySelector("time")?.textContent).toBe(adminDate.textContent);
    expect(card.container.querySelector("time")?.dateTime).toBe(post.publishedAt);
  });

  it("does not substitute a draft creation date for its publication date", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          ...empty,
          posts: [
            {
              ...newBlogFields(),
              id: "draft",
              title: "Draft Article",
              status: "DRAFT",
              revision: 1,
              createdAt: "2026-11-11T01:30:00.000Z",
              updatedAt: "2026-11-11T01:30:00.000Z",
              publishedAt: null,
            },
          ],
          stats: { total: 1, drafts: 1, published: 0 },
        }),
      ),
    );
    view();
    const table = await screen.findByRole("region", { name: "Blog Posts Table" });
    expect(within(table).getByText("Not Published")).toBeTruthy();
    expect(table.querySelector("time")).toBeNull();
  });

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
