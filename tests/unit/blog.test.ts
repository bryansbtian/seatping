import { afterEach, describe, expect, it, vi } from "vitest";
import {
  blogContentSchema,
  blogCoverAlt,
  blogFieldsSchema,
  blogSlug,
  emptyBlogContent,
  newBlogFields,
  readingMinutes,
  safeBlogUrl,
  safeMediaUrl,
  videoEmbedUrl,
  type BlogNode,
  type BlogPost,
} from "../../shared/blog.js";
import {
  blogRequest,
  BlogApiError,
  BlogSaveQueue,
  uploadBlogMedia,
} from "../../src/lib/blogApi.js";

afterEach(() => {
  vi.unstubAllGlobals();
});
const fixture = (): BlogPost => ({
  ...newBlogFields(),
  id: "post-1",
  slug: "post-one",
  status: "DRAFT",
  revision: 1,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  publishedAt: null,
});

describe("Blog content and URLs", () => {
  it("derives cover alt text from filenames and validates category colors", () => {
    expect(blogCoverAlt("Café Friday Menu.JPG")).toBe("cafe-friday-menu");
    expect(blogCoverAlt("dinner.menu.final.webp")).toBe("dinner-menu-final");
    expect(blogCoverAlt("🍽️.png")).toBe("cover-image");
    expect(
      blogFieldsSchema.parse({ ...newBlogFields(), categoryColor: "success" }).categoryColor,
    ).toBe("success");
    expect(
      blogFieldsSchema.safeParse({ ...newBlogFields(), categoryColor: "url(evil)" }).success,
    ).toBe(false);
  });
  it("generates predictable slugs and reading time", () => {
    expect(blogSlug(" Café & Guest Experience! ")).toBe("cafe-guest-experience");
    expect(blogSlug("a".repeat(159) + " x")).not.toMatch(/-$/);
    expect(readingMinutes(emptyBlogContent)).toBe(1);
    expect(
      readingMinutes({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "guest ".repeat(401) }] }],
      }),
    ).toBe(3);
    expect(newBlogFields()).not.toBe(newBlogFields());
  });
  it.each([
    "javascript:alert(1)",
    "data:text/html,test",
    "https://user:password@example.com",
    "file:///tmp/image",
    "not a url",
  ])("rejects unsafe link %s", (url) => {
    expect(safeBlogUrl(url)).toBe(false);
  });
  it.each([
    "https://example.com",
    "http://example.com",
    "mailto:hello@example.com",
    "tel:+123456789",
  ])("permits supported link %s", (url) => {
    expect(safeBlogUrl(url)).toBe(true);
  });
  it("restricts media and embeds to secure supported sources", () => {
    expect(safeMediaUrl("http://example.com/a.png")).toBe(false);
    expect(safeMediaUrl("https://example.com/a.png")).toBe(true);
    expect(videoEmbedUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
    expect(videoEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toContain(
      "/embed/dQw4w9WgXcQ",
    );
    expect(videoEmbedUrl("https://vimeo.com/12345")).toBe("https://player.vimeo.com/video/12345");
    expect(videoEmbedUrl("https://player.vimeo.com/video/12345")).toBe(
      "https://player.vimeo.com/video/12345",
    );
    for (const url of [
      "https://evil.com/embed/123",
      "https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/no",
      "http://vimeo.com/123",
      "invalid",
    ]) {
      expect(videoEmbedUrl(url)).toBeNull();
    }
  });
  it("accepts supported content and rejects malformed structure and unsafe attributes", () => {
    expect(blogContentSchema.safeParse(emptyBlogContent).success).toBe(true);
    const invalid: BlogNode[] = [
      { type: "text", text: "root" },
      { type: "doc", content: [] },
      { type: "doc", content: [{ type: "heading", attrs: { level: 5 } }] },
      { type: "doc", content: [{ type: "paragraph", attrs: { onclick: "alert(1)" } }] },
      { type: "doc", content: [{ type: "paragraph", attrs: { textAlign: "evil" } }] },
      { type: "doc", content: [{ type: "paragraph", text: "invalid" }] },
      { type: "doc", content: [{ type: "text", text: "outside a paragraph" }] },
      { type: "doc", content: [{ type: "image", attrs: { src: "data:image/png;base64,x" } }] },
      {
        type: "doc",
        content: [{ type: "video", attrs: { src: "https://evil.com/video", embed: true } }],
      },
      {
        type: "doc",
        content: [{ type: "video", attrs: { src: "https://evil.com/video", embed: false } }],
      },
      {
        type: "doc",
        content: [
          {
            type: "image",
            attrs: { src: "https://example.com/image", width: -1, alignment: "evil" },
          },
        ],
      },
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "hello",
                marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
              },
            ],
          },
        ],
      },
    ];
    for (const node of invalid) {
      expect(blogContentSchema.safeParse(node).success).toBe(false);
    }
    expect(blogFieldsSchema.safeParse({ ...newBlogFields(), slug: "A Bad Slug" }).success).toBe(
      false,
    );
  });
});

