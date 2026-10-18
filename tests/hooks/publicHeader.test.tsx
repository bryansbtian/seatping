import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Header from "../../src/components/Header";

const session = vi.hoisted(() => ({ customer: false }));

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({ customer: session.customer, name: "Example Guest" }),
}));

function CurrentRoute() {
  const location = useLocation();
  return <output aria-label="Current Route">{location.pathname + location.search}</output>;
}

beforeEach(() => {
  session.customer = false;
});

describe("Public Header Controls", () => {
  it("uses the shared mobile menu control and preserves menu dismissal", () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    );
    const toggle = screen.getByRole("button", { name: "Open menu" });

    expect(toggle.classList.contains("rounded-control")).toBe(true);
    expect(toggle.classList.contains("control-icon")).toBe(true);
    fireEvent.click(toggle);

    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("link", { name: "Log In" }).getAttribute("href")).toBe("/login");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("menu")).toBeNull();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("submits the search through the shared search button without a page reload", () => {
    render(
      <MemoryRouter>
        <Header showSearch />
        <CurrentRoute />
      </MemoryRouter>,
    );
    const search = screen.getByRole("button", { name: "Search" });

    expect(search.classList.contains("rounded-control")).toBe(true);
    expect(search.classList.contains("rounded-full")).toBe(false);
    fireEvent.change(screen.getByLabelText("Search restaurants"), {
      target: { value: " dinner " },
    });
    fireEvent.click(search);

    expect(screen.getByLabelText("Current Route").textContent).toBe("/search?query=dinner");
  });

  it("uses a shared logout menu action for an authenticated customer", () => {
    session.customer = true;
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open profile menu" }));
    const logout = screen.getByRole("menuitem", { name: "Log Out" });

    expect(logout.classList.contains("control-md")).toBe(true);
    expect(logout.classList.contains("rounded-control")).toBe(true);
  });
});
