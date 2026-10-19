import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../src/components/ui/select";

function LocationSelect({ onChange }: { onChange: (value: string) => void }) {
  return (
    <Select defaultValue="central" onValueChange={onChange}>
      <SelectTrigger aria-label="Location">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="central">Central</SelectItem>
        <SelectItem value="closed" disabled>
          Closed Location
        </SelectItem>
        <SelectItem value="harbor">Harbor</SelectItem>
      </SelectContent>
    </Select>
  );
}

beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

describe("Shared Select Controls", () => {
  it("supports keyboard selection while skipping disabled locations", async () => {
    const onChange = vi.fn();
    render(<LocationSelect onChange={onChange} />);
    const trigger = screen.getByRole("combobox", { name: "Location" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const central = await screen.findByRole("option", { name: "Central" });
    await waitFor(() => expect(document.activeElement).toBe(central));
    expect(
      screen.getByRole("option", { name: "Closed Location" }).getAttribute("aria-disabled"),
    ).toBe("true");
    fireEvent.keyDown(central, { key: "ArrowDown" });
    const harbor = screen.getByRole("option", { name: "Harbor" });
    await waitFor(() => expect(document.activeElement).toBe(harbor));
    fireEvent.keyDown(harbor, { key: "Enter" });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("harbor"));
    expect(trigger.textContent).toBe("Harbor");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("dismisses with Escape without changing the selected location", async () => {
    const onChange = vi.fn();
    render(<LocationSelect onChange={onChange} />);
    const trigger = screen.getByRole("combobox", { name: "Location" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const central = await screen.findByRole("option", { name: "Central" });
    await waitFor(() => expect(document.activeElement).toBe(central));
    fireEvent.keyDown(central, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect(onChange).not.toHaveBeenCalled();
    expect(trigger.textContent).toBe("Central");
  });
});
