import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Pagination } from "../../src/components/ui/pagination.js";

describe("pagination", () => {
  it.each([0, 1])("hides pagination for %i pages", (totalPages) => {
    render(<Pagination page={1} totalPages={totalPages} onPageChange={vi.fn()} />);
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it.each([
    { page: 1, total: 3, numbers: [1, 2, 3], gaps: 0 },
    { page: 5, total: 99, numbers: [1, 2, 3, 4, 5, 99], gaps: 1 },
    { page: 50, total: 99, numbers: [1, 49, 50, 51, 99], gaps: 2 },
    { page: 99, total: 99, numbers: [1, 95, 96, 97, 98, 99], gaps: 1 },
  ])("shows the page window at $page of $total", ({ page, total, numbers, gaps }) => {
    render(<Pagination page={page} totalPages={total} onPageChange={vi.fn()} />);
    const nav = screen.getByRole("navigation", { name: "Pagination" });
    expect(
      within(nav)
        .getAllByRole("button", { name: /^Page / })
        .map((button) => button.textContent),
    ).toEqual(numbers.map(String));
    expect(within(nav).queryAllByText("…")).toHaveLength(gaps);
    expect(nav.querySelector('[aria-current="page"]')?.textContent).toBe(String(page));
    expect(within(nav).getByRole("status").textContent).toBe(`Page ${page} of ${total}`);
  });

  it("navigates through page numbers and arrow buttons", () => {
    const changePage = vi.fn();
    render(<Pagination page={5} totalPages={99} onPageChange={changePage} />);
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Page 99" }));
    expect(changePage.mock.calls).toEqual([[4], [6], [99]]);
  });

  it("disables arrows at either end and retains accessible names without visible labels", () => {
    const changePage = vi.fn();
    const view = render(<Pagination page={1} totalPages={3} onPageChange={changePage} />);
    const previous = screen.getByRole("button", { name: "Previous" });
    expect(previous.hasAttribute("disabled")).toBe(true);
    expect(previous.textContent).toBe("");
    fireEvent.click(previous);
    view.rerender(<Pagination page={3} totalPages={3} onPageChange={changePage} />);
    const next = screen.getByRole("button", { name: "Next" });
    expect(next.hasAttribute("disabled")).toBe(true);
    expect(next.textContent).toBe("");
    fireEvent.click(next);
    expect(changePage).not.toHaveBeenCalled();
  });
});
