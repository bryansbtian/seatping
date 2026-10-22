import type { BlogPost, BlogFields } from "@shared/blog";

export class BlogApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}
export async function blogRequest<T>(path: string, method = "GET", data?: unknown): Promise<T> {
  const response = await fetch(`/api/admin/blog${path}`, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = (await response.json().catch(() => {
    throw new BlogApiError(
      "The server returned an invalid response, so please try again.",
      response.status,
    );
  })) as { error?: string; code?: string } & T;
  if (!response.ok) {
    throw new BlogApiError(
      result.error || "The request failed, so please try again.",
      response.status,
      result.code,
    );
  }
  return result;
}

export class BlogSaveQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private stopped = false;
  constructor(
    public post: BlogPost,
    private write = blogRequest,
  ) {}
  save(fields: BlogFields): Promise<BlogPost> {
    const snapshot = structuredClone(fields);
    const result = this.tail.then(async () => {
      if (this.stopped) {
        throw new Error(
          "Saving paused because this post changed elsewhere. Copy your edits before reloading.",
        );
      }
      try {
        const saved = await this.write<{ post: BlogPost }>(`/${this.post.id}`, "PUT", {
          ...snapshot,
          revision: this.post.revision,
        });
        this.post = saved.post;
        return saved.post;
      } catch (error) {
        if (
          error instanceof BlogApiError &&
          error.status === 409 &&
          error.code === "REVISION_CONFLICT"
        ) {
          this.stopped = true;
        }
        throw error;
      }
    });
    this.tail = result.catch(() => {});
    return result;
  }
}

export async function uploadBlogMedia(
  file: File,
  onProgress: (progress: number) => void,
): Promise<string> {
  const imageTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  const videoTypes = ["video/mp4", "video/webm"];
  let kind = "image";
  let maxSize = 10 * 1024 * 1024;
  if (videoTypes.includes(file.type)) {
    kind = "video";
    maxSize = 50 * 1024 * 1024;
  } else if (!imageTypes.includes(file.type)) {
    throw new Error("Choose a JPEG, PNG, WebP, GIF, MP4, or WebM file.");
  }
  if (file.size > maxSize || file.size === 0) {
    throw new Error("Images allow up to 10 MB and videos up to 50 MB.");
  }
  const { upload } = await blogRequest<{
    upload: {
      cloudName: string;
      kind: string;
      public_id: string;
      [key: string]: string | number | boolean;
    };
  }>("/media/sign", "POST", { kind });
  const form = new FormData();
  form.append("file", file);
  for (const [key, value] of Object.entries(upload)) {
    if (!["cloudName", "kind"].includes(key)) {
      form.append(key, String(value));
    }
  }
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(upload.cloudName)}/${kind}/upload`,
    );
    xhr.timeout = 180000;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 95));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error("Upload failed. Check the file and try again."));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
    xhr.ontimeout = () => reject(new Error("Upload timed out. Please try again."));
    xhr.onabort = () => reject(new Error("Upload was cancelled."));
    xhr.send(form);
  });
  const result = await blogRequest<{ url: string }>("/media/commit", "POST", {
    id: upload.public_id,
  });
  onProgress(100);
  return result.url;
}
