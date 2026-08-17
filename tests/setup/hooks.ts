import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

process.env.NODE_ENV = "test";

afterEach(() => {
  cleanup();
});
