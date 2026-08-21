import { defineConfig } from "vitest/config";
import path from "node:path";

const DB_PROJECT_SETUP = ["./tests/setup/integration.ts"];

const dbProjectOptions = {
  environment: "node" as const,
  setupFiles: DB_PROJECT_SETUP,
  fileParallelism: false,
  hookTimeout: 60_000,
  testTimeout: 60_000,
};

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
  test: {
    projects: [
      {
        resolve: {
          alias: {
            "@": path.resolve(__dirname, "./src"),
            "@shared": path.resolve(__dirname, "./shared"),
            "../dist-server/server/index.js": path.resolve(
              __dirname,
              "./tests/stubs/distServerApp.ts",
            ),
          },
        },
        test: {
          name: "unit",
          environment: "node",
          setupFiles: ["./tests/setup/unit.ts"],
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        resolve: {
          alias: {
            "@": path.resolve(__dirname, "./src"),
            "@shared": path.resolve(__dirname, "./shared"),
          },
        },
        test: {
          name: "hooks",
          environment: "jsdom",
          setupFiles: ["./tests/setup/hooks.ts"],
          include: ["tests/hooks/**/*.test.{ts,tsx}"],
        },
      },
      {
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          ...dbProjectOptions,
        },
      },
      {
        test: {
          name: "security",
          include: ["tests/security/**/*.test.ts"],
          ...dbProjectOptions,
        },
      },
      {
        test: {
          name: "concurrency",
          include: ["tests/concurrency/**/*.test.ts"],
          ...dbProjectOptions,
        },
      },
      {
        test: {
          name: "jobs",
          include: ["tests/jobs/**/*.test.ts"],
          ...dbProjectOptions,
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: [
        "server/**/*.ts",
        "api/**/*.ts",
        "shared/**/*.ts",
        "src/lib/**/*.ts",
        "src/hooks/**/*.ts",
      ],
      exclude: ["**/*.test.ts", "**/*.d.ts", "server/index.ts", "src/lib/i18n.tsx"],
      thresholds: {
        lines: 70,
        statements: 70,
        functions: 70,
        branches: 70,
      },
    },
  },
});
