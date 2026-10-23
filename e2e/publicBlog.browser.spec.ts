import { expect, test } from "@playwright/test";
import { newBlogFields } from "../shared/blog";
import { BLOG_TITLE } from "../shared/publicBlog";

const video = "https://res.cloudinary.com/test/video/upload/v123/dining-room.mp4";
const posts = [
  "A Better Evening Starts Before You Arrive",
  "The Friday Night Service Checklist",
  "A Thoughtful Welcome For Every Returning Guest",
].map((title, index) => ({
  ...newBlogFields(),
  title,
  slug: `article-${index}`,
  author: "SeatPing Team",
  category: ["Guides", "Operations", "Product"][index],
  excerpt:
    "Practical ideas for a calmer service, thoughtful hospitality, and a better experience for every guest.",
  coverUrl: "https://example.com/restaurant.jpg",
  coverAlt: "Restaurant Dining Room",
  readingMinutes: 3,
  content: {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Start With The Guest" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "A thoughtful arrival starts with clear communication." }],
      },
    ],
  },
  publishedAt: "2026-10-20T00:00:00Z",
  updatedAt: "2026-10-21T00:00:00Z",
}));
test.beforeEach(async ({ page }) => {
  await page.route("**/auth/session", (route) =>
    route.fulfill({ json: { customer: null, business: null } }),
  );
  await page.route("https://example.com/restaurant.jpg", (route) =>
    route.fulfill({ path: "public/display2.jpeg", contentType: "image/jpeg" }),
  );
  await page.route("**/api/blog**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/related")) {
      const currentSlug = url.pathname.split("/")[3];
      return route.fulfill({
        json: { posts: posts.filter((item) => item.slug !== currentSlug).slice(0, 2) },
      });
    }
    const post = posts.find((item) => url.pathname === `/api/blog/${item.slug}`);
    if (post) {
      return route.fulfill({ json: { post } });
    }
    const category = url.searchParams.get("category");
    const visible = posts.filter((item) => !category || item.category === category);
    return route.fulfill({
      json: {
        posts: visible,
        categories: ["Guides", "Operations", "Product"],
        page: 1,
        totalPages: 1,
      },
    });
  });
});

for (const [width, height] of [
  [320, 568],
  [390, 844],
  [768, 900],
  [1440, 900],
]) {
  test(`listing, underline tabs and article fit at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await page.goto("/blog");
    await expect(page.getByRole("heading", { name: BLOG_TITLE })).toBeVisible();
    await expect(page.getByRole("main").getByText("BLOG", { exact: true })).toBeVisible();
    await expect(page.locator("main article")).toHaveCount(3);
    const all = page
      .getByRole("navigation", { name: "Blog Categories" })
      .getByRole("link", { name: "All", exact: true });
    await expect(all).toHaveCSS("border-top-width", "0px");
    await expect(all).toHaveCSS("border-left-width", "0px");
    await expect(all).toHaveCSS("border-bottom-width", "2px");
    await expect(page.locator("main").locator("..")).toHaveCSS(
      "background-color",
      "rgb(255, 255, 255)",
    );
    const gap = await page
      .locator("main header p")
      .first()
      .evaluate(
        (element) =>
          element.getBoundingClientRect().top -
          document.querySelector("body > #root header")!.getBoundingClientRect().bottom,
      );
    expect(gap).toBeLessThan(50);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`listing-${width}.png`) });
    await page
      .getByRole("navigation", { name: "Blog Categories" })
      .getByRole("link", { name: "Guides" })
      .click();
    await expect(page.locator("main article")).toHaveCount(1);
    await page.locator("main article a").click();
    await expect(page.getByRole("heading", { name: posts[0].title })).toBeVisible();
    const back = await page.getByRole("link", { name: "Back To Blogs", exact: true }).boundingBox();
    const category = await page
      .locator("main > article > header")
      .getByText("Guides", { exact: true })
      .boundingBox();
    expect(category!.y).toBeGreaterThan(back!.y + back!.height);
    await expect(page.getByRole("heading", { name: "Keep Reading" })).toBeVisible();
    let relatedBorder = "0px";
    if (width >= 1280) {
      relatedBorder = "1px";
    }
    await expect(page.getByRole("region", { name: "Keep Reading" })).toHaveCSS(
      "border-top-width",
      relatedBorder,
    );
    await expect(page.getByRole("region", { name: "Keep Reading" }).locator("article")).toHaveCount(
      2,
    );
    await expect(
      page.getByText("A thoughtful arrival starts with clear communication."),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`article-${width}.png`), fullPage: true });
  });
  test(`loading skeletons fill the viewport with complete items at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height });
    await page.route("**/api/blog**", () => {});
    for (const path of ["/blog", "/blog/article-0"]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      const loading = page.getByRole("status", { name: /Loading (Blog Posts|Article)/ });
      await expect(loading).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const bounds = await loading.boundingBox();
      expect(bounds!.y + bounds!.height).toBeCloseTo(height - 24, 0);
      const invalidItems = await loading.locator(".animate-pulse:visible").evaluateAll((items) =>
        items.flatMap((item) => {
          const rect = item.getBoundingClientRect();
          if (
            rect.height > 0 &&
            rect.bottom <= window.innerHeight &&
            rect.left >= 0 &&
            rect.right <= window.innerWidth
          ) {
            return [];
          }
          return [
            {
              className: item.className,
              bounds: rect.toJSON(),
              viewport: { width: window.innerWidth, height: window.innerHeight },
            },
          ];
        }),
      );
      expect(invalidItems).toEqual([]);
      await page.screenshot({
        path: testInfo.outputPath(`loading-${path.split("/").pop() || "blog"}-${width}.png`),
      });
    }
  });
}

test("video cover cards request a first-frame image and the article offers video playback", async ({
  page,
}) => {
  const post = { ...posts[0], coverUrl: video };
  await page.route("**/api/blog**", (route) => {
    if (new URL(route.request().url()).pathname.endsWith("/related")) {
      return route.fulfill({ json: { posts: [] } });
    }
    if (new URL(route.request().url()).pathname.endsWith("article-0")) {
      return route.fulfill({ json: { post } });
    }
    return route.fulfill({
      json: { posts: [post], categories: ["Guides"], page: 1, totalPages: 1 },
    });
  });
  await page.route(
    "https://res.cloudinary.com/test/video/upload/so_0/v123/dining-room.jpg",
    (route) => route.fulfill({ path: "public/display2.jpeg", contentType: "image/jpeg" }),
  );
  await page.goto("/blog");
  await expect(page.locator("main article img")).toHaveAttribute(
    "src",
    "https://res.cloudinary.com/test/video/upload/so_0/v123/dining-room.jpg",
  );
  await expect(page.locator("main video")).toHaveCount(0);
  await page.locator("main article a").click();
  await expect(page.locator("main video")).toHaveAttribute("controls", "");
  await expect(page.locator("main video")).toHaveAttribute("src", video);
});