describe("Serialized Blog Saving", () => {
  it("serializes saves with the latest server revision and snapshots edits", async () => {
    const revisions: number[] = [];
    const bodies: unknown[] = [];
    const write = vi.fn(async (_path: string, _method: string, data: unknown) => {
      const value = data as { revision: number; title: string };
      revisions.push(value.revision);
      bodies.push(value);
      await Promise.resolve();
      return { post: { ...fixture(), title: value.title, revision: value.revision + 1 } };
    });
    const queue = new BlogSaveQueue(fixture(), write as typeof blogRequest);
    const first = newBlogFields();
    first.title = "First";
    const savedFirst = queue.save(first);
    first.title = "Mutated";
    const savedSecond = queue.save({ ...newBlogFields(), title: "Second" });
    await Promise.all([savedFirst, savedSecond]);
    expect(revisions).toEqual([1, 2]);
    expect(bodies[0]).toMatchObject({ title: "First" });
    expect(queue.post?.title).toBe("Second");
  });
  it("pauses after conflicts and preserves the last saved state", async () => {
    const write = vi.fn().mockRejectedValue(new BlogApiError("Conflict", 409, "REVISION_CONFLICT"));
    const queue = new BlogSaveQueue(fixture(), write);
    await expect(queue.save(newBlogFields())).rejects.toThrow("Conflict");
    await expect(queue.save(newBlogFields())).rejects.toThrow("Saving paused");
    expect(write).toHaveBeenCalledOnce();
    expect(queue.post?.revision).toBe(1);
  });
  it("retries transient failures without advancing the stored revision", async () => {
    const write = vi
      .fn()
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce({ post: { ...fixture(), revision: 2 } });
    const queue = new BlogSaveQueue(fixture(), write);
    await expect(queue.save(newBlogFields())).rejects.toThrow("Offline");
    await queue.save(newBlogFields());
    expect(write.mock.calls.map((call) => call[1])).toEqual(["PUT", "PUT"]);
  });
  it("surfaces API errors without treating HTML failures as successful saves", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ error: "Not allowed" }), { status: 401 })),
    );
    await expect(blogRequest("/post")).rejects.toThrow("Not allowed");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<!doctype html>", { status: 502 })),
    );
    await expect(blogRequest("/post")).rejects.toThrow(
      "The server returned an invalid response, so please try again.",
    );
  });
  it("rejects unsupported and oversized uploads before contacting storage", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(
      uploadBlogMedia(new File(["x"], "evil.svg", { type: "image/svg+xml" }), vi.fn()),
    ).rejects.toThrow("Choose a JPEG");
    await expect(
      uploadBlogMedia(
        new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.png", { type: "image/png" }),
        vi.fn(),
      ),
    ).rejects.toThrow("Images allow");
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("Blog upload transport", () => {
  function transport(mode: string, kind = "image") {
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith("/media/sign")) {
        return new Response(
          JSON.stringify({
            upload: {
              cloudName: "test-cloud",
              kind,
              public_id: "seatping/blog/test",
              timestamp: 1,
              api_key: "fixture",
              signature: "fixture",
              overwrite: false,
            },
          }),
        );
      }
      if (mode === "verification") {
        return new Response(JSON.stringify({ error: "File too large" }), { status: 400 });
      }
      return new Response(
        JSON.stringify({ url: "https://res.cloudinary.com/test/image/upload/file.png" }),
      );
    });
    vi.stubGlobal("fetch", fetcher);
    vi.stubGlobal(
      "XMLHttpRequest",
      class {
        status = 200;
        timeout = 0;
        upload = {
          onprogress: null as
            ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null,
        };
        onload = () => {};
        onerror = () => {};
        ontimeout = () => {};
        onabort = () => {};
        open() {}
        send() {
          queueMicrotask(() => {
            this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 });
            if (mode === "network") {
              this.onerror();
            } else if (mode === "timeout") {
              this.ontimeout();
            } else if (mode === "abort") {
              this.onabort();
            } else {
              if (mode === "http") {
                this.status = 500;
              }
              this.onload();
            }
          });
        }
      },
    );
    return fetcher;
  }
  it("reports progress and commits verified media", async () => {
    const fetcher = transport("success");
    const progress = vi.fn();
    expect(
      await uploadBlogMedia(new File(["image"], "cover.png", { type: "image/png" }), progress),
    ).toContain("https://res.cloudinary.com/");
    expect(progress.mock.calls.map((call) => call[0])).toEqual([48, 100]);
    expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
      "/api/admin/blog/media/sign",
      "/api/admin/blog/media/commit",
    ]);
  });
  it.each(["network", "timeout", "abort", "http"])(
    "reports %s upload failures without committing",
    async (mode) => {
      const fetcher = transport(mode, "video");
      await expect(
        uploadBlogMedia(new File(["video"], "video.mp4", { type: "video/mp4" }), vi.fn()),
      ).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledOnce();
    },
  );
  it("reports server rejection after the direct upload", async () => {
    transport("verification");
    await expect(
      uploadBlogMedia(new File(["image"], "cover.png", { type: "image/png" }), vi.fn()),
    ).rejects.toThrow("File too large");
  });
  it("allows correcting a duplicate slug and retrying the save", async () => {
    const write = vi
      .fn()
      .mockRejectedValueOnce(new BlogApiError("Duplicate slug", 409, "SLUG_CONFLICT"))
      .mockResolvedValueOnce({ post: { ...fixture(), revision: 2 } });
    const queue = new BlogSaveQueue(fixture(), write);
    await expect(queue.save(newBlogFields())).rejects.toThrow("Duplicate slug");
    await expect(queue.save({ ...newBlogFields(), slug: "new-slug" })).resolves.toMatchObject({
      revision: 2,
    });
  });
  it("bounds content depth before recursive validation", () => {
    let node: BlogNode = { type: "paragraph" };
    for (let index = 0; index < 40; index += 1) {
      node = { type: "blockquote", content: [node] };
    }
    expect(blogContentSchema.safeParse({ type: "doc", content: [node] }).success).toBe(false);
  });
});
