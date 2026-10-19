import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { loadRestaurantCollation, restaurantCollationSql } from "./restaurantCollation.js";
import {
  RESTAURANT_PAGE_SIZE,
  type RestaurantSearchRequest,
  type SearchFacets,
  type SearchResponse,
  type SearchResult,
  type SortKey,
} from "../../shared/restaurantDiscovery.js";

export type RestaurantSearchOptions = RestaurantSearchRequest & {
  versionTwo: boolean;
  limit: number | null;
};

const SORTS: SortKey[] = [
  "recommended",
  "rating",
  "reviews",
  "name-az",
  "name-za",
  "price-asc",
  "price-desc",
];

type LocalClock = { timezone: string; weekday: string; time: string };

export function restaurantSearchClocks(timezones: string[], now: Date): LocalClock[] {
  const clocks: LocalClock[] = [];
  for (const timezone of new Set(timezones)) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        weekday: "long",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).formatToParts(now);
      const weekday = parts.find((part) => part.type === "weekday")?.value.toLowerCase();
      if (weekday) {
        const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
        const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
        clocks.push({ timezone, weekday, time: `${hour}:${minute}` });
      }
    } catch {
      continue;
    }
  }
  return clocks;
}

function record(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return null;
}

export function restaurantOpenNow(openingHours: unknown, now = new Date()): boolean | null {
  const hours = record(openingHours);
  if (!hours) {
    return null;
  }
  let timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (typeof hours.timezone === "string" && hours.timezone) {
    timezone = hours.timezone;
  }
  const clock = restaurantSearchClocks([timezone], now)[0];
  if (!clock) {
    return null;
  }
  const day = record(hours[clock.weekday]);
  if (!day?.enabled) {
    return false;
  }
  const open = String(day.open || "");
  const close = String(day.close || "");
  if (!/^\d{2}:\d{2}$/.test(open) || !/^\d{2}:\d{2}$/.test(close)) {
    return null;
  }
  if (close <= open) {
    return clock.time >= open || clock.time < close;
  }
  return clock.time >= open && clock.time < close;
}

function text(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return "";
}

function selected(value: unknown): string | null {
  return text(value) || null;
}

function selections(value: unknown): string[] {
  let values: unknown[] = [];
  if (typeof value === "string") {
    values = [value];
  } else if (Array.isArray(value)) {
    values = value;
  }
  return Array.from(
    new Set(values.filter((item): item is string => typeof item === "string" && item.length > 0)),
  );
}

function enabled(value: unknown): boolean {
  return value === "1" || value === "true";
}

export function restaurantSearchOptions(query: Record<string, unknown>): RestaurantSearchOptions {
  const versionTwo = query.version === "2";
  let limit: number | null = null;
  const rawLimit = Number.parseInt(text(query.limit), 10);
  if (Number.isFinite(rawLimit) && rawLimit > 0) {
    limit = Math.min(rawLimit, 100);
  }
  if (versionTwo) {
    limit = RESTAURANT_PAGE_SIZE;
  }
  let page = Number.parseInt(text(query.page), 10);
  if (!Number.isSafeInteger(page) || page < 1 || page > 2147483647) {
    page = 1;
  }
  let sort: SortKey = "recommended";
  const requestedSort = SORTS.find((value) => value === query.sort);
  if (requestedSort) {
    sort = requestedSort;
  }
  const minRating = Array.from(
    new Set(
      selections(query.minRating)
        .map(Number)
        .filter((rating) => Number.isFinite(rating) && rating >= 0 && rating <= 5),
    ),
  );
  return {
    query: text(query.query).trim(),
    versionTwo,
    limit,
    page,
    sort,
    cuisine: selections(query.cuisine),
    price: selections(query.price),
    minRating,
    location: selected(query.location),
    queue: enabled(query.queue),
    reservations: enabled(query.reservations) || enabled(query.reservation),
    openNow: enabled(query.openNow),
  };
}

function ordering(options: RestaurantSearchOptions, collation: Prisma.Sql): Prisma.Sql {
  const stable = Prisma.sql`"createdAt" DESC, "locationId" ASC`;
  if (!options.versionTwo) {
    return stable;
  }
  switch (options.sort) {
    case "rating":
      return Prisma.sql`COALESCE(rating, 0) DESC, ${stable}`;
    case "reviews":
      return Prisma.sql`"reviewCount" DESC, ${stable}`;
    case "name-az":
      return Prisma.sql`name COLLATE ${collation} ASC, ${stable}`;
    case "name-za":
      return Prisma.sql`name COLLATE ${collation} DESC, ${stable}`;
    case "price-asc":
      return Prisma.sql`length(NULLIF("priceRange", '')) ASC NULLS LAST, ${stable}`;
    case "price-desc":
      return Prisma.sql`length(NULLIF("priceRange", '')) DESC NULLS LAST, ${stable}`;
    default:
      return Prisma.sql`featured DESC, ${stable}`;
  }
}

