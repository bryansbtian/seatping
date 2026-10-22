import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Admin from "../../src/pages/Admin.js";

const mocks = vi.hoisted(() => ({ toast: vi.fn(), invalidate: vi.fn() }));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/lib/queryClient", () => ({ invalidateRestaurantConfiguration: mocks.invalidate }));
vi.mock("@/components/Header", () => ({ default: () => <header>SeatPing</header> }));
vi.mock("@/components/SEO", () => ({ default: () => null }));
vi.mock("@/components/FeaturedRestaurantsManager", () => ({
  default: () => <p>Featured Restaurant Controls</p>,
}));
vi.mock("@/components/CampaignTemplatesAdmin", () => ({
  default: () => <p>Campaign Template Controls</p>,
}));

const ticket = {
  id: "ticket-1",
  ticketNumber: "SP-101",
  type: "feedback",
  status: "open",
  priority: "high",
  subject: "Reservation Support",
  senderName: "Test Operator",
  senderEmail: "operator@example.test",
  data: { feedbackType: "support", severity: "medium" },
  messages: [],
  createdAt: "2026-10-01T12:00:00.000Z",
  updatedAt: "2026-10-01T12:00:00.000Z",
};

const customer = {
  name: "Example Restaurant",
  username: "example-restaurant",
  email: "restaurant@example.test",
  phone: "+12025550123",
  trial: false,
  trialDurationDays: 14,
  maxLocations: 2,
  baseCredits: 100,
  creditsStartedAt: null,
  locations: [{ address: "Example Street", credits: 50 }],
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function defaultFetch(input: RequestInfo | URL) {
  const url = String(input);
  if (url === "/auth/admin/session") {
    return Promise.resolve(jsonResponse({ authenticated: true }));
  }
  if (url === "/tickets/stats") {
    return Promise.resolve(
      jsonResponse({
        stats: { total: 6, open: 1, inProgress: 2, closed: 3, feedback: 2 },
      }),
    );
  }
  if (url.startsWith("/tickets?")) {
    return Promise.resolve(jsonResponse({ tickets: [ticket] }));
  }
  if (url === "/tickets/SP-101") {
    return Promise.resolve(jsonResponse({ ticket }));
  }
  if (url.startsWith("/admin/customer?")) {
    return Promise.resolve(
      jsonResponse({
        customers: [{ ...customer, id: "business-1", locationCount: 1 }],
        total: 1,
        page: 1,
        pageSize: 25,
      }),
    );
  }
  if (url === "/admin/customer/example-restaurant") {
    return Promise.resolve(jsonResponse({ customer }));
  }
  if (url === "/auth/admin/logout") {
    return Promise.resolve(jsonResponse({ success: true }));
  }
  return Promise.resolve(jsonResponse({ error: "Unexpected Request" }, 404));
}

function LocationProbe() {
  const { pathname } = useLocation();
  return <span aria-label="Current Route">{pathname}</span>;
}

function renderAdmin(path = "/admin/dashboard") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Admin />
      <LocationProbe />
    </MemoryRouter>,
  );
}

function loginForm() {
  const username = screen.getByLabelText("Username");
  const form = username.closest("form");
  if (!form) {
    throw new Error("Admin Login Form Is Missing");
  }
  return form;
}

