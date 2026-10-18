import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CampaignTemplatesAdmin from "../../src/components/CampaignTemplatesAdmin";
import FeaturedRestaurantsManager from "../../src/components/FeaturedRestaurantsManager";

const mocks = vi.hoisted(() => ({ api: vi.fn(), toast: vi.fn(), writeText: vi.fn() }));

vi.mock("@/lib/api", () => ({ api: mocks.api }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));

const template = {
  id: "template-fixture",
  templateType: "CUSTOM",
  businessId: "business-fixture",
  businessUsername: "example-restaurant",
  locationId: null,
  name: "Guest Invitation",
  slug: "guest-invitation",
  purpose: "Welcome Guests",
  body: "Welcome to our restaurant.\nBook your next visit with us.",
  offerDetails: null,
  ctaText: null,
  ctaUrl: null,
  variables: [],
  exampleValues: {},
  approvalStatus: "PENDING_SEATPING_REVIEW",
  rejectionReason: null,
  internalReviewNotes: null,
  whatsappMetaStatus: "PENDING",
  whatsappProviderTemplateName: "guest_invitation",
  whatsappProviderTemplateId: null,
  whatsappMetaCategory: null,
  whatsappLanguage: null,
  submittedAt: "2026-10-01T12:00:00.000Z",
  approvedAt: null,
  rejectedAt: null,
  approvedBy: null,
  rejectedBy: null,
  createdAt: "2026-10-01T12:00:00.000Z",
  updatedAt: "2026-10-01T12:00:00.000Z",
  business: null,
};

const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.api.mockImplementation((url: string, options?: RequestInit) => {
    if (options?.method === "POST") {
      return Promise.resolve({});
    }
    return Promise.resolve({
      templates: [template],
      counts: { DRAFT: 2, PENDING_SEATPING_REVIEW: 3, APPROVED: 4, REJECTED: 1 },
    });
  });
  mocks.writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: mocks.writeText },
  });
});

afterEach(() => {
  if (clipboardDescriptor) {
    Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
  } else {
    Reflect.deleteProperty(navigator, "clipboard");
  }
});

async function openReview() {
  fireEvent.click(await screen.findByRole("button", { name: /Guest Invitation/ }));
  return screen.findByRole("dialog", { name: /Guest Invitation/ });
}

