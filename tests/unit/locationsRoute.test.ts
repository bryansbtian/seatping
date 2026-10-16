import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { signJwt } from "../../server/lib/auth.js";

const locationFindMany = vi.fn();
const searchSuggestions = vi.fn();
const locationFindFirst = vi.fn();
const locationUpdate = vi.fn();
const businessFindMany = vi.fn();
const photoCount = vi.fn();
const photoCreate = vi.fn();
const photoFindFirst = vi.fn();
const photoUpdate = vi.fn();
const photoDelete = vi.fn();
const reviewFindMany = vi.fn();
const reviewFindFirst = vi.fn();
const reviewUpdate = vi.fn();

const uploadImageBuffer = vi.fn();
const deleteImageByPublicId = vi.fn();
const signLocationUpload = vi.fn();
const assembleBusinessMe = vi.fn();

vi.mock("../../server/lib/prisma.js", () => {
  return {
    prisma: {
      location: {
        findMany: locationFindMany,
        findFirst: locationFindFirst,
        update: locationUpdate,
      },
      business: { findMany: businessFindMany },
      photo: {
        count: photoCount,
        create: photoCreate,
        findFirst: photoFindFirst,
        update: photoUpdate,
        delete: photoDelete,
      },
      review: {
        findMany: reviewFindMany,
        findFirst: reviewFindFirst,
        update: reviewUpdate,
      },
    },
  };
});

vi.mock("../../server/lib/searchSuggestions.js", () => ({ searchSuggestions }));

vi.mock("../../server/lib/cloudinary.js", async () => {
  const actual = await vi.importActual<any>("../../server/lib/cloudinary.js");
  return {
    ...actual,
    uploadImageBuffer,
    deleteImageByPublicId,
    signLocationUpload,
  };
});

vi.mock("../../server/lib/business.js", async () => {
  const actual = await vi.importActual<any>("../../server/lib/business.js");
  return { ...actual, assembleBusinessMe };
});

const locationsRouter = (await import("../../server/routes/locations.js")).default;

const ORIGINAL_ENV = { ...process.env };
const LOC = "0123456789abcdef01234567";

let ipCounter = 0;

function app() {
  const server = express();
  server.use(cookieParser());
  server.use(express.json());
  server.use("/api/locations", locationsRouter);
  return supertest(server);
}

