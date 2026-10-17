import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import Footer from "../../src/components/Footer.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("public footer", () => {
  it("uses the existing public destinations", () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    );
    const footer = within(screen.getByRole("contentinfo"));
    const destinations = [
      ["SeatPing", "/"],
      ["Find Restaurants", "/search"],
      ["Featured Restaurants", "/#featured"],
      ["SeatPing for Business", "/business"],
      ["Business Login", "/business/login"],
      ["Blog", "/blog"],
      ["Help & FAQ", "/help"],
      ["Feedback", "/feedback"],
      ["Privacy Policy", "/policy"],
      ["Terms of Service", "/terms"],
    ];

    for (const [name, href] of destinations) {
      expect(footer.getByRole("link", { name, exact: true }).getAttribute("href")).toBe(href);
    }
    expect(footer.getByText("Smarter queues. Better guest relationships.")).toBeTruthy();
  });

  it("names the icon-only LinkedIn link and hides decorative artwork", () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: "SeatPing on LinkedIn" });
    expect(link.getAttribute("href")).toBe("https://www.linkedin.com/company/seatpinghq");
    expect(link.textContent).toBe("");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getAllByRole("navigation").map((nav) => nav.getAttribute("aria-label"))).toEqual([
      "Explore",
      "For Restaurants",
      "Resources",
      "Connect",
      "Legal",
    ]);
  });

  it("uses the current year after a calendar year change", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2031-01-02T12:00:00Z"));
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    );
    expect(screen.getByText("© 2031 SeatPing.")).toBeTruthy();
  });
});
