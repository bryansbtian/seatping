import { expect, test, type Locator, type Page } from "@playwright/test";
import { newBlogFields, type BlogPost } from "../shared/blog";
import * as Y from "yjs";
import { fromBase64, toBase64 } from "lib0/buffer";
import {
  BLOG_PRESENCE_TTL,
  createBlogDocument,
  readBlogDocument,
  type BlogSyncRequest,
} from "../shared/blogCollaboration";
import { blogSlug } from "../shared/blog";

function workspaceState() {
  return {
    posts: [] as BlogPost[],
    failSave: false,
    failUpload: false,
    saves: 0,
    documents: new Map<string, Y.Doc>(),
    peers: new Map<string, Map<number, { awareness: string; lastSeenAt: number }>>(),
  };
}

async function workspace(page: Page, state = workspaceState()) {
  await page.route("**/auth/session", (route) =>
    route.fulfill({ json: { customer: null, business: null } }),
  );
  await page.route("**/auth/admin/session", (route) =>
    route.fulfill({ json: { authenticated: true } }),
  );
  await page.route("**/api/admin/blog-collaboration/**", async (route) => {
    const request = route.request();
    const parts = new URL(request.url()).pathname.split("/");
    const id = parts[4];
    const index = state.posts.findIndex((post) => post.id === id);
    const current = state.posts[index];
    if (request.method() === "DELETE") {
      state.peers.get(id)?.delete(Number(parts[5]));
      return route.fulfill({ json: { ok: true } });
    }
    if (!current) {
      return route.fulfill({ status: 404, json: { error: "Post not found" } });
    }
    let document = state.documents.get(id);
    if (!document) {
      document = createBlogDocument(current);
      state.documents.set(id, document);
    }
    let peers = state.peers.get(id);
    if (!peers) {
      peers = new Map();
      state.peers.set(id, peers);
    }
    let vector: Uint8Array | undefined;
    if (request.method() === "POST") {
      if (state.failSave) {
        return route.fulfill({ status: 503, json: { error: "Offline. Please retry." } });
      }
      const payload = request.postDataJSON() as BlogSyncRequest;
      vector = fromBase64(payload.vector);
      if (payload.update) {
        Y.applyUpdate(document, fromBase64(payload.update));
        const fields = readBlogDocument(document);
        let slug = current.slug;
        if (!current.publishedAt) {
          slug = blogSlug(fields.title) || current.slug;
        }
        document.getMap("metadata").set("slug", slug);
        state.posts[index] = {
          ...current,
          ...fields,
          slug,
          revision: current.revision + 1,
          updatedAt: new Date().toISOString(),
        };
        state.saves += 1;
      }
      peers.set(payload.clientId, { awareness: payload.awareness, lastSeenAt: Date.now() });
    }
    for (const [clientId, peer] of peers) {
      if (Date.now() - peer.lastSeenAt > BLOG_PRESENCE_TTL) {
        peers.delete(clientId);
      }
    }
    return route.fulfill({
      json: {
        update: toBase64(Y.encodeStateAsUpdate(document, vector)),
        post: state.posts[index],
        peers: [...peers].map(([clientId, peer]) => ({ clientId, awareness: peer.awareness })),
      },
    });
  });
  await page.route(/\/api\/admin\/blog(?:\/|\?|$)/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const suffix = url.pathname.replace("/api/admin/blog", "");
    const method = request.method();
    if (suffix === "/media/sign") {
      return route.fulfill({
        status: 503,
        json: { error: "Media uploads are unavailable. Please retry." },
      });
    }
    if (!suffix && method === "GET") {
      let posts = state.posts;
      const search = (url.searchParams.get("search") || "").toLowerCase();
      const status = url.searchParams.get("status");
      if (status && status !== "ALL") {
        posts = posts.filter((post) => post.status === status);
      }
      for (const key of ["category", "author"] as const) {
        const value = url.searchParams.get(key);
        if (value) {
          posts = posts.filter((post) => post[key] === value);
        }
      }
      const tag = url.searchParams.get("tag");
      if (tag) {
        posts = posts.filter((post) => post.tags.includes(tag));
      }
      posts = posts.filter((post) => `${post.title} ${post.author}`.toLowerCase().includes(search));
      return route.fulfill({
        json: {
          posts,
          filters: {
            categories: [...new Set(state.posts.map((post) => post.category).filter(Boolean))],
            authors: [...new Set(state.posts.map((post) => post.author).filter(Boolean))],
            tags: [...new Set(state.posts.flatMap((post) => post.tags))],
          },
          stats: {
            total: state.posts.length,
            drafts: state.posts.filter((post) => post.status === "DRAFT").length,
            published: state.posts.filter((post) => post.status === "PUBLISHED").length,
          },
        },
      });
    }
    if (!suffix && method === "POST") {
      const post: BlogPost = {
        ...newBlogFields(),
        id: `post-${state.posts.length + 1}`,
        slug: `untitled-${state.posts.length + 1}`,
        status: "DRAFT",
        revision: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        publishedAt: null,
      };
      state.posts.push(post);
      return route.fulfill({ status: 201, json: { post } });
    }
    const id = suffix.split("/")[1];
    const index = state.posts.findIndex((post) => post.id === id);
    const current = state.posts[index];
    if (!current) {
      return route.fulfill({ status: 404, json: { error: "Post not found" } });
    }
    if (method === "PUT") {
      if (state.failSave) {
        return route.fulfill({ status: 503, json: { error: "Offline. Please retry." } });
      }
      state.saves += 1;
      state.posts[index] = {
        ...current,
        ...request.postDataJSON(),
        revision: current.revision + 1,
        updatedAt: new Date().toISOString(),
      };
    } else if (suffix.endsWith("/status")) {
      state.posts[index] = {
        ...current,
        status: request.postDataJSON().status,
        revision: current.revision + 1,
        publishedAt: new Date().toISOString(),
      };
    } else if (suffix.endsWith("/duplicate")) {
      const post = {
        ...structuredClone(current),
        id: `post-${state.posts.length + 1}`,
        title: `${current.title} (Copy)`,
        status: "DRAFT" as const,
        revision: 1,
      };
      state.posts.push(post);
      return route.fulfill({ json: { post } });
    } else if (method === "DELETE") {
      state.posts.splice(index, 1);
      return route.fulfill({ json: { success: true } });
    }
    return route.fulfill({ json: { post: state.posts[index] } });
  });
  return state;
}

