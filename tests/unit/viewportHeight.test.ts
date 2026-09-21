import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import resolveConfig from "tailwindcss/resolveConfig";
import tailwindConfig from "../../tailwind.config.js";

const theme = resolveConfig(tailwindConfig).theme;
const indexCss = readFileSync(path.join(process.cwd(), "src/index.css"), "utf8");

describe("viewport height tokens", () => {
  it("resolves the screen height scales to the app height variable", () => {
    expect(theme?.height?.screen).toBe("var(--app-height)");
    expect(theme?.minHeight?.screen).toBe("var(--app-height)");
    expect(theme?.maxHeight?.screen).toBe("var(--app-height)");
  });

  it("prefers the dynamic viewport unit so mobile Safari toolbars do not clip the page", () => {
    expect(indexCss).toMatch(/@supports \(height: 100dvh\) \{\s*:root \{\s*--app-height: 100dvh;/);
  });

  it("falls back to a static viewport unit where the dynamic unit is unsupported", () => {
    expect(indexCss).toMatch(/--app-height: 100vh;/);
  });
});
