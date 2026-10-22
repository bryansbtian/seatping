import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DemoBookingProvider from "../../src/components/DemoBookingProvider.js";
import { useDemoBooking } from "../../src/lib/demoBooking.js";

function Trigger() {
  const open = useDemoBooking();
  return <button onClick={open}>Book a Demo</button>;
}

describe("demo booking dialog", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const scrollIntoView = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
  beforeEach(() => {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url, options) => {
      if (options?.method === "POST") {
        return new Response(
          JSON.stringify({
            start: "2026-10-02T13:00:00.000Z",
            end: "2026-10-02T13:15:00.000Z",
            meetLink: "https://meet.google.com/abc-defg-hij",
          }),
          { status: 201 },
        );
      }
      let slots = ["2026-10-02T13:00:00.000Z", "2026-10-02T13:15:00.000Z"];
      if (String(url).includes("2026-11")) {
        slots = ["2026-11-02T14:00:00.000Z"];
      }
      return new Response(JSON.stringify({ slots }));
    });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    if (scrollIntoView) {
      Object.defineProperty(Element.prototype, "scrollIntoView", scrollIntoView);
    } else {
      Reflect.deleteProperty(Element.prototype, "scrollIntoView");
    }
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function openDialog() {
    render(
      <DemoBookingProvider>
        <Trigger />
      </DemoBookingProvider>,
    );
    const trigger = screen.getByRole("button", { name: "Book a Demo" });
    trigger.focus();
    fireEvent.click(trigger);
    await screen.findByRole("dialog", { name: "Discover SeatPing" });
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Select A Date" }).getAttribute("aria-busy")).toBe(
        "false",
      ),
    );
    if (
      !screen
        .getByRole("combobox", { name: "Timezone", exact: true })
        .textContent?.includes("America/New York")
    ) {
      fireEvent.click(screen.getByRole("combobox", { name: "Timezone", exact: true }));
      fireEvent.change(screen.getByPlaceholderText("Search timezone or city..."), {
        target: { value: "New York" },
      });
      fireEvent.click(await screen.findByRole("option", { name: /America\/New York/ }));
      await waitFor(() =>
        expect(document.activeElement).toBe(
          screen.getByRole("combobox", { name: "Timezone", exact: true }),
        ),
      );
    }
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Select A Date" }).getAttribute("aria-busy")).toBe(
        "false",
      ),
    );
    return trigger;
  }

  async function selectSlot() {
    const day = within(screen.getByRole("grid"))
      .getAllByRole("gridcell")
      .find((button) => button.textContent === "2") as HTMLButtonElement;
    expect(day.disabled).toBe(false);
    fireEvent.click(day);
    fireEvent.click(await screen.findByRole("button", { name: "9:00 AM" }));
  }

  it("keeps standalone demo triggers safe without a booking provider", () => {
    render(<Trigger />);
    fireEvent.click(screen.getByRole("button", { name: "Book a Demo" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows complete time skeletons until availability resolves and replaces them with the date prompt", async () => {
    let finish = (_value: Response) => {};
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(
      <DemoBookingProvider>
        <Trigger />
      </DemoBookingProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Book a Demo" }));
    const times = await screen.findByRole("region", { name: "Available Times" });
    const skeleton = within(times).getByRole("status");

    expect(skeleton.querySelector("button")).toBeNull();
    expect(skeleton.textContent).toBe("");
    expect(skeleton.firstElementChild?.children).toHaveLength(6);
    expect(within(times).queryByText("Choose an available date to see meeting times.")).toBeNull();
    await act(async () => {
      finish(new Response(JSON.stringify({ slots: ["2026-10-02T13:00:00.000Z"] })));
    });

    expect(within(times).queryByRole("status")).toBeNull();
    expect(within(times).getByText("Choose an available date to see meeting times.")).toBeTruthy();
  });

  it("opens without navigation and restores focus on Escape", async () => {
    const trigger = await openDialog();
    expect(screen.getByText("Discover SeatPing")).toBeTruthy();
    fireEvent.keyDown(document.activeElement || document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("closes through the close button", async () => {
    await openDialog();
    fireEvent.click(screen.getByRole("button", { name: "Close", exact: true }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("changes timezone through the shared picker and keeps the booking dialog open", async () => {
    await openDialog();
    fireEvent.click(screen.getByRole("combobox", { name: "Timezone", exact: true }));
    const search = screen.getByPlaceholderText("Search timezone or city...");
    fireEvent.change(search, { target: { value: "no matching timezone" } });
    expect(await screen.findByText("No timezone found.")).toBeTruthy();
    fireEvent.change(search, { target: { value: "London" } });
    fireEvent.click(await screen.findByRole("option", { name: /Europe\/London/ }));
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Timezone", exact: true }).textContent).toContain(
        "Europe/London",
      ),
    );
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes("Europe%2FLondon"))).toBe(
        true,
      ),
    );
    expect(screen.getByRole("dialog", { name: "Discover SeatPing" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /America\/New York/ })).toBeNull();
  });

  it("returns focus to the timezone trigger on Escape while preserving the booking dialog", async () => {
    await openDialog();
    const trigger = screen.getByRole("combobox", { name: "Timezone", exact: true });
    fireEvent.click(trigger);
    const search = await screen.findByPlaceholderText("Search timezone or city...");
    fireEvent.keyDown(search, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByPlaceholderText("Search timezone or city...")).toBeNull(),
    );
    expect(document.activeElement).toBe(trigger);
    expect(screen.getByRole("dialog", { name: "Discover SeatPing" })).toBeTruthy();
  });

  it("disables unavailable dates and navigates to the next month", async () => {
    await openDialog();
    expect(
      within(screen.getByRole("grid"))
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual(["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]);
    const unavailable = within(screen.getByRole("grid"))
      .getAllByRole("gridcell")
      .find((button) => button.textContent === "3") as HTMLButtonElement;
    expect(unavailable.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /next month/i }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes("2026-11"))).toBe(true),
    );
    expect(screen.getByText("November 2026")).toBeTruthy();
  });

  it("shows the selected meeting beside the form and preserves details when going back", async () => {
    await openDialog();
    await selectSlot();
    const summary = screen.getByRole("region", { name: "Meeting Details" });
    expect(summary.textContent).toContain("Friday, October 2, 2026");
    expect(summary.textContent).toContain("9:00 AM - 9:15 AM");
    expect(summary.textContent).toContain("15 Minutes");
    expect(summary.textContent).toContain("America/New York");
    expect(screen.queryByRole("combobox", { name: "Timezone", exact: true })).toBeNull();
    fireEvent.change(screen.getByLabelText("Full Name"), { target: { value: "Test Guest" } });
    fireEvent.click(screen.getByRole("button", { name: "Back", exact: true }));
    expect(await screen.findByRole("grid")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "9:00 AM" }));
    expect((screen.getByLabelText("Full Name") as HTMLInputElement).value).toBe("Test Guest");
    expect(fetchMock.mock.calls.every(([, options]) => options?.method !== "POST")).toBe(true);
  });

  it("selects a day, changes time format, validates required fields, and confirms", async () => {
    await openDialog();
    const day = within(screen.getByRole("grid"))
      .getAllByRole("gridcell")
      .find((button) => button.textContent === "2") as HTMLButtonElement;
    fireEvent.click(day);
    fireEvent.click(screen.getByRole("button", { name: "24h" }));
    expect(screen.getByRole("button", { name: "09:00" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "09:00" }));
    expect(document.activeElement?.textContent).toBe("Your Details");
    expect(
      (screen.getByRole("button", { name: "Confirm Booking" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect((screen.getByLabelText("Email Address") as HTMLInputElement).required).toBe(true);
    fireEvent.change(screen.getByLabelText("Full Name"), { target: { value: "Test Guest" } });
    fireEvent.change(screen.getByLabelText("Email Address"), {
      target: { value: "guest@test.invalid" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm Booking" }));
    expect(await screen.findByText("Your Demo Is Booked")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Open Google Meet" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close", exact: true }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Book a Demo" }));
    expect(await screen.findByRole("grid")).toBeTruthy();
    expect(screen.queryByText("Your Demo Is Booked")).toBeNull();
  });

  it("shows unavailable meeting slots in the times column when availability fails", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 503 }));
    await openDialog();
    expect(
      within(screen.getByRole("region", { name: "Available Times" })).getByRole("status")
        .textContent,
    ).toBe("Check back later for available meeting slots.");
    expect(screen.queryByText("Please try again later to check calendar availability.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Try Again" })).toBeNull();
    const days = Array.from(screen.getByRole("grid").querySelectorAll<HTMLButtonElement>("button"));
    expect(days.every((day) => day.disabled)).toBe(true);
  });

  it("does not confirm an uncertain booking or allow an immediate duplicate", async () => {
    await openDialog();
    await selectSlot();
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ uncertain: true }), { status: 503 }),
    );
    fireEvent.change(screen.getByLabelText("Full Name"), { target: { value: "Test Guest" } });
    fireEvent.change(screen.getByLabelText("Email Address"), {
      target: { value: "guest@test.invalid" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm Booking" }));
    await screen.findByRole("alert");
    expect(screen.queryByText("Your Demo Is Booked")).toBeNull();
    expect(
      (screen.getByRole("button", { name: "Confirm Booking" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("returns to availability and explains when another guest takes the slot", async () => {
    await openDialog();
    await selectSlot();
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Conflict" }), { status: 409 }),
    );
    fireEvent.change(screen.getByLabelText("Full Name"), { target: { value: "Test Guest" } });
    fireEvent.change(screen.getByLabelText("Email Address"), {
      target: { value: "guest@test.invalid" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm Booking" }));
    expect(
      await screen.findByText("This time is no longer available. Please choose another slot."),
    ).toBeTruthy();
    expect(await screen.findByRole("grid")).toBeTruthy();
    expect(screen.queryByText("Your Demo Is Booked")).toBeNull();
  });
});
