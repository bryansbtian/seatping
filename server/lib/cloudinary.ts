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

const BASE_FOLDER = "seatping/locations";

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

export function publicIdInLocationFolder(
  publicId: string | null | undefined,
  locationId: string,
  kind: "banner" | "photo"
): boolean {
  if (!publicId) return false;
  return publicId.startsWith(`${locationFolder(locationId, kind)}/`);
}

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
