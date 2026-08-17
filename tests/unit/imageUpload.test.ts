import { afterEach, describe, expect, it, vi } from "vitest";
import {
  compressImage,
  uploadBanner,
  uploadPhoto,
} from "../../src/lib/imageUpload.js";

const SIGN_RESPONSE = {
  upload: {
    cloudName: "test-cloud",
    apiKey: "test-key",
    timestamp: 1700000000,
    folder: "seatping/locations/loc-1/banner",
    signature: "test-signature",
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      return body;
    },
  } as unknown as Response;
}

function smallFile(): File {
  return new File(["tiny"], "banner.jpg", { type: "image/jpeg" });
}

function largeFile(): File {
  return new File(["x".repeat(700 * 1024)], "banner.jpg", {
    type: "image/jpeg",
  });
}

type FetchCall = [string, RequestInit];

function stubFetch(
  overrides: Record<string, () => Response> = {},
): { calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    calls.push([url, init]);
    for (const [fragment, make] of Object.entries(overrides)) {
      if (url.includes(fragment)) {
        return make();
      }
    }
    if (url.includes("api.cloudinary.com")) {
      return jsonResponse({
        secure_url: "https://res.test.invalid/banner.jpg",
        public_id: "seatping/locations/loc-1/banner/abc",
      });
    }
    if (url.includes("/sign")) {
      return jsonResponse(SIGN_RESPONSE);
    }
    return jsonResponse({ ok: true });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

type Canvas = {
  width: number;
  height: number;
  getContext: () => unknown;
  toBlob: (cb: (blob: Blob | null) => void) => void;
};

function stubCanvas(options: {
  context?: unknown;
  blob?: Blob | null;
}): { canvas: Canvas; drawn: unknown[][] } {
  const drawn: unknown[][] = [];
  let context: unknown = {
    drawImage: (...args: unknown[]) => {
      drawn.push(args);
    },
  };
  if ("context" in options) {
    context = options.context;
  }
  let blob: Blob | null = new Blob(["small"]);
  if ("blob" in options) {
    blob = options.blob ?? null;
  }
  const canvas: Canvas = {
    width: 0,
    height: 0,
    getContext: () => {
      return context;
    },
    toBlob: (cb) => {
      cb(blob);
    },
  };
  vi.stubGlobal("document", {
    createElement: () => {
      return canvas;
    },
  });
  return { canvas, drawn };
}

function stubBitmap(width: number, height: number): { closed: boolean } {
  const state = { closed: false };
  vi.stubGlobal("createImageBitmap", async () => {
    return {
      width,
      height,
      close: () => {
        state.closed = true;
      },
    };
  });
  return state;
}

describe("compressImage", () => {
  it("returns the original file when it is already small", async () => {
    const file = smallFile();

    await expect(compressImage(file)).resolves.toBe(file);
  });

  it("returns the original file when the image cannot be decoded", async () => {
    const file = largeFile();

    await expect(compressImage(file)).resolves.toBe(file);
  });

  it("re-encodes an oversized image and releases the bitmap", async () => {
    const closed = stubBitmap(800, 600);
    const { canvas, drawn } = stubCanvas({});

    const result = await compressImage(largeFile());

    expect(result).toBeInstanceOf(Blob);
    expect(result.size).toBeLessThan(700 * 1024);
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(600);
    expect(drawn).toHaveLength(1);
    expect(closed.closed).toBe(true);
  });

  it("scales an image down to fit the longest side", async () => {
    stubBitmap(4000, 2000);
    const { canvas } = stubCanvas({});

    await compressImage(largeFile());

    expect(canvas.width).toBe(1920);
    expect(canvas.height).toBe(960);
  });

  it("keeps the original when the canvas has no 2d context", async () => {
    stubBitmap(800, 600);
    stubCanvas({ context: null });
    const file = largeFile();

    await expect(compressImage(file)).resolves.toBe(file);
  });

  it("keeps the original when the canvas produces no blob", async () => {
    stubBitmap(800, 600);
    stubCanvas({ blob: null });
    const file = largeFile();

    await expect(compressImage(file)).resolves.toBe(file);
  });

  it("keeps the original when re-encoding would not save bytes", async () => {
    stubBitmap(800, 600);
    stubCanvas({ blob: new Blob(["y".repeat(900 * 1024)]) });
    const file = largeFile();

    await expect(compressImage(file)).resolves.toBe(file);
  });

  it("falls back to an object url when bitmaps are unavailable", async () => {
    const revoked: string[] = [];
    vi.stubGlobal("createImageBitmap", undefined);
    vi.stubGlobal("URL", {
      createObjectURL: () => {
        return "blob:test";
      },
      revokeObjectURL: (url: string) => {
        revoked.push(url);
      },
    });
    vi.stubGlobal(
      "Image",
      class {
        public onload: (() => void) | null = null;
        public onerror: (() => void) | null = null;
        public naturalWidth = 640;
        public naturalHeight = 480;
        public set src(_value: string) {
          this.onload?.();
        }
      },
    );
    const { canvas } = stubCanvas({});

    const result = await compressImage(largeFile());

    expect(result).toBeInstanceOf(Blob);
    expect(canvas.width).toBe(640);
    expect(revoked).toEqual(["blob:test"]);
  });

  it("keeps the original when the fallback image fails to decode", async () => {
    const revoked: string[] = [];
    vi.stubGlobal("createImageBitmap", undefined);
    vi.stubGlobal("URL", {
      createObjectURL: () => {
        return "blob:broken";
      },
      revokeObjectURL: (url: string) => {
        revoked.push(url);
      },
    });
    vi.stubGlobal(
      "Image",
      class {
        public onload: (() => void) | null = null;
        public onerror: (() => void) | null = null;
        public set src(_value: string) {
          this.onerror?.();
        }
      },
    );
    const file = largeFile();

    await expect(compressImage(file)).resolves.toBe(file);
    expect(revoked).toEqual(["blob:broken"]);
  });
});

describe("uploadBanner", () => {
  it("signs, uploads to the provider, then commits", async () => {
    const { calls } = stubFetch();

    const result = await uploadBanner("loc-1", smallFile());

    expect(calls.map(([url]) => url)).toEqual([
      "/api/locations/loc-1/banner/sign",
      "https://api.cloudinary.com/v1_1/test-cloud/image/upload",
      "/api/locations/loc-1/banner/commit",
    ]);
    expect(result).toEqual({ ok: true });
  });

  it("posts the signed fields to the provider", async () => {
    const { calls } = stubFetch();

    await uploadBanner("loc-1", smallFile());

    const form = calls[1][1].body as FormData;
    expect(form.get("api_key")).toBe("test-key");
    expect(form.get("timestamp")).toBe("1700000000");
    expect(form.get("folder")).toBe("seatping/locations/loc-1/banner");
    expect(form.get("signature")).toBe("test-signature");
  });

  it("sends the uploaded url and public id to the commit endpoint", async () => {
    const { calls } = stubFetch();

    await uploadBanner("loc-1", smallFile());

    expect(JSON.parse(calls[2][1].body as string)).toEqual({
      url: "https://res.test.invalid/banner.jpg",
      publicId: "seatping/locations/loc-1/banner/abc",
    });
  });

  it("surfaces the provider error message", async () => {
    stubFetch({
      "api.cloudinary.com": () => {
        return jsonResponse({ error: { message: "File too large" } }, 400);
      },
    });

    await expect(uploadBanner("loc-1", smallFile())).rejects.toThrow(
      "File too large",
    );
  });

  it("falls back to the status code when the provider sends no JSON", async () => {
    stubFetch({
      "api.cloudinary.com": () => {
        return {
          ok: false,
          status: 502,
          json: async () => {
            throw new Error("not json");
          },
        } as unknown as Response;
      },
    });

    await expect(uploadBanner("loc-1", smallFile())).rejects.toThrow(/502/);
  });

  it("stops before uploading when signing is refused", async () => {
    const { calls } = stubFetch({
      "/sign": () => {
        return jsonResponse({ error: "Not your location" }, 403);
      },
    });

    await expect(uploadBanner("loc-1", smallFile())).rejects.toThrow(
      "Not your location",
    );
    expect(calls).toHaveLength(1);
  });
});

describe("uploadPhoto", () => {
  it("uses the photo sign and commit endpoints", async () => {
    const { calls } = stubFetch();

    await uploadPhoto("loc-9", smallFile());

    expect(calls.map(([url]) => url)).toEqual([
      "/api/locations/loc-9/photos/sign",
      "https://api.cloudinary.com/v1_1/test-cloud/image/upload",
      "/api/locations/loc-9/photos/commit",
    ]);
  });

  it("propagates a rejected commit", async () => {
    stubFetch({
      "/commit": () => {
        return jsonResponse({ error: "Photo limit reached" }, 409);
      },
    });

    await expect(uploadPhoto("loc-9", smallFile())).rejects.toThrow(
      "Photo limit reached",
    );
  });
});
