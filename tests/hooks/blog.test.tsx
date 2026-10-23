import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Blog from "../../src/pages/Blog.js";
import BlogArticle from "../../src/pages/BlogArticle.js";
import BlogCover from "../../src/components/blog/BlogCover.js";
import { newBlogFields } from "../../shared/blog.js";
import { BLOG_TITLE } from "../../shared/publicBlog.js";

vi.mock("@/components/Header", () => ({ default: () => <header>SeatPing</header> }));
const post = {
  ...newBlogFields(),
  title: "Better Guest Experiences",
  slug: "better-guests",
  category: "Guides",
  content: {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "A practical guest guide." }] }],
  },
  publishedAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};
function mount(path = "/blog") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/blog" element={<Blog />} />
          <Route path="/blog/:slug" element={<BlogArticle />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("Public Blog", () => {
  it("fills the initial request with an accessible skeleton without showing an empty state", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    mount();
    expect(screen.getByRole("status", { name: "Loading Blog Posts" })).toBeTruthy();
    expect(screen.queryByText("No Articles Yet")).toBeNull();
    expect(screen.getByText("BLOG")).toBeTruthy();
  });
  it("shows published cards, follows category links and opens an article", async () => {
    const fetcher = vi.fn((url: string) => {
      if (url.endsWith("/related")) {
        return Promise.resolve(Response.json({ posts: [] }));
      }
      if (url.startsWith("/api/blog/better-guests")) {
        return Promise.resolve(Response.json({ post }));
      }
      return Promise.resolve(
        Response.json({
          posts: [{ ...post, readingMinutes: 1 }],
          categories: ["Guides"],
          page: 1,
          totalPages: 1,
        }),
      );
    });
    vi.stubGlobal("fetch", fetcher);
    mount();
    await screen.findByRole("heading", { name: post.title });
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Blog Categories" })).getByRole("link", {
        name: "Guides",
      }),
    );
    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith("/api/blog?category=Guides&page=1", expect.any(Object)),
    );
    fireEvent.click(await screen.findByRole("link", { name: new RegExp(post.title) }));
    await screen.findByText("A practical guest guide.");
    expect(document.title).toBe(`${post.title} | SeatPing`);
    expect(JSON.parse(document.getElementById("page-structured-data")!.textContent!)["@type"]).toBe(
      "BlogPosting",
    );
    expect(screen.getAllByRole("contentinfo").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("link", { name: "Back To Blogs" }));
    await screen.findByRole("heading", { name: BLOG_TITLE });
    await waitFor(() => expect(document.getElementById("page-structured-data")).toBeNull());
  });
  it("keeps request errors distinct from an empty publication list and retries", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValue(Response.json({ posts: [], categories: [], page: 1, totalPages: 0 }));
    vi.stubGlobal("fetch", fetcher);
    mount();
    await screen.findByRole("heading", { name: "Unable To Load Articles" });
    expect(screen.queryByText("No Articles Yet")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
    await screen.findByText("No Articles Yet");
  });
  it("renders an article skeleton while loading and a missing article state for a 404", async () => {
    let finish = (_response: Response) => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      ),
    );
    mount("/blog/missing");
    expect(screen.getByRole("status", { name: "Loading Article" })).toBeTruthy();
    finish(new Response("", { status: 404 }));
    await screen.findByRole("heading", { name: "Article Not Found" });
    expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe(
      "noindex, follow",
    );
  });
  it("keeps an article service failure distinct from a missing article", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));
    mount("/blog/unavailable");
    await screen.findByRole("heading", { name: "Unable To Load This Article" });
    expect(screen.queryByText("Article Not Found")).toBeNull();
  });
});

describe("Cover Image Editing", () => {
  it.each(["Backspace", "Delete"])("removes the cover with %s", (key) => {
    const remove = vi.fn();
    render(
      <BlogCover
        url="https://example.com/cover.jpg"
        alt="Cover"
        readOnly={false}
        disabled={false}
        onRemove={remove}
      />,
    );
    const cover = screen.getByRole("textbox", { name: "Cover Image" });
    fireEvent.click(cover);
    fireEvent.keyDown(cover, { key });
    expect(remove).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("keeps preview covers read only", () => {
    render(
      <BlogCover
        url="https://example.com/cover.jpg"
        alt="Cover"
        readOnly
        disabled={false}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("img", { name: "Cover" })).toBeTruthy();
  });
});