test("two editors share coffee identities, text, selections, and independent undo", async ({
  page,
  browser,
  baseURL,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const state = await workspace(page);
  const now = new Date().toISOString();
  state.posts.push({
    ...newBlogFields(),
    id: "shared-browser-article",
    title: "Shared Article",
    slug: "shared-article",
    status: "DRAFT",
    revision: 1,
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    content: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Hello world" }] }],
    },
  });
  const context = await browser.newContext({ baseURL });
  const second = await context.newPage();
  try {
    await workspace(second, state);
    await page.goto("/admin/blog/shared-browser-article/edit");
    const firstBody = page.getByRole("textbox", { name: "Article Body" });
    const secondBody = second.getByRole("textbox", { name: "Article Body" });
    await expect(firstBody).toHaveText("Hello world");
    await expect(page.getByRole("group", { name: "Editors In This Article" })).toHaveCount(0);
    await second.goto("/admin/blog/shared-browser-article/edit");
    await expect(secondBody).toHaveText("Hello world");
    const ownAvatar = page.getByRole("img", { name: /^Anonymous .*\(You\)$/ });
    await expect(ownAvatar.locator("svg")).toHaveCount(1);
    await expect(
      page.getByRole("group", { name: "Editors In This Article" }).getByRole("img"),
    ).toHaveCount(2);
    const firstName = await ownAvatar.getAttribute("data-editor-name");
    expect(firstName).toBeTruthy();
    await ownAvatar.hover();
    await expect(page.getByRole("tooltip")).toContainText(firstName!);
    await expect
      .poll(() =>
        page.getByRole("tooltip").evaluate((element) => {
          const tooltip = element.parentElement!.getBoundingClientRect();
          const icon = document.querySelector('[data-editor-name][aria-label$="(You)"]')!;
          const avatar = icon.getBoundingClientRect();
          return {
            centered: Math.abs(tooltip.x + tooltip.width / 2 - avatar.x - avatar.width / 2) < 2,
            above: tooltip.bottom <= avatar.top,
            close: avatar.top - tooltip.bottom <= 10,
          };
        }),
      )
      .toEqual({ centered: true, above: true, close: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await ownAvatar.hover();
    await expect
      .poll(() =>
        page.getByRole("tooltip").evaluate((element) => {
          const tooltip = element.parentElement!.getBoundingClientRect();
          const avatar = document
            .querySelector('[data-editor-name][aria-label$="(You)"]')!
            .getBoundingClientRect();
          return (
            tooltip.bottom <= avatar.top &&
            avatar.top - tooltip.bottom <= 10 &&
            tooltip.left >= 0 &&
            tooltip.right <= window.innerWidth &&
            tooltip.left <= avatar.x + avatar.width / 2 &&
            tooltip.right >= avatar.x + avatar.width / 2
          );
        }),
      )
      .toBe(true);
    await page.setViewportSize({ width: 1440, height: 900 });
    await ownAvatar.click();
    await expect(page.getByLabel("Your Editor Name", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Live", { exact: true })).toHaveCount(0);
    await expect(page.getByText(/^Saved /)).toHaveCount(0);
    await firstBody.click();
    await firstBody.press("Home");
    await firstBody.pressSequentially("First ");
    await expect.poll(() => editorText(secondBody)).toBe("First Hello world");
    await secondBody.click();
    await secondBody.press("End");
    await secondBody.pressSequentially(" Second");
    await expect.poll(() => editorText(firstBody)).toBe("First Hello world Second");
    await firstBody.click();
    await firstBody.press("ControlOrMeta+z");
    await expect.poll(() => editorText(secondBody)).toBe("Hello world Second");
    await firstBody.press("Home");
    await firstBody.press("Shift+ArrowRight");
    await firstBody.press("Shift+ArrowRight");
    await expect(
      second.locator(`.blog-collaboration-selection[data-collaborator="${firstName}"]`),
    ).toBeVisible();
    await expect(
      second.locator(".collaboration-carets__label", { hasText: firstName! }),
    ).toBeVisible();
    await second.getByRole("button", { name: "Back To Posts", exact: true }).click();
    await expect(second).toHaveURL(/\/admin\/blog$/);
    await expect(page.getByRole("group", { name: "Editors In This Article" })).toHaveCount(0);
    await page.reload();
    await expect.poll(() => editorText(firstBody)).toBe("Hello world Second");
    await expect(page.getByRole("group", { name: "Editors In This Article" })).toHaveCount(0, {
      timeout: BLOG_PRESENCE_TTL + 5_000,
    });
  } finally {
    await context.close();
  }
});

async function editorText(body: Locator) {
  return body.evaluate((element) => {
    const copy = element.cloneNode(true) as HTMLElement;
    for (const caret of copy.querySelectorAll(".collaboration-carets__caret")) {
      caret.remove();
    }
    return copy.textContent;
  });
}
async function newArticle(page: Page) {
  await page.goto("/admin/blog/new");
  await expect(page.getByRole("textbox", { name: "Article Title" })).toBeVisible();
  await page.getByRole("textbox", { name: "Article Title" }).fill("The Guest Experience");
  return page.getByRole("textbox", { name: "Article Body" });
}

async function insertBlock(body: Locator, name: string) {
  await body.locator("p").last().click();
  await body.press("End");
  await body.press("Enter");
  await body.pressSequentially(`/${name.toLowerCase()}`);
  await body.press("Enter");
}

for (const format of ["plain", "html"]) {
  test(`converts pasted ${format} Markdown comparison tables and preserves them after reload`, async ({
    page,
  }) => {
    const state = await workspace(page);
    const body = await newArticle(page);
    const lines = [
      "Here's how the two compare:",
      "| Feature | Paper Waitlist | QR Code Waitlist With SeatPing |",
      "|---|---|---|",
      "| Guest Check-in | Staff-assisted | Self-check-in |",
      "| Waiting Experience | Near the entrance | Wait anywhere |",
      "| Waitlist Management | Handwritten & paper-based | Digital dashboard |",
      "| Guest Notifications | Verbal announcement | Digital & on-the-go notifications |",
      "| Guest Information | Manual records | Digital guest profiles |",
      "Choose the approach that fits your restaurant.",
    ];
    await body.click();
    await body.evaluate(
      (element, { lines, format }) => {
        const clipboard = new DataTransfer();
        clipboard.setData("text/plain", lines.join("\n\n"));
        if (format === "html") {
          const container = document.createElement("div");
          for (const line of lines) {
            const paragraph = document.createElement("p");
            paragraph.textContent = line;
            container.append(paragraph);
          }
          clipboard.setData("text/html", container.innerHTML);
        }
        element.dispatchEvent(
          new ClipboardEvent("paste", {
            clipboardData: clipboard,
            bubbles: true,
            cancelable: true,
          }),
        );
      },
      { lines, format },
    );
    await expect(body.locator("table")).toHaveCount(1);
    await expect(body.locator("tr")).toHaveCount(6);
    await expect(body.locator("th")).toHaveText([
      "Feature",
      "Paper Waitlist",
      "QR Code Waitlist With SeatPing",
    ]);
    await expect(body.locator("td")).toHaveCount(15);
    await expect(body).toContainText("Here's how the two compare:");
    await expect(body).toContainText("Choose the approach that fits your restaurant.");
    await expect
      .poll(() => state.posts[0]?.content.content?.some((node) => node.type === "table"))
      .toBe(true);
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Article Body" }).locator("tr")).toHaveCount(6);
  });
}

test("converts existing pipe text into a saved table when reopening an article", async ({
  page,
}) => {
  const state = await workspace(page);
  const now = new Date().toISOString();
  state.posts.push({
    ...newBlogFields(),
    id: "existing-markdown-table",
    title: "Restaurant Guide",
    slug: "restaurant-guide",
    status: "DRAFT",
    revision: 1,
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    content: {
      type: "doc",
      content: [
        "Before.",
        "| Feature | SeatPing |",
        "|---|---|",
        "| Check-in | Self-check-in |",
        "After.",
      ].map((text) => ({ type: "paragraph", content: [{ type: "text", text }] })),
    },
  });
  await page.goto("/admin/blog/existing-markdown-table/edit");
  const body = page.getByRole("textbox", { name: "Article Body" });
  await expect(body.locator("table")).toHaveCount(1);
  await expect(body.locator("td")).toHaveText(["Check-in", "Self-check-in"]);
  await expect
    .poll(() => state.posts[0].content.content?.map((node) => node.type))
    .toEqual(["paragraph", "table", "paragraph"]);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Article Body" }).locator("table")).toHaveCount(1);
});

test("spaces image settings controls and uses the shared stacked alignment select", async ({
  page,
}, testInfo) => {
  const state = await workspace(page);
  const now = new Date().toISOString();
  state.posts.push({
    ...newBlogFields(),
    id: "image-settings",
    title: "Restaurant Guide",
    slug: "restaurant-guide",
    status: "DRAFT",
    revision: 1,
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    content: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Let guests join your queue." }] },
        {
          type: "image",
          attrs: {
            src: "https://images.example.test/queue.svg",
            alt: "Queue Form",
            width: 420,
            alignment: "center",
            caption: "",
          },
        },
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Manage Waiting Parties" }],
        },
      ],
    },
  });
  await page.route("https://images.example.test/queue.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="420" height="260"><rect width="420" height="260" fill="#f1f5f9"/></svg>',
    }),
  );
  await page.goto("/admin/blog/image-settings/edit");
  const image = page.getByRole("img", { name: "Queue Form" });
  await image.click();
  const settings = page.getByRole("button", { name: "Image Settings", exact: true });
  await expect(settings).toBeVisible();
  const imageBox = await image.locator("..").boundingBox();
  const toolbarBox = await settings.locator("..").boundingBox();
  expect(
    Math.max(
      imageBox!.y - toolbarBox!.y - toolbarBox!.height,
      toolbarBox!.y - imageBox!.y - imageBox!.height,
    ),
  ).toBeGreaterThanOrEqual(16);
  await settings.click();
  const dialog = page.getByRole("dialog", { name: "Image Settings" });
  for (const label of ["Alt Text", "Caption", "Alignment"]) {
    const control = dialog.getByLabel(label, { exact: true });
    const labelElement = dialog.locator(`label[for="${await control.getAttribute("id")}"]`);
    await expect
      .poll(async () => {
        const labelBox = await labelElement.boundingBox();
        const controlBox = await control.boundingBox();
        return Math.round((controlBox!.y - labelBox!.y - labelBox!.height) * 100) / 100;
      })
      .toBeGreaterThanOrEqual(8);
  }
  const alignment = dialog.getByRole("combobox", { name: "Alignment" });
  await alignment.click();
  await page.getByRole("option", { name: "Right", exact: true }).click();
  await expect(alignment).toHaveText("Right");
  const apply = dialog.getByRole("button", { name: "Apply", exact: true });
  const cancel = dialog.getByRole("button", { name: "Cancel", exact: true });
  const applyBox = await apply.boundingBox();
  const cancelBox = await cancel.boundingBox();
  if (testInfo.project.name === "webkit-mobile") {
    expect(cancelBox!.y - applyBox!.y - applyBox!.height).toBeGreaterThanOrEqual(8);
    expect(applyBox!.height).toBe(32);
    expect(cancelBox!.height).toBe(32);
  }
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await dialog.screenshot({ path: testInfo.outputPath("image-settings.png") });
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(image.locator("..")).toHaveAttribute("data-alignment", "right");
  await expect
    .poll(
      () =>
        state.posts[0]?.content.content?.find((node) => node.type === "image")?.attrs?.alignment,
    )
    .toBe("right");
});

