import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "../helpers/app.js";
import { adminCookie } from "../helpers/auth.js";
import { clearTestDatabase, disconnectTestPrisma, getTestPrisma } from "../helpers/db.js";
import { seedBusiness, seedLocation } from "../helpers/seed.js";

const db = getTestPrisma();

beforeEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await disconnectTestPrisma();
});

async function fixtures() {
  const business = await seedBusiness();
  const locations = await Promise.all(
    ["First", "Second", "Third"].map((displayName) =>
      seedLocation(business.id, business.username, { displayName }),
    ),
  );
  return { business, locations };
}

async function add(businessId: string, locationId: string, isActive = true) {
  const response = await (
    await api()
  )
    .post("/admin/featured-restaurants")
    .set("Cookie", adminCookie())
    .send({ businessId, locationId, isActive });
  expect(response.status).toBe(200);
  return String(response.body.featured.id);
}

describe("Featured Restaurant Persistent Ordering", () => {
  it("saves ordering across requests and keeps homepage visibility and deletion working", async () => {
    const { business, locations } = await fixtures();
    const first = await add(business.id, locations[0].id);
    const second = await add(business.id, locations[1].id, false);
    const third = await add(business.id, locations[2].id);
    const saved = await (
      await api()
    )
      .patch("/admin/featured-restaurants/reorder")
      .set("Cookie", adminCookie())
      .send({ ids: [third, second, first] });
    expect(saved.status).toBe(200);

    const reloaded = await (
      await api()
    )
      .get("/admin/featured-restaurants")
      .set("Cookie", adminCookie());
    expect(reloaded.status).toBe(200);
    expect(reloaded.body.featured.map((row: { id: string }) => row.id)).toEqual([
      third,
      second,
      first,
    ]);
    const stored = await db.featuredRestaurant.findMany({ orderBy: { sortOrder: "asc" } });
    expect(stored.map((row) => [row.id, row.sortOrder])).toEqual([
      [third, 0],
      [second, 1],
      [first, 2],
    ]);

    const homepage = await (await api()).get("/api/featured-restaurants");
    expect(homepage.status).toBe(200);
    expect(homepage.body.featured.map((row: { id: string }) => row.id)).toEqual([third, first]);

    const activated = await (
      await api()
    )
      .patch(`/admin/featured-restaurants/${second}`)
      .set("Cookie", adminCookie())
      .send({ isActive: true });
    expect(activated.status).toBe(200);
    const removed = await (
      await api()
    )
      .delete(`/admin/featured-restaurants/${third}`)
      .set("Cookie", adminCookie());
    expect(removed.status).toBe(200);
    const updatedHomepage = await (await api()).get("/api/featured-restaurants");
    expect(updatedHomepage.status).toBe(200);
    expect(updatedHomepage.body.featured.map((row: { id: string }) => row.id)).toEqual([
      second,
      first,
    ]);
    expect(await db.location.count({ where: { businessId: business.id } })).toBe(3);
  });

  it("assigns distinct trailing positions when restaurants are added concurrently", async () => {
    const { business, locations } = await fixtures();
    const ids = await Promise.all(locations.map((location) => add(business.id, location.id)));
    const stored = await db.featuredRestaurant.findMany({ orderBy: { sortOrder: "asc" } });
    expect(new Set(stored.map((row) => row.id))).toEqual(new Set(ids));
    expect(stored.map((row) => row.sortOrder)).toEqual([0, 1, 2]);
  });

  it("rejects stale membership without changing persisted positions", async () => {
    const { business, locations } = await fixtures();
    const first = await add(business.id, locations[0].id);
    const second = await add(business.id, locations[1].id);
    const failed = await (
      await api()
    )
      .patch("/admin/featured-restaurants/reorder")
      .set("Cookie", adminCookie())
      .send({ ids: [second] });
    expect(failed.status).toBe(409);
    const stored = await db.featuredRestaurant.findMany({ orderBy: { sortOrder: "asc" } });
    expect(stored.map((row) => [row.id, row.sortOrder])).toEqual([
      [first, 0],
      [second, 1],
    ]);
  });

  it("preserves every entry when reordering overlaps a new addition", async () => {
    const { business, locations } = await fixtures();
    const first = await add(business.id, locations[0].id);
    const second = await add(business.id, locations[1].id);
    const client = await api();
    const [reordered, third] = await Promise.all([
      client
        .patch("/admin/featured-restaurants/reorder")
        .set("Cookie", adminCookie())
        .send({ ids: [second, first] }),
      add(business.id, locations[2].id),
    ]);
    expect([200, 409]).toContain(reordered.status);
    const stored = await db.featuredRestaurant.findMany({ orderBy: { sortOrder: "asc" } });
    expect(new Set(stored.map((row) => row.id))).toEqual(new Set([first, second, third]));
    expect(stored.map((row) => row.sortOrder)).toEqual([0, 1, 2]);
    expect(stored[2].id).toBe(third);
    if (reordered.status === 200) {
      expect(stored.map((row) => row.id)).toEqual([second, first, third]);
    } else {
      expect(stored.map((row) => row.id)).toEqual([first, second, third]);
    }
  });
});