function freshIp(): string {
  ipCounter += 1;
  return `172.16.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
}

function cookie(businessId = "biz-1"): string {
  const token = signJwt({ sub: businessId, accountType: "business" });
  return `sp_auth_business=${token}`;
}

async function suggest(query: string) {
  return app()
    .get(`/api/locations/search-suggestions?query=${encodeURIComponent(query)}`)
    .set("X-Forwarded-For", freshIp());
}

beforeEach(() => {
  process.env.JWT_SECRET = "unit-test-jwt-secret";
  searchSuggestions.mockReset().mockResolvedValue([]);
  locationFindMany.mockReset().mockResolvedValue([]);
  locationFindFirst.mockReset().mockResolvedValue({ id: LOC, bannerImagePublicId: null });
  locationUpdate.mockReset().mockResolvedValue({});
  businessFindMany
    .mockReset()
    .mockResolvedValue([{ id: "biz-1", name: "Bistro", username: "bistro" }]);
  photoCount.mockReset().mockResolvedValue(0);
  photoCreate.mockReset().mockResolvedValue({
    id: "photo-1",
    url: "https://test.invalid/p.jpg",
    publicId: `seatping/locations/${LOC}/photo/p`,
  });
  photoFindFirst.mockReset().mockResolvedValue({ id: "photo-1", publicId: "pid" });
  photoUpdate.mockReset().mockResolvedValue({ id: "photo-1" });
  photoDelete.mockReset().mockResolvedValue({});
  reviewFindMany.mockReset().mockResolvedValue([]);
  reviewFindFirst.mockReset().mockResolvedValue({ id: LOC, businessReplyCreatedAt: null });
  reviewUpdate.mockReset().mockResolvedValue({ id: LOC });
  uploadImageBuffer.mockReset().mockResolvedValue({
    url: "https://test.invalid/uploaded.jpg",
    publicId: `seatping/locations/${LOC}/banner/u`,
  });
  deleteImageByPublicId.mockReset().mockResolvedValue(undefined);
  signLocationUpload.mockReset().mockReturnValue({
    cloudName: "test-cloud",
    apiKey: "k",
    timestamp: 1,
    folder: `seatping/locations/${LOC}/banner`,
    signature: "sig",
  });
  assembleBusinessMe.mockReset().mockResolvedValue({ id: "biz-1" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("suggestion database dispatch", () => {
  it.each([
    { limit: "invalid", expected: 3 },
    { limit: "0", expected: 1 },
    { limit: "-1", expected: 1 },
    { limit: "2", expected: 2 },
    { limit: "100", expected: 3 },
  ])("bounds a requested suggestion limit of $limit", async ({ limit, expected }) => {
    const res = await app()
      .get("/api/locations/search-suggestions")
      .query({ query: "bistro", limit })
      .set("X-Forwarded-For", freshIp());

    expect(res.status).toBe(200);
    expect(searchSuggestions).toHaveBeenCalledExactlyOnceWith("bistro", expected);
  });

  it("normalizes the query and bounds the database result limit", async () => {
    searchSuggestions.mockResolvedValue([{ locationId: LOC, name: "Bistro" }]);
    const res = await suggest("  BISTRO  ");
    expect(searchSuggestions).toHaveBeenCalledWith("bistro", 3);
    expect(res.body.suggestions).toEqual([{ locationId: LOC, name: "Bistro" }]);
    expect(locationFindMany).not.toHaveBeenCalled();
    expect(businessFindMany).not.toHaveBeenCalled();
  });

  it("does not query the database for blank input", async () => {
    const res = await suggest("  ");
    expect(res.body.suggestions).toEqual([]);
    expect(searchSuggestions).not.toHaveBeenCalled();
  });

  it("reports a server error without leaking the cause", async () => {
    searchSuggestions.mockRejectedValue(new Error("db down"));
    const res = await suggest("bistro");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to load suggestions." });
  });

  it("survives a rejection that carries no message", async () => {
    searchSuggestions.mockRejectedValue("db exploded");
    await suggest("bistro");
    expect(vi.mocked(console.error).mock.calls[0][1]).toBe("db exploded");
  });
});

describe("ownership guard", () => {
  it("rejects malformed location IDs before querying storage", async () => {
    const res = await app().post("/api/locations/invalid/banner/sign").set("Cookie", cookie());

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Location not found or access denied" });
    expect(locationFindFirst).not.toHaveBeenCalled();
    expect(signLocationUpload).not.toHaveBeenCalled();
  });

  it("rejects a location outside the authenticated business", async () => {
    locationFindFirst.mockResolvedValue(null);
    const res = await app().post(`/api/locations/${LOC}/banner/sign`).set("Cookie", cookie());

    expect(res.status).toBe(404);
    expect(locationFindFirst).toHaveBeenCalledExactlyOnceWith({
      where: { id: LOC, businessId: "biz-1" },
      select: { id: true, bannerImagePublicId: true },
    });
    expect(signLocationUpload).not.toHaveBeenCalled();
  });

  it("reports a server error when the lookup fails", async () => {
    locationFindFirst.mockRejectedValue(new Error("db down"));

    const res = await app().post(`/api/locations/${LOC}/banner/sign`).set("Cookie", cookie());

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Server error" });
  });
});

describe.each(["banner", "photos"])("%s commit validation", (kind) => {
  it.each([
    { url: 7, publicId: "image" },
    { url: "", publicId: "image" },
    { url: "https://test.invalid/image.jpg", publicId: 7 },
    { url: "https://test.invalid/image.jpg", publicId: "" },
  ])("rejects invalid uploaded image data: %j", async (body) => {
    const res = await app()
      .post(`/api/locations/${LOC}/${kind}/commit`)
      .set("Cookie", cookie())
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Missing uploaded image data." });
    expect(locationUpdate).not.toHaveBeenCalled();
    expect(photoCreate).not.toHaveBeenCalled();
    expect(deleteImageByPublicId).not.toHaveBeenCalled();
  });

  it("rejects image references belonging to another location", async () => {
    const res = await app()
      .post(`/api/locations/${LOC}/${kind}/commit`)
      .set("Cookie", cookie())
      .send({
        url: "https://test.invalid/image.jpg",
        publicId: "seatping/locations/another-location/banner/image",
      });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid image reference." });
    expect(locationUpdate).not.toHaveBeenCalled();
    expect(photoCreate).not.toHaveBeenCalled();
    expect(deleteImageByPublicId).not.toHaveBeenCalled();
  });
});

describe("banner endpoints", () => {
  it("removes the previous image after committing a replacement banner", async () => {
    const previousId = `seatping/locations/${LOC}/banner/previous`;
    const publicId = `seatping/locations/${LOC}/banner/replacement`;
    const url = "https://test.invalid/replacement.jpg";
    locationFindFirst.mockResolvedValue({ id: LOC, bannerImagePublicId: previousId });

    const res = await app()
      .post(`/api/locations/${LOC}/banner/commit`)
      .set("Cookie", cookie())
      .send({ url, publicId });

    expect(res.status).toBe(200);
    expect(res.body.banner).toEqual({ url, publicId });
    expect(locationUpdate).toHaveBeenCalledExactlyOnceWith({
      where: { id: LOC },
      data: { bannerImageUrl: url, bannerImagePublicId: publicId },
    });
    expect(deleteImageByPublicId).toHaveBeenCalledExactlyOnceWith(previousId);
    expect(locationUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      deleteImageByPublicId.mock.invocationCallOrder[0],
    );
  });

  it("keeps the image when committing the existing banner again", async () => {
    const publicId = `seatping/locations/${LOC}/banner/current`;
    const url = "https://test.invalid/current.jpg";
    locationFindFirst.mockResolvedValue({ id: LOC, bannerImagePublicId: publicId });

    const res = await app()
      .post(`/api/locations/${LOC}/banner/commit`)
      .set("Cookie", cookie())
      .send({ url, publicId });

    expect(res.status).toBe(200);
    expect(res.body.banner).toEqual({ url, publicId });
    expect(deleteImageByPublicId).not.toHaveBeenCalled();
  });

  it("reports a failed provider upload", async () => {
    uploadImageBuffer.mockRejectedValue(new Error("cloudinary down"));

    const res = await app()
      .post(`/api/locations/${LOC}/banner/upload`)
      .set("Cookie", cookie())
      .attach("file", Buffer.from("img"), {
        filename: "b.jpg",
        contentType: "image/jpeg",
      });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("cloudinary down");
  });

  it("falls back to a generic message when the failure has none", async () => {
    uploadImageBuffer.mockRejectedValue({});

    const res = await app()
      .post(`/api/locations/${LOC}/banner/upload`)
      .set("Cookie", cookie())
      .attach("file", Buffer.from("img"), {
        filename: "b.jpg",
        contentType: "image/jpeg",
      });

    expect(res.body.error).toBe("Failed to upload banner.");
  });

  it("reports a failed signature", async () => {
    signLocationUpload.mockImplementation(() => {
      throw new Error("Cloudinary is not configured");
    });

    const res = await app().post(`/api/locations/${LOC}/banner/sign`).set("Cookie", cookie());

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Cloudinary is not configured");
  });

  it("falls back to a generic signature failure message", async () => {
    signLocationUpload.mockImplementation(() => {
      throw {};
    });

    const res = await app().post(`/api/locations/${LOC}/banner/sign`).set("Cookie", cookie());

    expect(res.body.error).toBe("Failed to prepare upload.");
  });

  it("reports a failed banner commit", async () => {
    locationUpdate.mockRejectedValue(new Error("db down"));

    const res = await app()
      .post(`/api/locations/${LOC}/banner/commit`)
      .set("Cookie", cookie())
      .send({
        url: "https://test.invalid/b.jpg",
        publicId: `seatping/locations/${LOC}/banner/b`,
      });

    expect(res.status).toBe(500);
  });

  it("reports a failed banner delete", async () => {
    locationUpdate.mockRejectedValue(new Error("db down"));

    const res = await app().delete(`/api/locations/${LOC}/banner`).set("Cookie", cookie());

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to remove banner." });
  });
});

describe("photo endpoints", () => {
  it.each(["patch", "delete"] as const)(
    "rejects malformed photo IDs on %s without querying storage",
    async (method) => {
      const request = app()[method](`/api/locations/${LOC}/photos/invalid`);
      const res = await request.set("Cookie", cookie());

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "Photo not found" });
      expect(photoFindFirst).not.toHaveBeenCalled();
      expect(photoUpdate).not.toHaveBeenCalled();
      expect(photoDelete).not.toHaveBeenCalled();
    },
  );

  it("rejects alt text updates for a photo outside the owned location", async () => {
    photoFindFirst.mockResolvedValue(null);
    const res = await app()
      .patch(`/api/locations/${LOC}/photos/${LOC}`)
      .set("Cookie", cookie())
      .send({ altText: "Dining Room" });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Photo not found" });
    expect(photoFindFirst).toHaveBeenCalledExactlyOnceWith({
      where: { id: LOC, locationId: LOC },
      select: { id: true },
    });
    expect(photoUpdate).not.toHaveBeenCalled();
  });

  it("reports a failed photo upload", async () => {
    uploadImageBuffer.mockRejectedValue(new Error("cloudinary down"));

    const res = await app()
      .post(`/api/locations/${LOC}/photos/upload`)
      .set("Cookie", cookie())
      .attach("files", Buffer.from("img"), {
        filename: "p.jpg",
        contentType: "image/jpeg",
      });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("cloudinary down");
  });

  it("reports a failed photo signature", async () => {
    photoCount.mockRejectedValue(new Error("db down"));

    const res = await app().post(`/api/locations/${LOC}/photos/sign`).set("Cookie", cookie());

    expect(res.status).toBe(500);
  });

  it("discards a committed photo once the gallery filled up", async () => {
    photoCount.mockResolvedValue(10);

    const res = await app()
      .post(`/api/locations/${LOC}/photos/commit`)
      .set("Cookie", cookie())
      .send({
        url: "https://test.invalid/p.jpg",
        publicId: `seatping/locations/${LOC}/photo/p`,
      });

    expect(res.status).toBe(400);
    expect(deleteImageByPublicId).toHaveBeenCalledWith(`seatping/locations/${LOC}/photo/p`);
  });

  it("reports a failed photo commit", async () => {
    photoCreate.mockRejectedValue(new Error("db down"));

    const res = await app()
      .post(`/api/locations/${LOC}/photos/commit`)
      .set("Cookie", cookie())
      .send({
        url: "https://test.invalid/p.jpg",
        publicId: `seatping/locations/${LOC}/photo/p`,
      });

    expect(res.status).toBe(500);
  });

  it("rejects alt text that is not a string", async () => {
    const res = await app()
      .patch(`/api/locations/${LOC}/photos/${LOC}`)
      .set("Cookie", cookie())
      .send({ altText: 7 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("altText must be a string");
  });

  it("accepts a null alt text as a clear", async () => {
    const res = await app()
      .patch(`/api/locations/${LOC}/photos/${LOC}`)
      .set("Cookie", cookie())
      .send({ altText: null });

    expect(res.status).toBe(200);
    expect(photoUpdate.mock.calls[0][0].data.altText).toBeNull();
  });

  it("clears alt text that is only whitespace", async () => {
    await app()
      .patch(`/api/locations/${LOC}/photos/${LOC}`)
      .set("Cookie", cookie())
      .send({ altText: "   " });

    expect(photoUpdate.mock.calls[0][0].data.altText).toBeNull();
  });

  it("reports a failed alt text update", async () => {
    photoUpdate.mockRejectedValue(new Error("db down"));

    const res = await app()
      .patch(`/api/locations/${LOC}/photos/${LOC}`)
      .set("Cookie", cookie())
      .send({ altText: "Dining room" });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to update photo." });
  });

  it("reports a failed photo delete", async () => {
    photoDelete.mockRejectedValue(new Error("db down"));

    const res = await app().delete(`/api/locations/${LOC}/photos/${LOC}`).set("Cookie", cookie());

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to delete photo." });
  });
});

describe("review endpoints", () => {
  it("defaults every optional review field", async () => {
    reviewFindMany.mockResolvedValue([{ id: "rev-1", locationId: LOC }]);

    const res = await app().get(`/api/locations/${LOC}/reviews`).set("Cookie", cookie());

    const review = res.body.reviews[0];
    expect(review.rating).toBe(0);
    expect(review.partySize).toBeNull();
    expect(review.customerId).toBeNull();
    expect(review.customerName).toBeNull();
    expect(review.customerUsername).toBeNull();
    expect(review.description).toBeNull();
    expect(review.serviceType).toBeNull();
    expect(review.businessReply).toBeNull();
  });

  it("keeps the stored review values", async () => {
    reviewFindMany.mockResolvedValue([
      {
        id: "rev-1",
        locationId: LOC,
        customerId: "cust-1",
        customerName: "Ada",
        customerUsername: "ada",
        rating: 4,
        description: "Great",
        partySize: 2,
        serviceType: "dine_in",
        businessReply: "Thanks",
      },
    ]);

    const res = await app().get(`/api/locations/${LOC}/reviews`).set("Cookie", cookie());

    expect(res.body.reviews[0].rating).toBe(4);
    expect(res.body.reviews[0].partySize).toBe(2);
    expect(res.body.reviews[0].businessReply).toBe("Thanks");
  });

  it("reports a failed review listing", async () => {
    reviewFindMany.mockRejectedValue(new Error("db down"));

    const res = await app().get(`/api/locations/${LOC}/reviews`).set("Cookie", cookie());

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to load reviews." });
  });

  it("reports an unknown review on reply", async () => {
    reviewFindFirst.mockResolvedValue(null);

    const res = await app()
      .patch(`/api/locations/${LOC}/reviews/${LOC}/reply`)
      .set("Cookie", cookie())
      .send({ reply: "Thank you" });

    expect(res.status).toBe(404);
  });

  it("reports a failed reply write", async () => {
    reviewUpdate.mockRejectedValue(new Error("db down"));

    const res = await app()
      .patch(`/api/locations/${LOC}/reviews/${LOC}/reply`)
      .set("Cookie", cookie())
      .send({ reply: "Thank you" });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to save reply." });
  });

  it("reports a failed reply removal", async () => {
    reviewUpdate.mockRejectedValue(new Error("db down"));

    const res = await app()
      .delete(`/api/locations/${LOC}/reviews/${LOC}/reply`)
      .set("Cookie", cookie());

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to delete reply." });
  });
});
