import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import resolveConfig from "tailwindcss/resolveConfig";
import tailwindConfig from "../../tailwind.config.js";
import { buttonVariants } from "../../src/components/ui/buttonVariants.js";
import { cn } from "../../src/lib/utils.js";

const root = process.cwd();
const indexCss = readFileSync(path.join(root, "src/index.css"), "utf8");
const theme = resolveConfig(tailwindConfig).theme;

function readUi(file: string) {
  return readFileSync(path.join(root, "src/components/ui", file), "utf8");
}

describe("motion tokens", () => {
  it("defines the strong easing curves as variables", () => {
    expect(indexCss).toContain("--ease-strong-out: cubic-bezier(0.23, 1, 0.32, 1);");
    expect(indexCss).toContain("--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);");
    expect(indexCss).toContain("--ease-crossfade: cubic-bezier(0.2, 0, 0, 1);");
  });

  it("exposes the curves as timing function utilities", () => {
    expect(theme?.transitionTimingFunction?.["strong-out"]).toBe("var(--ease-strong-out)");
    expect(theme?.transitionTimingFunction?.drawer).toBe("var(--ease-drawer)");
    expect(theme?.transitionTimingFunction?.crossfade).toBe("var(--ease-crossfade)");
  });

  it("lets a call site easing replace the token easing", () => {
    expect(cn("ease-strong-out", "ease-linear")).toBe("ease-linear");
    expect(cn("ease-out", "ease-drawer")).toBe("ease-drawer");
  });

  it("drops the dead catch-all transition token", () => {
    expect(indexCss).not.toContain("--transition-smooth");
  });
});

describe("transition properties", () => {
  it("names the exact properties the button animates", () => {
    const base = buttonVariants();

    expect(base).toContain("transition-[background-color,border-color,color,transform]");
    expect(base).toContain("ease-strong-out");
    expect(base).not.toContain("transition-all");
  });

  it("keeps transition-all out of the shared primitives", () => {
    for (const file of ["accordion.tsx", "tabs.tsx", "toast.tsx", "sheet.tsx"]) {
      expect(readUi(file)).not.toContain("transition-all");
    }
  });
});

describe("origin aware overlays", () => {
  it("scales popovers, selects and tooltips from their trigger", () => {
    expect(readUi("popover.tsx")).toContain(
      "origin-[var(--radix-popover-content-transform-origin)]",
    );
    expect(readUi("select.tsx")).toContain("origin-[var(--radix-select-content-transform-origin)]");
    expect(readUi("tooltip.tsx")).toContain(
      "origin-[var(--radix-tooltip-content-transform-origin)]",
    );
  });

  it("keeps the modal dialog centred", () => {
    expect(readUi("dialog.tsx")).not.toContain("transform-origin");
    expect(readUi("dialog.tsx")).not.toContain("origin-[var(");
  });
});
