import type { ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FeaturedRestaurantsManager from "../../src/components/FeaturedRestaurantsManager";
import type { FeaturedRestaurant } from "../../src/components/featured-restaurants/types";

const mocks = vi.hoisted(() => ({ api: vi.fn(), toast: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: mocks.api }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/lib/queryClient", () => ({ invalidateRestaurantConfiguration: mocks.invalidate }));
vi.mock("@/components/featured-restaurants/FeaturedSortableList", () => ({
  default: ({
    items,
    disabled,
    onReorder,
    renderItem,
  }: {
    items: FeaturedRestaurant[];
    disabled: boolean;
    onReorder: (items: FeaturedRestaurant[]) => void;
    renderItem: (item: FeaturedRestaurant, handle: ReactNode) => ReactNode;
  }) => (
    <div>
      <button disabled={disabled} onClick={() => onReorder([...items].reverse())}>
        Move Last Restaurant First
      </button>
      {items.map((item) => (
        <div key={item.id} data-testid="featured-row">
          {renderItem(item, <span>Handle</span>)}
        </div>
      ))}
    </div>
  ),
}));

const restaurants: FeaturedRestaurant[] = ["First", "Second"].map((name, index) => ({
  id: `featured-${index}`,
  businessId: `business-${index}`,
  locationId: `location-${index}`,
  isActive: true,
  sortOrder: index,
  createdAt: "2026-10-01T12:00:00.000Z",
  business: { id: `business-${index}`, name, username: name.toLowerCase() },
  location: { id: `location-${index}`, displayName: "Main Branch", address: "Example Street" },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.invalidate.mockResolvedValue(undefined);
  mocks.api.mockResolvedValue({ featured: restaurants });
});

function order() {
  return screen.getAllByTestId("featured-row").map((row) => row.textContent);
}

describe("Featured Restaurant Autosave", () => {
  it("shows compact content without order inputs or the inline add form", async () => {
    render(<FeaturedRestaurantsManager />);
    await screen.findByText("First", { exact: true });
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.queryByText("Drag To Reorder Homepage Restaurants", { exact: true })).toBeNull();
    expect(screen.queryByLabelText("Business Username")).toBeNull();
    expect(screen.getByRole("link", { name: "View Homepage" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("button", { name: "Add Restaurant", exact: true })).toBeTruthy();
  });

  it("updates immediately, blocks overlapping changes, and persists the complete order", async () => {
    let finish = (_data: { featured: FeaturedRestaurant[] }) => {};
    render(<FeaturedRestaurantsManager />);
    await screen.findByText("First", { exact: true });
    mocks.api.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Move Last Restaurant First" }));
    expect(order()[0]).toContain("Second");
    expect(
      (screen.getByRole("button", { name: "Delete First" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(mocks.api).toHaveBeenLastCalledWith("/admin/featured-restaurants/reorder", {
      method: "PATCH",
      body: JSON.stringify({ ids: ["featured-1", "featured-0"] }),
    });
    await act(async () => finish({ featured: [...restaurants].reverse() }));
    expect(await screen.findByText("Order Saved")).toBeTruthy();
    expect(order()[0]).toContain("Second");
    expect(mocks.invalidate).toHaveBeenCalledTimes(1);
  });

  it("restores the prior order and reports a failed save", async () => {
    render(<FeaturedRestaurantsManager />);
    await screen.findByText("First", { exact: true });
    mocks.api.mockRejectedValueOnce(new Error("The featured list changed. Refresh and try again."));
    fireEvent.click(screen.getByRole("button", { name: "Move Last Restaurant First" }));
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Unable To Save Order", variant: "destructive" }),
      ),
    );
    expect(order()[0]).toContain("First");
    expect(mocks.invalidate).not.toHaveBeenCalled();
    expect(
      (screen.getByRole("button", { name: "Move Last Restaurant First" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("requires confirmation before removing a restaurant and retains it after failure", async () => {
    render(<FeaturedRestaurantsManager />);
    await screen.findByText("First", { exact: true });
    fireEvent.click(screen.getByRole("button", { name: "Delete First" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("First");
    expect(mocks.api).toHaveBeenCalledTimes(1);
    mocks.api.mockRejectedValueOnce(new Error("Removal failed"));
    fireEvent.click(screen.getByRole("button", { name: "Delete", exact: true }));
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Unable To Remove Restaurant" }),
      ),
    );
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(order()[0]).toContain("First");
    mocks.api.mockResolvedValueOnce({ success: true });
    fireEvent.click(screen.getByRole("button", { name: "Delete", exact: true }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(order()).toHaveLength(1);
    expect(order()[0]).toContain("Second");
  });
});
