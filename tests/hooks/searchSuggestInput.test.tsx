import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SearchSuggestInput } from "../../src/components/SearchSuggestInput.js";

const useSearchSuggestions = vi.hoisted(() => vi.fn());

vi.mock("../../src/hooks/useSearchSuggestions.js", () => ({ useSearchSuggestions }));

beforeEach(() => {
  useSearchSuggestions
    .mockReset()
    .mockReturnValue({ suggestions: [], loading: false, error: false });
});

function input() {
  return render(
    <MemoryRouter>
      <SearchSuggestInput
        value="Bistro"
        onChange={vi.fn()}
        date={new Date(2026, 9, 15)}
        time="18:00"
        people="2"
      />
    </MemoryRouter>,
  );
}

describe("search suggestion focus", () => {
  it("keeps pending suggestions noninteractive and replaces them when results arrive", () => {
    useSearchSuggestions.mockReturnValue({ suggestions: [], loading: true, error: false });
    const view = input();
    fireEvent.focus(screen.getByRole("combobox"));
    const skeleton = screen.getByRole("status", { name: "Loading Restaurant Suggestions" });
    expect(skeleton.textContent).toBe("");
    expect(screen.queryByRole("option")).toBeNull();
    useSearchSuggestions.mockReturnValue({
      suggestions: [{ locationId: "location", name: "Bistro", url: null }],
      loading: false,
      error: false,
    });
    view.rerender(
      <MemoryRouter>
        <SearchSuggestInput value="Bistro" onChange={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("option").textContent).toContain("Bistro");
  });

  it("keeps existing text idle until the user focuses the input", () => {
    input();
    expect(useSearchSuggestions).toHaveBeenLastCalledWith("Bistro", false);
    fireEvent.focus(screen.getByRole("combobox"));
    expect(useSearchSuggestions).toHaveBeenLastCalledWith("Bistro", true);
  });

  it("disables suggestions when dismissed outside or with Escape", () => {
    input();
    const search = screen.getByRole("combobox");
    fireEvent.focus(search);
    fireEvent.mouseDown(document.body);
    expect(useSearchSuggestions).toHaveBeenLastCalledWith("Bistro", false);
    fireEvent.focus(search);
    fireEvent.keyDown(search, { key: "Escape" });
    expect(useSearchSuggestions).toHaveBeenLastCalledWith("Bistro", false);
    fireEvent.focus(search);
    fireEvent.blur(search);
    expect(useSearchSuggestions).toHaveBeenLastCalledWith("Bistro", false);
  });

  it("disables suggestions after choosing a restaurant", () => {
    useSearchSuggestions.mockReturnValue({
      suggestions: [{ locationId: "location", name: "Bistro", url: null }],
      loading: false,
      error: false,
    });
    input();
    fireEvent.focus(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option"));
    expect(useSearchSuggestions).toHaveBeenLastCalledWith("Bistro", false);
  });
});
