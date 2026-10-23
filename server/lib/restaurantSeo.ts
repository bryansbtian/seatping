import { prisma } from "./prisma.js";
import { SITE_URL, type PageMeta } from "../../shared/pageMeta.js";
import { escapeBlogHtml as escape } from "../../shared/publicBlog.js";

export async function restaurantSeo(username: string, locationId: string) {
  const business = await prisma.business.findUnique({
    where: { username },
    select: { id: true, name: true, username: true },
  });
  if (!business) {
    return null;
  }
  const location = await prisma.location.findFirst({
    where: { id: locationId, businessId: business.id },
    select: {
      name: true,
      displayName: true,
      address: true,
      city: true,
      restaurantProfile: true,
      isPublished: true,
      bannerImageUrl: true,
    },
  });
  if (!location) {
    return null;
  }
  let profile: Record<string, unknown> = {};
  if (
    location.restaurantProfile &&
    typeof location.restaurantProfile === "object" &&
    !Array.isArray(location.restaurantProfile)
  ) {
    profile = location.restaurantProfile;
  }
  const url = `${SITE_URL}/${encodeURIComponent(business.username)}/${encodeURIComponent(locationId)}`;
  if (!location.isPublished || profile.isPublished === false) {
    return {
      meta: {
        title: "Restaurant | SeatPing",
        description: "Restaurant details on SeatPing.",
        image: `${SITE_URL}/display2.jpeg`,
        url,
        type: "website",
        robots: "noindex, follow",
      } satisfies PageMeta,
      body: "",
    };
  }
  let name = business.name || location.displayName || location.name || "Restaurant";
  if (typeof profile.displayName === "string" && profile.displayName.trim()) {
    name = profile.displayName;
  }
  let description = `Explore ${name} on SeatPing for restaurant details, reservations, and virtual queue options.`;
  if (typeof profile.description === "string" && profile.description.trim()) {
    description = profile.description.trim().replace(/\s+/g, " ").slice(0, 160);
  }
  const meta: PageMeta = {
    title: `${name} | SeatPing`,
    description,
    image: location.bannerImageUrl || `${SITE_URL}/display2.jpeg`,
    url,
    type: "website",
    robots: "index, follow",
  };
  const body = `<nav><a href="/">SeatPing</a> <a href="/search">Find Restaurants</a></nav><h1>${escape(name)}</h1><p>${escape(description)}</p><p>${escape(location.address)}</p>`;
  return { meta, body };
}
