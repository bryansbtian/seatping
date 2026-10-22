import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AddFeaturedRestaurantDialog from "../../src/components/featured-restaurants/AddFeaturedRestaurantDialog";

const mocks = vi.hoisted(() => ({ api: vi.fn(), toast: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: mocks.api }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));

const business = { id: "business-example", username: "example", name: "Example Restaurant" };
const location = { id: "location-example", displayName: "Central", address: "123 Example Road" };

beforeEach(() => {
  vi.resetAllMocks();
  HTMLElement.prototype.scrollIntoView = vi.fn();
  mocks.api.mockImplementation((path: string, options?: RequestInit) => {
    if (options?.method === "POST") {
      return Promise.resolve({});
    }
    if (path.includes("/locations")) {
      return Promise.resolve({ locations: [location] });
    }
    return Promise.resolve({ businesses: [business] });
  });
});

async function searchBusiness() {
  fireEvent.change(screen.getByLabelText("Business Username"), { target: { value: " example " } });
  fireEvent.click(screen.getByRole("button", { name: "Search", exact: true }));
  fireEvent.click(await screen.findByRole("button", { name: /Example Restaurant.*@example/ }));
  await screen.findByRole("combobox", { name: "Location" });
}

async function chooseLocation() {
  fireEvent.click(screen.getByRole("combobox", { name: "Location" }));
  fireEvent.click(await screen.findByRole("option", { name: "Central", exact: true }));
}

