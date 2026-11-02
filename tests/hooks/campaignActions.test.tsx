import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BusinessCampaigns from "../../src/pages/BusinessCampaigns.js";
import { LangContext, translate, type Lang } from "../../src/lib/i18n.js";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: apiMock }));
vi.mock("@/components/SEO", () => ({
  default: () => null,
  BUSINESS_DESCRIPTION: "",
  BUSINESS_IMAGE: "",
}));
vi.mock("@/lib/businessSession", () => ({
  useBusinessSession: () => ({ currentLocation: { id: "location" } }),
}));

function renderCampaign(status: string, lang: Lang = "en") {
  apiMock.mockImplementation(async (path: string) => {
    if (path.startsWith("/api/campaigns?")) {
      return {
        campaigns: [
          {
            id: "campaign",
            name: "Guest Campaign",
            status,
            channel: "SMS",
            templateName: "Welcome Guests",
            audienceLabel: "All Guests",
            recipientCount: 10,
            createdAt: "2026-10-17T12:00:00Z",
          },
        ],
      };
    }
    return { locations: [], templates: [], audiences: [] };
  });
  render(
    <LangContext.Provider
      value={{
        lang,
        ready: true,
        t: (key, params) => translate(lang, key, params),
        tStatus: (value) => value,
        setLang: async () => {},
      }}
    >
      <BusinessCampaigns />
    </LangContext.Provider>,
  );
}

beforeEach(() => {
  apiMock.mockReset();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("campaign management menu", () => {
  it.each([
    ["DRAFT", ["Edit"]],
    ["READY", ["Edit"]],
    ["CANCELLED", ["Edit"]],
    ["SCHEDULED", ["Cancel"]],
    ["RECURRING", ["Pause", "Cancel"]],
    ["PAUSED", ["Resume", "Cancel"]],
  ])("shows only available actions for %s campaigns", async (status, actions) => {
    renderCampaign(status);
    const table = await screen.findByRole("table");
    const manage = within(table).getByRole("button", { name: "Manage Guest Campaign" });
    expect(manage.textContent).toBe("Manage");
    expect(within(table).queryByRole("button", { name: "Edit" })).toBeNull();
    fireEvent.keyDown(manage, { key: "Enter" });
    const menu = await screen.findByRole("menu");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(actions);
  });

  it.each([
    ["RECURRING", "Pause", "pause"],
    ["PAUSED", "Resume", "resume"],
    ["SCHEDULED", "Cancel", "cancel"],
  ])("keeps the %s action connected to its existing API", async (status, label, action) => {
    renderCampaign(status);
    const table = await screen.findByRole("table");
    fireEvent.keyDown(within(table).getByRole("button", { name: "Manage Guest Campaign" }), {
      key: "Enter",
    });
    fireEvent.click(await screen.findByRole("menuitem", { name: label }));
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(`/api/campaigns/campaign/${action}`, {
        method: "POST",
        body: "{}",
      }),
    );
  });

  it("localizes the trigger and available actions in Indonesian", async () => {
    renderCampaign("RECURRING", "id");
    const table = await screen.findByRole("table");
    const manage = within(table).getByRole("button", { name: "Kelola Guest Campaign" });
    expect(manage.textContent).toBe("Kelola");
    fireEvent.keyDown(manage, { key: "Enter" });
    const menu = await screen.findByRole("menu");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(["Jeda", "Batal"]);
  });
});
