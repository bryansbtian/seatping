import { expect, test } from "@playwright/test";
import { restaurant } from "../tests/helpers/searchRestaurants";
import { PUBLIC_LANGUAGE_COOKIE } from "../shared/publicLanguage";

test.beforeEach(async ({ page }) => {
  await page.route("**/auth/session", (route) =>
    route.fulfill({ json: { customer: null, business: null } }),
  );
  await page.route("**/api/featured-restaurants**", (route) =>
    route.fulfill({ json: { restaurants: [] } }),
  );
  await page.route("**/api/search/restaurants**", (route) =>
    route.fulfill({
      json: {
        results: [],
        total: 0,
        page: 1,
        totalPages: 1,
        facets: { cuisines: [], locations: [] },
      },
    }),
  );
});

test("language endpoint reads country headers through the Vite proxy", async ({ request }) => {
  for (const [country, language] of [
    ["ID", "id"],
    ["US", "en"],
  ]) {
    const response = await request.get("/api/language", {
      headers: { "x-vercel-ip-country": country },
    });
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ language });
    expect(response.headers()["cache-control"]).toBe("private, no-store");
  }
  const local = await request.get("/api/language");
  expect(await local.json()).toEqual({ language: "en" });
  const manual = await request.get("/api/language", {
    headers: { "x-vercel-ip-country": "ID", cookie: `${PUBLIC_LANGUAGE_COOKIE}=en` },
  });
  expect(await manual.json()).toEqual({ language: "en" });
});

test("Indonesian detection waits for the endpoint and manual English survives reloads", async ({
  page,
}) => {
  let requests = 0;
  let release: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/language", async (route) => {
    requests += 1;
    await pending;
    await route.fulfill({ json: { language: "id" } });
  });
  await page.goto("/?from=direct");
  await expect(page.getByRole("status", { name: "Loading Page" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Discover Restaurants and Join the Wait Effortlessly" }),
  ).toHaveCount(0);
  release?.();
  await expect(page).toHaveURL(/\/id\?from=direct$/);
  await expect(
    page.getByRole("heading", { name: "Temukan Restoran dan Antre Tanpa Ribet" }),
  ).toBeVisible();
  await page.getByRole("contentinfo").getByRole("link", { name: "English" }).click();
  await expect(page).toHaveURL(/\/en\?from=direct$/);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.goto("/");
  await expect(page).toHaveURL(/\/en$/);
  expect(requests).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem("seatping.consumer.lang"))).toBe("en");
  expect(
    (await page.context().cookies()).some(
      (cookie) => cookie.name === PUBLIC_LANGUAGE_COOKIE && cookie.value === "en",
    ),
  ).toBe(true);
});

