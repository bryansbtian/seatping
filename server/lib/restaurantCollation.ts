import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

export type RestaurantCollationName = "und-x-icu" | "en-US-x-icu" | "en-x-icu";

let pendingCollation: Promise<Prisma.Sql> | null = null;

export function restaurantCollationSql(name: RestaurantCollationName | null): Prisma.Sql {
  if (name === "und-x-icu") {
    return Prisma.sql`pg_catalog."und-x-icu"`;
  }
  if (name === "en-US-x-icu") {
    return Prisma.sql`pg_catalog."en-US-x-icu"`;
  }
  if (name === "en-x-icu") {
    return Prisma.sql`pg_catalog."en-x-icu"`;
  }
  return Prisma.sql`pg_catalog."default"`;
}

async function detectRestaurantCollation(): Promise<Prisma.Sql> {
  const names = await prisma.$queryRaw<{ name: RestaurantCollationName }[]>(Prisma.sql`
    SELECT collname::text AS name FROM pg_collation
    WHERE collprovider = 'i' AND collnamespace = 'pg_catalog'::regnamespace
      AND collname IN ('und-x-icu', 'en-US-x-icu', 'en-x-icu')
      AND collencoding IN (-1, pg_char_to_encoding(current_setting('server_encoding')))
    ORDER BY CASE collname WHEN 'und-x-icu' THEN 0 WHEN 'en-US-x-icu' THEN 1 ELSE 2 END
    LIMIT 1
  `);
  return restaurantCollationSql(names[0]?.name ?? null);
}

export function loadRestaurantCollation(): Promise<Prisma.Sql> {
  if (pendingCollation) {
    return pendingCollation;
  }
  pendingCollation = detectRestaurantCollation().catch((error: unknown) => {
    pendingCollation = null;
    throw error;
  });
  return pendingCollation;
}
