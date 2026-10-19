import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FeaturedSortableList from "../../src/components/featured-restaurants/FeaturedSortableList.js";
import type { FeaturedRestaurant } from "../../src/components/featured-restaurants/types.js";

const restaurants: FeaturedRestaurant[] = [
  {
    id: "first",
    businessId: "business-first",
    locationId: "location-first",
    isActive: true,
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    business: { id: "business-first", name: "First Restaurant", username: "first" },
    location: { id: "location-first", address: "First Street" },
  },
  {
    id: "second",
    businessId: "business-second",
    locationId: "location-second",
    isActive: false,
    sortOrder: 1,
    createdAt: "2026-01-02T00:00:00.000Z",
    business: { id: "business-second", name: "Second Restaurant", username: "second" },
    location: { id: "location-second", address: "Second Street" },
  },
];

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
    const row = this.closest("li");
    let top = 100;
    if (row?.getAttribute("data-testid") === "featured-row-second") {
      top = 160;
    }
    return {
      x: 0,
      y: top,
      top,
      left: 0,
      bottom: top + 60,
      right: 500,
      width: 500,
      height: 60,
      toJSON: () => ({}),
    };
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderList(disabled = false) {
  const onReorder = vi.fn();
  const onToggle = vi.fn();
  const view = render(
    <FeaturedSortableList
      items={restaurants}
      disabled={disabled}
      onReorder={onReorder}
      renderItem={(item, handle) => (
        <div>
          {handle}
          <span>{item.business?.name}</span>
          <button type="button" onClick={onToggle}>
            Toggle {item.business?.name}
          </button>
        </div>
      )}
    />,
  );
  return { ...view, onReorder, onToggle };
}

async function pickUpFirst() {
  const handle = screen.getByRole("button", { name: "Reorder First Restaurant" });
  handle.focus();
  fireEvent.keyDown(handle, { code: "Space" });
  await waitFor(() => {
    expect(handle.getAttribute("aria-pressed")).toBe("true");
  });
  return handle;
}

describe("Featured Restaurant Sorting", () => {
  it("uses a dedicated accessible handle while keeping row actions independent", () => {
    const { onToggle, onReorder } = renderList();
    const list = screen.getByRole("list", { name: "Featured Restaurants" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    const handle = screen.getByRole("button", { name: "Reorder First Restaurant" });
    expect(handle.getAttribute("aria-describedby")).toBeTruthy();
    expect(handle.className).toContain("touch-none");
    fireEvent.click(screen.getByRole("button", { name: "Toggle First Restaurant" }));
    expect(onToggle).toHaveBeenCalledOnce();
    expect(onReorder).not.toHaveBeenCalled();
    expect(handle.getAttribute("aria-pressed")).not.toBe("true");
  });

  it("moves a restaurant with the keyboard and reports the new ordering on drop", async () => {
    const { onReorder } = renderList();
    await pickUpFirst();
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain(
        "First Restaurant is at position 1 of 2.",
      );
    });
    fireEvent.keyDown(document, { code: "ArrowDown" });
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain("position 2 of 2");
    });
    expect(onReorder).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { code: "Space" });
    await waitFor(() => {
      expect(onReorder).toHaveBeenCalledWith([restaurants[1], restaurants[0]]);
    });
    expect(restaurants.map((item) => item.id)).toEqual(["first", "second"]);
  });

  it("cancels sorting with Escape without changing the list", async () => {
    const { onReorder } = renderList();
    const handle = await pickUpFirst();
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain(
        "First Restaurant is at position 1 of 2.",
      );
    });
    fireEvent.keyDown(document, { code: "Escape" });
    await waitFor(() => {
      expect(handle.getAttribute("aria-pressed")).not.toBe("true");
    });
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("disables all drag handles during persistence", () => {
    const { onReorder } = renderList(true);
    for (const handle of screen.getAllByRole("button", { name: /^Reorder / })) {
      expect(handle.hasAttribute("disabled")).toBe(true);
      fireEvent.keyDown(handle, { code: "Space" });
    }
    expect(onReorder).not.toHaveBeenCalled();
  });
});