test("mobile recovery actions share one row below the recovery message", async ({ page }) => {
  const state = await workspace(page);
  const timestamp = new Date().toISOString();
  state.posts.push({
    ...newBlogFields(),
    id: "mobile-recovery",
    title: "Saved Article",
    slug: "saved-article",
    status: "DRAFT",
    revision: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    publishedAt: null,
  });
  await page.addInitScript(
    (fields) => {
      sessionStorage.setItem("seatping.blog.recovery.mobile-recovery", JSON.stringify(fields));
    },
    { ...newBlogFields(), title: "Recovered Article" },
  );
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/admin/blog/mobile-recovery/edit");
    const alert = page.getByRole("alert");
    const message = alert.locator("p");
    await expect(message).toHaveText(
      "Restore unsaved edits from this tab or keep the server version.",
    );
    const restore = alert.getByRole("button", { name: "Restore Edits", exact: true });
    const keep = alert.getByRole("button", { name: "Use Server Version", exact: true });
    const messageBounds = await message.boundingBox();
    const restoreBounds = await restore.boundingBox();
    const keepBounds = await keep.boundingBox();
    expect(messageBounds).not.toBeNull();
    expect(restoreBounds).not.toBeNull();
    expect(keepBounds).not.toBeNull();
    expect(restoreBounds!.y).toBeGreaterThanOrEqual(messageBounds!.y + messageBounds!.height);
    expect(restoreBounds!.y).toBe(keepBounds!.y);
    expect(keepBounds!.x).toBeGreaterThanOrEqual(restoreBounds!.x + restoreBounds!.width);
    expect(keepBounds!.x + keepBounds!.width).toBeLessThanOrEqual(width);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(0);
  }
  await page.getByRole("button", { name: "Restore Edits", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Article Title" })).toHaveValue(
    "Recovered Article",
  );
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("switching between editing and preview preserves the article layout", async ({ page }) => {
  const state = await workspace(page);
  const timestamp = new Date().toISOString();
  const coverUrl = "https://images.example.test/preview-cover.png";
  await page.route(coverUrl, (route) =>
    route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN2kAAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
  state.posts.push({
    ...newBlogFields(),
    id: "stable-preview",
    title: "QR Code Waitlist for Restaurants: How It Works and How to Set It Up",
    excerpt:
      "Learn how to set up a QR code waitlist for your restaurant, reduce crowded waiting areas, and let guests join the queue from their phones without downloading an app.",
    author: "SeatPing Team",
    category: "Restaurant Operations",
    coverUrl,
    coverAlt: "Dining Room",
    content: {
      type: "doc",
      content: Array.from({ length: 30 }, () => ({
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "A longer article about helping restaurant guests wait comfortably.",
          },
        ],
      })),
    },
    tags: ["queues"],
    slug: "stable-preview",
    status: "DRAFT",
    revision: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    publishedAt: null,
  });
  await page.goto("/admin/blog/stable-preview/edit");
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    let sidebarPadding = "0px";
    if (width >= 1024) {
      sidebarPadding = "256px";
    }
    await expect(page.getByRole("main").locator("..")).toHaveCSS("padding-left", sidebarPadding);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
    });
    const title = page.getByRole("textbox", { name: "Article Title" });
    await expect(title).toBeVisible();
    await expect
      .poll(() => title.evaluate((element) => element.scrollHeight <= element.clientHeight + 1))
      .toBe(true);
    await page.getByRole("main").evaluate((element) => {
      element.scrollTop = 0;
    });
    const geometry = () =>
      page.locator("article").evaluate((article) => {
        const elements = [
          article,
          article.querySelector("header"),
          article.querySelector("img"),
          article.querySelector(".blog-content"),
        ];
        return elements.map((element) => {
          const bounds = element!.getBoundingClientRect();
          return { x: bounds.x, y: bounds.y, width: bounds.width };
        });
      });
    const editing = await geometry();
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(page.getByRole("heading", { name: state.posts[0].title })).toBeVisible();
    await expect.poll(geometry).toEqual(editing);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(title).toBeVisible();
    await expect.poll(geometry).toEqual(editing);
  }
});

