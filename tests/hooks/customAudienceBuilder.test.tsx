import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomAudienceBuilder } from "../../src/components/CustomAudienceBuilder.js";

const mocks = vi.hoisted(() => ({ api: vi.fn(), toast: vi.fn() }));

vi.mock("@/lib/api", () => ({ api: mocks.api }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));

const guest = {
  id: "guest-fixture",
  fullName: "Example Guest",
  phone: null,
  normalizedPhone: null,
  email: null,
  tags: [],
  lastVisitAt: null,
  totalVisits: 1,
  returning: false,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Custom Audience Request Loading", () => {
  it("shows preview skeletons until the first response and preserves existing results during refresh", async () => {
    let resolvePreview: (value: unknown) => void = () => {};
    mocks.api.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePreview = resolve;
        }),
    );
    render(
      <CustomAudienceBuilder
        open
        onClose={() => {}}
        locationId="location-fixture"
        onSaved={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.queryByText("No Guests Match This Group Yet.")).toBeNull();

    await act(async () => resolvePreview({ count: 1, guests: [guest] }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("Example Guest")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("Example Guest")).toBeTruthy();

    await act(async () => resolvePreview({ count: 0, guests: [] }));
    expect(screen.getByText("No Guests Match This Group Yet.")).toBeTruthy();
    expect(screen.queryByText("Example Guest")).toBeNull();
  });

  it("waits for saved audience guests before allowing preview or save", async () => {
    let resolveGuests: (value: unknown) => void = () => {};
    mocks.api.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveGuests = resolve;
        }),
    );
    render(
      <CustomAudienceBuilder
        open
        onClose={() => {}}
        locationId="location-fixture"
        existing={{
          id: "audience-fixture",
          name: "Selected Guests",
          description: null,
          filters: { guestIds: [guest.id] },
        }}
        onSaved={() => {}}
      />,
    );

    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Preview" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Save Custom Group" }).hasAttribute("disabled")).toBe(
      true,
    );

    await act(async () => resolveGuests({ guests: [guest] }));
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(screen.getByText("Example Guest")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save Custom Group" }).hasAttribute("disabled")).toBe(
      false,
    );

    mocks.api.mockResolvedValue({ count: 1, guests: [guest] });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() => {
      expect(mocks.api).toHaveBeenCalledWith("/api/audiences/preview", {
        method: "POST",
        body: expect.any(String),
      });
    });
    const previewCall = mocks.api.mock.calls.find(([url]) => url === "/api/audiences/preview");
    expect(JSON.parse(previewCall?.[1].body).filters.guestIds).toEqual([guest.id]);
  });
});
