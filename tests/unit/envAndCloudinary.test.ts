import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { behavior, sinks } from "../setup/externalMocks.js";

const ORIGINAL_ENV = { ...process.env };

const REQUIRED_IN_PROD = [
  "DATABASE_URL",
  "JWT_SECRET",
  "CRON_SECRET",
  "ADMIN_USERNAME",
  "ADMIN_PASSWORD_HASH",
  "EMAIL_PASSWORD",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "QSTASH_TOKEN",
  "QSTASH_CURRENT_SIGNING_KEY",
  "QSTASH_NEXT_SIGNING_KEY",
];

const OPTIONAL_PROVIDERS = [
  "TELNYX_API_KEY",
  "TELNYX_PHONE_NUMBER",
  "KAPSO_API_KEY",
  "KAPSO_PHONE_NUMBER_ID",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
];

async function loadEnvCheck() {
  vi.resetModules();
  return import("../../server/lib/envCheck.js");
}

async function loadCloudinary() {
  vi.resetModules();
  return import("../../server/lib/cloudinary.js");
}

function setCloudinaryEnv() {
  process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
  process.env.CLOUDINARY_API_KEY = "test-key";
  process.env.CLOUDINARY_API_SECRET = "test-secret";
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("logEnvStatus", () => {
  it("stays silent outside production", async () => {
    process.env.NODE_ENV = "test";
    const { logEnvStatus } = await loadEnvCheck();

    logEnvStatus();

    expect(console.error).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
  });

  it("names every missing required production variable", async () => {
    process.env.NODE_ENV = "production";
    for (const key of REQUIRED_IN_PROD) {
      delete process.env[key];
    }
    const { logEnvStatus } = await loadEnvCheck();

    logEnvStatus();

    const message = (console.error as any).mock.calls[0][0] as string;
    for (const key of REQUIRED_IN_PROD) {
      expect(message).toContain(key);
    }
  });

  it("warns rather than errors about unset optional providers", async () => {
    process.env.NODE_ENV = "production";
    for (const key of REQUIRED_IN_PROD) {
      process.env[key] = "set";
    }
    for (const key of OPTIONAL_PROVIDERS) {
      delete process.env[key];
    }
    const { logEnvStatus } = await loadEnvCheck();

    logEnvStatus();

    expect(console.error).not.toHaveBeenCalled();
    expect((console.warn as any).mock.calls[0][0]).toContain("KAPSO_API_KEY");
  });

  it("confirms a fully configured production environment", async () => {
    process.env.NODE_ENV = "production";
    for (const key of [...REQUIRED_IN_PROD, ...OPTIONAL_PROVIDERS]) {
      process.env[key] = "set";
    }
    const { logEnvStatus } = await loadEnvCheck();

    logEnvStatus();

    expect(console.error).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
    expect((console.log as any).mock.calls[0][0]).toContain("[env]");
  });

  it("reports only once per process", async () => {
    process.env.NODE_ENV = "production";
    for (const key of REQUIRED_IN_PROD) {
      delete process.env[key];
    }
    const { logEnvStatus } = await loadEnvCheck();

    logEnvStatus();
    logEnvStatus();

    expect((console.error as any).mock.calls).toHaveLength(1);
  });
});

describe("cloudinary configuration", () => {
  it("passes the guard once every credential is present", async () => {
    setCloudinaryEnv();
    const { assertCloudinaryConfigured } = await loadCloudinary();

    expect(() => assertCloudinaryConfigured()).not.toThrow();
  });

  it("names each missing credential in the error", async () => {
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
    const { assertCloudinaryConfigured } = await loadCloudinary();

    expect(() => assertCloudinaryConfigured()).toThrow(
      /CLOUDINARY_CLOUD_NAME.*CLOUDINARY_API_KEY.*CLOUDINARY_API_SECRET/,
    );
  });

  it("scopes a folder to the location and the image kind", async () => {
    const { locationFolder } = await loadCloudinary();

    expect(locationFolder("loc-1", "banner")).toBe("seatping/locations/loc-1/banner");
    expect(locationFolder("loc-1", "photo")).toBe("seatping/locations/loc-1/photo");
  });

  it("only accepts a public id inside the matching location folder", async () => {
    const { publicIdInLocationFolder } = await loadCloudinary();

    expect(publicIdInLocationFolder("seatping/locations/loc-1/banner/abc", "loc-1", "banner")).toBe(
      true,
    );
    expect(publicIdInLocationFolder("seatping/locations/loc-2/banner/abc", "loc-1", "banner")).toBe(
      false,
    );
    expect(publicIdInLocationFolder("seatping/locations/loc-1/photo/abc", "loc-1", "banner")).toBe(
      false,
    );
    expect(publicIdInLocationFolder(null, "loc-1", "banner")).toBe(false);
    expect(publicIdInLocationFolder(undefined, "loc-1", "banner")).toBe(false);
  });
});

describe("signLocationUpload", () => {
  it("returns the fields a browser upload needs", async () => {
    setCloudinaryEnv();
    const { signLocationUpload } = await loadCloudinary();

    const signed = signLocationUpload("loc-1", "photo");

    expect(signed.cloudName).toBe("test-cloud");
    expect(signed.apiKey).toBe("test-key");
    expect(signed.folder).toBe("seatping/locations/loc-1/photo");
    expect(signed.signature).toEqual(expect.any(String));
    expect(Number.isInteger(signed.timestamp)).toBe(true);
  });

  it("never returns a signature when the credentials are absent", async () => {
    delete process.env.CLOUDINARY_API_SECRET;
    const { signLocationUpload } = await loadCloudinary();

    expect(() => signLocationUpload("loc-1", "photo")).toThrow(/CLOUDINARY_API_SECRET/);
  });
});

describe("uploadImageBuffer", () => {
  it("uploads into the location folder and returns the stored image", async () => {
    setCloudinaryEnv();
    const { uploadImageBuffer } = await loadCloudinary();

    const uploaded = await uploadImageBuffer(Buffer.from("image-bytes"), "loc-1", "banner");

    expect(uploaded.url).toBe("https://test.invalid/image.jpg");
    expect(uploaded.publicId).toEqual(expect.any(String));
    expect(sinks().cloudinary[0].folder).toBe("seatping/locations/loc-1/banner");
  });

  it("rejects when the provider reports an error", async () => {
    setCloudinaryEnv();
    const { uploadImageBuffer } = await loadCloudinary();
    behavior().cloudinaryUploadError = "invalid image file";

    await expect(uploadImageBuffer(Buffer.from("bad"), "loc-1", "banner")).rejects.toThrow(
      "invalid image file",
    );
  });

  it("refuses to upload when the credentials are absent", async () => {
    delete process.env.CLOUDINARY_API_KEY;
    const { uploadImageBuffer } = await loadCloudinary();

    expect(() => uploadImageBuffer(Buffer.from("x"), "loc-1", "banner")).toThrow(
      /CLOUDINARY_API_KEY/,
    );
    expect(sinks().cloudinary).toHaveLength(0);
  });
});

describe("deleteImageByPublicId", () => {
  it("does nothing without a public id", async () => {
    setCloudinaryEnv();
    const { deleteImageByPublicId } = await loadCloudinary();

    await expect(deleteImageByPublicId(null)).resolves.toBeUndefined();
    await expect(deleteImageByPublicId(undefined)).resolves.toBeUndefined();
    await expect(deleteImageByPublicId("")).resolves.toBeUndefined();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("deletes a stored asset", async () => {
    setCloudinaryEnv();
    const { deleteImageByPublicId } = await loadCloudinary();

    await expect(
      deleteImageByPublicId("seatping/locations/loc-1/banner/abc"),
    ).resolves.toBeUndefined();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("warns instead of throwing when the delete cannot run", async () => {
    delete process.env.CLOUDINARY_API_SECRET;
    const { deleteImageByPublicId } = await loadCloudinary();

    await expect(
      deleteImageByPublicId("seatping/locations/loc-1/banner/abc"),
    ).resolves.toBeUndefined();
    expect((console.warn as any).mock.calls[0][0]).toContain("[cloudinary]");
  });
});
