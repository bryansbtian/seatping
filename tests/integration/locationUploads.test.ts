import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "../helpers/app.js";
import { businessCookie } from "../helpers/auth.js";
import {
  clearTestDatabase,
  disconnectTestPrisma,
  getTestPrisma,
} from "../helpers/db.js";
import { seedBusinessWithLocation } from "../helpers/seed.js";
import { sinks } from "../setup/externalMocks.js";

const db = getTestPrisma();

function jpeg(): Buffer {
  return Buffer.from("fake-jpeg-bytes");
}

const ATTACH_OPTS = { filename: "photo.jpg", contentType: "image/jpeg" };

beforeAll(() => {
  process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
  process.env.CLOUDINARY_API_KEY = "test-key";
  process.env.CLOUDINARY_API_SECRET = "test-secret";
});

beforeEach(async () => {
  await clearTestDatabase();
});

afterAll(async () => {
  await disconnectTestPrisma();
});

describe("banner upload", () => {
  it("stores the uploaded banner on the location", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (await api())
      .post(`/api/locations/${location.id}/banner/upload`)
      .set("Cookie", businessCookie(business.id))
      .attach("file", jpeg(), ATTACH_OPTS);

    expect(res.status).toBe(200);
    expect(res.body.banner.url).toBe("https://test.invalid/image.jpg");
    expect(res.body.user).toBeDefined();
    const stored = await db.location.findUnique({ where: { id: location.id } });
    expect(stored?.bannerImagePublicId).toBe(res.body.banner.publicId);
    expect(sinks().cloudinary[0].folder).toBe(
      `seatping/locations/${location.id}/banner`,
    );
  });

  it("replaces an existing banner", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await db.location.update({
      where: { id: location.id },
      data: {
        bannerImageUrl: "https://test.invalid/old.jpg",
        bannerImagePublicId: `seatping/locations/${location.id}/banner/old`,
      },
    });

    const res = await (await api())
      .post(`/api/locations/${location.id}/banner/upload`)
      .set("Cookie", businessCookie(business.id))
      .attach("file", jpeg(), ATTACH_OPTS);

    expect(res.status).toBe(200);
    const stored = await db.location.findUnique({ where: { id: location.id } });
    expect(stored?.bannerImagePublicId).not.toContain("/old");
  });

  it("rejects an upload with no file", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (await api())
      .post(`/api/locations/${location.id}/banner/upload`)
      .set("Cookie", businessCookie(business.id))
      .field("nothing", "here");

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("No image file provided.");
  });

  it("rejects a file type that is not an image", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (await api())
      .post(`/api/locations/${location.id}/banner/upload`)
      .set("Cookie", businessCookie(business.id))
      .attach("file", Buffer.from("not an image"), {
        filename: "notes.txt",
        contentType: "text/plain",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("JPG, PNG, and WEBP");
  });

  it("rejects a file larger than the size limit", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (await api())
      .post(`/api/locations/${location.id}/banner/upload`)
      .set("Cookie", businessCookie(business.id))
      .attach("file", Buffer.alloc(6 * 1024 * 1024, 1), ATTACH_OPTS);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Each image must be 5MB or smaller.");
  });

  it("rejects a malformed location id", async () => {
    const { business } = await seedBusinessWithLocation();

    const res = await (await api())
      .post("/api/locations/not-an-object-id/banner/upload")
      .set("Cookie", businessCookie(business.id))
      .attach("file", jpeg(), ATTACH_OPTS);

    expect(res.status).toBe(404);
  });
});

describe("banner signing", () => {
  it("returns the fields a browser upload needs", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (await api())
      .post(`/api/locations/${location.id}/banner/sign`)
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(200);
    expect(res.body.upload.cloudName).toBe("test-cloud");
    expect(res.body.upload.folder).toBe(
      `seatping/locations/${location.id}/banner`,
    );
    expect(res.body.upload.signature).toEqual(expect.any(String));
  });

  it("keeps the stored banner when a commit reuses the same public id", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const publicId = `seatping/locations/${location.id}/banner/same`;
    await db.location.update({
      where: { id: location.id },
      data: {
        bannerImageUrl: "https://test.invalid/same.jpg",
        bannerImagePublicId: publicId,
      },
    });

    const res = await (await api())
      .post(`/api/locations/${location.id}/banner/commit`)
      .set("Cookie", businessCookie(business.id))
      .send({ url: "https://test.invalid/same-v2.jpg", publicId });

    expect(res.status).toBe(200);
    const stored = await db.location.findUnique({ where: { id: location.id } });
    expect(stored?.bannerImageUrl).toBe("https://test.invalid/same-v2.jpg");
  });
});

