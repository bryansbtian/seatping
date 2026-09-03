import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import type { JSDOM } from "jsdom";

process.env.NODE_ENV = "test";

const jsdomInstance = (globalThis as { jsdom?: JSDOM }).jsdom;

if (jsdomInstance) {
  for (const key of ["localStorage", "sessionStorage"] as const) {
    Object.defineProperty(globalThis, key, {
      value: jsdomInstance.window[key],
      configurable: true,
      enumerable: true,
    });
  }
}

afterEach(() => {
  cleanup();
});
