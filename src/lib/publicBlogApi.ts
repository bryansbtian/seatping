export class PublicBlogError extends Error {
  constructor(public status: number) {
    super("Unable to load the blog.");
  }
}

export async function publicBlogRequest<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/blog${path}`, { signal });
  if (!response.ok) {
    throw new PublicBlogError(response.status);
  }
  return response.json() as Promise<T>;
}
