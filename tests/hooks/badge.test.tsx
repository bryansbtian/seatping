import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Badge } from "../../src/components/ui/badge.js";
import { ChannelBadge } from "../../src/components/CampaignBadges.js";
import { GuestTagBadge } from "../../src/components/GuestBadge.js";

describe("shared badges", () => {
  it.each([
    ["SMS", "SMS"],
    ["WHATSAPP", "WhatsApp"],
    ["EMAIL", "Email"],
  ])("preserves the %s channel label and tone", (channel, label) => {
    render(<ChannelBadge channel={channel} />);
    expect(screen.getByText(label).parentElement?.className).toContain("h-badge");
  });

  it("keeps a compound text label together without inserting extra gaps", () => {
    render(<Badge data-testid="count">{12} Guests</Badge>);
    const badge = screen.getByTestId("count");
    expect(badge.textContent).toBe("12 Guests");
    expect(badge.childElementCount).toBe(1);
  });

  it("preserves the icon beside the text and forwards badge attributes", () => {
    render(
      <Badge variant="success" title="Featured Restaurant" data-testid="featured">
        <svg role="img" aria-label="Star" />
        Featured
      </Badge>,
    );
    const badge = screen.getByTestId("featured");
    expect(badge.getAttribute("title")).toBe("Featured Restaurant");
    expect(screen.getByRole("img", { name: "Star" }).parentElement).toBe(badge);
    expect(screen.getByText("Featured").parentElement).toBe(badge);
  });

  it("keeps guest tag removal reachable beside the aligned label", () => {
    const remove = vi.fn();
    render(<GuestTagBadge tag="VIP" onRemove={remove} />);
    expect(screen.getByText("VIP")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove VIP" }));
    expect(remove).toHaveBeenCalledOnce();
  });
});