describe("photo upload", () => {
  it("stores several uploaded photos in the gallery", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (await api())
      .post(`/api/locations/${location.id}/photos/upload`)
      .set("Cookie", businessCookie(business.id))
      .attach("files", jpeg(), ATTACH_OPTS)
      .attach("files", jpeg(), ATTACH_OPTS);

    expect(res.status).toBe(200);
    expect(res.body.photos).toHaveLength(2);
    const stored = await db.photo.count({ where: { locationId: location.id } });
    expect(stored).toBe(2);
  });

  it("rejects an upload with no files", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (await api())
      .post(`/api/locations/${location.id}/photos/upload`)
      .set("Cookie", businessCookie(business.id))
      .field("nothing", "here");

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("No image files provided.");
  });

  it("refuses to exceed the remaining gallery slots", async () => {
    const { business, location } = await seedBusinessWithLocation();
    for (let i = 0; i < 9; i++) {
      await db.photo.create({
        data: {
          locationId: location.id,
          url: `https://test.invalid/p${i}.jpg`,
          publicId: `seatping/locations/${location.id}/photo/p${i}`,
        },
      });
    }

    const res = await (await api())
      .post(`/api/locations/${location.id}/photos/upload`)
      .set("Cookie", businessCookie(business.id))
      .attach("files", jpeg(), ATTACH_OPTS)
      .attach("files", jpeg(), ATTACH_OPTS);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("You can add 1 more photo");
  });

  it("refuses an upload once the gallery is full", async () => {
    const { business, location } = await seedBusinessWithLocation();
    for (let i = 0; i < 10; i++) {
      await db.photo.create({
        data: {
          locationId: location.id,
          url: `https://test.invalid/p${i}.jpg`,
          publicId: `seatping/locations/${location.id}/photo/p${i}`,
        },
      });
    }

    const res = await (await api())
      .post(`/api/locations/${location.id}/photos/upload`)
      .set("Cookie", businessCookie(business.id))
      .attach("files", jpeg(), ATTACH_OPTS);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("maximum of 10 photos");
  });
});

describe("photo signing", () => {
  it("reports how many gallery slots remain", async () => {
    const { business, location } = await seedBusinessWithLocation();
    await db.photo.create({
      data: {
        locationId: location.id,
        url: "https://test.invalid/p.jpg",
        publicId: `seatping/locations/${location.id}/photo/p`,
      },
    });

    const res = await (await api())
      .post(`/api/locations/${location.id}/photos/sign`)
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(200);
    expect(res.body.remaining).toBe(9);
    expect(res.body.upload.folder).toBe(
      `seatping/locations/${location.id}/photo`,
    );
  });

  it("refuses to sign once the gallery is full", async () => {
    const { business, location } = await seedBusinessWithLocation();
    for (let i = 0; i < 10; i++) {
      await db.photo.create({
        data: {
          locationId: location.id,
          url: `https://test.invalid/p${i}.jpg`,
          publicId: `seatping/locations/${location.id}/photo/p${i}`,
        },
      });
    }

    const res = await (await api())
      .post(`/api/locations/${location.id}/photos/sign`)
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(400);
  });
});

describe("review replies", () => {
  async function seedReview(locationId: string) {
    return db.review.create({
      data: {
        locationId,
        customerId: "000000000000000000000001",
        customerName: "Ada Lovelace",
        customerUsername: "ada",
        rating: 4,
        description: "Great service.",
      },
    });
  }

  it("rejects a malformed review id", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (await api())
      .patch(`/api/locations/${location.id}/reviews/not-an-id/reply`)
      .set("Cookie", businessCookie(business.id))
      .send({ reply: "Thank you" });

    expect(res.status).toBe(404);
  });

  it("rejects a reply that is not a string", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const review = await seedReview(location.id);

    const res = await (await api())
      .patch(`/api/locations/${location.id}/reviews/${review.id}/reply`)
      .set("Cookie", businessCookie(business.id))
      .send({ reply: 7 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("reply must be a string");
  });

  it("rejects an empty reply", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const review = await seedReview(location.id);

    const res = await (await api())
      .patch(`/api/locations/${location.id}/reviews/${review.id}/reply`)
      .set("Cookie", businessCookie(business.id))
      .send({ reply: "   " });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Reply cannot be empty.");
  });

  it("rejects a reply that is too long", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const review = await seedReview(location.id);

    const res = await (await api())
      .patch(`/api/locations/${location.id}/reviews/${review.id}/reply`)
      .set("Cookie", businessCookie(business.id))
      .send({ reply: "x".repeat(501) });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("500 characters or fewer");
  });

  it("keeps the original reply timestamp when the reply is edited", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const review = await seedReview(location.id);
    const cookie = businessCookie(business.id);

    const first = await (await api())
      .patch(`/api/locations/${location.id}/reviews/${review.id}/reply`)
      .set("Cookie", cookie)
      .send({ reply: "Thank you for visiting." });
    const second = await (await api())
      .patch(`/api/locations/${location.id}/reviews/${review.id}/reply`)
      .set("Cookie", cookie)
      .send({ reply: "Thank you, see you soon." });

    expect(second.status).toBe(200);
    expect(second.body.review.businessReply).toBe("Thank you, see you soon.");
    expect(second.body.review.businessReplyCreatedAt).toBe(
      first.body.review.businessReplyCreatedAt,
    );
  });

  it("removes a reply", async () => {
    const { business, location } = await seedBusinessWithLocation();
    const review = await seedReview(location.id);
    const cookie = businessCookie(business.id);
    await (await api())
      .patch(`/api/locations/${location.id}/reviews/${review.id}/reply`)
      .set("Cookie", cookie)
      .send({ reply: "Thank you for visiting." });

    const res = await (await api())
      .delete(`/api/locations/${location.id}/reviews/${review.id}/reply`)
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.review.businessReply).toBeNull();
    expect(res.body.review.businessReplyCreatedAt).toBeNull();
  });

  it("rejects removing a reply from a malformed review id", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (await api())
      .delete(`/api/locations/${location.id}/reviews/not-an-id/reply`)
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(404);
  });

  it("rejects removing a reply from an unknown review", async () => {
    const { business, location } = await seedBusinessWithLocation();

    const res = await (await api())
      .delete(
        `/api/locations/${location.id}/reviews/000000000000000000000000/reply`,
      )
      .set("Cookie", businessCookie(business.id));

    expect(res.status).toBe(404);
  });
});