for (const paragraphs of [1, 40]) {
  test(`editor has one content-sized scroll area with ${paragraphs} paragraphs`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    const state = await workspace(page);
    const timestamp = new Date().toISOString();
    const coverUrl = "https://images.example.test/scroll-cover.png";
    await page.route(coverUrl, (route) =>
      route.fulfill({
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN2kAAAAASUVORK5CYII=",
          "base64",
        ),
      }),
    );
    state.posts.push({
      ...newBlogFields(),
      id: "scroll-layout",
      coverUrl,
      coverAlt: "Dining Room",
      title: "Restaurant Guests",
      slug: "restaurant-guests",
      tags: ["Guest Experience"],
      content: {
        type: "doc",
        content: Array.from({ length: paragraphs }, (_, index) => ({
          type: "paragraph",
          content: [{ type: "text", text: `Guest experience paragraph ${index + 1}.` }],
        })),
      },
      status: "DRAFT",
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      publishedAt: null,
    });
    for (const width of [320, 390, 768, 1440]) {
      let height = 1000;
      if (paragraphs === 1) {
        height = 1600;
      }
      await page.setViewportSize({ width, height });
      await page.goto("/admin/blog/scroll-layout/edit");
      const body = page.getByRole("textbox", { name: "Article Body" });
      await expect(body).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator("article img")).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollHeight - innerHeight))
        .toBeLessThanOrEqual(1);
      if (paragraphs === 1) {
        expect((await body.boundingBox())!.height).toBeLessThan(150);
      }
      const main = page.getByRole("main");
      const sidebar = page.locator("aside");
      const sidebarBefore = await sidebar.boundingBox();
      for (const preview of [false, true]) {
        if (preview) {
          await page.getByRole("button", { name: "Preview", exact: true }).click();
        }
        const scrollOwners = await page.evaluate(() =>
          Array.from(document.querySelectorAll("body *"))
            .filter(
              (element) =>
                ["auto", "scroll"].includes(getComputedStyle(element).overflowY) &&
                element.scrollHeight > element.clientHeight + 1,
            )
            .map((element) => element.tagName),
        );
        if (paragraphs === 1) {
          expect(scrollOwners).toEqual([]);
        } else {
          expect(scrollOwners).toEqual(["MAIN"]);
        }
        await main.evaluate((element) => {
          element.scrollTop = element.scrollHeight;
        });
        await expect(page.getByRole("group", { name: "Article Tags" })).toBeInViewport();
        if (paragraphs > 1) {
          const bottomGap = await page
            .locator("article")
            .evaluate(
              (element) =>
                element.closest("main")!.getBoundingClientRect().bottom -
                element.getBoundingClientRect().bottom,
            );
          expect(Math.abs(bottomGap - 32)).toBeLessThanOrEqual(1);
        }
        if (width >= 1024) {
          await expect(sidebar).toHaveCSS("position", "fixed");
          expect(await sidebar.boundingBox()).toEqual(sidebarBefore);
        } else {
          await expect(
            page.getByRole("button", { name: "Open Menu", exact: true }),
          ).toBeInViewport();
        }
        expect(
          await page.evaluate(() => document.documentElement.scrollHeight - innerHeight),
        ).toBeLessThanOrEqual(1);
      }
      await page.screenshot({
        path: testInfo.outputPath(`editor-bottom-${width}.png`),
        animations: "disabled",
      });
    }
  });
}

