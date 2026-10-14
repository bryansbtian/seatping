import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ReservationBooking from "../../src/components/ReservationBooking.js";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: apiMock }));
vi.mock("@/lib/analytics", () => ({
  analytics: { reservationStarted: vi.fn(), reservationCompleted: vi.fn() },
}));

const settings = {
  reservationStartTime: "12:00",
  reservationEndTime: "22:00",
  maxPartySize: 10,
  maxReservedGuestsPerHour: 0,
  bookingWindowDays: 540,
  minNoticeMinutes: 0,
  defaultReservationDurationMinutes: 90,
  reservationHoldMinutes: 15,
  confirmationMode: "auto",
  cancellationPolicy: "",
};

beforeEach(() => {
  apiMock.mockReset().mockImplementation(async (path: string) => {
    if (path.endsWith("/settings")) {
      return { settings };
    }
    if (path.includes("/availability?")) {
      return {
        slots: [{ time: "18:00", label: "6:00 PM", available: true, remaining: 2 }],
        availability: { status: "available" },
      };
    }
    return { user: null };
  });
});

function renderBooking(overrides: Partial<ComponentProps<typeof ReservationBooking>> = {}) {
  return render(
    <MemoryRouter>
      <ReservationBooking
        businessUsername="bistro"
        locationId="loc-1"
        name="Bistro Downtown"
        reservationsEnabled
        queueEnabled
        queueHref="/queue/bistro/loc-1"
        heroImage={null}
        locationText="Main Street"
        initialDate="2027-10-16"
        initialTime="18:00"
        initialPartySize={3}
        {...overrides}
      />
    </MemoryRouter>,
  );
}

describe("restaurant booking actions", () => {
  it("keeps the actions text only and omits the removed instruction", async () => {
    renderBooking();
    const book = screen.getByRole("button", { name: "Book Table", exact: true });
    await waitFor(() => expect(book.hasAttribute("disabled")).toBe(false));
    const queue = screen.getByRole("link", { name: "Join Queue", exact: true });
    expect(book.querySelector("svg")).toBeNull();
    expect(queue.querySelector("svg")).toBeNull();
    expect(book.parentElement).toBe(queue.parentElement);
    expect(queue.getAttribute("href")).toBe("/queue/bistro/loc-1");
    expect(screen.queryByText("Select number of guests, date, and time to book.")).toBeNull();
    fireEvent.click(book);
    expect(await screen.findByRole("dialog", { name: "Book a Table" })).toBeTruthy();
  });

  it("requires a genuinely available slot before enabling booking", async () => {
    apiMock.mockImplementation(async (path: string) => {
      if (path.endsWith("/settings")) {
        return { settings };
      }
      return {
        slots: [
          { time: "18:00", label: "6:00 PM", available: false, remaining: 0, reason: "full" },
        ],
      };
    });
    renderBooking();
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(expect.stringContaining("/availability?")),
    );
    expect(
      screen.getByRole("button", { name: "Book Table", exact: true }).hasAttribute("disabled"),
    ).toBe(true);
  });

  it("preserves unsupported reservations and hides unsupported queue access", async () => {
    renderBooking({ reservationsEnabled: false, queueEnabled: false });
    const action = screen.getByRole("button", { name: "Reservations Unavailable", exact: true });
    expect(action.hasAttribute("disabled")).toBe(true);
    expect(action.querySelector("svg")).toBeNull();
    expect(screen.queryByRole("link", { name: "Join Queue", exact: true })).toBeNull();
  });
});
