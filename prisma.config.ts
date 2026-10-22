import "dotenv/config";
import { defineConfig } from "prisma/config";
import { guardDevelopmentDatabase } from "./server/lib/developmentDatabase";

guardDevelopmentDatabase();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
});
