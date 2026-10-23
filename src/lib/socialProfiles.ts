export type SocialPlatform = "instagram" | "facebook" | "tiktok";

export function socialProfileLink(
  platform: SocialPlatform,
  value: string | null | undefined,
): { handle: string; url: string } | null {
  const input = value?.trim();
  if (!input) {
    return null;
  }
  const domain = `${platform}.com`;
  let handle = input.replace(/^@/, "");
  if (input.includes("/") || input.includes(":")) {
    let candidate = input;
    if (!/^https?:\/\//i.test(candidate)) {
      candidate = `https://${candidate}`;
    }
    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      return null;
    }
    const host = parsed.hostname.toLowerCase().replace(/^(www|m|mbasic)\./, "");
    if (host !== domain || parsed.username || parsed.password) {
      return null;
    }
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (platform === "facebook" && segments[0] === "profile.php") {
      const id = parsed.searchParams.get("id");
      if (!id || !/^\d+$/.test(id)) {
        return null;
      }
      return { handle: id, url: `https://www.facebook.com/profile.php?id=${id}` };
    }
    if (platform === "facebook" && ["people", "pages"].includes(segments[0])) {
      if (segments.length !== 3 || !/^\d+$/.test(segments[2])) {
        return null;
      }
      return {
        handle: segments[2],
        url: `https://www.facebook.com/${segments.join("/")}`,
      };
    }
    handle = (segments[0] || "").replace(/^@/, "");
  }
  if (!/^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/.test(handle)) {
    return null;
  }
  let path = handle;
  if (platform === "tiktok") {
    path = `@${handle}`;
  }
  return { handle, url: `https://www.${domain}/${path}` };
}
