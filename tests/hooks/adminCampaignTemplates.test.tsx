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
  it("shows the shared business empty state with filters and sorting available", async () => {
    mocks.api.mockResolvedValue({ templates: [], counts: {} });
    render(<CampaignTemplatesAdmin />);

    expect(await screen.findByRole("heading", { name: "No Templates Found" })).toBeTruthy();
    expect(
      screen.getByText(
        "Business-submitted campaign templates will appear here. Try changing your filters or search.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "All" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("button", { name: "Refresh" })).toBeNull();
    expect(screen.getByRole("button", { name: "Filter", exact: true })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sort By: Newest First" })).toBeTruthy();
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

  it("shows status categories without counts and preserves status queries", async () => {
    render(<CampaignTemplatesAdmin />);
    const all = screen.getByRole("button", { name: "All" });
    const pending = await screen.findByRole("button", { name: "Pending Review" });

    expect(
      within(screen.getByRole("group", { name: "Template Statuses" }))
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["All", "Draft", "Pending Review", "Approved", "Rejected"]);
    expect(screen.queryByRole("heading", { name: "Campaign Templates", exact: true })).toBeNull();
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

  it("keeps status and debounced search parameters when sorting templates", async () => {
    render(<CampaignTemplatesAdmin />);
    fireEvent.click(await screen.findByRole("button", { name: "Approved" }));
    fireEvent.change(screen.getByPlaceholderText("Search by business, template name, or content"), {
      target: { value: "  dinner & guests  " },
    });

    await waitFor(() =>
      expect(mocks.api).toHaveBeenLastCalledWith(
        "/admin/campaign-templates?status=APPROVED&search=dinner+%26+guests",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Sort By: Newest First" }));
    fireEvent.click(await screen.findByRole("button", { name: "Oldest First", exact: true }));

    expect(mocks.api).toHaveBeenLastCalledWith(
      "/admin/campaign-templates?status=APPROVED&search=dinner+%26+guests",
    );
  });

  it("filters by date, retains panel selections, and clears filters from empty results", async () => {
    const day = 24 * 60 * 60 * 1000;
    const recent = new Date(Date.now() - 14 * day).toISOString();
    const old = new Date(Date.now() - 60 * day).toISOString();
    const loadedTemplates = [
      {
        ...template,
        id: "alpha",
        name: "Alpha Offer",
        createdAt: old,
        submittedAt: recent,
        business: {
          id: "alpha-business",
          name: "Alpha Restaurant",
          username: "alpha",
          email: "alpha@example.test",
        },
      },
      {
        ...template,
        id: "draft",
        name: "Recent Draft",
        approvalStatus: "DRAFT",
        createdAt: recent,
        submittedAt: old,
        business: {
          id: "alpha-business",
          name: "Alpha Restaurant",
          username: "alpha",
          email: "alpha@example.test",
        },
      },
      {
        ...template,
        id: "beta",
        name: "Older Submission",
        createdAt: recent,
        submittedAt: old,
        businessUsername: "beta",
        business: null,
      },
    ];
    mocks.api.mockResolvedValue({ templates: loadedTemplates });
    render(<CampaignTemplatesAdmin />);
    await screen.findByRole("heading", { name: "Alpha Offer" });
    fireEvent.click(screen.getByRole("button", { name: "Filter", exact: true }));
    let panel = await screen.findByRole("dialog", { name: "Filter" });
    expect(within(panel).queryByRole("textbox", { name: "Business" })).toBeNull();
    fireEvent.click(within(panel).getByRole("button", { name: "Last 30 Days" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Show Templates" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Filter" })).toBeNull());
    expect(screen.getByRole("heading", { name: "Alpha Offer" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Recent Draft" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Older Submission" })).toBeNull();
    expect(screen.getByLabelText("1 Active Filters")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Filter", exact: true }));
    panel = await screen.findByRole("dialog", { name: "Filter" });
    expect(
      within(panel).getByRole("button", { name: "Last 30 Days" }).getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(within(panel).getByRole("button", { name: "Last 7 Days" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Show Templates" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Filter" })).toBeNull());
    expect(screen.getByRole("heading", { name: "No Templates Found" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear Filters", exact: true }));
    expect(screen.getByRole("heading", { name: "Older Submission" })).toBeTruthy();
    expect(screen.queryByLabelText(/Active Filters/)).toBeNull();
  });

  it("sorts by newest, oldest, and template name with creation dates for drafts", async () => {
    const loadedTemplates = [
      { ...template, id: "old", name: "Bravo Offer", submittedAt: "2026-01-01T12:00:00.000Z" },
      {
        ...template,
        id: "draft",
        name: "Zulu Draft",
        approvalStatus: "DRAFT",
        submittedAt: "2025-01-01T12:00:00.000Z",
        createdAt: "2026-03-01T12:00:00.000Z",
      },
      { ...template, id: "new", name: "Alpha Offer", submittedAt: "2026-02-01T12:00:00.000Z" },
    ];
    mocks.api.mockResolvedValue({ templates: loadedTemplates });
    render(<CampaignTemplatesAdmin />);
    await screen.findByRole("heading", { name: "Zulu Draft" });
    const names = () =>
      screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent);
    expect(names()).toEqual(["Zulu Draft", "Alpha Offer", "Bravo Offer"]);
    fireEvent.click(screen.getByRole("button", { name: "Sort By: Newest First" }));
    fireEvent.click(await screen.findByRole("button", { name: "Oldest First", exact: true }));
    expect(names()).toEqual(["Bravo Offer", "Alpha Offer", "Zulu Draft"]);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Oldest First", exact: true })).toBeNull(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Sort By: Oldest First" }));
    fireEvent.click(await screen.findByRole("button", { name: "Template Name", exact: true }));
    expect(names()).toEqual(["Alpha Offer", "Bravo Offer", "Zulu Draft"]);
    expect(loadedTemplates.map((item) => item.name)).toEqual([
      "Bravo Offer",
      "Zulu Draft",
      "Alpha Offer",
    ]);
    expect(mocks.api).toHaveBeenCalledTimes(1);
  });

  it.each([null, "2026-10-01T12:00:00.000Z"])(
    "hides submission metadata and review actions for drafts with submittedAt %s",
    async (submittedAt) => {
      mocks.api.mockResolvedValue({
        templates: [{ ...template, approvalStatus: "DRAFT", submittedAt }],
      });
      render(<CampaignTemplatesAdmin />);
      const dialog = await openReview();
      expect(within(dialog).queryByText(/Submitted/)).toBeNull();
      expect(within(dialog).queryByRole("button", { name: "Approve", exact: true })).toBeNull();
      expect(within(dialog).queryByRole("button", { name: "Reject", exact: true })).toBeNull();
      expect(within(dialog).getByRole("heading", { name: "Template Content" })).toBeTruthy();
      expect(within(dialog).getByText("example-restaurant", { exact: true })).toBeTruthy();
    },
  );

  it("shows submission metadata only when a non-draft has a valid submission date", async () => {
    render(<CampaignTemplatesAdmin />);
    const dialog = await openReview();
    expect(within(dialog).getByText("example-restaurant · Submitted Oct 1, 2026")).toBeTruthy();
  });

  it.each([null, "invalid-date"])(
    "omits missing or invalid submission dates (%s)",
    async (submittedAt) => {
      mocks.api.mockResolvedValue({ templates: [{ ...template, submittedAt }] });
      render(<CampaignTemplatesAdmin />);
      const dialog = await openReview();
      expect(within(dialog).queryByText(/Submitted/)).toBeNull();
    },
  );

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
  it("shows the restaurant profile name and a Delete button without visibility switches", async () => {
    mocks.api.mockResolvedValueOnce({
      featured: [
        {
          id: "featured-fixture",
          name: "Japanese Restaurant",
          businessId: "business-fixture",
          locationId: "location-fixture",
          isActive: true,
          sortOrder: 0,
          createdAt: "2026-10-01T12:00:00.000Z",
          business: {
            id: "business-fixture",
            username: "example-restaurant",
            name: "Demo Restaurant",
          },
          location: { id: "location-fixture", displayName: "Featured Location", address: "" },
        },
      ],
    });
    render(<FeaturedRestaurantsManager />);
    expect(await screen.findByText("Japanese Restaurant", { exact: true })).toBeTruthy();
    expect(screen.queryByText("Demo Restaurant", { exact: true })).toBeNull();
    expect(screen.getByRole("button", { name: "Delete Japanese Restaurant" })).toBeTruthy();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("menuitem")).toBeNull();
    expect(screen.queryByText("Active", { exact: true })).toBeNull();
  });

  it("shows the shared empty state and opens business search from the add dialog", async () => {
    mocks.api.mockResolvedValue({ featured: [] });
    render(<FeaturedRestaurantsManager />);

    expect(
      await screen.findByRole("heading", { name: "No Featured Restaurants Yet" }),
    ).toBeTruthy();
    expect(
      screen.getByText("Add a restaurant to choose which locations appear on the homepage."),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Business Username")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add Restaurant", exact: true }));
    expect(await screen.findByLabelText("Business Username")).toBeTruthy();
    expect(mocks.api).toHaveBeenCalledWith(
      "/admin/featured-restaurants",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
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
    expect(mocks.api).toHaveBeenLastCalledWith(
      "/admin/featured-restaurants",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
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
