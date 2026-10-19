import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Header from "../../src/components/Header";

const state = vi.hoisted(() => ({
  session: undefined as { customer: { name?: string | null } | null } | undefined,
}));

vi.mock("@/hooks/useSession", () => ({ useSession: () => state.session }));

beforeEach(() => {
  state.session = undefined;
});

describe("Customer Header Height", () => {
  it("reserves the same row while the session loads and the customer logs in", () => {
    const view = render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    );
    const row = screen.getByRole("banner").firstElementChild;
    const initialClass = row?.className;
    expect(row?.classList.contains("h-[60px]")).toBe(true);
    expect(row?.classList.contains("sm:h-16")).toBe(true);

    state.session = { customer: null };
    view.rerender(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    );
    expect(row?.className).toBe(initialClass);

    state.session = {
      customer: { name: "Alexandra Very Long Customer Name To Exercise Truncation" },
    };
    view.rerender(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    );
    const profile = screen.getByRole("button", { name: "Open profile menu" });
    expect(row?.className).toBe(initialClass);
    expect(profile.classList.contains("h-9")).toBe(true);
    expect(profile.classList.contains("control-md")).toBe(true);
    expect(profile.textContent).toBe("A");
    expect(screen.queryByText(state.session.customer?.name || "")).toBeNull();
    fireEvent.click(profile);
    expect(screen.getByRole("menuitem", { name: "View Profile" }).getAttribute("href")).toBe(
      "/profile",
    );
    expect(row?.className).toBe(initialClass);
  });

  it("keeps search and business variants within the same reserved row", () => {
    state.session = { customer: { name: "  " } };
    const view = render(
      <MemoryRouter>
        <Header showSearch />
      </MemoryRouter>,
    );
    const initialClass = screen.getByRole("banner").firstElementChild?.className;
    expect(screen.getByRole("search")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open profile menu" }));
    expect(screen.getByText("Signed in as Account")).toBeTruthy();
    view.rerender(
      <MemoryRouter>
        <Header variant="business" />
      </MemoryRouter>,
    );
    expect(screen.getByRole("banner").firstElementChild?.className).toBe(initialClass);
    expect(screen.queryByRole("button", { name: "Open profile menu" })).toBeNull();
    expect(screen.getByRole("link", { name: "SeatPing" }).getAttribute("href")).toBe("/business");
  });
});