export function buildRestaurantSearchQuery(
  options: RestaurantSearchOptions,
  clocks: LocalClock[] = [],
  collation: Prisma.Sql = restaurantCollationSql(null),
): Prisma.Sql {
  const filters: Prisma.Sql[] = [];
  if (options.versionTwo) {
    if (options.cuisine.length > 0) {
      filters.push(Prisma.sql`cuisine IN (${Prisma.join(options.cuisine)})`);
    }
    if (options.price.length > 0) {
      filters.push(Prisma.sql`"priceRange" IN (${Prisma.join(options.price)})`);
    }
    if (options.minRating.length > 0) {
      filters.push(Prisma.sql`rating >= ${Math.min(...options.minRating)}`);
    }
    if (options.location) {
      filters.push(Prisma.sql`"areaLabel" = ${options.location}`);
    }
    if (options.queue) {
      filters.push(Prisma.sql`"queueEnabled" = true`);
    }
    if (options.reservations) {
      filters.push(Prisma.sql`"reservationsEnabled" = true`);
    }
    if (options.openNow) {
      filters.push(Prisma.sql`"openNow" = true`);
    }
  }
  let predicate = Prisma.sql`true`;
  if (filters.length > 0) {
    predicate = Prisma.join(filters, " AND ");
  }
  let pagination = Prisma.empty;
  if (options.limit !== null) {
    pagination = Prisma.sql`LIMIT ${options.limit} OFFSET ${(options.page - 1) * options.limit}`;
  }
  const order = ordering(options, collation);
  const defaultTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return Prisma.sql`
    WITH matched AS MATERIALIZED (
      SELECT l.id AS "locationId", l."createdAt", b.username AS "businessUsername",
        b.name AS "businessName",
        COALESCE(NULLIF(l."restaurantProfile"->>'displayName', ''), NULLIF(b.name, ''),
          NULLIF(l."displayName", ''), NULLIF(l.name, ''), 'Restaurant') AS name,
        COALESCE(NULLIF(l."restaurantProfile"->>'shortAddress', ''), NULLIF(l."displayName", ''),
          NULLIF(l.area, ''), NULLIF(l.city, '')) AS "shortAddress",
        l."displayName" AS "locationDisplayName",
        l."restaurantProfile"->>'description' AS description,
        l."restaurantProfile"->>'tagline' AS tagline,
        CASE WHEN jsonb_typeof(l."restaurantProfile"->'cuisineTypes') = 'array'
          AND jsonb_array_length(l."restaurantProfile"->'cuisineTypes') > 0
          THEN COALESCE(l."restaurantProfile"->'cuisineTypes'->>0, 'null') END AS cuisine,
        l."restaurantProfile"->>'priceRange' AS "priceRange",
        COALESCE(l.address, '') AS address, l.area, l.city,
        l."bannerImageUrl", l."queueEnabled", l."reservationsEnabled",
        l."restaurantProfile"->'openingHours' AS "openingHours",
        COALESCE(NULLIF(l.area, ''), NULLIF(l."displayName", ''), NULLIF(l.city, ''), '') AS "areaLabel"
      FROM locations l LEFT JOIN businesses b ON b.id = l."businessId"
      WHERE l."isPublished" = true AND (
        ${options.query} = '' OR EXISTS (
          SELECT 1 FROM unnest(ARRAY[
            l."displayName", l.name, l.address, l.area, l.city, l.country, b.username, b.name,
            l."restaurantProfile"->>'displayName', l."restaurantProfile"->>'tagline',
            l."restaurantProfile"->>'description', l."restaurantProfile"->>'priceRange',
            l."restaurantProfile"->'details'->>'city', l."restaurantProfile"->'details'->>'area',
            l."restaurantProfile"->'details'->>'address'
          ]) AS field(value)
          WHERE strpos(lower(field.value COLLATE ${collation}), lower(${options.query} COLLATE ${collation})) > 0
        ) OR EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(l."restaurantProfile"->'cuisineTypes') = 'array'
              THEN l."restaurantProfile"->'cuisineTypes' ELSE '[]'::jsonb END
          ) AS cuisine(value) WHERE strpos(lower(cuisine.value COLLATE ${collation}), lower(${options.query} COLLATE ${collation})) > 0
        )
      )
    ), local_clocks AS (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(clocks)}::jsonb)
        AS c(timezone text, weekday text, time text)
    ), review_summaries AS (
      SELECT r."locationId", round(avg(r.rating), 1)::float8 AS rating,
        count(*)::integer AS "reviewCount"
      FROM reviews r JOIN matched m ON m."locationId" = r."locationId"
      GROUP BY r."locationId"
    ), enriched AS MATERIALIZED (
      SELECT m.*, r.rating, COALESCE(r."reviewCount", 0) AS "reviewCount",
        EXISTS (SELECT 1 FROM featured_restaurants f
          WHERE f."locationId" = m."locationId" AND f."isActive" = true) AS featured,
        CASE
          WHEN jsonb_typeof(m."openingHours") NOT IN ('object', 'array') OR m."openingHours" IS NULL
            OR clock.timezone IS NULL THEN NULL
          WHEN jsonb_typeof(hours.day) <> 'object' OR hours.day IS NULL
            OR COALESCE(hours.day->'enabled', 'null'::jsonb) IN ('false'::jsonb, 'null'::jsonb, '0'::jsonb, '""'::jsonb)
            THEN false
          WHEN COALESCE(hours.day->>'open', '') !~ '^[0-9]{2}:[0-9]{2}$'
            OR COALESCE(hours.day->>'close', '') !~ '^[0-9]{2}:[0-9]{2}$' THEN NULL
          WHEN hours.day->>'close' <= hours.day->>'open'
            THEN clock.time >= hours.day->>'open' OR clock.time < hours.day->>'close'
          ELSE clock.time >= hours.day->>'open' AND clock.time < hours.day->>'close'
        END AS "openNow"
      FROM matched m LEFT JOIN review_summaries r ON r."locationId" = m."locationId"
      LEFT JOIN local_clocks clock ON clock.timezone = COALESCE(
        NULLIF(CASE WHEN jsonb_typeof(m."openingHours"->'timezone') = 'string'
          THEN m."openingHours"->>'timezone' END, ''), ${defaultTimezone})
      CROSS JOIN LATERAL (SELECT m."openingHours"->clock.weekday AS day) hours
    ), filtered AS MATERIALIZED (
      SELECT * FROM enriched WHERE ${predicate}
    ), page AS (
      SELECT * FROM filtered ORDER BY ${order} ${pagination}
    ), presented AS (
      SELECT p.*, COALESCE(NULLIF(p."bannerImageUrl", ''), (
        SELECT photo.url FROM photos photo WHERE photo."locationId" = p."locationId"
        ORDER BY photo."createdAt" ASC, photo.id ASC LIMIT 1
      )) AS "resolvedBanner"
      FROM page p
    )
    SELECT (SELECT count(*)::integer FROM filtered) AS total,
      COALESCE((SELECT jsonb_agg(
        (to_jsonb(p) - 'createdAt' - 'areaLabel' - 'resolvedBanner') ||
        jsonb_build_object('bannerImageUrl', p."resolvedBanner") ORDER BY ${order}
      ) FROM presented p), '[]'::jsonb) AS results,
      jsonb_build_object(
        'cuisines', COALESCE((SELECT jsonb_agg(cuisine ORDER BY cuisine)
          FROM (SELECT DISTINCT cuisine FROM matched WHERE cuisine IS NOT NULL AND cuisine <> '') c), '[]'::jsonb),
        'locations', COALESCE((SELECT jsonb_agg("areaLabel" ORDER BY "areaLabel")
          FROM (SELECT DISTINCT "areaLabel" FROM matched WHERE "areaLabel" <> '') a), '[]'::jsonb)
      ) AS facets
  `;
}

