import { describe, expect, it, vi } from "vitest";

vi.mock("../../server/lib/prisma.js", () => {
  return { prisma: { user: { findUnique: vi.fn(), update: vi.fn() } } };
});

const { businessNotificationEmail } = await import("../../server/lib/business.js");
const { emailButtonRow, needsReviewReasonLabel } = await import("../../server/lib/email.js");

describe("businessNotificationEmail", () => {
  const business = { email: "owner@account.test", contactEmail: null };

  it("prefers the location contact email", () => {
    const location = {
      restaurantProfile: { details: { email: "front-desk@venue.test" } },
    };

    expect(businessNotificationEmail(location, business)).toBe("front-desk@venue.test");
  });

  it("accepts a contact email stored on the profile root", () => {
    const location = { restaurantProfile: { email: "profile@venue.test" } };

    expect(businessNotificationEmail(location, business)).toBe("profile@venue.test");
  });

  it("falls back to the business contact email", () => {
    const location = { restaurantProfile: {} };

    expect(
      businessNotificationEmail(location, {
        email: "owner@account.test",
        contactEmail: "ops@biz.test",
      }),
    ).toBe("ops@biz.test");
  });

  it("falls back to the account email last", () => {
    expect(businessNotificationEmail({ restaurantProfile: {} }, business)).toBe(
      "owner@account.test",
    );
  });

  it("skips a location value that is not an email", () => {
    const location = { restaurantProfile: { details: { email: "not-an-email" } } };

    expect(businessNotificationEmail(location, business)).toBe("owner@account.test");
  });

  it("skips a blank location value", () => {
    const location = { restaurantProfile: { details: { email: "   " } } };

    expect(businessNotificationEmail(location, business)).toBe("owner@account.test");
  });

  it("trims surrounding whitespace", () => {
    const location = { restaurantProfile: { details: { email: "  desk@venue.test  " } } };

    expect(businessNotificationEmail(location, business)).toBe("desk@venue.test");
  });

  it("returns null when nothing is reachable", () => {
    expect(businessNotificationEmail({ restaurantProfile: {} }, { email: null })).toBeNull();
    expect(businessNotificationEmail(null, null)).toBeNull();
  });

  it("ignores a profile that is not an object", () => {
    expect(businessNotificationEmail({ restaurantProfile: "nonsense" }, business)).toBe(
      "owner@account.test",
    );
  });
});

describe("needsReviewReasonLabel", () => {
  it("explains the known reason", () => {
    expect(needsReviewReasonLabel("NO_TABLE")).toContain("No table was free");
  });

  it("falls back for an unknown reason", () => {
    expect(needsReviewReasonLabel("SOMETHING_ELSE")).toContain("could not find a table");
  });

  it("falls back for a missing reason", () => {
    expect(needsReviewReasonLabel(null)).toContain("could not find a table");
    expect(needsReviewReasonLabel(undefined)).toContain("could not find a table");
  });
});

describe("emailButtonRow", () => {
  const html = emailButtonRow(
    { href: "https://app.test/business/reservations", label: "Review Reservation" },
    { href: "https://app.test/business/floor", label: "Open Floor Management" },
  );

  it("keeps both buttons in one table row", () => {
    const rows = html.match(/<tr>/g) ?? [];
    const inner = html.slice(html.lastIndexOf("<tr>"), html.lastIndexOf("</tr>"));

    expect(rows.length).toBe(2);
    expect(inner).toContain("Review Reservation");
    expect(inner).toContain("Open Floor Management");
  });

  it("links each button to its own destination", () => {
    expect(html).toContain('href="https://app.test/business/reservations"');
    expect(html).toContain('href="https://app.test/business/floor"');
  });

  it("puts a spacer between the two buttons", () => {
    expect(html).toContain("width: 12px");
  });

  it("escapes the labels", () => {
    const risky = emailButtonRow(
      { href: "https://app.test/a", label: "<script>x</script>" },
      { href: "https://app.test/b", label: "Fine" },
    );

    expect(risky).not.toContain("<script>");
    expect(risky).toContain("&lt;script&gt;");
  });

  it("refuses an unsafe href", () => {
    const risky = emailButtonRow(
      { href: "javascript:alert(1)", label: "Bad" },
      { href: "https://app.test/b", label: "Fine" },
    );

    expect(risky).not.toContain("javascript:");
  });
});