describe("Admin Campaign Templates", () => {
  it("shows the shared business empty state with filters and refresh available", async () => {
    mocks.api.mockResolvedValue({ templates: [], counts: {} });
    render(<CampaignTemplatesAdmin />);

    expect(await screen.findByRole("heading", { name: "No Templates Found" })).toBeTruthy();
    expect(
      screen.getByText(
        "Business-submitted campaign templates will appear here. Try changing your filters or search.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "All" }).getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByRole("button", { name: "Refresh" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("keeps the loading state until an empty template response resolves", async () => {
    let resolveTemplates = (_response: {
      templates: unknown[];
      counts: Record<string, number>;
    }) => {};
    mocks.api.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveTemplates = resolve;
        }),
    );
    render(<CampaignTemplatesAdmin />);

    expect(screen.getByRole("status", { name: "Loading Templates" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "No Templates Found" })).toBeNull();
    await act(async () => {
      resolveTemplates({ templates: [], counts: {} });
    });

    expect(screen.getByRole("heading", { name: "No Templates Found" })).toBeTruthy();
    expect(screen.queryByRole("status", { name: "Loading Templates" })).toBeNull();
  });

  it("exposes the selected shared filter button and preserves counts and status queries", async () => {
    render(<CampaignTemplatesAdmin />);
    const all = screen.getByRole("button", { name: "All" });
    const pending = await screen.findByRole("button", { name: "Pending Review (3)" });

    expect(all.getAttribute("aria-pressed")).toBe("true");
    expect(pending.getAttribute("aria-pressed")).toBe("false");
    expect(all.className).toContain("rounded-control");
    expect(all.className).toContain("control-sm");
    expect(all.className).not.toContain("rounded-full");

    fireEvent.click(pending);

    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith(
        "/admin/campaign-templates?status=PENDING_SEATPING_REVIEW",
      ),
    );
    expect(pending.getAttribute("aria-pressed")).toBe("true");
    expect(all.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(all);

    await waitFor(() => expect(mocks.api).toHaveBeenLastCalledWith("/admin/campaign-templates?"));
    expect(all.getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps status and debounced search parameters when refreshing templates", async () => {
    render(<CampaignTemplatesAdmin />);
    fireEvent.click(await screen.findByRole("button", { name: "Approved (4)" }));
    fireEvent.change(screen.getByPlaceholderText("Search by business, template name, or content"), {
      target: { value: "  dinner & guests  " },
    });

    await waitFor(() =>
      expect(mocks.api).toHaveBeenLastCalledWith(
        "/admin/campaign-templates?status=APPROVED&search=dinner+%26+guests",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    expect(mocks.api).toHaveBeenLastCalledWith(
      "/admin/campaign-templates?status=APPROVED&search=dinner+%26+guests",
    );
  });

  it("copies the exact username and multiline message through shared copy buttons", async () => {
    render(<CampaignTemplatesAdmin />);
    const dialog = await openReview();
    const username = within(dialog).getByRole("button", { name: template.slug });
    const message = within(dialog).getByTitle("Click to copy message");

    expect(username.className).toContain("rounded-control");
    expect(message.className).toContain("h-auto");
    expect(message.className).toContain("whitespace-pre-wrap");
    fireEvent.click(username);

    await waitFor(() => expect(mocks.writeText).toHaveBeenCalledWith(template.slug));
    fireEvent.click(message);

    await waitFor(() => expect(mocks.writeText).toHaveBeenLastCalledWith(template.body));
    expect(mocks.toast).toHaveBeenCalledWith({ title: "Message copied" });
  });

  it("preserves the existing approval operation and refreshes the template list", async () => {
    render(<CampaignTemplatesAdmin />);
    const dialog = await openReview();
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve" }));

    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith("/admin/campaign-templates/template-fixture/approve", {
        method: "POST",
        body: JSON.stringify({
          whatsappProviderTemplateName: "guest_invitation",
          whatsappMetaStatus: "PENDING",
        }),
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.api).toHaveBeenLastCalledWith("/admin/campaign-templates?");
  });

  it("requires a rejection reason and preserves the submitted rejection operation", async () => {
    render(<CampaignTemplatesAdmin />);
    const dialog = await openReview();
    fireEvent.click(within(dialog).getByRole("button", { name: "Reject" }));
    const rejection = await screen.findByRole("dialog", { name: "Reject Template" });
    fireEvent.click(within(rejection).getByRole("button", { name: "Reject" }));

    expect(mocks.toast).toHaveBeenCalledWith({
      title: "A rejection reason is required",
      variant: "destructive",
    });
    expect(mocks.api.mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
    fireEvent.change(
      within(rejection).getByPlaceholderText("Shown to the business if you reject this template"),
      { target: { value: "Please clarify the offer." } },
    );
    fireEvent.click(within(rejection).getByRole("button", { name: "Reject" }));

    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith("/admin/campaign-templates/template-fixture/reject", {
        method: "POST",
        body: JSON.stringify({ rejectionReason: "Please clarify the offer." }),
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("Admin Featured Restaurants Empty State", () => {
  it("updates a featured restaurant status and restores it if the update fails", async () => {
    mocks.api.mockResolvedValueOnce({
      featured: [
        {
          id: "featured-fixture",
          businessId: "business-fixture",
          locationId: "location-fixture",
          isActive: true,
          sortOrder: 0,
          createdAt: "2026-10-01T12:00:00.000Z",
          business: { id: "business-fixture", username: "example-restaurant" },
          location: { id: "location-fixture", displayName: "Featured Location", address: "" },
        },
      ],
    });
    render(<FeaturedRestaurantsManager />);
    await screen.findByText("Featured Location");
    const toggle = screen.getByRole("switch", { name: "Toggle active" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");

    fireEvent.click(toggle);
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("false"));
    expect(screen.getByText("Inactive")).toBeTruthy();
    expect(mocks.api).toHaveBeenLastCalledWith("/admin/featured-restaurants/featured-fixture", {
      method: "PATCH",
      body: JSON.stringify({ isActive: false }),
    });

    mocks.api.mockRejectedValueOnce(new Error("Update unavailable"));
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Failed to update",
          variant: "destructive",
        }),
      ),
    );
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("Inactive")).toBeTruthy();
  });

  it("shows the shared business empty state and retains the business search control", async () => {
    mocks.api.mockResolvedValue({ featured: [] });
    render(<FeaturedRestaurantsManager />);

    expect(
      await screen.findByRole("heading", { name: "No Featured Restaurants Yet" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Search for a business above to feature one of its locations on the homepage.",
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText("Business Username")).toBeTruthy();
    expect(mocks.api).toHaveBeenCalledWith("/admin/featured-restaurants");
  });

  it("sanitizes a failed featured list and retries into a successful empty state", async () => {
    mocks.api
      .mockRejectedValueOnce(new Error("Internal server error"))
      .mockResolvedValue({ featured: [] });
    render(<FeaturedRestaurantsManager />);

    expect(
      await screen.findByRole("heading", { name: "Unable To Load Featured Restaurants" }),
    ).toBeTruthy();
    expect(
      screen.getByText("We couldn't load featured restaurants right now. Please try again."),
    ).toBeTruthy();
    expect(screen.queryByText("Internal server error")).toBeNull();
    expect(screen.queryByRole("heading", { name: "No Featured Restaurants Yet" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));

    expect(
      await screen.findByRole("heading", { name: "No Featured Restaurants Yet" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "Unable To Load Featured Restaurants" }),
    ).toBeNull();
    expect(mocks.api).toHaveBeenCalledTimes(2);
    expect(mocks.api).toHaveBeenLastCalledWith("/admin/featured-restaurants");
  });

  it("keeps the retry loading state until the featured response resolves", async () => {
    let resolveFeatured = (_response: { featured: unknown[] }) => {};
    mocks.api.mockRejectedValueOnce(new Error("Internal server error")).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFeatured = resolve;
        }),
    );
    render(<FeaturedRestaurantsManager />);
    fireEvent.click(await screen.findByRole("button", { name: "Try Again" }));

    expect(screen.getByRole("status", { name: "Loading Featured Restaurants" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try Again" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "No Featured Restaurants Yet" })).toBeNull();
    await act(async () => {
      resolveFeatured({ featured: [] });
    });

    expect(screen.getByRole("heading", { name: "No Featured Restaurants Yet" })).toBeTruthy();
    expect(screen.queryByRole("status", { name: "Loading Featured Restaurants" })).toBeNull();
  });
});
