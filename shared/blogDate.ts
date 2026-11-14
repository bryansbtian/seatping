export function formatBlogDate(value: string, month: "short" | "long" = "short"): string {
  return new Date(value).toLocaleDateString("en-US", {
    month,
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
