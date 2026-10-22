import { afterEach, describe, expect, it } from "vitest";
import { clearTestDatabase, getTestPrisma } from "../helpers/db.js";
import { seedDevelopmentData } from "../../server/lib/developmentSeed.js";
import { blogFieldsSchema } from "../../shared/blog.js";

afterEach(clearTestDatabase);

describe("Local Development Demo Data", () => {
  it("seeds real relational data repeatedly without overwriting local edits", async () => {
    await clearTestDatabase();
    await seedDevelopmentData(process.env.TEST_DATABASE_URL!);
    const db = getTestPrisma();
    expect(await db.business.count()).toBe(32);
    expect(await db.location.count()).toBe(62);
    expect(await db.featuredRestaurant.count()).toBe(12);
    expect(await db.featuredRestaurant.count({ where: { isActive: false } })).toBe(2);
    expect(await db.business.count({ where: { trial: true } })).toBe(10);
    expect(await db.ticket.count()).toBe(51);
    expect(await db.ticket.count({ where: { type: "feedback" } })).toBe(51);
    for (const status of ["open", "in_progress", "closed"]) {
      expect(await db.ticket.count({ where: { status } })).toBe(17);
    }
    expect(
      (await db.ticket.findUniqueOrThrow({ where: { id: "dev-demo-ticket-2" } })).data,
    ).toEqual({ feedbackType: "support", severity: "medium" });
    expect(await db.ticketMessage.count()).toBe(83);
    expect(await db.ticketMessage.count({ where: { status: "PENDING" } })).toBe(0);
    expect(await db.campaignTemplate.count()).toBe(27);
    expect(await db.campaignTemplate.count({ where: { approvalStatus: "REJECTED" } })).toBe(6);
    expect(await db.blogPost.count()).toBe(19);
    expect(await db.blogPost.count({ where: { status: "PUBLISHED" } })).toBe(9);
    for (const post of await db.blogPost.findMany()) {
      expect(
        blogFieldsSchema.safeParse({
          title: post.title,
          slug: post.slug,
          excerpt: post.excerpt,
          content: post.content,
          coverUrl: post.coverUrl,
          coverAlt: post.coverAlt,
          author: post.author,
          category: post.category,
          tags: post.tags,
        }).success,
      ).toBe(true);
    }
    await db.blogPost.update({ where: { id: "dev-demo-blog" }, data: { title: "My Local Edit" } });
    await seedDevelopmentData(process.env.TEST_DATABASE_URL!);
    expect(await db.business.count()).toBe(32);
    expect(await db.ticket.count()).toBe(51);
    expect(await db.location.count()).toBe(62);
    expect(await db.ticketMessage.count()).toBe(83);
    expect(await db.featuredRestaurant.count()).toBe(12);
    expect(await db.campaignTemplate.count()).toBe(27);
    expect(await db.blogPost.count()).toBe(19);
    expect((await db.blogPost.findUniqueOrThrow({ where: { id: "dev-demo-blog" } })).title).toBe(
      "My Local Edit",
    );
  });
  it("preserves existing local accounts and login hashes", async () => {
    await clearTestDatabase();
    const db = getTestPrisma();
    const account = await db.business.create({
      data: {
        name: "Existing Local Restaurant",
        username: "existing-local-account",
        email: "existing@example.test",
        phone: "+12025550199",
        password: "existing-local-test-password-hash",
        trial: false,
        baseCredits: 725,
      },
    });
    await seedDevelopmentData(process.env.TEST_DATABASE_URL!);
    expect(await db.business.findUnique({ where: { id: account.id } })).toEqual(account);
    expect(await db.business.count()).toBe(33);
  });
  it("refuses to seed a hosted database even from an explicitly invoked setup", async () => {
    await expect(
      seedDevelopmentData("postgresql://u:p@hosted.example.test/seatping_dev"),
    ).rejects.toThrow("Development cannot connect");
  });
});