test("scrolling stops at the article canvas bottom", async ({ page }, testInfo) => {
  const state = await workspace(page);
  const timestamp = new Date().toISOString();
  state.posts.push({
    ...newBlogFields(),
    id: "long-article",
    title: "Managing Restaurant Guests",
    slug: "managing-restaurant-guests",
    tags: ["Guest Experience"],
    content: {
      type: "doc",
      content: Array.from({ length: 40 }, (_, index) => ({
        type: "paragraph",
        content: [{ type: "text", text: `Restaurant guest experience paragraph ${index + 1}.` }],
      })),
    },
    status: "DRAFT",
    revision: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    publishedAt: null,
  });
  await page.goto("/admin/blog/long-article/edit");
  await expect(page.getByRole("textbox", { name: "Article Body" })).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const preview of [false, true]) {
      if (preview) {
        await page.getByRole("button", { name: "Preview", exact: true }).click();
      }
      const main = page.getByRole("main");
      await expect(main).toHaveCSS("overflow-y", "auto");
      await main.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await expect(page.getByRole("group", { name: "Article Tags" })).toBeInViewport();
      if (testInfo.project.name !== "webkit-mobile") {
        await page.mouse.move(width / 2, 850);
        await page.mouse.wheel(0, 1000);
      }
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
      const bottomGap = await page.locator("article").evaluate((element) => {
        const main = element.closest("main")!;
        return main.getBoundingClientRect().bottom - element.getBoundingClientRect().bottom;
      });
      expect(bottomGap).toBeGreaterThanOrEqual(0);
      expect(bottomGap).toBeLessThanOrEqual(33);
      expect(
        await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight),
      ).toBeLessThanOrEqual(1);
      if (preview) {
        await page.getByRole("button", { name: "Edit", exact: true }).click();
      }
    }
  }
});

