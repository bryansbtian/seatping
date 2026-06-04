// src/lib/imageUpload.ts
//
// Direct-to-Cloudinary image uploads for location media (banner + gallery).
//
// Why not just POST the file to our own API? Vercel Serverless Functions cap the
// request body at ~4.5MB, so a single phone photo can trip a 413
// (FUNCTION_PAYLOAD_TOO_LARGE). Instead we:
//   1. Downscale + re-encode the image in the browser (compressImage), then
//   2. Ask our backend for a short-lived Cloudinary signature (/sign), then
//   3. Upload the bytes DIRECTLY to Cloudinary (never touching our function), then
//   4. Hand the returned url/publicId back to our backend to persist (/commit).
// The API secret stays server-side; the signature only authorizes an upload into
// this location's folder, which /commit re-verifies.
import { api } from "./api";

// Longest edge (px) after downscale, and JPEG quality for re-encoding. 1920px at
// q0.82 keeps gallery/banner images crisp on retina while landing well under 1MB.
const MAX_DIMENSION = 1920;
const TARGET_QUALITY = 0.82;
// Files already this small aren't worth re-encoding (it can even grow them).
const SKIP_COMPRESS_BELOW = 600 * 1024;

type SignData = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  signature: string;
};

function fitWithin(w: number, h: number, max: number) {
  if (w <= max && h <= max) return { width: w, height: h };
  const scale = Math.min(max / w, max / h);
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

async function loadImage(
  file: File
): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  }
  // Fallback for browsers without createImageBitmap.
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not decode image"));
      img.src = url;
    });
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

/**
 * Downscale + re-encode an image so the upload payload is small and dimensions
 * are web-sane. Falls back to the original file if the browser can't decode it
 * or re-encoding wouldn't shrink it, so the upload still proceeds.
 */
export async function compressImage(file: File): Promise<Blob> {
  if (file.size <= SKIP_COMPRESS_BELOW) return file;
  try {
    const img = await loadImage(file);
    try {
      const { width, height } = fitWithin(img.width, img.height, MAX_DIMENSION);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.drawImage(img.source, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", TARGET_QUALITY)
      );
      // Keep whichever is smaller — re-encoding can occasionally inflate.
      return blob && blob.size < file.size ? blob : file;
    } finally {
      img.close();
    }
  } catch {
    return file;
  }
}

/** Upload an image blob straight to Cloudinary using a server-signed request. */
async function uploadToCloudinary(
  blob: Blob,
  sign: SignData
): Promise<{ url: string; publicId: string }> {
  const fd = new FormData();
  fd.append("file", blob);
  fd.append("api_key", sign.apiKey);
  fd.append("timestamp", String(sign.timestamp));
  fd.append("folder", sign.folder);
  fd.append("signature", sign.signature);

  const resp = await fetch(
    `https://api.cloudinary.com/v1_1/${sign.cloudName}/image/upload`,
    { method: "POST", body: fd }
  );
  let json: any = null;
  try {
    json = await resp.json();
  } catch {
    /* non-JSON error body */
  }
  if (!resp.ok) {
    throw new Error(
      json?.error?.message || `Cloudinary upload failed (${resp.status})`
    );
  }
  return { url: json.secure_url, publicId: json.public_id };
}

/** Upload + persist a location banner. Returns the refreshed business `user`. */
export async function uploadBanner(
  locationId: string,
  file: File
): Promise<{ banner: { url: string; publicId: string }; user: any }> {
  const blob = await compressImage(file);
  const { upload } = await api(`/api/locations/${locationId}/banner/sign`, {
    method: "POST",
  });
  const { url, publicId } = await uploadToCloudinary(blob, upload as SignData);
  return api(`/api/locations/${locationId}/banner/commit`, {
    method: "POST",
    body: JSON.stringify({ url, publicId }),
  });
}

/** Upload + persist ONE gallery photo. Returns the created photo + refreshed user. */
export async function uploadPhoto(
  locationId: string,
  file: File
): Promise<{ photo: any; user: any }> {
  const blob = await compressImage(file);
  const { upload } = await api(`/api/locations/${locationId}/photos/sign`, {
    method: "POST",
  });
  const { url, publicId } = await uploadToCloudinary(blob, upload as SignData);
  return api(`/api/locations/${locationId}/photos/commit`, {
    method: "POST",
    body: JSON.stringify({ url, publicId }),
  });
}
