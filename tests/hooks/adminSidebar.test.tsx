import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminLayout from "../../src/components/AdminLayout.js";

const adminCollapsedKey = "seatping.admin.sidebarCollapsed";
const businessCollapsedKey = "seatping.business.sidebarCollapsed";

function RouteContent() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  return (
    <>
      <p data-testid="route">{pathname}</p>
      <button type="button" onClick={() => navigate(-1)}>
        Previous Page
      </button>
    </>
  );
}

function renderLayout(route = "/admin/dashboard", onLogout = vi.fn()) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AdminLayout onLogout={onLogout}>
        <RouteContent />
      </AdminLayout>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("Admin Sidebar", () => {
  it.each([
    ["/admin/dashboard", "Ticket Management"],
    ["/admin/customers", "Customer Management"],
    ["/admin/featured", "Featured Restaurants"],
    ["/admin/templates", "Campaign Templates"],
  ])("marks the current section on %s", (route, label) => {
    renderLayout(route);

    const nav = screen.getByRole("navigation", { name: "Admin Navigation" });
    const links = within(nav).getAllByRole("link");
    expect(links).toHaveLength(4);
    expect(within(nav).getByRole("link", { name: label }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(links.filter((link) => link.getAttribute("aria-current") === "page")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "SeatPing Admin Portal" })).toBeTruthy();
  });

  it("marks tickets as current on the compatible admin URL", () => {
    renderLayout("/admin");

    expect(
      screen.getByRole("link", { name: "Ticket Management" }).getAttribute("aria-current"),
    ).toBe("page");
  });

  it.each([
    ["/ADMIN/", "Ticket Management"],
    ["/ADMIN/DASHBOARD/", "Ticket Management"],
    ["/ADMIN/CUSTOMERS/", "Customer Management"],
    ["/ADMIN/FEATURED/", "Featured Restaurants"],
    ["/ADMIN/TEMPLATES/", "Campaign Templates"],
  ])("marks the current section for the accepted variant %s", (route, label) => {
    renderLayout(route);

    const nav = screen.getByRole("navigation", { name: "Admin Navigation" });
    expect(within(nav).getByRole("link", { name: label }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(
      within(nav)
        .getAllByRole("link")
        .filter((link) => link.getAttribute("aria-current") === "page"),
    ).toHaveLength(1);
  });

  it("uses client navigation and supports browser history", () => {
    renderLayout();

    fireEvent.click(screen.getByRole("link", { name: "Customer Management" }));
    expect(screen.getByTestId("route").textContent).toBe("/admin/customers");
    expect(
      screen.getByRole("link", { name: "Customer Management" }).getAttribute("aria-current"),
    ).toBe("page");

    fireEvent.click(screen.getByRole("button", { name: "Previous Page" }));
    expect(screen.getByTestId("route").textContent).toBe("/admin/dashboard");
    expect(
      screen.getByRole("link", { name: "Ticket Management" }).getAttribute("aria-current"),
    ).toBe("page");
  });

  it("keeps the admin logout action in the sidebar footer", () => {
    const onLogout = vi.fn();
    renderLayout("/admin/dashboard", onLogout);

    const logout = screen.getByRole("button", { name: "Log Out" });
    expect(logout.parentElement?.className).toContain("border-t");
    fireEvent.click(logout);
    expect(onLogout).toHaveBeenCalledOnce();
  });
});

describe("Shared Portal Layout", () => {
  it("removes branding while collapsed and restores it when expanded", () => {
    renderLayout();

    expect(screen.getByRole("link", { name: "SeatPing Admin Portal" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Collapse Sidebar" }));

    expect(screen.queryByText("SP")).toBeNull();
    expect(screen.queryByRole("link", { name: "SeatPing Admin Portal" })).toBeNull();
    expect(screen.getByRole("link", { name: "Ticket Management" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Log Out" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Expand Sidebar" }));
    expect(screen.getByRole("link", { name: "SeatPing Admin Portal" })).toBeTruthy();
  });

  it("persists admin collapse without changing the business preference", () => {
    localStorage.setItem(businessCollapsedKey, "false");
    const first = renderLayout();

    const sidebar = screen.getByRole("complementary");
    expect(sidebar.className).toContain("w-64");
    fireEvent.click(screen.getByRole("button", { name: "Collapse Sidebar" }));
    expect(sidebar.className).toContain("w-12");
    expect(localStorage.getItem(adminCollapsedKey)).toBe("true");
    expect(localStorage.getItem(businessCollapsedKey)).toBe("false");

    const ticketLink = screen.getByRole("link", { name: "Ticket Management" });
    expect(ticketLink.getAttribute("title")).toBe("Ticket Management");
    expect(ticketLink.querySelector("span")?.className).toContain("sr-only");
    expect(screen.getByRole("button", { name: "Log Out" })).toBeTruthy();
    first.unmount();

    renderLayout();
    expect(screen.getByRole("button", { name: "Expand Sidebar" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Expand Sidebar" }));
    expect(localStorage.getItem(adminCollapsedKey)).toBe("false");
  });

  it("does not use the business sidebar preference for admin", () => {
    localStorage.setItem(businessCollapsedKey, "true");
    renderLayout();

    expect(screen.getByRole("button", { name: "Collapse Sidebar" })).toBeTruthy();
  });

  it("keeps collapse usable when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    renderLayout();

    fireEvent.click(screen.getByRole("button", { name: "Collapse Sidebar" }));
    expect(screen.getByRole("button", { name: "Expand Sidebar" })).toBeTruthy();
  });

  it("shows expanded navigation in the mobile drawer and closes after selecting a section", async () => {
    localStorage.setItem(adminCollapsedKey, "true");
    renderLayout();

    fireEvent.click(screen.getByRole("button", { name: "Open Menu" }));
    const drawer = screen.getByRole("dialog", { name: "Admin Navigation" });
    expect(within(drawer).getByRole("link", { name: "SeatPing Admin Portal" })).toBeTruthy();
    const customers = within(drawer).getByRole("link", { name: "Customer Management" });
    expect(customers.querySelector("span")?.className).not.toContain("sr-only");
    fireEvent.click(customers);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(screen.getByTestId("route").textContent).toBe("/admin/customers");
    expect(screen.getByRole("button", { name: "Expand Sidebar" })).toBeTruthy();
  });

  it("closes the mobile drawer with its close control", async () => {
    renderLayout();
    fireEvent.click(screen.getByRole("button", { name: "Open Menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Close Menu" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });
});
