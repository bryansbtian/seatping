import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import Blog from "../../src/pages/Blog.js";

vi.mock("@/components/Header", () => ({ default: () => <header>SeatPing</header> }));

describe("Blog construction page", () => {
  it("explains the construction state and includes the public footer", () => {
    render(
      <MemoryRouter initialEntries={["/blog"]}>
        <Blog />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Under Construction", level: 1 })).toBeTruthy();
    expect(
      screen.getByText(
        "Ideas for smarter queues, smoother service, and better guest relationships are coming soon.",
      ),
    ).toBeTruthy();
    expect(screen.getAllByRole("contentinfo")).toHaveLength(1);
    const resources = within(screen.getByRole("navigation", { name: "Resources" }));
    expect(resources.getByRole("link", { name: "Blog" }).getAttribute("href")).toBe("/blog");
    expect(document.title).toBe("Blog | SeatPing");
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://www.seatping.biz/blog",
    );
    expect(screen.getByRole("main").querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("lets visitors return to the homepage", () => {
    render(
      <MemoryRouter initialEntries={["/blog"]}>
        <Routes>
          <Route path="/blog" element={<Blog />} />
          <Route path="/" element={<p>Public Homepage</p>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("link", { name: "Back to Home" }));
    expect(screen.getByText("Public Homepage")).toBeTruthy();
  });
});
