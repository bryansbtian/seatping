import {
  localizedPublicPath,
  unlocalizedPath,
  publicLanguageForPath,
  isLocalizedPublicPath,
} from "./publicLanguage.js";
import { translatePublic } from "./publicTranslations.js";

export const SITE_URL = "https://www.seatping.biz";
export const PLATFORM_TITLE = "SeatPing | Restaurant Queue, Reservations & Guest Management";
export const PLATFORM_DESCRIPTION =
  "SeatPing helps restaurants manage waitlists, reservations, floor operations, guest relationships, and marketing campaigns in one platform.";
export const PLATFORM_INTRO =
  "SeatPing is a restaurant management and guest engagement platform that connects restaurant discovery with guest-flow operations.";
export const PLATFORM_FEATURES = [
  [
    "Virtual Queues And Waitlists",
    "Let guests join a virtual queue and help staff manage arrivals.",
  ],
  [
    "Online Reservations",
    "Let guests book tables and manage reservations from the business dashboard.",
  ],
  [
    "Floor And Table Management",
    "Manage dining tables and use smart table assignments for reservations.",
  ],
  ["Guest CRM And Visit History", "Keep guest profiles and visit history together for your team."],
  ["Guest Engagement Campaigns", "Create SMS, WhatsApp, and email marketing campaigns."],
  [
    "Restaurant Discovery",
    "Help diners discover restaurants and explore public restaurant profiles.",
  ],
];

export type PageMeta = {
  title: string;
  description: string;
  image: string;
  url: string;
  type: string;
  robots?: string;
  structuredData?: Record<string, unknown>;
  author?: string;
  publishedAt?: string;
  updatedAt?: string;
  language?: string;
  alternates?: { language: string; url: string }[];
};

export const PUBLIC_PAGE_COPY: Record<string, { title: string; description: string }> = {
  "/": { title: PLATFORM_TITLE, description: PLATFORM_DESCRIPTION },
  "/business": {
    title: "SeatPing For Business | Restaurant Management & Guest Engagement",
    description:
      "Manage virtual queues, reservations, floor plans, smart table assignments, guest CRM, and SMS, WhatsApp, and email campaigns with SeatPing.",
  },
  "/blog": {
    title: "Restaurant Management And Guest Engagement Blog | SeatPing",
    description:
      "Explore SeatPing guides and updates on restaurant queues, reservations, floor operations, guest CRM, and marketing campaigns.",
  },
  "/terms": {
    title: "Terms Of Service | SeatPing",
    description:
      "Read the terms for using SeatPing, including accounts, restaurant queues, reservations, business services, and user responsibilities.",
  },
  "/policy": {
    title: "Privacy Policy | SeatPing",
    description:
      "Learn how SeatPing collects, uses, and protects information when guests and businesses use its restaurant and guest management services.",
  },
  "/help": {
    title: "Help And Support | SeatPing",
    description:
      "Find answers about SeatPing accounts, restaurant queues, reservations, business tools, and contacting support.",
  },
  "/feedback": {
    title: "Feedback | SeatPing",
    description:
      "Share feedback about SeatPing restaurant discovery, reservations, queues, and business tools with our team.",
  },
  "/login": {
    title: "Log In | SeatPing",
    description:
      "Log in to your SeatPing guest account to manage restaurant reservations, queue visits, and your profile.",
  },
  "/signup": {
    title: "Sign Up | SeatPing",
    description:
      "Create a SeatPing guest account to discover restaurants, book tables, and join virtual queues.",
  },
  "/business/login": {
    title: "Business Log In | SeatPing",
    description:
      "Log in to the SeatPing Business Portal to manage restaurant queues, reservations, tables, guests, and campaigns.",
  },
  "/business/signup": {
    title: "Business Sign Up | SeatPing",
    description:
      "Register your restaurant with SeatPing to manage guest flow, reservations, floor operations, guest CRM, and campaigns.",
  },
  "/forgot": {
    title: "Forgot Password | SeatPing",
    description: "Request a password reset for your SeatPing account.",
  },
  "/reset": {
    title: "Reset Password | SeatPing",
    description: "Set a new password for your SeatPing account.",
  },
};
export const INDEXABLE_STATIC_PATHS = [
  "/",
  "/business",
  "/blog",
  "/help",
  "/policy",
  "/terms",
  "/feedback",
];

export function isBusinessPath(pathname: string): boolean {
  return pathname === "/business" || pathname.startsWith("/business/");
}

export function isPrivatePath(pathname: string): boolean {
  const clean = unlocalizedPath(pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/");
  return (
    /^\/(admin|api|auth|profile|queue|reservations|tickets|login|signup|forgot|reset|search)(\/|$)/.test(
      clean,
    ) || clean.startsWith("/business/")
  );
}

export function platformStructuredData(): Record<string, unknown> {
  const organization = {
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: "SeatPing",
    url: `${SITE_URL}/`,
    logo: `${SITE_URL}/logo_nobg.png`,
    description: PLATFORM_DESCRIPTION,
  };
  return {
    "@context": "https://schema.org",
    "@graph": [
      organization,
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: "SeatPing",
        url: `${SITE_URL}/`,
        description: PLATFORM_DESCRIPTION,
        publisher: { "@id": organization["@id"] },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE_URL}/#application`,
        name: "SeatPing",
        url: `${SITE_URL}/business`,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description: PLATFORM_DESCRIPTION,
        featureList: PLATFORM_FEATURES.map(([title]) => title),
        publisher: { "@id": organization["@id"] },
      },
    ],
  };
}

export function metaForPath(pathname: string): PageMeta {
  const requestedPath = pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  const language = publicLanguageForPath(requestedPath);
  const clean = unlocalizedPath(requestedPath);
  let copy = PUBLIC_PAGE_COPY[clean];
  if (!copy) {
    copy = { title: "SeatPing", description: PLATFORM_DESCRIPTION };
    if (isBusinessPath(clean)) {
      copy = {
        title: "Business Portal | SeatPing",
        description: "Manage your restaurant in the SeatPing Business Portal.",
      };
    } else if (clean.startsWith("/admin")) {
      copy = { title: "Admin | SeatPing", description: "SeatPing administration." };
    }
  }
  let image = `${SITE_URL}/display2.jpeg`;
  if (isBusinessPath(clean)) {
    image = `${SITE_URL}/display.jpeg`;
  }
  const meta: PageMeta = {
    ...copy,
    title: translatePublic(language, copy.title),
    description: translatePublic(language, copy.description),
    image,
    url: `${SITE_URL}${localizedPublicPath(requestedPath, language)}`,
    type: "website",
    robots: "index, follow",
    language,
  };
  if (isPrivatePath(clean)) {
    meta.robots = "noindex, follow";
    if (clean.startsWith("/reservations/manage/")) {
      meta.url = `${SITE_URL}${localizedPublicPath("/", language).replace(/\/$/, "")}/reservations/manage`;
    }
  }
  if (clean === "/" || clean === "/business") {
    meta.structuredData = platformStructuredData();
  }
  if (!isPrivatePath(clean) && isLocalizedPublicPath(requestedPath)) {
    meta.alternates = [
      { language: "en", url: `${SITE_URL}${localizedPublicPath(clean, "en")}` },
      { language: "id", url: `${SITE_URL}${localizedPublicPath(clean, "id")}` },
      { language: "x-default", url: `${SITE_URL}${localizedPublicPath(clean, "en")}` },
    ];
  }
  return meta;
}
