import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WhySeatPingSection } from "../../src/components/landing/WhyChooseSeatPing.js";

function source(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

const NOTIFICATIONS_SOURCE = source("server/lib/notifications.ts");

const QUEUE_PAGE_SOURCE = source("src/pages/QueueBusiness.tsx");

function renderedText(): string {
  const { container } = render(<WhySeatPingSection />);
  return container.textContent || "";
}

describe("guest moment fidelity", () => {
  it("quotes the queue join message the guest actually receives", () => {
    const fragments = [
      "You've joined the queue at",
      "in line. We'll text you when it's your turn.",
    ];
    const text = renderedText();
    fragments.forEach((fragment) => {
      expect(NOTIFICATIONS_SOURCE).toContain(fragment);
      expect(text).toContain(fragment);
    });
  });

  it("quotes the admitted message the guest actually receives", () => {
    const fragments = [
      "Good news! It's your turn at",
      "Please proceed to the host within the next 5 minutes.",
    ];
    const text = renderedText();
    fragments.forEach((fragment) => {
      expect(NOTIFICATIONS_SOURCE).toContain(fragment);
      expect(text).toContain(fragment);
    });
  });

  it("reuses the queue status wording from the guest queue page", () => {
    const fragments = [
      "in line",
      "ahead of you",
      "Estimated Wait",
      "Notifications",
      "Wait time may change based on queue movement and upcoming reservations.",
    ];
    const text = renderedText();
    fragments.forEach((fragment) => {
      expect(QUEUE_PAGE_SOURCE).toContain(fragment);
      expect(text).toContain(fragment);
    });
  });

  it("reuses the admitted screen wording from the guest queue page", () => {
    const fragments = [
      "It's Your Turn!",
      "Please Arrive Within",
      "Your spot will be held for 5 minutes.",
    ];
    const text = renderedText();
    fragments.forEach((fragment) => {
      expect(QUEUE_PAGE_SOURCE).toContain(fragment);
      expect(text).toContain(fragment);
    });
  });

  it("keeps the wait estimate in the format the ETA builder renders", () => {
    expect(source("server/lib/queueEta.ts")).toContain("} Minutes`");
    expect(renderedText()).toMatch(/\d+-\d+ Minutes/);
  });
});