test("authors, saves, previews, reloads formatting, publishes, filters, duplicates, and deletes", async ({
  page,
}) => {
  const state = await workspace(page);
  await page.goto("/admin/blog");
  await expect(page.getByRole("heading", { name: "No Blogs Yet" })).toBeVisible();
  await page.getByRole("link", { name: "Create Your First Post" }).click();
  const title = page.getByRole("textbox", { name: "Article Title" });
  await title.fill("The Guest Experience");
  const body = page.getByRole("textbox", { name: "Article Body" });
  await body.click();
  await body.pressSequentially("## Welcome");
  await expect(body.locator("h2")).toHaveText("Welcome");
  await body.press("Enter");
  await body.pressSequentially("**Better service** ");
  await expect(body.locator("strong")).toHaveText("Better service");
  await body.press("Enter");
  await body.pressSequentially("/table");
  await expect(page.getByRole("listbox", { name: "Insert Content Block" })).toBeVisible();
  await body.press("Enter");
  await expect(body.locator("table")).toBeVisible();
  await page.getByLabel("Excerpt", { exact: true }).fill("Make every guest feel welcome.");
  await expect(page.getByRole("complementary", { name: "Article Settings" })).toHaveCount(0);
  await page.getByRole("textbox", { name: "Author", exact: true }).fill("Jamie Chen");
  await page.getByRole("button", { name: "Edit Category" }).click();
  await page.getByLabel("Category", { exact: true }).fill("Operations");
  await page.getByRole("button", { name: "Use Green Category Color" }).click();
  await page.getByLabel("Category", { exact: true }).press("Escape");
  const tags = page.getByRole("textbox", { name: "Add Tag", exact: true });
  await tags.fill("queues");
  await tags.press("Enter");
  await tags.fill("reservations");
  await tags.press("Enter");
  const longTag = "t".repeat(50);
  await tags.fill(longTag);
  await tags.press("Enter");
  await page.getByRole("button", { name: `Remove Tag ${longTag}`, exact: true }).click();
  await expect(
    page.getByRole("group", { name: "Article Tags" }).getByText(longTag, { exact: true }),
  ).toHaveCount(0);
  await expect.poll(() => state.posts[0]?.category).toBe("Operations");
  await expect.poll(() => state.posts[0]?.tags).toEqual(["queues", "reservations"]);
  expect(state.posts[0]?.categoryColor).toBe("success");
  expect(state.posts[0]?.author).toBe("Jamie Chen");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Object.keys(sessionStorage).filter((key) =>
            key.startsWith("seatping.blog.shared-recovery."),
          ).length,
      ),
    )
    .toBe(0);
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByRole("heading", { name: "The Guest Experience" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Welcome" })).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.reload();
  await expect(body.locator("h2")).toHaveText("Welcome");
  await expect(body.locator("strong")).toHaveText("Better service");
  await expect(body.locator("table")).toBeVisible();
  expect(state.posts[0]?.slug).toBe("the-guest-experience");
  await expect(page.getByRole("textbox", { name: "Author", exact: true })).toHaveValue(
    "Jamie Chen",
  );
  await expect(page.getByRole("button", { name: "Edit Category" })).toContainText("Operations");
  await page.getByRole("button", { name: "Edit Category" }).click();
  await expect(page.getByRole("button", { name: "Use Green Category Color" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByLabel("Category", { exact: true }).press("Escape");
  await expect(page.getByRole("group", { name: "Article Tags" })).toContainText("queues");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Publish", exact: true }).click();
  await expect.poll(() => state.posts[0]?.status).toBe("PUBLISHED");
  await page.getByRole("button", { name: "Back To Posts" }).click();
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await page.getByRole("button", { name: "Draft", exact: true }).click();
  await page.getByRole("button", { name: "Show Posts", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No Matching Posts" })).toBeVisible();
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await page.getByRole("button", { name: "Published", exact: true }).click();
  await page.getByRole("button", { name: "Show Posts", exact: true }).click();
  await expect(page.getByRole("link", { name: /The Guest Experience/ })).toBeVisible();
  await page.getByRole("textbox", { name: "Search Blog Posts" }).fill("missing");
  await expect(page.getByRole("heading", { name: "No Matching Posts" })).toBeVisible();
  await page.getByRole("textbox", { name: "Search Blog Posts" }).fill("");
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await page.getByRole("combobox", { name: "Category", exact: true }).click();
  await page.getByRole("option", { name: "Operations", exact: true }).click();
  await page.getByRole("combobox", { name: "Tag", exact: true }).click();
  await page.getByRole("option", { name: "queues", exact: true }).click();
  await page.getByRole("button", { name: "Show Posts", exact: true }).click();
  await expect(page.getByLabel("3 Active Filters")).toBeAttached();
  await expect(page.getByRole("link", { name: /The Guest Experience/ })).toBeVisible();
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await page.getByRole("button", { name: "Clear Filters", exact: true }).click();
  await expect(page.getByRole("button", { name: "All", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Show Posts", exact: true }).click();
  await expect(page.getByLabel(/Active Filters/)).toHaveCount(0);
  await page.getByRole("button", { name: "Actions For The Guest Experience", exact: true }).click();
  await page.getByRole("menuitem", { name: "Duplicate", exact: true }).click();
  await expect(title).toHaveValue("The Guest Experience (Copy)");
  await page.getByRole("button", { name: "Back To Posts" }).click();
  await page
    .getByRole("button", { name: "Actions For The Guest Experience (Copy)", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect.poll(() => state.posts.length).toBe(1);
});

test("uploads a cover on the canvas and generates its alt text from the filename", async ({
  page,
}, testInfo) => {
  const state = await workspace(page);
  const image = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN2kAAAAASUVORK5CYII=",
    "base64",
  );
  const coverUrl = "https://res.cloudinary.com/test/image/upload/cover.png";
  await page.route("**/api/admin/blog/media/sign", (route) =>
    route.fulfill({ json: { upload: { cloudName: "test", kind: "image", public_id: "cover" } } }),
  );
  await page.route("https://api.cloudinary.com/v1_1/test/image/upload", (route) =>
    route.fulfill({ json: {}, headers: { "Access-Control-Allow-Origin": "*" } }),
  );
  await page.route("**/api/admin/blog/media/commit", (route) =>
    route.fulfill({ json: { url: coverUrl } }),
  );
  await page.route(coverUrl, (route) => route.fulfill({ body: image, contentType: "image/png" }));
  await newArticle(page);
  await expect(page.getByRole("textbox", { name: "Excerpt", exact: true })).toHaveAttribute(
    "placeholder",
    "Add a short introduction to your article...",
  );
  const back = page.getByRole("button", { name: "Back To Posts" });
  await expect(back.locator("svg")).toHaveCount(1);
  await page
    .getByLabel("Upload Cover Image", { exact: true })
    .setInputFiles({ name: "Friday Dinner Menu.png", mimeType: "image/png", buffer: image });
  await expect.poll(() => state.posts[0]?.coverAlt).toBe("friday-dinner-menu");
  await expect(page.getByRole("img", { name: "friday-dinner-menu", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("img", { name: "friday-dinner-menu", exact: true })).toBeVisible();
  const canvas = page.locator("article");
  await canvas.screenshot({ path: testInfo.outputPath("canvas-editor.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await expect(page.getByRole("button", { name: "Change Cover", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Remove Cover", exact: true })).toHaveCount(0);
  await page.getByRole("textbox", { name: "Cover Image", exact: true }).click();
  await page.keyboard.press("Backspace");
  await expect(page.getByRole("button", { name: "Add Cover Image", exact: true })).toBeVisible();
  await expect.poll(() => state.posts[0]?.coverUrl).toBe("");
  expect(state.posts[0]?.coverAlt).toBe("");
});

test("canvas header spacing, mobile actions, and author metadata fit each viewport", async ({
  page,
}, testInfo) => {
  await workspace(page);
  await newArticle(page);
  const title = page.getByRole("textbox", { name: "Article Title" });
  const excerpt = page.getByRole("textbox", { name: "Excerpt", exact: true });
  await title.fill("7 Best Glean Alternatives for Teams in 2026");
  await excerpt.fill(
    "Glean connects company knowledge so employees can find answers and run agents. These seven alternatives range from cited search to agents that finish the work in the same place the team discusses it.",
  );
  const author = page.getByRole("textbox", { name: "Author", exact: true });
  await author.fill("SeatPing Team");
  await author.blur();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Object.keys(sessionStorage).filter((key) =>
            key.startsWith("seatping.blog.shared-recovery."),
          ).length,
      ),
    )
    .toBe(0);
  await expect(page.getByRole("toolbar", { name: "Article Formatting", exact: true })).toHaveCount(
    0,
  );
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect
      .poll(() => title.evaluate((element) => element.scrollHeight <= element.clientHeight + 1))
      .toBe(true);
    await expect
      .poll(() => excerpt.evaluate((element) => element.scrollHeight <= element.clientHeight + 1))
      .toBe(true);
    await expect
      .poll(() =>
        author.evaluate((element, mobile) => {
          const author = element.getBoundingClientRect();
          const metadata = element.parentElement!.parentElement!;
          const date = metadata.querySelector("time")!.getBoundingClientRect();
          if (mobile) {
            return date.y >= author.y + author.height;
          }
          const dot = metadata.querySelector(":scope > span")!.getBoundingClientRect();
          return (
            Math.abs(date.y + date.height / 2 - author.y - author.height / 2) <= 1 &&
            dot.x > author.right &&
            Math.abs(dot.x - author.right - (date.x - dot.right)) <= 1
          );
        }, width < 640),
      )
      .toBe(true);
    const category = page.getByRole("button", { name: "Edit Category" });
    const categoryText = category.locator("span");
    await expect
      .poll(() =>
        categoryText.evaluate((element) => {
          const text = element.getBoundingClientRect();
          const pill = element.parentElement!.getBoundingClientRect();
          return text.y >= pill.y && text.bottom <= pill.bottom;
        }),
      )
      .toBe(true);
    if (width < 640) {
      await expect
        .poll(() =>
          page.getByRole("textbox", { name: "Add Tag", exact: true }).evaluate((element) => {
            const input = element.getBoundingClientRect();
            const button = element.parentElement!.querySelector("button")!.getBoundingClientRect();
            return Math.abs(input.height - button.height) <= 1 && Math.abs(input.y - button.y) <= 1;
          }),
        )
        .toBe(true);
      const back = page.getByRole("button", { name: "Back To Posts", exact: true });
      await expect
        .poll(() =>
          back.evaluate((element) => {
            const root = element.parentElement!;
            const back = element.getBoundingClientRect();
            const pill = root.children[1].lastElementChild!.getBoundingClientRect();
            const actions = Array.from(root.lastElementChild!.children).map((button) =>
              button.getBoundingClientRect(),
            );
            return {
              statusNextRow: pill.y >= back.bottom,
              statusEdgesAligned: Math.abs(pill.right - actions.at(-1)!.right) <= 1,
              equalActions: actions.every(
                (action) => Math.abs(action.width - actions[0].width) <= 1,
              ),
              sameActionRow: actions.every((action) => Math.abs(action.y - actions[0].y) <= 1),
              actionsNextRow: actions.every((action) => action.y > pill.bottom),
            };
          }),
        )
        .toEqual({
          statusNextRow: true,
          statusEdgesAligned: true,
          equalActions: true,
          sameActionRow: true,
          actionsNextRow: true,
        });
      await expect
        .poll(() =>
          author.evaluate((element) => {
            const input = element as HTMLInputElement;
            const style = getComputedStyle(input);
            const context = document.createElement("canvas").getContext("2d")!;
            context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
            const available =
              input.clientWidth -
              Number.parseFloat(style.paddingLeft) -
              Number.parseFloat(style.paddingRight);
            return context.measureText(input.value).width <= available;
          }),
        )
        .toBe(true);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`canvas-header-${width}.png`) });
  }
});

test("article editor skeleton fills the remaining page while a post loads", async ({ page }) => {
  await workspace(page);
  await newArticle(page);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Object.keys(sessionStorage).filter((key) =>
            key.startsWith("seatping.blog.shared-recovery."),
          ).length,
      ),
    )
    .toBe(0);
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/api\/admin\/blog\/post-1$/, async (route) => {
    await pending;
    await route.fallback();
  });
  try {
    await page.reload();
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      const loading = page.getByRole("status", { name: "Loading Blog Editor", exact: true });
      await expect(loading).toBeVisible();
      await expect
        .poll(() =>
          loading.evaluate((element) => {
            const bounds = element.getBoundingClientRect();
            const list = element.querySelector('[aria-label="Loading Article Content"]')!;
            const inner = list.firstElementChild!;
            const innerBounds = inner.getBoundingClientRect();
            const last = inner.lastElementChild!.getBoundingClientRect();
            return (
              Math.abs(window.innerHeight - bounds.bottom - 32) <= 1 &&
              Math.abs(last.bottom - innerBounds.bottom) <= 1 &&
              Array.from(inner.children).every((row) => {
                const box = row.getBoundingClientRect();
                return box.top >= innerBounds.top && box.bottom <= innerBounds.bottom + 1;
              })
            );
          }),
        )
        .toBe(true);
    }
  } finally {
    release();
  }
  await expect(page.getByRole("textbox", { name: "Article Title" })).toHaveValue(
    "The Guest Experience",
  );
});

for (const item of [
  { typed: "# ", selector: "h1" },
  { typed: "## ", selector: "h2" },
  { typed: "### ", selector: "h3" },
  { typed: "- ", selector: "ul:not([data-type])" },
  { typed: "1. ", selector: "ol" },
  { typed: "> ", selector: "blockquote" },
  { typed: "[ ] ", selector: 'ul[data-type="taskList"]' },
  { typed: "---", selector: "hr" },
  { typed: "```", selector: "pre" },
  { typed: "**bold** ", selector: "strong" },
  { typed: "*italic* ", selector: "em" },
  { typed: "~~strike~~ ", selector: "s" },
]) {
  test(`converts Markdown shortcut ${item.typed.trim()}`, async ({ page }) => {
    await workspace(page);
    const body = await newArticle(page);
    await body.click();
    await body.pressSequentially(item.typed);
    await expect(body.locator(item.selector)).toHaveCount(1);
  });
}

test("supports slash keyboard navigation", async ({ page }) => {
  await workspace(page);
  const body = await newArticle(page);
  await body.click();
  await body.pressSequentially("/heading");
  await body.press("ArrowDown");
  await body.press("Enter");
  await expect(body.locator("h2")).toHaveCount(1);
});

test("keeps edits after save errors and shows styled upload progress before failures", async ({
  page,
}, testInfo) => {
  const state = await workspace(page);
  state.failSave = true;
  const body = await newArticle(page);
  await body.fill("Keep this article even when offline.");
  await expect(page.getByRole("alert")).toContainText("Offline. Please retry.");
  await page.getByRole("button", { name: "Retry Save" }).focus();
  state.failSave = false;
  await page.keyboard.press("Enter");
  await expect.poll(() => state.posts[0]?.title).toBe("The Guest Experience");
  await page.route("**/api/admin/blog/media/sign", (route) =>
    route.fulfill({ json: { upload: { cloudName: "test", kind: "image", public_id: "cover" } } }),
  );
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("https://api.cloudinary.com/v1_1/test/image/upload", async (route) => {
    await held;
    return route.fulfill({ status: 503, json: { error: "Unavailable" } });
  });
  await page.evaluate(() => {
    const send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (body) {
      send.call(this, body);
      this.upload.dispatchEvent(
        new ProgressEvent("progress", { lengthComputable: true, loaded: 100, total: 100 }),
      );
    };
  });
  await page
    .getByLabel("Upload Cover Image", { exact: true })
    .setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: Buffer.from("image") });
  const progress = page.getByRole("progressbar", { name: "Uploading Cover" });
  await expect(progress).toHaveAttribute("aria-valuenow", "95");
  await expect(progress).toHaveCSS("height", "6px");
  await expect(progress.locator("div")).toHaveCSS("background-color", "rgb(15, 23, 41)");
  await progress.locator("..").screenshot({ path: testInfo.outputPath("upload-progress.png") });
  release();
  await expect(page.getByRole("alert")).toContainText(
    "Upload failed. Check the file and try again.",
  );
  await expect(progress).toHaveCount(0);
  await expect(body).toHaveText("Keep this article even when offline.");
});

