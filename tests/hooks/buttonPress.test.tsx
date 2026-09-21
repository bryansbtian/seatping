import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "../../src/components/ui/button.js";

describe("Button press feedback", () => {
  it("scales down on press by default", () => {
    render(<Button>Save</Button>);

    const button = screen.getByRole("button", { name: "Save" });

    expect(button.className).toContain("active:scale-[0.96]");
    expect(button.className).toContain("motion-reduce:active:scale-100");
  });

  it("drops the press scale when the call site asks for a static button", () => {
    render(<Button static>Save</Button>);

    const button = screen.getByRole("button", { name: "Save" });

    expect(button.className).not.toContain("active:scale-");
    expect(button.getAttribute("static")).toBeNull();
  });

  it("leaves text links unscaled", () => {
    render(<Button variant="link">Learn More</Button>);

    const button = screen.getByRole("button", { name: "Learn More" });

    expect(button.className).not.toContain("active:scale-");
  });

  it("lets a call site override the press scale", () => {
    render(<Button className="active:scale-100">Save</Button>);

    const button = screen.getByRole("button", { name: "Save" });

    expect(button.className).toContain("active:scale-100");
    expect(button.className).not.toContain("active:scale-[0.96]");
  });
});
