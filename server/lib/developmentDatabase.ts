export function assertLocalDevelopmentDatabase(raw: string | undefined): string {
  let url: URL;
  try {
    url = new URL(raw || "");
  } catch {
    throw new Error("Development requires a local PostgreSQL DATABASE_URL and DIRECT_URL.");
  }
  const database = decodeURIComponent(url.pathname.slice(1));
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !/(^|[_-])(dev|development|test)([_-]|$)/i.test(database) ||
    /prod/i.test(database)
  ) {
    throw new Error(
      "Development cannot connect to a hosted or production database. Use a local database named seatping_dev.",
    );
  }
  return url.toString();
}

export function guardDevelopmentDatabase(): void {
  if (process.env.NODE_ENV !== "development") {
    return;
  }
  assertLocalDevelopmentDatabase(process.env.DATABASE_URL);
  assertLocalDevelopmentDatabase(process.env.DIRECT_URL);
}
