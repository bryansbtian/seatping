import { fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ScrollToTop from "../../src/components/ScrollToTop.js";

function renderNavigation(path = "/help") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ScrollToTop />
      <Link to="/terms" state={{ scrollToTop: true }}>
        Terms
      </Link>
      <Link to="/help" state={{ scrollToTop: true }}>
        Help
      </Link>
      <Link to="/#featured" state={{ scrollToTop: true }}>
        Featured
      </Link>
      <Link to="/search?sort=rating">Filter</Link>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("page navigation scrolling", () => {
  it("resets both axes for a footer destination", () => {
    renderNavigation();
    expect(window.scrollTo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("link", { name: "Terms" }));
    expect(window.scrollTo).toHaveBeenCalledExactlyOnceWith({
      top: 0,
      left: 0,
      behavior: "instant",
    });
  });

  it("returns to the top when following a link to the current page", () => {
    renderNavigation();
    vi.mocked(window.scrollTo).mockClear();
    fireEvent.click(screen.getByRole("link", { name: "Help" }));
    expect(window.scrollTo).toHaveBeenCalledExactlyOnceWith({
      top: 0,
      left: 0,
      behavior: "instant",
    });
  });

  it("leaves section links for the destination page to position", () => {
    renderNavigation();
    vi.mocked(window.scrollTo).mockClear();
    fireEvent.click(screen.getByRole("link", { name: "Featured" }));
    expect(window.scrollTo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("link", { name: "Help" }));
    expect(window.scrollTo).toHaveBeenCalledExactlyOnceWith({
      top: 0,
      left: 0,
      behavior: "instant",
    });
  });

  it("preserves the section target on a direct link", () => {
    renderNavigation("/#featured");
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("preserves scrolling for navigation without a footer scroll request", () => {
    renderNavigation();
    fireEvent.click(screen.getByRole("link", { name: "Filter" }));
    expect(window.scrollTo).not.toHaveBeenCalled();
  });
});
