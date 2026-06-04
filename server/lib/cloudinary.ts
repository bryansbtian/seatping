// server/lib/cloudinary.ts
//
// Cloudinary image storage — used ONLY from the backend so the API secret is
// never exposed to the browser. Configured from environment variables:
//   CLOUDINARY_CLOUD_NAME  — your Cloudinary "Cloud name" (dashboard top)
//   CLOUDINARY_API_KEY     — API key from Settings → API Keys
//   CLOUDINARY_API_SECRET  — API secret (keep this private)
//
// If any of these are missing, uploads throw a clear error (see assertConfigured).
import { v2 as cloudinary } from "cloudinary";

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

cloudinary.config({
  cloud_name: CLOUD_NAME,
  api_key: API_KEY,
  api_secret: API_SECRET,
  secure: true,
});

/** Folder all SeatPing location media is stored under in Cloudinary. */
const BASE_FOLDER = "seatping/locations";

/**
 * Throw a descriptive error if Cloudinary env vars are not configured. Called
 * at the start of every upload/delete so misconfiguration surfaces as a clean
 * 500 with an actionable message rather than a cryptic SDK failure.
 */
export function assertCloudinaryConfigured() {
  const missing: string[] = [];
  if (!CLOUD_NAME) missing.push("CLOUDINARY_CLOUD_NAME");
  if (!API_KEY) missing.push("CLOUDINARY_API_KEY");
  if (!API_SECRET) missing.push("CLOUDINARY_API_SECRET");
  if (missing.length > 0) {
    throw new Error(
      `Cloudinary is not configured. Missing env var(s): ${missing.join(
        ", "
      )}. Add them to your .env (copy from console.cloudinary.com) and restart the server.`
    );
  }
}

export type UploadedImage = { url: string; publicId: string };

/** Cloudinary folder a given location/kind uploads land in. */
export function locationFolder(
  locationId: string,
  kind: "banner" | "photo"
): string {
  return `${BASE_FOLDER}/${locationId}/${kind}`;
}

export type UploadSignature = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  signature: string;
};

/**
 * Produce a short-lived signature so the BROWSER can upload an image directly to
 * Cloudinary (bypassing our serverless function and its ~4.5MB body limit). The
 * API secret stays server-side: we only sign `folder` + `timestamp`, which the
 * client must echo back verbatim alongside the file. The returned publicId is
 * later verified against `locationFolder` in the commit route so a client can't
 * point us at an asset outside its own folder.
 */
export function signLocationUpload(
  locationId: string,
  kind: "banner" | "photo"
): UploadSignature {
  assertCloudinaryConfigured();
  const timestamp = Math.round(Date.now() / 1000);
  const folder = locationFolder(locationId, kind);
  const signature = cloudinary.utils.api_sign_request(
    { folder, timestamp },
    API_SECRET as string
  );
  return {
    cloudName: CLOUD_NAME as string,
    apiKey: API_KEY as string,
    timestamp,
    folder,
    signature,
  };
}

/** True if `publicId` lives inside the expected location/kind folder. */
export function publicIdInLocationFolder(
  publicId: string | null | undefined,
  locationId: string,
  kind: "banner" | "photo"
): boolean {
  if (!publicId) return false;
  return publicId.startsWith(`${locationFolder(locationId, kind)}/`);
}

/**
 * Upload an in-memory image buffer to Cloudinary and return its secure URL +
 * publicId. `kind` picks the subfolder (banner vs gallery photo).
 */
export function uploadImageBuffer(
  buffer: Buffer,
  locationId: string,
  kind: "banner" | "photo"
): Promise<UploadedImage> {
  assertCloudinaryConfigured();
  return new Promise<UploadedImage>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `${BASE_FOLDER}/${locationId}/${kind}`,
        resource_type: "image",
        // Reject anything that isn't an image at the Cloudinary level too.
        allowed_formats: ["jpg", "jpeg", "png", "webp"],
      },
      (error, result) => {
        if (error || !result) {
          return reject(
            error instanceof Error ? error : new Error("Cloudinary upload failed")
          );
        }
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    stream.end(buffer);
  });
}

/**
 * Best-effort delete of a Cloudinary asset by publicId. Never throws — a failed
 * remote delete must not block removing the DB record (we log and move on).
 */
export async function deleteImageByPublicId(
  publicId: string | null | undefined
): Promise<void> {
  if (!publicId) return;
  try {
    assertCloudinaryConfigured();
    await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
  } catch (err: any) {
    console.warn(
      `[cloudinary] failed to delete asset ${publicId}:`,
      err?.message || err
    );
  }
}