export async function searchRestaurants(options: RestaurantSearchOptions): Promise<SearchResponse> {
  const now = new Date();
  const collation = await loadRestaurantCollation();
  type Row = {
    total: number;
    results: (SearchResult & { openingHours?: unknown })[];
    facets: SearchFacets;
  };
  const fetchRows = (database: Pick<Prisma.TransactionClient, "$queryRaw">, clocks: LocalClock[]) =>
    database.$queryRaw<Row[]>(buildRestaurantSearchQuery(options, clocks, collation));
  let rows: Row[];
  if (options.versionTwo && options.openNow) {
    const defaultTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    rows = await prisma.$transaction(
      async (transaction) => {
        const timezones = await transaction.$queryRaw<{ timezone: string }[]>(Prisma.sql`
        SELECT DISTINCT COALESCE(NULLIF(CASE
          WHEN jsonb_typeof("restaurantProfile"->'openingHours'->'timezone') = 'string'
            THEN "restaurantProfile"->'openingHours'->>'timezone' END, ''), ${defaultTimezone}) AS timezone
        FROM locations WHERE "isPublished" = true
          AND jsonb_typeof("restaurantProfile"->'openingHours') IN ('object', 'array')
      `);
        const clocks = restaurantSearchClocks(
          timezones.map(({ timezone }) => timezone),
          now,
        );
        return fetchRows(transaction, clocks);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  } else {
    rows = await fetchRows(prisma, []);
  }
  const row = rows[0] ?? { total: 0, results: [], facets: { cuisines: [], locations: [] } };
  const results = row.results.map(({ openingHours, ...restaurant }) => ({
    ...restaurant,
    openNow: restaurantOpenNow(openingHours, now),
  }));
  const response: SearchResponse = { query: options.query, results, total: row.total };
  if (options.limit !== null) {
    response.page = options.page;
    response.limit = options.limit;
    response.hasMore = options.page * options.limit < row.total;
  }
  if (options.versionTwo) {
    response.totalPages = Math.ceil(row.total / RESTAURANT_PAGE_SIZE);
    response.facets = row.facets;
  }
  return response;
}
