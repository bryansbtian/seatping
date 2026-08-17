import { defineConfig } from "vitest/config";
import { loadTestEnv } from "./tests/helpers/loadTestEnv.js";

loadTestEnv();

export default defineConfig({
  test: {
    name: "smoke",
    environment: "node",
    include: ["tests/smoke/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
