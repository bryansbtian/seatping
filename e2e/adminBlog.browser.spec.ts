import { expect, test, type Locator, type Page } from "@playwright/test";
import { newBlogFields, type BlogPost } from "../shared/blog";

async function workspace(page: Page) {
  const state = { posts: [] as BlogPost[], failSave: false, failUpload: false, saves: 0 };
  await page.route("**/auth/session", (route) =>
    route.fulfill({ json: { customer: null, business: null } }),
  );
  await page.route("**/auth/admin/session", (route) =>
    route.fulfill({ json: { authenticated: true } }),
  );
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
  expect(state.posts[0]?.tags).toEqual(["queues", "reservations"]);
  expect(state.posts[0]?.categoryColor).toBe("success");
  expect(state.posts[0]?.author).toBe("Jamie Chen");
  await expect(page.getByRole("status").filter({ hasText: /^Saved / })).toBeVisible();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByRole("heading", { name: "The Guest Experience" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Welcome" })).toBeVisible();
  await page.getByRole("button", { name: "Continue Editing" }).click();
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
  await expect(page.getByRole("status").filter({ hasText: /^Saved / })).toBeVisible();
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
            const arrow = element.querySelector("svg")!.getBoundingClientRect();
            const saved = root.querySelector('[role="status"]')!.getBoundingClientRect();
            const pill = root
              .querySelector('[role="status"]')!
              .parentElement!.lastElementChild!.getBoundingClientRect();
            const actions = Array.from(root.lastElementChild!.children).map((button) =>
              button.getBoundingClientRect(),
            );
            return {
              arrowAligned: Math.abs(arrow.x - saved.x) <= 1,
              statusNextRow: saved.y >= back.bottom,
              statusEdgesAligned: Math.abs(pill.right - actions.at(-1)!.right) <= 1,
              equalActions: actions.every(
                (action) => Math.abs(action.width - actions[0].width) <= 1,
              ),
              sameActionRow: actions.every((action) => Math.abs(action.y - actions[0].y) <= 1),
              actionsNextRow: actions.every((action) => action.y > saved.bottom),
            };
          }),
        )
        .toEqual({
          arrowAligned: true,
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
  await expect(page.getByRole("status").filter({ hasText: /^Saved / })).toBeVisible();
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

test("converts Markdown shortcuts and supports slash keyboard navigation", async ({ page }) => {
  await workspace(page);
  const body = await newArticle(page);
  const cases = [
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
  ];
  for (const item of cases) {
    await body.click();
    await body.press("ControlOrMeta+A");
    await body.press("Backspace");
    await body.pressSequentially(item.typed);
    await expect(body.locator(item.selector)).toHaveCount(1);
  }
  await body.press("ControlOrMeta+A");
  await body.press("Backspace");
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
  state.failSave = false;
  await page.getByRole("button", { name: "Retry Save" }).click();
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
  await expect(page.getByRole("status").filter({ hasText: /^Saved / })).toBeVisible();
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
