export function isBlogCoverVideo(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "res.cloudinary.com" &&
      /^\/[^/]+\/video\/upload\/.+\.(mp4|webm)$/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

export function blogCoverThumbnail(value: string): string {
  if (!isBlogCoverVideo(value)) {
    return value;
  }
  const url = new URL(value);
  url.pathname = url.pathname
    .replace("/video/upload/", "/video/upload/so_0/")
    .replace(/\.(mp4|webm)$/i, ".jpg");
  return url.toString();
}
