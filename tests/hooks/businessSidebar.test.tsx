import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import BusinessSidebar from "../../src/components/BusinessSidebar.js";
import {
  BusinessSessionContext,
  type BusinessSessionValue,
} from "../../src/lib/businessSession.js";

const session: BusinessSessionValue = {
  me: { id: "b1", name: "Demo Restaurant", email: "owner@example.com" },
  setMe: () => {},
  refreshMe: async () => {},
  locations: [{ id: "loc-1", displayName: "PIK Avenue" }],
  currentLocation: { id: "loc-1", displayName: "PIK Avenue" },
  currentLocationIndex: 0,
  selectedLocationId: "loc-1",
  selectLocation: () => {},
};

function renderSidebar(route: string, collapsed = false) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <BusinessSessionContext.Provider value={session}>
        <BusinessSidebar collapsed={collapsed} onToggleCollapse={() => {}} />
      </BusinessSessionContext.Provider>
    </MemoryRouter>,
  );
}

function renderMobileSidebar() {
  return render(
    <MemoryRouter initialEntries={["/business/overview"]}>
      <BusinessSessionContext.Provider value={session}>
        <BusinessSidebar
          headerAction={
            <button type="button" aria-label="Close menu">
              x
            </button>
          }
        />
      </BusinessSessionContext.Provider>
    </MemoryRouter>,
  );
}

function settingsLink(): HTMLElement {
  return screen.getByRole("link", { name: "Settings" });
}

describe("BusinessSidebar header", () => {
  it("replaces the wordmark with the location switcher", () => {
    renderSidebar("/business/overview");

    expect(screen.queryByText("SeatPing")).toBeNull();
    expect(screen.getByRole("button", { name: "Switch Location" }).textContent).toContain(
      "PIK Avenue",
    );
  });

  it("puts the location switcher ahead of the collapse control in the header", () => {
    renderSidebar("/business/overview");

    const trigger = screen.getByRole("button", { name: "Switch Location" });
    const collapse = screen.getByRole("button", { name: "Collapse Sidebar" });
    const header = trigger.parentElement;

    expect(header).not.toBeNull();
    expect(header?.contains(collapse)).toBe(true);
    expect(
      header?.compareDocumentPosition(collapse) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      trigger.compareDocumentPosition(collapse) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("keeps the switcher out of the account footer", () => {
    renderSidebar("/business/overview");

    const footer = screen.getByText("Demo Restaurant").closest("div")?.parentElement?.parentElement;

    expect(footer).not.toBeNull();
    expect(footer?.contains(screen.getByRole("button", { name: "Switch Location" }))).toBe(false);
  });

  it("keeps the switcher reachable while collapsed", () => {
    renderSidebar("/business/overview", true);

    expect(screen.getByRole("button", { name: "Switch Location" })).toBeTruthy();
  });
});

describe("BusinessSidebar header action", () => {
  it("shares one header row with the location switcher so they stay centred together", () => {
    renderMobileSidebar();

    const trigger = screen.getByRole("button", { name: "Switch Location" });
    const close = screen.getByRole("button", { name: "Close menu" });
    const header = trigger.parentElement;

    expect(header).not.toBeNull();
    expect(header?.contains(close)).toBe(true);
    expect(header?.className).toContain("items-center");
    expect(header?.className).toContain("justify-between");
  });

  it("renders the action after the switcher so it stays right aligned", () => {
    renderMobileSidebar();

    const trigger = screen.getByRole("button", { name: "Switch Location" });
    const close = screen.getByRole("button", { name: "Close menu" });

    expect(trigger.compareDocumentPosition(close) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders no header action when none is passed", () => {
    renderSidebar("/business/overview");

    expect(screen.queryByRole("button", { name: "Close menu" })).toBeNull();
  });
});

describe("BusinessSidebar settings placement", () => {
  it("drops the Other nav group and links Settings from the account row", () => {
    renderSidebar("/business/overview");

    expect(screen.queryByText("Other")).toBeNull();
    expect(settingsLink().getAttribute("href")).toBe("/business/settings");
  });

  it("sits in the same row as the account name and email", () => {
    renderSidebar("/business/overview");

    const row = screen.getByText("Demo Restaurant").closest("div")?.parentElement;

    expect(row).not.toBeNull();
    expect(row?.contains(settingsLink())).toBe(true);
    expect(row?.textContent).toContain("owner@example.com");
  });

  it("marks the settings link as the current page on the settings route", () => {
    renderSidebar("/business/settings");

    expect(settingsLink().getAttribute("aria-current")).toBe("page");
  });

  it("leaves settings unmarked on another route", () => {
    renderSidebar("/business/overview");

    expect(settingsLink().getAttribute("aria-current")).toBeNull();
  });

  it("keeps settings reachable while collapsed, with the account hidden", () => {
    renderSidebar("/business/overview", true);

    expect(settingsLink().getAttribute("href")).toBe("/business/settings");
    expect(screen.queryByText("owner@example.com")).toBeNull();
  });
});