async function completeLogin() {
  fireEvent.change(await screen.findByLabelText("Username"), { target: { value: "test-admin" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "test-password" } });
  fireEvent.submit(loginForm());
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(defaultFetch));
  vi.spyOn(console, "error").mockImplementation(() => {});
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Admin Portal Authentication", () => {
  it("waits for the admin session before rendering protected controls or requesting admin data", async () => {
    let resolveSession = (_response: Response) => {};
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveSession = resolve;
        }),
    );
    renderAdmin();
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Customer Management" })).toBeNull();
    expect(screen.queryByLabelText("Username")).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("/auth/admin/session", { credentials: "include" });
    await act(async () => {
      resolveSession(jsonResponse({ authenticated: false }));
    });
    expect(screen.getByLabelText("Username")).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["/admin/dashboard", "/admin/customers", "/admin/featured", "/admin/templates"])(
    "protects direct navigation to %s with the separate admin session",
    async (path) => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ authenticated: false }));
      renderAdmin(path);
      expect(await screen.findByLabelText("Username")).toBeTruthy();
      expect(screen.queryByRole("link", { name: "Ticket Management" })).toBeNull();
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(screen.getByLabelText("Current Route").textContent).toBe(path);
    },
  );

  it("fails closed when session verification fails even if a response contains authenticated true", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ authenticated: true }, 503));
    renderAdmin("/admin/customers");
    expect(await screen.findByLabelText("Username")).toBeTruthy();
    expect(screen.queryByLabelText("Search Business Accounts")).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("returns to the login when the admin session request rejects", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("Session Unavailable"));
    renderAdmin("/admin/templates");
    expect(await screen.findByLabelText("Username")).toBeTruthy();
    expect(screen.queryByText("Campaign Template Controls")).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("renders application validation without a native browser tooltip or login request", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ authenticated: false }));
    renderAdmin("/admin");
    await screen.findByLabelText("Username");
    expect(loginForm().noValidate).toBe(true);
    fireEvent.submit(loginForm());
    expect(screen.getByText(/username is required/i)).toBeTruthy();
    expect(screen.getByText(/password is required/i)).toBeTruthy();
    expect(screen.getByLabelText("Username").getAttribute("aria-invalid")).toBe("true");
    expect(fetch).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "test-admin" } });
    expect(screen.queryByText(/username is required/i)).toBeNull();
  });

  it("posts existing admin credentials with cookies and retains the requested section after login", async () => {
    vi.mocked(fetch).mockImplementation((input) => {
      if (String(input) === "/auth/admin/session") {
        return Promise.resolve(jsonResponse({ authenticated: false }));
      }
      if (String(input) === "/auth/admin/login") {
        return Promise.resolve(jsonResponse({ success: true }));
      }
      return defaultFetch(input);
    });
    renderAdmin("/admin/customers");
    await completeLogin();
    expect(await screen.findByLabelText("Search Business Accounts")).toBeTruthy();
    expect(screen.getByLabelText("Search Business Accounts").getAttribute("placeholder")).toBe(
      "Search by business, username, email, or phone",
    );
    expect(fetch).toHaveBeenCalledWith("/auth/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username: "test-admin", password: "test-password" }),
    });
    expect(screen.getByLabelText("Current Route").textContent).toBe("/admin/customers");
  });

  it("disables duplicate login submission while credentials are being verified and redirects the legacy entry", async () => {
    let finishLogin = (_response: Response) => {};
    vi.mocked(fetch).mockImplementation((input) => {
      if (String(input) === "/auth/admin/session") {
        return Promise.resolve(jsonResponse({ authenticated: false }));
      }
      if (String(input) === "/auth/admin/login") {
        return new Promise<Response>((resolve) => {
          finishLogin = resolve;
        });
      }
      return defaultFetch(input);
    });
    renderAdmin("/admin");
    await completeLogin();
    expect(
      (screen.getByRole("button", { name: /signing in/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.submit(loginForm());
    expect(
      vi.mocked(fetch).mock.calls.filter(([input]) => input === "/auth/admin/login"),
    ).toHaveLength(1);
    await act(async () => {
      finishLogin(jsonResponse({ success: true }));
    });
    expect(screen.getByLabelText("Current Route").textContent).toBe("/admin/dashboard");
    expect(
      screen.getByRole("link", { name: "Ticket Management" }).getAttribute("aria-current"),
    ).toBe("page");
  });

  it("keeps rejected credentials outside protected content and displays the server error", async () => {
    vi.mocked(fetch).mockImplementation((input) => {
      if (String(input) === "/auth/admin/login") {
        return Promise.resolve(jsonResponse({ error: "Invalid credentials." }, 401));
      }
      return Promise.resolve(jsonResponse({ authenticated: false }));
    });
    renderAdmin("/admin");
    await completeLogin();
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ description: "Invalid credentials.", variant: "destructive" }),
      ),
    );
    expect(screen.getByLabelText("Username")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Ticket Management" })).toBeNull();
  });

  it("logs out through the admin endpoint and removes protected controls", async () => {
    renderAdmin();
    await screen.findByRole("link", { name: "Customer Management" });
    fireEvent.click(screen.getByRole("button", { name: "Log Out" }));
    expect(await screen.findByLabelText("Username")).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith("/auth/admin/logout", {
      method: "POST",
      credentials: "include",
    });
    expect(screen.queryByRole("link", { name: "Customer Management" })).toBeNull();
  });
});

