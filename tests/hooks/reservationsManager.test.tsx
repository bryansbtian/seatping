import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ReservationsManager from "../../src/components/ReservationsManager";
import { LangContext, translate, translateStatus, type Lang } from "../../src/lib/i18n";
import { addDaysToDateKey, getTodayKeyInTimezone } from "../../src/lib/timezones";

const mocks = vi.hoisted(() => ({ api: vi.fn(), toast: vi.fn() }));

vi.mock("@/lib/api", () => ({ api: mocks.api }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));

type Reservation = ComponentProps<typeof ReservationsManager>["reservations"][number];

function reservation(id: string, overrides: Partial<Reservation> = {}): Reservation {
  return {
    id,
    firstName: "Test",
    lastName: "Guest",
    name: `Guest ${id}`,
    contactMethod: "email",
    phone: "2025550123",
    countryCode: "+1",
    email: "guest@example.test",
    partySize: 2,
    reservationDateTime: `${getTodayKeyInTimezone("UTC")}T12:00:00`,
    notes: "",
    status: "confirmed",
    source: "public",
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function renderManager(
  reservations: Reservation[],
  onUpdated = vi.fn(),
  lang: Lang = "en",
  reservationsEnabled = true,
) {
  return render(
    <LangContext.Provider
      value={{
        lang,
        ready: true,
        t: (key, params) => translate(lang, key, params),
        tStatus: (status) => translateStatus(lang, status),
        setLang: async () => {},
      }}
    >
      <ReservationsManager
        reservations={reservations}
        businessUsername="example-restaurant"
        locationId="location-1"
        reservationsEnabled={reservationsEnabled}
        timeZone="UTC"
        onUpdated={onUpdated}
      />
    </LangContext.Provider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.api.mockResolvedValue({ user: { id: "business-1" } });
});

describe("Reservation Management Controls", () => {
  it("keeps filter selection, counts, and reservation buckets in sync", () => {
    renderManager([
      reservation("today"),
      reservation("upcoming", {
        reservationDateTime: `${addDaysToDateKey(getTodayKeyInTimezone("UTC"), 1)}T12:00:00`,
      }),
      reservation("cancelled", { status: "cancelled" }),
    ]);
    const today = screen.getByRole("button", { name: "Today 1" });
    const upcoming = screen.getByRole("button", { name: "Upcoming 1" });
    expect(today.getAttribute("aria-pressed")).toBe("true");
    expect(upcoming.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("Guest today")).toBeTruthy();

    fireEvent.click(upcoming);

    expect(upcoming.getAttribute("aria-pressed")).toBe("true");
    expect(today.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("Guest upcoming")).toBeTruthy();
    expect(screen.queryByText("Guest today")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Cancelled 1" }));

    expect(screen.getByText("Guest cancelled")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mark Arrived" })).toBeNull();
    expect(mocks.api).not.toHaveBeenCalled();
  });

  it("preserves Indonesian filter labels and selected states", () => {
    renderManager([], vi.fn(), "id");

    expect(screen.getByRole("button", { name: "Hari Ini" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Mendatang" }));
    expect(screen.getByRole("button", { name: "Mendatang" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("resets the expanded reservation list when changing filters", () => {
    renderManager(Array.from({ length: 6 }, (_, index) => reservation(String(index))));
    fireEvent.click(screen.getByRole("button", { name: "View All (6)" }));
    expect(screen.getByRole("button", { name: "View Less" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Upcoming" }));
    fireEvent.click(screen.getByRole("button", { name: "Today 6" }));

    expect(screen.getByRole("button", { name: "View All (6)" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "View Less" })).toBeNull();
  });

  it("preserves the status update and refreshed business account", async () => {
    const onUpdated = vi.fn();
    renderManager([reservation("today")], onUpdated);
    fireEvent.click(screen.getByRole("button", { name: "Mark Arrived" }));

    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith(
        "/auth/business/locations/location-1/reservations/today",
        { method: "PATCH", body: JSON.stringify({ status: "arrived" }) },
      ),
    );
    expect(onUpdated).toHaveBeenCalledWith({ id: "business-1" });
  });

  it("keeps the reservation and restores its action after an update fails", async () => {
    mocks.api.mockRejectedValue(new Error("Reservation update unavailable"));
    const onUpdated = vi.fn();
    renderManager([reservation("today")], onUpdated);
    fireEvent.click(screen.getByRole("button", { name: "Mark Arrived" }));

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "Reservation update unavailable",
          variant: "destructive",
        }),
      ),
    );
    expect(screen.getByText("Guest today")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mark Arrived" }).hasAttribute("disabled")).toBe(
      false,
    );
    expect(onUpdated).not.toHaveBeenCalled();
  });
});

it.each<Lang>(["en", "id"])("shows a centered disabled-reservations state in %s", (lang) => {
  renderManager([], vi.fn(), lang, false);
  const title = screen.getByRole("heading", { name: translate(lang, "res.notEnabled") });
  expect(title.parentElement?.classList.contains("flex-1")).toBe(true);
  expect(title.parentElement?.classList.contains("items-center")).toBe(true);
  expect(title.parentElement?.querySelector("svg")).toBeTruthy();
  expect(screen.getByText(translate(lang, "res.enableHint"))).toBeTruthy();
  expect(screen.queryByText(translate(lang, "res.empty.title"))).toBeNull();
});

it("keeps existing reservations manageable when new reservations are disabled", () => {
  renderManager([reservation("existing")], vi.fn(), "en", false);
  expect(screen.getByText("Guest existing")).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Reservations Not Enabled" })).toBeNull();
});
