import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BusinessReviews from "../../src/pages/BusinessReviews.js";
import type { Review } from "../../src/lib/reviews.js";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => {
  return { api: apiMock };
});

const session = vi.hoisted(() => {
  return { currentLocation: { id: "loc-1", displayName: "PIK Avenue" } as any };
});
vi.mock("@/lib/businessSession", () => {
  return { useBusinessSession: () => session };
});

const toastSpy = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => {
  return { useToast: () => ({ toast: toastSpy }) };
});

vi.mock("@/components/SEO", () => {
  return {
    default: () => null,
    BUSINESS_DESCRIPTION: "",
    BUSINESS_IMAGE: "",
  };
});

function review(overrides: Partial<Review> = {}): Review {
  return {
    id: "r1",
    customerName: "Bryan Susanto",
    rating: 5,
    description: "Great experience and quick service.",
    createdAt: "2026-08-25T12:00:00.000Z",
    ...overrides,
  };
}

function reviewsFor(locationId: string): Review[] {
  if (locationId === "loc-1") {
    return [
      review({ id: "pik-1", customerName: "Bryan Susanto", rating: 5 }),
      review({
        id: "pik-2",
        customerName: "Kevin Nguyen",
        rating: 3,
        createdAt: "2026-08-20T12:00:00.000Z",
      }),
    ];
  }
  return [review({ id: "plaza-1", customerName: "Ada Lovelace", rating: 4 })];
}

beforeEach(() => {
  vi.clearAllMocks();
  session.currentLocation = { id: "loc-1", displayName: "PIK Avenue" };
  apiMock.mockImplementation((url: string) => {
    const match = /\/api\/locations\/([^/]+)\/reviews$/.exec(url);
    if (match) {
      return Promise.resolve({ reviews: reviewsFor(match[1]) });
    }
    return Promise.resolve({});
  });
});

describe("the reviews page", () => {
  it("loads reviews for the location selected in the sidebar", async () => {
    render(<BusinessReviews />);

    await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/api/locations/loc-1/reviews"));
    expect(await screen.findByTestId("reviews-list")).toBeTruthy();
  });

  it("shows the page heading rather than a coming soon placeholder", async () => {
    render(<BusinessReviews />);

    expect(await screen.findByRole("heading", { name: "Customer Reviews" })).toBeTruthy();
    expect(screen.queryByText(/coming soon/i)).toBeNull();
  });

  it("does not render its own location selector", async () => {
    render(<BusinessReviews />);

    await screen.findByTestId("reviews-list");
    expect(screen.queryByText("PIK Avenue")).toBeNull();
    expect(screen.queryByLabelText(/switch location/i)).toBeNull();
  });

  it("asks the operator to pick a location when none is selected", async () => {
    session.currentLocation = null;
    render(<BusinessReviews />);

    expect(await screen.findByTestId("reviews-no-location")).toBeTruthy();
    expect(apiMock).not.toHaveBeenCalled();
  });

  it("shows only the reviews belonging to the selected location", async () => {
    render(<BusinessReviews />);

    const list = await screen.findByTestId("reviews-list");
    expect(within(list).getByText("Bryan Susanto")).toBeTruthy();
    expect(within(list).getByText("Kevin Nguyen")).toBeTruthy();
    expect(within(list).queryByText("Ada Lovelace")).toBeNull();
  });

  it("reloads when the sidebar location changes", async () => {
    const view = render(<BusinessReviews />);
    await screen.findByTestId("reviews-list");

    session.currentLocation = { id: "loc-2", displayName: "Plaza Indonesia" };
    view.rerender(<BusinessReviews />);

    await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/api/locations/loc-2/reviews"));
    const list = await screen.findByTestId("reviews-list");
    await waitFor(() => expect(within(list).queryByText("Ada Lovelace")).toBeTruthy());
    expect(within(list).queryByText("Bryan Susanto")).toBeNull();
  });

  it("reports the average rating, the total, and the distribution", async () => {
    render(<BusinessReviews />);

    expect((await screen.findByTestId("reviews-average")).textContent).toBe("4.0");
    expect((await screen.findByTestId("reviews-reply-status")).textContent).toBe(
      "2 guests are waiting, chef.",
    );
    expect(screen.getByTestId("reviews-reply-status-body").textContent).toBe(
      "Send a quick reply and keep the good vibes simmering.",
    );

    const five = await screen.findByTestId("reviews-distribution-5");
    const three = await screen.findByTestId("reviews-distribution-3");
    expect(five.textContent).toContain("1");
    expect(three.textContent).toContain("1");
  });

  it("uses singular wording when one guest needs a reply", async () => {
    apiMock.mockResolvedValue({ reviews: [review()] });
    render(<BusinessReviews />);

    expect((await screen.findByTestId("reviews-reply-status")).textContent).toBe(
      "One guest is waiting, chef.",
    );
  });

  it("handles a location with no reviews without a large empty container", async () => {
    apiMock.mockResolvedValue({ reviews: [] });
    render(<BusinessReviews />);

    expect(await screen.findByTestId("reviews-empty")).toBeTruthy();
    expect(screen.queryByTestId("reviews-summary")).toBeNull();
    expect(screen.queryByTestId("reviews-list")).toBeNull();
  });

  it("surfaces a failed load", async () => {
    apiMock.mockRejectedValue(new Error("Failed to load reviews."));
    render(<BusinessReviews />);

    expect((await screen.findByTestId("reviews-error")).textContent).toContain(
      "Failed to load reviews.",
    );
  });
});

describe("sorting and filtering on the reviews page", () => {
  function orderedNames(list: HTMLElement): string[] {
    return Array.from(list.querySelectorAll("[data-testid^='review-author-']")).map(
      (name) => name.textContent ?? "",
    );
  }

  it("shows the newest review first by default", async () => {
    render(<BusinessReviews />);

    const list = await screen.findByTestId("reviews-list");
    expect(orderedNames(list)).toEqual(["Bryan Susanto", "Kevin Nguyen"]);
  });

  it("offers a sort control and the quick filter chips", async () => {
    render(<BusinessReviews />);
    await screen.findByTestId("reviews-list");

    expect(screen.getByTestId("reviews-sort")).toBeTruthy();
    expect(screen.getByLabelText("Sort reviews")).toBeTruthy();
    for (const chip of ["all", "needs-reply", "replied", "low"]) {
      expect(screen.getByTestId(`reviews-chip-${chip}`)).toBeTruthy();
    }
  });

  it("starts on newest first", async () => {
    render(<BusinessReviews />);
    await screen.findByTestId("reviews-list");

    expect(screen.getByTestId("reviews-sort").textContent).toContain("Newest First");
  });
});