describe("Admin Portal Sections", () => {
  it("retries a ticket load failure and resolves to the existing business empty state", async () => {
    let unavailable = true;
    vi.mocked(fetch).mockImplementation((input) => {
      if (String(input).startsWith("/tickets?")) {
        if (unavailable) {
          return Promise.resolve(jsonResponse({ error: "Unavailable" }, 503));
        }
        return Promise.resolve(jsonResponse({ tickets: [] }));
      }
      return defaultFetch(input);
    });
    renderAdmin();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Please try again to load your tickets.");
    unavailable = false;
    fireEvent.click(within(alert).getByRole("button", { name: "Retry Tickets" }));
    expect(await screen.findByRole("heading", { name: "No Tickets Found" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps a loading skeleton visible until the ticket list resolves", async () => {
    let finishTickets = (_response: Response) => {};
    vi.mocked(fetch).mockImplementation((input) => {
      if (String(input).startsWith("/tickets?")) {
        return new Promise<Response>((resolve) => {
          finishTickets = resolve;
        });
      }
      return defaultFetch(input);
    });
    renderAdmin();
    expect(await screen.findByRole("status", { name: "Loading Tickets" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "No Tickets Found" })).toBeNull();
    await act(async () => {
      finishTickets(jsonResponse({ tickets: [ticket] }));
    });
    expect(screen.getByText("Reservation Support")).toBeTruthy();
    expect(screen.queryByRole("status", { name: "Loading Tickets" })).toBeNull();
  });

  it("uses route links with active states and preserves customer search when switching sections", async () => {
    renderAdmin("/admin/customers");
    const customerLink = await screen.findByRole("link", { name: "Customer Management" });
    expect(customerLink.getAttribute("aria-current")).toBe("page");
    expect(screen.queryByRole("tab", { name: "Customer Management" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Search Business Accounts"), {
      target: { value: "example-restaurant" },
    });
    fireEvent.click(screen.getByRole("link", { name: "Featured Restaurants" }));
    expect(await screen.findByText("Featured Restaurant Controls")).toBeTruthy();
    expect(screen.getByLabelText("Current Route").textContent).toBe("/admin/featured");
    expect(
      screen.getByRole("link", { name: "Featured Restaurants" }).getAttribute("aria-current"),
    ).toBe("page");
    fireEvent.click(screen.getByRole("link", { name: "Campaign Templates" }));
    expect(await screen.findByText("Campaign Template Controls")).toBeTruthy();
    expect(screen.getByLabelText("Current Route").textContent).toBe("/admin/templates");
    fireEvent.click(customerLink);
    expect(
      (await screen.findByLabelText("Search Business Accounts")) as HTMLInputElement,
    ).toHaveProperty("value", "example-restaurant");
  });

  it("summarizes attention and resolved totals and sends status, category, and priority filters to the API", async () => {
    renderAdmin();
    await screen.findByText("Reservation Support");
    const overview = screen.getByRole("region", { name: "Ticket Overview" });
    expect(
      within(overview).getByRole("heading", { name: "Needs Attention" }).nextElementSibling
        ?.textContent,
    ).toBe("3");
    expect(
      within(overview).getByRole("heading", { name: "Resolved" }).nextElementSibling?.textContent,
    ).toBe("3");
    expect(
      within(overview).getByRole("heading", { name: "Total Tickets" }).nextElementSibling
        ?.textContent,
    ).toBe("6");
    const categories = screen.getByRole("group", { name: "Ticket Categories" });
    fireEvent.click(within(categories).getByRole("button", { name: "Support", exact: true }));
    expect(screen.queryByRole("button", { name: "All Statuses" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Filter", exact: true }));
    const dialog = await screen.findByRole("dialog", { name: "Filter" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Open", exact: true }));
    fireEvent.click(within(dialog).getByRole("button", { name: "High", exact: true }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/tickets?status=open&type=feedback&priority=high"),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Show Tickets" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Filter" })).toBeNull());
    expect(
      vi.mocked(fetch).mock.calls.filter(([input]) => input === "/tickets/stats"),
    ).toHaveLength(1);
    expect(
      within(screen.getByRole("button", { name: "Filter", exact: true })).getByLabelText(
        "2 Active Filters",
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Filter", exact: true }));
    const reopened = await screen.findByRole("dialog", { name: "Filter" });
    expect(
      within(reopened)
        .getByRole("button", { name: "Open", exact: true })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      within(reopened)
        .getByRole("button", { name: "High", exact: true })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(within(reopened).getByRole("button", { name: "Clear Filters", exact: true }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/tickets?type=feedback"));
    expect(
      (within(reopened).getByRole("button", { name: "Clear Filters" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(within(reopened).getByRole("button", { name: "Close Filters" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Filter" })).toBeNull());
    expect(
      within(categories)
        .getByRole("button", { name: "Support", exact: true })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(within(categories).getByRole("button", { name: "All", exact: true }));
    await waitFor(() => expect(fetch).toHaveBeenLastCalledWith("/tickets?"));
    expect(
      screen.getByRole("button", { name: "All", exact: true }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("removes the sales category and shows only counts in the overview", async () => {
    renderAdmin();
    await screen.findByText("Reservation Support");
    const categories = screen.getByRole("group", { name: "Ticket Categories" });
    expect(
      within(categories)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["All", "Support", "Feedback"]);
    const overview = screen.getByRole("region", { name: "Ticket Overview" });
    expect(within(overview).queryByText(/Open|In Progress/)).toBeNull();
    expect(
      within(screen.getByRole("region", { name: "Ticket Results" })).queryByRole("heading", {
        name: /^\d+ Tickets?$/,
      }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Sort By: Newest First" })).toBeTruthy();
  });

  it("sorts loaded tickets by date and priority without changing their data", async () => {
    const loadedTickets = [
      {
        ...ticket,
        id: "old",
        subject: "Older Request",
        priority: "high",
        createdAt: "2026-10-01T12:00:00.000Z",
      },
      {
        ...ticket,
        id: "new",
        subject: "Newer Request",
        priority: "low",
        createdAt: "2026-10-03T12:00:00.000Z",
      },
      {
        ...ticket,
        id: "middle",
        subject: "Middle Request",
        priority: "high",
        createdAt: "2026-10-02T12:00:00.000Z",
      },
    ];
    vi.mocked(fetch).mockImplementation((input) => {
      if (String(input).startsWith("/tickets?")) {
        return Promise.resolve(jsonResponse({ tickets: loadedTickets }));
      }
      return defaultFetch(input);
    });
    renderAdmin();
    await screen.findByRole("heading", { name: "Newer Request", exact: true });
    const results = screen.getByRole("region", { name: "Ticket Results" });
    const subjects = () =>
      within(results)
        .getAllByRole("listitem")
        .map((item) => within(item).getByRole("heading").textContent);
    expect(subjects()).toEqual(["Newer Request", "Middle Request", "Older Request"]);
    fireEvent.click(screen.getByRole("button", { name: "Sort By: Newest First" }));
    fireEvent.click(await screen.findByRole("button", { name: "Oldest First", exact: true }));
    expect(subjects()).toEqual(["Older Request", "Middle Request", "Newer Request"]);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Oldest First", exact: true })).toBeNull(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Sort By: Oldest First" }));
    fireEvent.click(await screen.findByRole("button", { name: "Highest Priority", exact: true }));
    expect(subjects()).toEqual(["Middle Request", "Older Request", "Newer Request"]);
    expect(loadedTickets.map((item) => item.subject)).toEqual([
      "Older Request",
      "Newer Request",
      "Middle Request",
    ]);
  });

  it("searches tickets by subject, number, sender, and business and resets empty searches", async () => {
    renderAdmin();
    await screen.findByRole("heading", { name: "Reservation Support" });
    const input = screen.getByRole("textbox", { name: "Search Tickets" });
    for (const value of [" reservation ", "SP-101", "TEST OPERATOR", "operator@example.test"]) {
      fireEvent.change(input, { target: { value } });
      expect(screen.getByRole("heading", { name: "Reservation Support" })).toBeTruthy();
    }
    fireEvent.change(input, { target: { value: "unmatched inquiry" } });
    expect(screen.getByRole("heading", { name: "No Tickets Found" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Reservation Support" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clear Search And Filters" }));
    await screen.findByRole("heading", { name: "Reservation Support" });
    expect((input as HTMLInputElement).value).toBe("");
    expect(
      screen.getByRole("button", { name: "All", exact: true }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("groups support subtypes without changing stored feedback ticket types", async () => {
    const supportTickets = ["support", "bug", "ux", "billing"].map((feedbackType) => ({
      ...ticket,
      id: feedbackType,
      subject: `${feedbackType} Help`,
      data: { feedbackType },
    }));
    const feedbackTickets: Array<
      Omit<typeof ticket, "data"> & { data: { feedbackType: string } | null }
    > = ["feature", "other"].map((feedbackType) => ({
      ...ticket,
      id: feedbackType,
      subject: `${feedbackType} Feedback`,
      data: { feedbackType },
    }));
    feedbackTickets.push({ ...ticket, id: "legacy", subject: "Legacy Feedback", data: null });
    vi.mocked(fetch).mockImplementation((input) => {
      if (String(input).startsWith("/tickets?")) {
        return Promise.resolve(jsonResponse({ tickets: [...supportTickets, ...feedbackTickets] }));
      }
      return defaultFetch(input);
    });
    renderAdmin();
    await screen.findByText("bug Help");
    const categories = screen.getByRole("group", { name: "Ticket Categories" });
    fireEvent.click(within(categories).getByRole("button", { name: "Support", exact: true }));
    await waitFor(() => expect(screen.queryByText("feature Feedback")).toBeNull());
    for (const support of supportTickets) {
      expect(screen.getByRole("heading", { name: support.subject })).toBeTruthy();
    }
    expect(fetch).toHaveBeenCalledWith("/tickets?type=feedback");
    fireEvent.click(within(categories).getByRole("button", { name: "Feedback", exact: true }));
    await screen.findByText("feature Feedback");
    for (const support of supportTickets) {
      expect(screen.queryByRole("heading", { name: support.subject })).toBeNull();
    }
    expect(screen.getByText("Legacy Feedback")).toBeTruthy();
  });

  it("distinguishes an empty inbox from an empty filtered result and resets filters", async () => {
    vi.mocked(fetch).mockImplementation((input) => {
      if (String(input).startsWith("/tickets?")) {
        return Promise.resolve(jsonResponse({ tickets: [] }));
      }
      return defaultFetch(input);
    });
    renderAdmin();
    await screen.findByRole("heading", { name: "No Tickets Found" });
    expect(screen.getByText(/will appear here when they arrive/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "New Ticket" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Support", exact: true }));
    await screen.findByText("Clear your filters to see all tickets.");
    const emptyState = screen.getByRole("heading", { name: "No Tickets Found" }).parentElement!;
    fireEvent.click(within(emptyState).getByRole("button", { name: "Clear Filters" }));
    await screen.findByText(/will appear here when they arrive/);
    expect(fetch).toHaveBeenCalledWith("/tickets?");
  });

  it("preserves ticket detail, status update, and team response operations", async () => {
    vi.mocked(fetch).mockImplementation((input) => {
      if (String(input) === "/tickets/SP-101/status") {
        return Promise.resolve(jsonResponse({ ticket: { ...ticket, status: "closed" } }));
      }
      if (String(input) === "/tickets/SP-101/respond") {
        return Promise.resolve(jsonResponse({ ticket }));
      }
      return defaultFetch(input);
    });
    renderAdmin();
    fireEvent.click(await screen.findByText("Reservation Support"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getAllByRole("combobox")[0]);
    fireEvent.click(await screen.findByRole("option", { name: "Closed", exact: true }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/tickets/SP-101/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "closed" }),
      }),
    );
    expect(within(dialog).getAllByRole("tab")).toHaveLength(2);
    expect(within(dialog).getByRole("region", { name: "Ticket Details" })).toBeTruthy();
    expect(within(dialog).queryByRole("log", { name: "Ticket Conversation" })).toBeNull();
    expect(within(dialog).getByText("Type:", { exact: true }).parentElement?.textContent).toBe(
      "Type: Support",
    );
    expect(within(dialog).getByText("Severity:", { exact: true }).parentElement?.textContent).toBe(
      "Severity: Medium",
    );
    fireEvent.mouseDown(within(dialog).getByRole("tab", { name: "Messages", exact: true }), {
      button: 0,
      ctrlKey: false,
    });
    expect(within(dialog).getByRole("log", { name: "Ticket Conversation" })).toBeTruthy();
    fireEvent.change(await within(dialog).findByLabelText("Your Name"), {
      target: { value: "Test Admin" },
    });
    fireEvent.change(within(dialog).getByLabelText("Response Message"), {
      target: { value: "We can help with your reservation." },
    });
    fireEvent.mouseDown(within(dialog).getByRole("tab", { name: "Details", exact: true }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.mouseDown(within(dialog).getByRole("tab", { name: "Messages", exact: true }), {
      button: 0,
      ctrlKey: false,
    });
    expect(within(dialog).getByDisplayValue("We can help with your reservation.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Send Response" }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/tickets/SP-101/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: expect.stringContaining("We can help with your reservation."),
      }),
    );
  });

  it("loads business accounts in a table and fetches account details only when editing", async () => {
    renderAdmin("/admin/customers");
    expect(await screen.findByRole("table")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit example-restaurant" })).toBeTruthy();
    expect(
      vi.mocked(fetch).mock.calls.some(([input]) => String(input).startsWith("/admin/customer?")),
    ).toBe(true);
    expect(
      vi.mocked(fetch).mock.calls.some(([input]) => String(input).startsWith("/admin/customer/")),
    ).toBe(false);
  });

  it("keeps empty account results distinct from request failures and supports retry", async () => {
    let status = 200;
    vi.mocked(fetch).mockImplementation((input) => {
      if (String(input).startsWith("/admin/customer?")) {
        return Promise.resolve(jsonResponse({ customers: [], total: 0, pageSize: 25 }, status));
      }
      return defaultFetch(input);
    });
    renderAdmin("/admin/customers");
    expect(await screen.findByRole("heading", { name: "No Accounts Found" })).toBeTruthy();
    status = 503;
    fireEvent.change(screen.getByLabelText("Search Business Accounts"), {
      target: { value: "missing" },
    });
    expect(await screen.findByRole("heading", { name: "Unable To Load Accounts" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "No Accounts Found" })).toBeNull();
    status = 200;
    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
    expect(await screen.findByRole("heading", { name: "No Accounts Found" })).toBeTruthy();
  });

  it("appends accounts on scroll and resets the collection for search, access, and sort", async () => {
    let intersect = () => {};
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: IntersectionObserverCallback) {
          intersect = () =>
            callback(
              [{ isIntersecting: true } as IntersectionObserverEntry],
              this as unknown as IntersectionObserver,
            );
        }
        observe() {}
        disconnect() {}
      },
    );
    vi.mocked(fetch).mockImplementation((input) => {
      if (String(input).startsWith("/admin/customer?")) {
        return Promise.resolve(
          jsonResponse({
            customers: [{ ...customer, id: String(input), name: String(input), locationCount: 1 }],
            total: 26,
            pageSize: 25,
          }),
        );
      }
      return defaultFetch(input);
    });
    renderAdmin("/admin/customers");
    await screen.findByRole("table");
    expect(screen.queryByRole("button", { name: "Next", exact: true })).toBeNull();
    act(() => intersect());
    await waitFor(() =>
      expect(String(vi.mocked(fetch).mock.calls.at(-1)?.[0])).toContain("page=2"),
    );
    await waitFor(() =>
      expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(3),
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Filter", exact: true }));
    fireEvent.click(await screen.findByRole("button", { name: "Trial", exact: true }));
    await waitFor(() =>
      expect(String(vi.mocked(fetch).mock.calls.at(-1)?.[0])).toContain("page=1&access=trial"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Show Accounts" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Filter" })).toBeNull());
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: "Sort By: Newest First" }));
    fireEvent.click(await screen.findByRole("button", { name: "Business Name", exact: true }));
    fireEvent.change(screen.getByLabelText("Search Business Accounts"), {
      target: { value: "dinner & guests" },
    });
    await waitFor(() =>
      expect(String(vi.mocked(fetch).mock.calls.at(-1)?.[0])).toContain(
        "page=1&access=trial&sort=name&search=dinner+%26+guests",
      ),
    );
  });

  it("preserves loaded accounts after a failed scroll request and retries the failed batch", async () => {
    let intersect = () => {};
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: IntersectionObserverCallback) {
          intersect = () =>
            callback(
              [{ isIntersecting: true } as IntersectionObserverEntry],
              this as unknown as IntersectionObserver,
            );
        }
        observe() {}
        disconnect() {}
      },
    );
    let fail = true;
    vi.mocked(fetch).mockImplementation((input) => {
      if (String(input).includes("page=2")) {
        if (fail) {
          return Promise.resolve(jsonResponse({}, 503));
        }
        return Promise.resolve(
          jsonResponse({
            customers: [
              { ...customer, id: "business-2", name: "Second Business", locationCount: 1 },
            ],
            total: 2,
            pageSize: 1,
          }),
        );
      }
      if (String(input).startsWith("/admin/customer?")) {
        return Promise.resolve(
          jsonResponse({
            customers: [{ ...customer, id: "business-1", locationCount: 1 }],
            total: 2,
            pageSize: 1,
          }),
        );
      }
      return defaultFetch(input);
    });
    renderAdmin("/admin/customers");
    await screen.findByRole("table");
    act(() => intersect());
    await screen.findByRole("alert");
    expect(screen.getByText(customer.name)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Unable To Load Accounts" })).toBeNull();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
    expect(await screen.findByText("Second Business")).toBeTruthy();
    expect(screen.getByText(customer.name)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(screen.queryByText("Second Business")).toBeNull());
  });

  it("shows an export failure without downloading an incomplete account collection", async () => {
    renderAdmin("/admin/customers");
    await screen.findByRole("table");
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}, 503));
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Export Failed", variant: "destructive" }),
      ),
    );
    expect((screen.getByRole("button", { name: "Export" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
    expect(screen.getByRole("table")).toBeTruthy();
  });

  it("cancels drafts and retains edited fields after a rejected save", async () => {
    vi.mocked(fetch).mockImplementation((input, init) => {
      if (init?.method === "PATCH") {
        return Promise.resolve(
          jsonResponse({ error: "Email is already in use by another account" }, 409),
        );
      }
      return defaultFetch(input);
    });
    renderAdmin("/admin/customers");
    fireEvent.click(await screen.findByRole("button", { name: "Edit example-restaurant" }));
    const email = await screen.findByLabelText("Email");
    fireEvent.change(email, { target: { value: "new@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel", exact: true }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Edit example-restaurant" }));
    expect(await screen.findByDisplayValue(customer.email)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "conflict@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm", exact: true }));
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ description: "Email is already in use by another account" }),
      ),
    );
    expect(screen.getByDisplayValue("conflict@example.test")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Edit Customer" })).toBeTruthy();
  });

  it("keeps customer lookup, blank numeric edits, validation, and confirmed saves operational", async () => {
    renderAdmin("/admin/customers");
    fireEvent.click(await screen.findByRole("button", { name: "Edit example-restaurant" }));
    await screen.findByLabelText("Base Credits");
    expect(fetch).toHaveBeenCalledWith(
      "/admin/customer/example-restaurant",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    const baseCredits = screen.getByDisplayValue("100");
    fireEvent.change(baseCredits, { target: { value: "" } });
    expect((baseCredits as HTMLInputElement).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm", exact: true }));
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ description: expect.stringContaining("cannot be blank") }),
      ),
    );
    expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
    fireEvent.change(baseCredits, { target: { value: "150" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm", exact: true }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/admin/customer/example-restaurant", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: customer.name,
          username: customer.username,
          email: customer.email,
          phone: customer.phone,
          trial: customer.trial,
          trialDurationDays: customer.trialDurationDays,
          maxLocations: customer.maxLocations,
          baseCredits: 150,
          locations: customer.locations,
        }),
      }),
    );
    await waitFor(() => expect(mocks.invalidate).toHaveBeenCalled());
  });
});
