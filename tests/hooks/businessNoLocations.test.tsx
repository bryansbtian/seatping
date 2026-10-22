import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import BusinessLayout from "../../src/components/BusinessLayout";
import { BusinessSessionContext, type BusinessSessionValue } from "../../src/lib/businessSession";
import { LangContext, translate, type Lang } from "../../src/lib/i18n";

const session: BusinessSessionValue = {
  me: { id: "business-1", name: "Example Business", locations: [] },
  loadingMe: false,
  meError: false,
  setMe: () => {},
  refreshMe: async () => {},
  locations: [],
  currentLocation: null,
  currentLocationIndex: -1,
  selectedLocationId: null,
  selectLocation: () => {},
};

function view(path: string, value = session, lang: Lang = "en") {
  return (
    <MemoryRouter initialEntries={[path]}>
      <BusinessSessionContext.Provider value={value}>
        <LangContext.Provider
          value={{
            lang,
            ready: true,
            t: (key, params) => translate(lang, key, params),
            tStatus: (status) => status,
            setLang: async () => {},
          }}
        >
          <Routes>
            <Route element={<BusinessLayout />}>
              <Route path="/business/*" element={<p>Operational Page Content</p>} />
            </Route>
          </Routes>
        </LangContext.Provider>
      </BusinessSessionContext.Provider>
    </MemoryRouter>
  );
}

describe.each<Lang>(["en", "id"])("businesses without locations in %s", (lang) => {
  it.each([
    "overview",
    "queue",
    "reservations",
    "floor",
    "guests",
    "reviews",
    "campaigns",
    "performance",
  ])("shows the shared empty card on %s", (page) => {
    render(view(`/business/${page}`, session, lang));

    const card = screen.getByTestId("business-no-locations");
    expect(
      within(card).getByRole("heading", {
        name: translate(lang, "guests.empty.noLocations.title"),
      }),
    ).toBeTruthy();
    expect(within(card).getByText(translate(lang, "guests.empty.noLocations.body"))).toBeTruthy();
    expect(card.classList.contains("flex-1")).toBe(true);
    expect(screen.queryByText("Operational Page Content")).toBeNull();
    expect(screen.queryByText(/Choose a location|Pilih lokasi/)).toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).not.toBe("");
  });

  it("keeps Settings accessible so the first location can be added", () => {
    render(view("/business/settings", session, lang));
    expect(screen.getByText("Operational Page Content")).toBeTruthy();
    expect(screen.queryByTestId("business-no-locations")).toBeNull();
  });
});

it("updates the page when the first location is added or the last one is removed", () => {
  const result = render(view("/business/queue"));
  expect(screen.getByTestId("business-no-locations")).toBeTruthy();
  const location = { id: "location-1", address: "Example Street" };
  result.rerender(
    view("/business/queue", {
      ...session,
      me: { ...session.me, locations: [location] },
      locations: [location],
      currentLocation: location,
      currentLocationIndex: 0,
      selectedLocationId: location.id,
    }),
  );
  expect(screen.getByText("Operational Page Content")).toBeTruthy();
  expect(screen.queryByTestId("business-no-locations")).toBeNull();

  result.rerender(view("/business/queue"));
  expect(screen.getByTestId("business-no-locations")).toBeTruthy();
  expect(screen.queryByText("Operational Page Content")).toBeNull();
});

it("does not treat an unresolved account as a business with no locations", () => {
  render(view("/business/queue", { ...session, me: null, loadingMe: true }));
  expect(screen.queryByTestId("business-no-locations")).toBeNull();
});
