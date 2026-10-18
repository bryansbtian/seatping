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
        stats: { total: 6, open: 1, inProgress: 2, closed: 3, sales: 4, feedback: 2 },
      }),
    );
  }
  if (url.startsWith("/tickets?")) {
    return Promise.resolve(jsonResponse({ tickets: [ticket] }));
  }
  if (url === "/tickets/SP-101") {
    return Promise.resolve(jsonResponse({ ticket }));
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
    expect(screen.queryByLabelText("Business Username")).toBeNull();
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
    expect(await screen.findByLabelText("Business Username")).toBeTruthy();
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
    expect(alert.textContent).toContain("Tickets could not be loaded");
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
    fireEvent.change(screen.getByLabelText("Business Username"), {
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
    expect((await screen.findByLabelText("Business Username")) as HTMLInputElement).toHaveProperty(
      "value",
      "example-restaurant",
    );
  });

  it("preserves ticket statistics and sends status, type, and priority filters to the API", async () => {
    renderAdmin();
    await screen.findByText("Reservation Support");
    for (const name of ["Total", "Open", "In Progress", "Closed", "Sales", "Feedback"]) {
      expect(screen.getByRole("heading", { name, exact: true })).toBeTruthy();
    }
    for (const [index, option] of [
      [0, "Open"],
      [1, "Feedback"],
      [2, "High"],
    ] as const) {
      fireEvent.click(screen.getAllByRole("combobox")[index]);
      fireEvent.click(await screen.findByRole("option", { name: option, exact: true }));
    }
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/tickets?status=open&type=feedback&priority=high"),
    );
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
    fireEvent.mouseDown(within(dialog).getByRole("tab", { name: "Respond" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.change(await within(dialog).findByPlaceholderText("Enter your name"), {
      target: { value: "Test Admin" },
    });
    fireEvent.change(within(dialog).getByPlaceholderText("Type your response here..."), {
      target: { value: "We can help with your reservation." },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Send Response" }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/tickets/SP-101/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "We can help with your reservation.",
          responderName: "Test Admin",
        }),
      }),
    );
  });

  it("prompts for a customer search before fetching business account details", async () => {
    renderAdmin("/admin/customers");

    expect(await screen.findByRole("heading", { name: "Find a Business Account" })).toBeTruthy();
    expect(
      screen.getByText(
        "Search for a business username to view and manage its account, locations, and credits.",
      ),
    ).toBeTruthy();
    expect(
      vi.mocked(fetch).mock.calls.some(([input]) => String(input).startsWith("/admin/customer/")),
    ).toBe(false);
  });

  it("shows a customer empty state for a missing account and keeps API errors distinct", async () => {
    let customerStatus = 404;
    vi.mocked(fetch).mockImplementation((input) => {
      if (String(input) === "/admin/customer/missing-business") {
        return Promise.resolve(
          jsonResponse({ error: "Account lookup unavailable" }, customerStatus),
        );
      }
      return defaultFetch(input);
    });
    renderAdmin("/admin/customers");
    fireEvent.change(await screen.findByLabelText("Business Username"), {
      target: { value: "missing-business" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search Customer" }));

    expect(await screen.findByRole("heading", { name: "No Customer Found" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Find a Business Account" })).toBeNull();

    customerStatus = 503;
    fireEvent.click(screen.getByRole("button", { name: "Search Customer" }));

    expect(await screen.findByText("Account lookup unavailable")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "No Customer Found" })).toBeNull();
  });

  it("keeps customer lookup, blank numeric edits, validation, and confirmed saves operational", async () => {
    renderAdmin("/admin/customers");
    fireEvent.change(await screen.findByLabelText("Business Username"), {
      target: { value: " example-restaurant " },
    });
    fireEvent.keyDown(screen.getByLabelText("Business Username"), { key: "Enter" });
    expect(await screen.findByText("Example Restaurant")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Find a Business Account" })).toBeNull();
    expect(fetch).toHaveBeenCalledWith("/admin/customer/example-restaurant");
    fireEvent.click(screen.getByRole("button", { name: "Edit Customer" }));
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
