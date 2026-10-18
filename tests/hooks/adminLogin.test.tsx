import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import AdminLogin from "../../src/components/AdminLogin";

vi.mock("../../src/components/Header", () => ({
  default: function Header() {
    return <header>SeatPing</header>;
  },
}));

function renderLogin(loading = false) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const result = render(
    <MemoryRouter>
      <AdminLogin onSubmit={onSubmit} loading={loading} />
    </MemoryRouter>,
  );
  return { ...result, onSubmit };
}

describe("Admin Login", () => {
  it("shows application validation without native browser tooltips and focuses the first invalid field", () => {
    const { onSubmit } = renderLogin();
    const username = screen.getByLabelText("Username");
    const password = screen.getByLabelText("Password");
    const form = username.closest("form");

    expect(form?.noValidate).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

    expect(screen.getByText("Username is required")).toBeTruthy();
    expect(screen.getByText("Password is required")).toBeTruthy();
    expect(username.getAttribute("aria-invalid")).toBe("true");
    expect(username.getAttribute("aria-describedby")).toBe("admin-username-error");
    expect(password.getAttribute("aria-invalid")).toBe("true");
    expect(password.getAttribute("aria-describedby")).toBe("admin-password-error");
    expect(document.activeElement).toBe(username);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("clears each field error while editing and focuses a missing password", () => {
    renderLogin();
    const username = screen.getByLabelText("Username");
    const password = screen.getByLabelText("Password");

    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
    fireEvent.change(username, { target: { value: "admin-user" } });

    expect(screen.queryByText("Username is required")).toBeNull();
    expect(username.getAttribute("aria-invalid")).toBe("false");
    expect(username.hasAttribute("aria-describedby")).toBe(false);
    expect(screen.getByText("Password is required")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

    expect(document.activeElement).toBe(password);
    fireEvent.change(password, { target: { value: "sample-password" } });

    expect(screen.queryByText("Password is required")).toBeNull();
    expect(password.getAttribute("aria-invalid")).toBe("false");
    expect(password.hasAttribute("aria-describedby")).toBe(false);
  });

  it("passes exact credentials to the existing authentication handler", async () => {
    const { onSubmit } = renderLogin();

    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: " Admin User " },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: " Sample Password " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
        username: " Admin User ",
        password: " Sample Password ",
      });
    });
  });

  it("disables sign in and prevents additional submissions while authentication is pending", () => {
    const { onSubmit } = renderLogin(true);
    const button = screen.getByRole("button", { name: "Signing in..." }) as HTMLButtonElement;
    const username = screen.getByLabelText("Username");
    const form = username.closest("form");

    expect(button.disabled).toBe(true);
    expect(form?.getAttribute("aria-busy")).toBe("true");
    if (!form) {
      throw new Error("Expected Admin Login form");
    }
    fireEvent.submit(form);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.queryByText("Username is required")).toBeNull();
  });
});