describe("Add Featured Restaurant Dialog", () => {
  it("searches businesses, selects a location, and adds it without exposing a numeric order", async () => {
    const onAdded = vi.fn();
    const onOpenChange = vi.fn();
    render(<AddFeaturedRestaurantDialog open onOpenChange={onOpenChange} onAdded={onAdded} />);
    expect(screen.queryByRole("switch")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Add Restaurant", exact: true }).hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.queryByRole("spinbutton")).toBeNull();
    await searchBusiness();
    await chooseLocation();
    fireEvent.click(screen.getByRole("button", { name: "Add Restaurant", exact: true }));
    await waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1));
    expect(mocks.api).toHaveBeenCalledWith(
      "/admin/businesses/search?username=example",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(mocks.api).toHaveBeenCalledWith("/admin/featured-restaurants", {
      method: "POST",
      body: JSON.stringify({ businessId: business.id, locationId: location.id, isActive: true }),
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Restaurant Added" }),
    );
  });

  it("retains the selected location after a failed add", async () => {
    const onAdded = vi.fn();
    render(<AddFeaturedRestaurantDialog open onOpenChange={vi.fn()} onAdded={onAdded} />);
    await searchBusiness();
    await chooseLocation();
    mocks.api.mockRejectedValueOnce(new Error("This location is already featured."));
    fireEvent.click(screen.getByRole("button", { name: "Add Restaurant", exact: true }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "This location is already featured.",
    );
    expect(screen.getByRole("combobox", { name: "Location" }).textContent).toContain("Central");
    expect(screen.queryByRole("switch")).toBeNull();
    expect(onAdded).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Add Restaurant", exact: true }));
    await waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1));
    expect(mocks.api).toHaveBeenLastCalledWith("/admin/featured-restaurants", {
      method: "POST",
      body: JSON.stringify({ businessId: business.id, locationId: location.id, isActive: true }),
    });
  });

  it("prevents duplicate submissions and closing while the add request is pending", async () => {
    let resolveAdd = (_value: object) => {};
    const onOpenChange = vi.fn();
    render(<AddFeaturedRestaurantDialog open onOpenChange={onOpenChange} onAdded={vi.fn()} />);
    await searchBusiness();
    await chooseLocation();
    mocks.api.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAdd = resolve;
        }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add Restaurant", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "Adding Restaurant" }));
    fireEvent.click(screen.getByRole("button", { name: "Close", exact: true }));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(mocks.api.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(
      1,
    );
    await act(async () => {
      resolveAdd({});
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("distinguishes an unsuccessful search from an empty search and allows retry", async () => {
    mocks.api.mockRejectedValueOnce(new Error("Search unavailable"));
    render(<AddFeaturedRestaurantDialog open onOpenChange={vi.fn()} onAdded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Business Username"), { target: { value: "example" } });
    fireEvent.keyDown(screen.getByLabelText("Business Username"), { key: "Enter" });
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Search unavailable");
    expect(screen.queryByText("Try another username to find a business.")).toBeNull();
    mocks.api.mockResolvedValueOnce({ businesses: [] });
    fireEvent.click(screen.getByRole("button", { name: "Search", exact: true }));
    expect(await screen.findByText("Try another username to find a business.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows location loading, retries location failures, and keeps the selected business", async () => {
    let rejectLocations = (_error: Error) => {};
    mocks.api.mockResolvedValueOnce({ businesses: [business] }).mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectLocations = reject;
        }),
    );
    render(<AddFeaturedRestaurantDialog open onOpenChange={vi.fn()} onAdded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Business Username"), { target: { value: "example" } });
    fireEvent.click(screen.getByRole("button", { name: "Search", exact: true }));
    fireEvent.click(await screen.findByRole("button", { name: /Example Restaurant.*@example/ }));
    expect(screen.getByRole("status", { name: "Loading Locations" })).toBeTruthy();
    await act(async () => {
      rejectLocations(new Error("Locations unavailable"));
    });
    expect(screen.getByRole("alert").textContent).toBe("Locations unavailable");
    expect(screen.queryByText("This business has no locations yet.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
    await screen.findByRole("combobox", { name: "Location" });
    expect(screen.getByText("Example Restaurant")).toBeTruthy();
  });

  it("ignores stale search results after the username changes and cancels requests on close", async () => {
    let resolveSearch = (_response: object) => {};
    mocks.api.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSearch = resolve;
        }),
    );
    const props = { onOpenChange: vi.fn(), onAdded: vi.fn() };
    const { rerender } = render(<AddFeaturedRestaurantDialog open {...props} />);
    fireEvent.change(screen.getByLabelText("Business Username"), { target: { value: "first" } });
    fireEvent.click(screen.getByRole("button", { name: "Search", exact: true }));
    expect(screen.getByRole("status", { name: "Searching Businesses" })).toBeTruthy();
    const requestSignal = mocks.api.mock.calls[0][1].signal as AbortSignal;
    fireEvent.change(screen.getByLabelText("Business Username"), { target: { value: "second" } });
    expect(requestSignal.aborted).toBe(true);
    await act(async () => {
      resolveSearch({ businesses: [business] });
    });
    expect(screen.queryByRole("button", { name: /Example Restaurant.*@example/ })).toBeNull();
    rerender(<AddFeaturedRestaurantDialog open={false} {...props} />);
    rerender(<AddFeaturedRestaurantDialog open {...props} />);
    expect((screen.getByLabelText("Business Username") as HTMLInputElement).value).toBe("");
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("clears locations when changing business and ignores a stale location response", async () => {
    let resolveLocations = (_response: object) => {};
    mocks.api.mockResolvedValueOnce({ businesses: [business] }).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveLocations = resolve;
        }),
    );
    render(<AddFeaturedRestaurantDialog open onOpenChange={vi.fn()} onAdded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Business Username"), { target: { value: "example" } });
    fireEvent.click(screen.getByRole("button", { name: "Search", exact: true }));
    fireEvent.click(await screen.findByRole("button", { name: /Example Restaurant.*@example/ }));
    const requestSignal = mocks.api.mock.calls[1][1].signal as AbortSignal;
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(requestSignal.aborted).toBe(true);
    await act(async () => {
      resolveLocations({ locations: [location] });
    });
    expect(screen.queryByRole("combobox", { name: "Location" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Add Restaurant", exact: true }).hasAttribute("disabled"),
    ).toBe(true);
  });
});
