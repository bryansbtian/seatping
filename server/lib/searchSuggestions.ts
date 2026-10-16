import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { loadRestaurantCollation, restaurantCollationSql } from "./restaurantCollation.js";

export type SearchSuggestion = {
  locationId: string;
  businessId: string;
  businessUsername: string | null;
  businessName: string | null;
  name: string;
  shortAddress: string | null;
  cuisine: string | null;
  area: string | null;
  city: string | null;
  imageUrl: string | null;
  url: string | null;
};

export function buildSearchSuggestionsQuery(
  query: string,
  limit: number,
  collation = restaurantCollationSql(null),
): Prisma.Sql {
  return Prisma.sql`
    WITH matched AS MATERIALIZED (
      SELECT l.id, l."businessId", l."displayName", l.name, l.area, l.city, l.address,
        l."bannerImageUrl", l."restaurantProfile", b.name AS "businessName", b.username AS "businessUsername"
      FROM locations l LEFT JOIN businesses b ON b.id = l."businessId"
      WHERE l."isPublished" = true
        AND l."restaurantProfile"->'isPublished' IS DISTINCT FROM 'false'::jsonb
        AND (EXISTS (
          SELECT 1 FROM unnest(ARRAY[l."restaurantProfile"->>'displayName', b.name,
            l."displayName", l."restaurantProfile"->>'shortAddress', l.name, l.area, l.city,
            l."restaurantProfile"->'details'->>'area', l."restaurantProfile"->'details'->>'city',
            l.address, l."restaurantProfile"->'details'->>'address',
            l."restaurantProfile"->>'tagline', l."restaurantProfile"->>'description', b.username
          ]) field(value) WHERE strpos(lower(field.value COLLATE ${collation}), ${query}) > 0
        ) OR EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(CASE
            WHEN jsonb_typeof(l."restaurantProfile"->'cuisineTypes') = 'array'
              THEN l."restaurantProfile"->'cuisineTypes' ELSE '[]'::jsonb END
          ) cuisine(value) WHERE strpos(lower(cuisine.value COLLATE ${collation}), ${query}) > 0
        ))
    ), candidates AS (
      SELECT l.id, l."businessId", l."displayName", l.name, l.area, l.city,
        l."bannerImageUrl", l."restaurantProfile" AS profile,
        l."businessName", l."businessUsername", ranked.score
      FROM matched l
      CROSS JOIN LATERAL (
        SELECT sum(groups.score * groups.weight) AS score
        FROM (
          SELECT field.weight, max(CASE
            WHEN lower(field.value COLLATE ${collation}) = ${query} THEN 100
            WHEN strpos(lower(field.value COLLATE ${collation}), ${query}) = 1 THEN 60
            WHEN EXISTS (
              SELECT 1 FROM regexp_split_to_table(lower(field.value COLLATE ${collation}), '[\\s,.&/-]+') word
              WHERE word <> '' AND strpos(word, ${query}) = 1
            ) THEN 40
            WHEN strpos(lower(field.value COLLATE ${collation}), ${query}) > 0 THEN 20
            ELSE 0 END) AS score
          FROM (
            SELECT 3.2 AS weight, unnest(ARRAY[l."restaurantProfile"->>'displayName', l."businessName"]) AS value
            UNION ALL SELECT 2.6, unnest(ARRAY[l."displayName", l."restaurantProfile"->>'shortAddress', l.name])
            UNION ALL SELECT 1.6, unnest(ARRAY[l.area, l.city,
              l."restaurantProfile"->'details'->>'area', l."restaurantProfile"->'details'->>'city'])
            UNION ALL SELECT 1.3, jsonb_array_elements_text(CASE
              WHEN jsonb_typeof(l."restaurantProfile"->'cuisineTypes') = 'array'
                THEN l."restaurantProfile"->'cuisineTypes' ELSE '[]'::jsonb END)
            UNION ALL SELECT 1.0, unnest(ARRAY[l.address, l."restaurantProfile"->'details'->>'address'])
            UNION ALL SELECT 0.7, unnest(ARRAY[l."restaurantProfile"->>'tagline',
              l."restaurantProfile"->>'description', l."businessUsername"])
          ) field GROUP BY field.weight
        ) groups
      ) ranked
      WHERE ranked.score > 0
      ORDER BY ranked.score DESC,
        lower(COALESCE(NULLIF(l."restaurantProfile"->>'displayName', ''), l."businessName", '') COLLATE ${collation}) ASC,
        l.id ASC
      LIMIT ${limit}
    )
    SELECT c.id AS "locationId", c."businessId", c."businessUsername", c."businessName",
      COALESCE(NULLIF(c.profile->>'displayName', ''), NULLIF(c."businessName", ''),
        NULLIF(c."displayName", ''), NULLIF(c.name, ''), 'Restaurant') AS name,
      COALESCE(NULLIF(c.profile->>'shortAddress', ''), NULLIF(c."displayName", ''),
        NULLIF(c.area, ''), NULLIF(c.city, '')) AS "shortAddress",
      CASE WHEN jsonb_typeof(c.profile->'cuisineTypes') = 'array'
        AND jsonb_array_length(c.profile->'cuisineTypes') > 0
        THEN COALESCE(c.profile->'cuisineTypes'->>0, 'null') END AS cuisine,
      c.area, c.city, COALESCE(NULLIF(c."bannerImageUrl", ''), (
        SELECT p.url FROM photos p WHERE p."locationId" = c.id
        ORDER BY p."createdAt" ASC, p.id ASC LIMIT 1
      )) AS "imageUrl",
      CASE WHEN c."businessUsername" IS NOT NULL AND c."businessUsername" <> ''
        THEN '/restaurants/' || c."businessUsername" || '/' || c.id END AS url
    FROM candidates c ORDER BY c.score DESC,
      lower(COALESCE(NULLIF(c.profile->>'displayName', ''), c."businessName", '') COLLATE ${collation}) ASC, c.id ASC
  `;
}

export async function searchSuggestions(query: string, limit: number): Promise<SearchSuggestion[]> {
  const collation = await loadRestaurantCollation();
  return prisma.$queryRaw<SearchSuggestion[]>(buildSearchSuggestionsQuery(query, limit, collation));
}