test("business marketing detects Indonesia while explicit routes override saved choices", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/language", (route) => {
    requests += 1;
    return route.fulfill({ json: { language: "id" } });
  });
  await page.goto("/business?from=nav");
  await expect(page).toHaveURL(/\/id\/business\?from=nav$/);
  await expect(
    page.getByRole("heading", {
      name: "Kelola Operasional Restoran Dari Satu Tempat",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .context()
    .addCookies([{ name: PUBLIC_LANGUAGE_COOKIE, value: "id", url: new URL(page.url()).origin }]);
  await page.evaluate(() => localStorage.setItem("seatping.consumer.lang", "id"));
  await page.goto("/en");
  await expect(
    page.getByRole("heading", { name: "Discover Restaurants and Join the Wait Effortlessly" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Log In", exact: true }).first()).toHaveAttribute(
    "href",
    "/en/login",
  );
  await page
    .context()
    .addCookies([{ name: PUBLIC_LANGUAGE_COOKIE, value: "en", url: new URL(page.url()).origin }]);
  await page.evaluate(() => localStorage.setItem("seatping.consumer.lang", "en"));
  await page.goto("/id");
  await expect(page.locator("html")).toHaveAttribute("lang", "id");
  expect(requests).toBe(1);
});

test("failed detection defaults to English without creating a manual preference", async ({
  page,
}) => {
  await page.route("**/api/language", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Discover Restaurants and Join the Wait Effortlessly" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  expect(await page.evaluate(() => localStorage.getItem("seatping.consumer.lang"))).toBeNull();
});

for (const width of [320, 390, 768, 1440]) {
  test(`language switching and translated footer fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/help");
    const footer = page.getByRole("contentinfo");
    const indonesian = footer.getByRole("link", { name: "Bahasa Indonesia" });
    await indonesian.scrollIntoViewIfNeeded();
    await indonesian.hover();
    await expect(indonesian).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await indonesian.click();
    await expect(page).toHaveURL(/\/id\/help$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "id");
    await expect(page.getByRole("heading", { name: "Bantuan dan FAQ", exact: true })).toBeVisible();
    await expect(footer.getByRole("link", { name: "Kebijakan Privasi" })).toHaveAttribute(
      "href",
      "/id/policy",
    );
    await expect(footer.getByRole("link", { name: "Blog", exact: true })).toHaveAttribute(
      "href",
      "/blog",
    );
    await expect(footer.getByRole("link", { name: "Bahasa Indonesia" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    await page.getByRole("button", { name: "Bagaimana Cara Ikut Antrean?", exact: true }).click();
    await expect(
      page.getByText(
        "Buka halaman SeatPing restoran atau pindai kode QR-nya, isi data Anda, lalu pilih cara menerima notifikasi.",
      ),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await footer.screenshot({
      path: `performance-artifacts/public-language/footer-id-${width}.png`,
    });
    if (width === 1440) {
      const legal = await footer.getByRole("navigation", { name: "Informasi Hukum" }).boundingBox();
      const footerBox = await footer.boundingBox();
      expect(legal).not.toBeNull();
      expect(footerBox).not.toBeNull();
      expect(
        Math.abs(legal!.x + legal!.width / 2 - (footerBox!.x + footerBox!.width / 2)),
      ).toBeLessThan(2);
    }
    await footer.getByRole("link", { name: "English" }).click();
    await expect(page).toHaveURL(/\/help$/);
    await expect(page.getByRole("heading", { name: "Help & FAQ", exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });
}

test("Indonesian authentication and consumer navigation stay localized", async ({ page }) => {
  await page.goto("/id/login");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, follow");
  await expect(page.getByRole("heading", { name: "Selamat Datang Kembali" })).toBeVisible();
  await expect(page.getByLabel("Email atau Nama Pengguna")).toBeVisible();
  await expect(page.getByLabel("Kata Sandi", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Lupa Kata Sandi?" }).click();
  await expect(page).toHaveURL(/\/id\/forgot$/);
  await expect(page.getByLabel("Alamat Email")).toBeVisible();
  await page.getByRole("link", { name: "SeatPing", exact: true }).click();
  await expect(page).toHaveURL(/\/id\/?$/);
  await expect(
    page.getByRole("heading", { name: "Temukan Restoran dan Antre Tanpa Ribet" }),
  ).toBeVisible();
  await page.goto("/admin");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("Indonesian public pages fit narrow screens and exclude private route aliases", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  for (const [path, title] of [
    ["/id/login", "Selamat Datang Kembali"],
    ["/id/signup", "Buat Akun Anda"],
    ["/id/business", "Kelola Operasional Restoran Dari Satu Tempat"],
    ["/id/business/login", "Masuk ke Akun Bisnis"],
    ["/id/business/signup", "Buat Akun Bisnis Anda"],
    ["/id/terms", "Ketentuan Layanan"],
    ["/id/policy", "Kebijakan Privasi"],
    ["/id/search", "Cari Restoran"],
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "id");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  let restaurantRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/restaurants/")) {
      restaurantRequests += 1;
    }
  });
  for (const path of ["/id/admin/dashboard", "/id/business/overview", "/id/blog/story"]) {
    await page.goto(path);
    await expect(page.getByRole("link", { name: "Back to Home" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  }
  expect(restaurantRequests).toBe(0);
});

test("Indonesian booking keeps API values intact and shares an Indonesian manage link", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await page.route("**/api/restaurants/bistro/loc-1?version=2", (route) =>
    route.fulfill({
      json: {
        restaurant: {
          ...restaurant({ bannerImageUrl: null }),
          photos: [],
          menu: [],
          reviews: [],
          reviewsPage: { nextCursor: null, hasMore: false },
          cuisineTypes: ["Japanese"],
          openingHours: null,
        },
      },
    }),
  );
  await page.route("**/api/reservations/bistro/loc-1/settings", (route) =>
    route.fulfill({
      json: {
        settings: {
          reservationStartTime: "12:00",
          reservationEndTime: "22:00",
          maxPartySize: 10,
          maxReservedGuestsPerHour: 0,
          bookingWindowDays: 365,
          minNoticeMinutes: 0,
          defaultReservationDurationMinutes: 90,
          reservationHoldMinutes: 15,
          confirmationMode: "auto",
          cancellationPolicy: "",
        },
      },
    }),
  );
  await page.route("**/api/reservations/bistro/loc-1/availability**", (route) =>
    route.fulfill({
      json: {
        slots: [{ time: "18:00", label: "6:00 PM", available: true, remaining: 4 }],
        availability: { status: "available" },
      },
    }),
  );
  let submitted: unknown;
  await page.route("**/api/reservations/bistro/loc-1", (route) => {
    submitted = route.request().postDataJSON();
    return route.fulfill({
      json: {
        manageToken: "public-language-test",
        manageUrl: "https://example.invalid/reservations/manage/public-language-test",
      },
    });
  });
  await page.goto(`/id/bistro/loc-1?book=1&date=${date}&time=18:00&partySize=2`);
  const dialog = page.getByRole("dialog", { name: "Reservasi Meja", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "18.00", exact: true })).toBeVisible();
  await dialog.getByLabel("Nama Depan", { exact: true }).fill("Ayu");
  await dialog.getByLabel("Nama Belakang", { exact: true }).fill("Putri");
  await dialog.getByLabel("Email", { exact: true }).fill("ayu@example.test");
  await dialog.getByRole("button", { name: "Konfirmasi Reservasi", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Reservasi Dikonfirmasi", exact: true }),
  ).toBeVisible();
  expect(submitted).toMatchObject({
    firstName: "Ayu",
    lastName: "Putri",
    email: "ayu@example.test",
    contactMethod: "email",
    time: "18:00",
    partySize: 2,
  });
  await expect(page.getByRole("link", { name: "Kelola Reservasi", exact: true })).toHaveAttribute(
    "href",
    "/id/reservations/manage/public-language-test",
  );
  await expect(page.getByRole("textbox").filter({ visible: true }).last()).toHaveValue(
    /\/id\/reservations\/manage\/public-language-test$/,
  );
});
