import express from "express";
import cookieParser from "cookie-parser";
import { serveApp } from "../helpers/app.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import router from "../../server/routes/adminBlog.js";
import { signJwt } from "../../server/lib/auth.js";
import { prisma } from "../../server/lib/prisma.js";
import { assertCloudinaryConfigured } from "../../server/lib/cloudinary.js";
import { v2 as cloudinary } from "cloudinary";

vi.mock("../../server/lib/prisma.js", () => ({
  prisma: { blogMedia: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() } },
}));
vi.mock("../../server/lib/cloudinary.js", () => ({ assertCloudinaryConfigured: vi.fn() }));
vi.mock("cloudinary", () => ({
  v2: {
    utils: { api_sign_request: vi.fn().mockReturnValue("test-signature") },
    api: { resource: vi.fn() },
    uploader: { destroy: vi.fn() },
  },
}));
const app = express();
app.use(express.json(), cookieParser());
app.use("/api/admin/blog", router);
const client = await serveApp(app);
const id = "seatping/blog/00000000-0000-0000-0000-000000000000";
function cookie() {
  return `sp_auth_admin=${signJwt({ sub: "admin", accountType: "admin" })}`;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ADMIN_USERNAME", "test-admin");
  vi.stubEnv("ADMIN_PASSWORD_HASH", "test-hash");
  vi.stubEnv("CLOUDINARY_API_KEY", "test-key");
  vi.stubEnv("CLOUDINARY_API_SECRET", "test-secret");
  vi.mocked(prisma.blogMedia.findUnique).mockResolvedValue({
    id,
    kind: "image",
    url: null,
    createdAt: new Date(),
  });
  vi.mocked(cloudinary.api.resource).mockResolvedValue({
    bytes: 100,
    format: "png",
    secure_url: "https://res.cloudinary.com/test/image/upload/picture.png",
    resource_type: "image",
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Blog Media Verification", () => {
  it("signs only server-chosen paths and supported formats", async () => {
    const response = await client
      .post("/api/admin/blog/media/sign")
      .set("Cookie", cookie())
      .send({ kind: "video" });
    expect(response.status).toBe(200);
    expect(response.body.upload.public_id).toMatch(/^seatping\/blog\/[\w-]+$/);
    expect(response.body.upload.allowed_formats).toBe("mp4,webm");
    expect(response.body.upload.overwrite).toBe(false);
    expect(prisma.blogMedia.create).toHaveBeenCalledOnce();
    expect(cloudinary.utils.api_sign_request).toHaveBeenCalledWith(
      expect.objectContaining({ allowed_formats: "mp4,webm", overwrite: false }),
      "test-secret",
    );
  });
  it("verifies provider metadata before accepting an uploaded asset", async () => {
    const response = await client
      .post("/api/admin/blog/media/commit")
      .set("Cookie", cookie())
      .send({ id });
    expect(response.status).toBe(200);
    expect(response.body.url).toContain("https://res.cloudinary.com/");
    expect(cloudinary.api.resource).toHaveBeenCalledWith(id, { resource_type: "image" });
    expect(prisma.blogMedia.update).toHaveBeenCalledOnce();
  });
  it.each([
    { bytes: 11 * 1024 * 1024 },
    { format: "svg" },
    { format: "html" },
    { bytes: 0 },
    { resource_type: "raw" },
    { secure_url: "http://untrusted.com/file" },
  ])("removes rejected uploads with invalid metadata %j", async (override) => {
    vi.mocked(cloudinary.api.resource).mockResolvedValue({
      bytes: 100,
      format: "png",
      secure_url: "https://res.cloudinary.com/test/image/upload/a.png",
      resource_type: "image",
      ...override,
    });
    const response = await client
      .post("/api/admin/blog/media/commit")
      .set("Cookie", cookie())
      .send({ id });
    expect(response.status).toBe(400);
    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith(id, { resource_type: "image" });
    expect(prisma.blogMedia.delete).toHaveBeenCalledWith({ where: { id } });
    expect(prisma.blogMedia.update).not.toHaveBeenCalled();
  });
  it("accepts a supported video and rejects a video over 50 MB", async () => {
    vi.mocked(prisma.blogMedia.findUnique).mockResolvedValue({
      id,
      kind: "video",
      url: null,
      createdAt: new Date(),
    });
    vi.mocked(cloudinary.api.resource).mockResolvedValue({
      bytes: 40 * 1024 * 1024,
      format: "mp4",
      secure_url: "https://res.cloudinary.com/test/video/upload/a.mp4",
      resource_type: "video",
    });
    expect(
      (await client.post("/api/admin/blog/media/commit").set("Cookie", cookie()).send({ id }))
        .status,
    ).toBe(200);
    vi.mocked(cloudinary.api.resource).mockResolvedValue({
      bytes: 51 * 1024 * 1024,
      format: "mp4",
      secure_url: "https://res.cloudinary.com/test/video/upload/a.mp4",
      resource_type: "video",
    });
    expect(
      (await client.post("/api/admin/blog/media/commit").set("Cookie", cookie()).send({ id }))
        .status,
    ).toBe(400);
  });
  it("reports provider failures without storing unverified media", async () => {
    vi.mocked(cloudinary.api.resource).mockRejectedValue(new Error("Provider failed"));
    const response = await client
      .post("/api/admin/blog/media/commit")
      .set("Cookie", cookie())
      .send({ id });
    expect(response.status).toBe(502);
    expect(prisma.blogMedia.update).not.toHaveBeenCalled();
    vi.mocked(assertCloudinaryConfigured).mockImplementation(() => {
      throw new Error("Missing config");
    });
    expect(
      (
        await client
          .post("/api/admin/blog/media/sign")
          .set("Cookie", cookie())
          .send({ kind: "image" })
      ).status,
    ).toBe(503);
  });
});