test("matches customer toolbar spacing, keeps New Post navy, and matches ticket overview sizing", async ({
  page,
}, testInfo) => {
  await workspace(page);
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/api\/admin\/blog\?/, async (route) => {
    await held;
    return route.fulfill({
      json: {
        posts: [],
        stats: { total: 0, drafts: 0, published: 0 },
        filters: { categories: [], authors: [], tags: [] },
      },
    });
  });
  await page.route("**/tickets/stats", (route) =>
    route.fulfill({ json: { stats: { total: 0, open: 0, inProgress: 0, closed: 0 } } }),
  );
  await page.route(/\/tickets\?/, (route) => route.fulfill({ json: { tickets: [] } }));
  await page.goto("/admin/blog");
  const skeleton = page.getByRole("status", { name: "Loading Blog Posts" });
  await expect(skeleton).toBeVisible();
  const searchInput = page.getByRole("textbox", { name: "Search Blog Posts" });
  const search = await searchInput.boundingBox();
  const toolbar = await searchInput.locator("../..").boundingBox();
  const card = await page.getByTestId("admin-content-card").boundingBox();
  const row = await skeleton.locator('[aria-hidden="true"] > div').first().boundingBox();
  const newPost = page.getByRole("link", { name: "New Post", exact: true });
  const plus = await newPost.boundingBox();
  const filter = await page.getByRole("button", { name: "Filter", exact: true }).boundingBox();
  const sort = await page.getByRole("button", { name: /^Sort By:/ }).boundingBox();
  expect(search).not.toBeNull();
  expect(toolbar).not.toBeNull();
  expect(card).not.toBeNull();
  expect(row).not.toBeNull();
  expect(plus).not.toBeNull();
  expect(filter).not.toBeNull();
  expect(sort).not.toBeNull();
  await expect(newPost).toHaveCSS("background-color", "rgb(15, 23, 42)");
  expect(Math.abs(filter!.y + filter!.height / 2 - plus!.y - plus!.height / 2)).toBeLessThanOrEqual(
    1,
  );
  expect(Math.abs(filter!.y - sort!.y)).toBeLessThanOrEqual(1);
  expect(filter!.x).toBeLessThan(sort!.x);
  expect(sort!.x).toBeLessThan(plus!.x);
  if (testInfo.project.name === "webkit-mobile") {
    expect(search!.y).toBeGreaterThanOrEqual(filter!.y + filter!.height + 8);
    expect(Math.abs(search!.x - filter!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(row!.y - toolbar!.y - toolbar!.height - 16)).toBeLessThanOrEqual(1);
    expect(Math.abs(filter!.x - card!.x - 13)).toBeLessThanOrEqual(1);
    expect(plus!.height).toBe(32);
  } else {
    expect(
      Math.abs(search!.y + search!.height / 2 - filter!.y - filter!.height / 2),
    ).toBeLessThanOrEqual(1);
    expect(search!.x).toBeGreaterThan(sort!.x + sort!.width);
    expect(search!.x + search!.width).toBeLessThan(plus!.x);
    expect(Math.abs(row!.y - toolbar!.y - toolbar!.height - 24)).toBeLessThanOrEqual(1);
    expect(Math.abs(filter!.x - card!.x - 17)).toBeLessThanOrEqual(1);
    expect(plus!.height).toBe(28);
  }
  expect(
    Math.abs(plus!.x + plus!.width - toolbar!.x - toolbar!.width + filter!.x - card!.x - 1),
  ).toBeLessThanOrEqual(1);
  release();
  await expect(page.getByRole("heading", { name: "No Blogs Yet" })).toBeVisible();
  const overview = await page.getByRole("region", { name: "Blog Overview" }).boundingBox();
  await page.screenshot({ path: testInfo.outputPath("blog-management.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.goto("/admin/dashboard");
  const tickets = page.getByRole("region", { name: "Ticket Overview" });
  await expect(tickets).toBeVisible();
  const ticketBox = await tickets.boundingBox();
  expect(Math.abs(ticketBox!.height - overview!.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(ticketBox!.width - overview!.width)).toBeLessThanOrEqual(1);
});

test("preserves safe pasted formatting, image metadata, callouts, and video embeds after reload", async ({
  page,
}) => {
  const state = await workspace(page);
  const body = await newArticle(page);
  await body.click();
  await body.evaluate((element) => {
    const clipboard = new DataTransfer();
    clipboard.setData(
      "text/html",
      '<h2>Guest Guide</h2><p><strong>Bold</strong> <em>Italic</em> <u>Underline</u> <a href="https://example.com/guide">Read More</a><a href="javascript:alert(1)">Unsafe Link</a></p>',
    );
    clipboard.setData("text/plain", "Guest Guide Bold Italic Underline Read More Unsafe Link");
    element.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: clipboard, bubbles: true, cancelable: true }),
    );
  });
  await expect(body.locator("h2")).toHaveText("Guest Guide");
  await expect(body.locator("strong")).toHaveText("Bold");
  await expect(body.locator("em")).toHaveText("Italic");
  await expect(body.locator("u")).toHaveText("Underline");
  await expect(body.locator('a[href^="javascript:"]')).toHaveCount(0);
  await expect(body.locator("a")).toHaveAttribute("href", "https://example.com/guide");
  await insertBlock(body, "Image");
  await page
    .getByRole("dialog")
    .getByLabel("URL", { exact: true })
    .fill("https://example.com/image.jpg");
  await page.getByRole("dialog").getByLabel("Alt Text", { exact: true }).fill("Evening Service");
  await page
    .getByRole("dialog")
    .getByLabel("Caption", { exact: true })
    .fill("A welcoming restaurant.");
  await page.getByRole("dialog").getByRole("button", { name: "Apply" }).click();
  await expect(body.locator("img")).toHaveAttribute("alt", "Evening Service");
  await expect(body.locator("figcaption")).toHaveText("A welcoming restaurant.");
  await insertBlock(body, "Video");
  await page
    .getByRole("dialog")
    .getByLabel("URL", { exact: true })
    .fill("https://youtu.be/dQw4w9WgXcQ");
  await page.getByRole("dialog").getByRole("button", { name: "Apply" }).click();
  await expect(body.locator("iframe")).toHaveAttribute(
    "src",
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
  );
  await insertBlock(body, "Callout");
  await expect(body.locator("aside[data-callout]")).toBeVisible();
  await expect
    .poll(() => JSON.stringify(state.posts[0]?.content))
    .toContain('"caption":"A welcoming restaurant."');
  await expect.poll(() => JSON.stringify(state.posts[0]?.content)).toContain('"type":"callout"');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Object.keys(sessionStorage).filter((key) =>
            key.startsWith("seatping.blog.shared-recovery."),
          ).length,
      ),
    )
    .toBe(0);
  await page.reload();
  await expect(body.locator("strong")).toHaveText("Bold");
  await expect(body.locator("u")).toHaveText("Underline");
  await expect(body.locator("figcaption")).toHaveText("A welcoming restaurant.");
  await expect(body.locator("iframe")).toHaveAttribute(
    "src",
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
  );
  await expect(body.locator("aside[data-callout]")).toBeVisible();
});
