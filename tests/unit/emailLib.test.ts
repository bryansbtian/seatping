import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  calloutBox,
  detailCard,
  emailButton,
  emailSecondaryButton,
  esc,
  fallbackLink,
  p,
  renderEmail,
  sendEmail,
  sendEmailDetailed,
  sendFeedbackEmail,
  sendNewReservationBusinessEmail,
  sendPasswordChangeConfirmationEmail,
  sendPasswordResetEmail,
  sendReservationConfirmationEmail,
  sendReservationReminderEmail,
  sendBusinessOnboardingEmail,
} from "../../server/lib/email.js";
import { behavior, sinks } from "../setup/externalMocks.js";

const ORIGINAL_ENV = { ...process.env };

function lastEmail() {
  const store = sinks().email;
  return store[store.length - 1];
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("html building blocks", () => {
  it("escapes the characters that would break the markup", () => {
    expect(esc("<b>&\"'</b>")).not.toContain("<b>");
    expect(esc(null as never)).toEqual(expect.any(String));
  });

  it("renders the shared blocks", () => {
    expect(p("Hello")).toContain("Hello");
    expect(calloutBox("Note")).toContain("Note");
    expect(emailButton("https://test.invalid", "Go")).toContain("https://test.invalid");
    expect(emailSecondaryButton("https://test.invalid", "Maybe")).toContain("Maybe");
    expect(fallbackLink("https://test.invalid")).toContain("https://test.invalid");
  });

  it("renders a detail card with and without a title", () => {
    const titled = detailCard("Booking", [["Date", "Wed"]]);
    const untitled = detailCard("", [["Date", "Wed"]]);

    expect(titled).toContain("Booking");
    expect(titled).toContain("Wed");
    expect(untitled).toContain("Wed");
    expect(untitled).not.toContain("Booking");
  });

  it("includes a preheader only when one is given", () => {
    const withPre = renderEmail({
      heading: "Hi",
      bodyHtml: "<p>Body</p>",
      preheader: "Sneak peek",
    });
    const withoutPre = renderEmail({ heading: "Hi", bodyHtml: "<p>Body</p>" });

    expect(withPre).toContain("Sneak peek");
    expect(withoutPre).not.toContain("Sneak peek");
  });

  it("uses the default tagline unless one is supplied", () => {
    expect(renderEmail({ heading: "Hi", bodyHtml: "" })).toContain(
      "Queues &amp; Reservations For Hospitality",
    );
    expect(renderEmail({ heading: "Hi", bodyHtml: "", tagline: "Custom Tagline" })).toContain(
      "Custom Tagline",
    );
  });
});

describe("sendEmailDetailed", () => {
  it("reports a successful send", async () => {
    const result = await sendEmailDetailed({
      to: "guest@test.invalid",
      subject: "Hello",
      html: "<p>Hi</p>",
    });

    expect(result.ok).toBe(true);
    expect(result.recipient).toBe("guest@test.invalid");
    expect(result.messageId).toEqual(expect.any(String));
    expect(result.accepted).toEqual(["guest@test.invalid"]);
  });

  it("attaches a reply-to only when one is given", async () => {
    await sendEmailDetailed({
      to: "guest@test.invalid",
      subject: "Hello",
      html: "<p>Hi</p>",
      replyTo: "owner@test.invalid",
    });
    expect((lastEmail() as any).replyTo).toBe("owner@test.invalid");

    await sendEmailDetailed({
      to: "guest@test.invalid",
      subject: "Hello",
      html: "<p>Hi</p>",
    });
    expect((lastEmail() as any).replyTo).toBeUndefined();
  });

  it("uses a custom sender when one is given", async () => {
    await sendEmailDetailed({
      to: "guest@test.invalid",
      subject: "Hello",
      html: "<p>Hi</p>",
      from: "ops@test.invalid",
    });

    expect((lastEmail() as any).from).toBe("ops@test.invalid");
  });

  it("fails when the server does not accept the recipient", async () => {
    behavior().emailAccepted = [];

    const result = await sendEmailDetailed({
      to: "guest@test.invalid",
      subject: "Hello",
      html: "<p>Hi</p>",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("not accepted");
  });

  it("fails when the server explicitly rejects the recipient", async () => {
    behavior().emailRejected = ["guest@test.invalid"];

    const result = await sendEmailDetailed({
      to: "guest@test.invalid",
      subject: "Hello",
      html: "<p>Hi</p>",
    });

    expect(result.ok).toBe(false);
    expect(result.rejected).toContain("guest@test.invalid");
  });

  it("matches the recipient regardless of case", async () => {
    behavior().emailAccepted = ["GUEST@TEST.INVALID"];

    const result = await sendEmailDetailed({
      to: "  Guest@Test.Invalid  ",
      subject: "Hello",
      html: "<p>Hi</p>",
    });

    expect(result.ok).toBe(true);
  });

  it("retries after a transient failure and then succeeds", async () => {
    behavior().emailSendErrorOnce = "temporary greylist";

    const result = await sendEmailDetailed(
      { to: "guest@test.invalid", subject: "Hello", html: "<p>Hi</p>" },
      1,
    );

    expect(result.ok).toBe(true);
    expect(sinks().email).toHaveLength(2);
  }, 15_000);

  it("gives up after exhausting the retries", async () => {
    behavior().emailSendError = "smtp refused";

    const result = await sendEmailDetailed(
      { to: "guest@test.invalid", subject: "Hello", html: "<p>Hi</p>" },
      0,
    );

    expect(result.ok).toBe(false);
    expect(result.error).toBe("smtp refused");
    expect(result.rejected).toEqual(["guest@test.invalid"]);
    expect(result.messageId).toBeNull();
  });

  it("reports a boolean result through the simple wrapper", async () => {
    await expect(
      sendEmail({ to: "guest@test.invalid", subject: "Hi", html: "<p>Hi</p>" }),
    ).resolves.toBe(true);

    behavior().emailSendError = "smtp refused";
    await expect(
      sendEmail({ to: "guest@test.invalid", subject: "Hi", html: "<p>Hi</p>" }),
    ).resolves.toBe(false);
  }, 15_000);
});

describe("transactional emails", () => {
  it("builds a customer reset link and a business one", async () => {
    process.env.FRONTEND_URL = "https://app.test.invalid";

    await sendPasswordResetEmail("guest@test.invalid", "tok-1", "customer");
    expect(lastEmail().html).toContain("/reset?token=tok-1");

    await sendPasswordResetEmail("owner@test.invalid", "tok-2", "business");
    expect(lastEmail().html).toContain("tok-2");
  });

  it("honours an explicit base url for the reset link", async () => {
    await sendPasswordResetEmail(
      "guest@test.invalid",
      "tok-3",
      "customer",
      "https://custom.test.invalid",
    );

    expect(lastEmail().html).toContain("https://custom.test.invalid");
  });

  it("greets the customer by name when there is one", async () => {
    await sendPasswordChangeConfirmationEmail("guest@test.invalid", "Ada");
    expect(lastEmail().html).toContain("Hi Ada");

    await sendPasswordChangeConfirmationEmail("guest@test.invalid");
    expect(lastEmail().html).not.toContain("Hi ,");
  });

  it("mentions the trial length only when there is one", async () => {
    await sendBusinessOnboardingEmail("owner@test.invalid", "Ada", "bistro", 14);
    expect(lastEmail().html).toContain("14-day trial");

    await sendBusinessOnboardingEmail("owner@test.invalid", "Ada", "bistro");
    expect(lastEmail().html).not.toContain("-day trial");

    await sendBusinessOnboardingEmail("owner@test.invalid", "Ada", "bistro", 0);
    expect(lastEmail().html).not.toContain("-day trial");
  });

  it("singularises the guest count on a reservation confirmation", async () => {
    await sendReservationConfirmationEmail({
      email: "guest@test.invalid",
      firstName: "Ada",
      lastName: "Lovelace",
      businessName: "Bistro",
      address: "1 Test Street",
      dateLabel: "Wed, 12 Aug",
      timeLabel: "19:00",
      partySize: 1,
      manageUrl: "https://app.test.invalid/manage",
    });
    expect(lastEmail().html).toContain("1 Guest");

    await sendReservationConfirmationEmail({
      email: "guest@test.invalid",
      firstName: "Ada",
      lastName: "Lovelace",
      businessName: "Bistro",
      address: "1 Test Street",
      dateLabel: "Wed, 12 Aug",
      timeLabel: "19:00",
      partySize: 3,
      manageUrl: "https://app.test.invalid/manage",
    });
    expect(lastEmail().html).toContain("3 Guests");
  });

  it("includes the cancellation policy only when there is one", async () => {
    const base = {
      email: "guest@test.invalid",
      firstName: "Ada",
      lastName: "Lovelace",
      businessName: "Bistro",
      address: "1 Test Street",
      dateLabel: "Wed, 12 Aug",
      timeLabel: "19:00",
      partySize: 2,
      manageUrl: "https://app.test.invalid/manage",
    };

    await sendReservationConfirmationEmail({
      ...base,
      cancellationPolicy: "Cancel 24 hours ahead",
    });
    expect(lastEmail().html).toContain("Cancel 24 hours ahead");

    await sendReservationConfirmationEmail(base);
    expect(lastEmail().html).not.toContain("Cancellation Policy");
  });

  it("includes the manage button on a reminder only when there is a link", async () => {
    const base = {
      email: "guest@test.invalid",
      firstName: "Ada",
      businessName: "Bistro",
      address: "1 Test Street",
      dateLabel: "Wed, 12 Aug",
      timeLabel: "19:00",
      partySize: 1,
    };

    await sendReservationReminderEmail({
      ...base,
      manageUrl: "https://app.test.invalid/manage",
    });
    expect(lastEmail().html).toContain("Manage Reservation");

    await sendReservationReminderEmail(base);
    expect(lastEmail().html).not.toContain("Manage Reservation");
    expect(lastEmail().html).toContain("1 Guest");
  });

  it("includes the optional rows on a business heads-up", async () => {
    const base = {
      to: "owner@test.invalid",
      businessName: "Bistro",
      locationName: "Downtown",
      customerName: "Ada Lovelace",
      customerEmail: "ada@test.invalid",
      dateLabel: "Wed, 12 Aug",
      timeLabel: "19:00",
      partySize: 1,
      dashboardUrl: "https://app.test.invalid/dashboard",
    };

    await sendNewReservationBusinessEmail({
      ...base,
      customerPhone: "+15550000000",
      notes: "Window seat",
    });
    expect(lastEmail().html).toContain("+15550000000");
    expect(lastEmail().html).toContain("Window seat");
    expect(lastEmail().html).toContain("1 Guest");

    await sendNewReservationBusinessEmail({ ...base, partySize: 4 });
    expect(lastEmail().html).not.toContain("+15550000000");
    expect(lastEmail().html).toContain("4 Guests");
  });

  it("labels a known feedback type and falls back for an unknown one", async () => {
    const base = {
      name: "Ada",
      email: "ada@test.invalid",
      subject: "Queue Page Stalls",
      message: "It stopped refreshing.\nTwice.",
      feedbackType: "bug",
    };

    await sendFeedbackEmail({
      ...base,
      severity: "high",
      businessName: "Bistro",
      phone: "+15550000000",
    });
    expect(lastEmail().subject).toContain("Bug");
    expect(lastEmail().html).toContain("High");
    expect(lastEmail().html).toContain("Bistro");
    expect(lastEmail().html).toContain("+15550000000");

    await sendFeedbackEmail({ ...base, feedbackType: "mystery" });
    expect(lastEmail().subject).toContain("mystery");
    expect(lastEmail().html).not.toContain("Severity");
  });

  it("falls back to a generic heading when the feedback has no subject", async () => {
    await sendFeedbackEmail({
      name: "Ada",
      email: "ada@test.invalid",
      subject: "",
      message: "Something",
      feedbackType: "other",
    });

    expect(lastEmail().html).toContain("New Feedback");
  });

  it("falls back for an unknown severity label", async () => {
    await sendFeedbackEmail({
      name: "Ada",
      email: "ada@test.invalid",
      subject: "S",
      message: "M",
      feedbackType: "ux",
      severity: "critical",
    });

    expect(lastEmail().html).toContain("critical");
  });
});
