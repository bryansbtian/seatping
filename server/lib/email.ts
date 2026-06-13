import nodemailer from "nodemailer";

// Create a transporter using SMTP
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || "smtp.porkbun.com", // Porkbun SMTP server for custom domain email
  port: 587,
  secure: false, // true for 465, false for other ports (587 uses STARTTLS)
  auth: {
    user: process.env.EMAIL_USER || "bryan.susanto@seatping.biz", // Custom domain email address
    pass: process.env.EMAIL_PASSWORD || "your-app-password-here", // Email password
  },
  tls: {
    // Verify the SMTP server's certificate (an unverified connection allows a
    // network MITM to read every email, including password-reset links).
    // EMAIL_TLS_INSECURE=1 is a temporary escape hatch if the provider's cert
    // chain ever breaks — do not leave it set.
    rejectUnauthorized: process.env.EMAIL_TLS_INSECURE !== "1",
  },
  // Increase timeouts for serverless environments
  connectionTimeout: 30000, // 30 seconds
  greetingTimeout: 30000, // 30 seconds
  socketTimeout: 60000, // 60 seconds
  // Disable pooling for serverless (create new connection each time)
  pool: false,
  // Add debug logging
  logger: false,
  debug: false,
} as any);

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string; // Optional custom sender email
  replyTo?: string; // Optional Reply-To (e.g. the business email for campaigns)
}

// Actual SMTP sender (must match the authenticated mailbox for deliverability).
const FROM_ADDRESS = "bryan.susanto@seatping.biz";
// Public-facing support address shown in every email footer + contact link.
const SUPPORT_EMAIL = "help@seatping.biz";

/**
 * Full result of an SMTP send attempt. `ok` is true ONLY when the mail server
 * actually accepted the intended recipient (i.e. the address is in `accepted`
 * and not in `rejected`). The provider strings let callers log/trace exactly
 * what happened per recipient — accepting the message for relay is NOT the same
 * as the inbox provider (e.g. Gmail) ultimately delivering it.
 */
export interface EmailSendResult {
  ok: boolean;
  recipient: string;
  messageId: string | null;
  response: string | null; // last raw SMTP response line, e.g. "250 OK ..."
  accepted: string[];
  rejected: string[];
  envelope: any;
  error?: string;
}

/**
 * Send one email and return the full per-recipient provider result. Use this
 * (over the boolean `sendEmail`) anywhere accurate delivery status matters, e.g.
 * campaign sends that flip a CampaignRecipient to SENT/FAILED.
 */
export const sendEmailDetailed = async (
  options: EmailOptions,
  retries = 2,
): Promise<EmailSendResult> => {
  let lastError: any = null;
  const target = options.to.trim().toLowerCase();

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`[EMAIL] Retry attempt ${attempt}/${retries} for:`, options.to);
        // Wait before retrying (exponential backoff)
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      } else {
        console.log("[EMAIL] Attempting to send email to:", options.to);
      }

      const mailOptions = {
        from: options.from || FROM_ADDRESS,
        to: options.to,
        subject: options.subject,
        html: options.html,
        ...(options.replyTo ? { replyTo: options.replyTo } : {}),
      };

      const info: any = await transporter.sendMail(mailOptions);
      const accepted: string[] = (info.accepted || []).map((a: any) => String(a));
      const rejected: string[] = (info.rejected || []).map((a: any) => String(a));
      const messageId: string | null = info.messageId || null;
      const response: string | null = info.response || null;

      // The SMTP server accepted the message AND this specific recipient.
      const acceptedTarget = accepted.some((a) => a.toLowerCase() === target);
      const rejectedTarget = rejected.some((a) => a.toLowerCase() === target);

      // One structured line per recipient so delivery can be traced end to end.
      console.log(
        `[EMAIL] Sent email to ${options.to} | messageId=${messageId} | ` +
          `accepted=[${accepted.join(", ")}] | rejected=[${rejected.join(", ")}] | ` +
          `response=${response}`,
      );

      if (!acceptedTarget || rejectedTarget) {
        const reason = `Recipient not accepted by mail server (accepted=[${accepted.join(
          ", ",
        )}], rejected=[${rejected.join(", ")}], response=${response})`;
        console.warn(`[EMAIL] ${options.to} NOT accepted — ${reason}`);
        return {
          ok: false,
          recipient: options.to,
          messageId,
          response,
          accepted,
          rejected,
          envelope: info.envelope ?? null,
          error: reason,
        };
      }

      return {
        ok: true,
        recipient: options.to,
        messageId,
        response,
        accepted,
        rejected,
        envelope: info.envelope ?? null,
      };
    } catch (error: any) {
      lastError = error;
      console.error(
        `[EMAIL] Error sending email to ${options.to} (attempt ${attempt + 1}/${retries + 1}):`,
        error?.message,
      );
      if (attempt === retries) {
        console.error(
          "[EMAIL] All retry attempts failed. Final error:",
          lastError?.message || lastError,
        );
      }
    }
  }

  return {
    ok: false,
    recipient: options.to,
    messageId: null,
    response: null,
    accepted: [],
    rejected: [options.to],
    envelope: null,
    error: lastError?.message || String(lastError) || "Unknown send error",
  };
};

/** Boolean convenience wrapper around {@link sendEmailDetailed}. */
export const sendEmail = async (
  options: EmailOptions,
  retries = 2,
): Promise<boolean> => {
  const result = await sendEmailDetailed(options, retries);
  return result.ok;
};

// ===========================================================================
// SeatPing email design system
// ---------------------------------------------------------------------------
// One shared, mobile-friendly, inline-styled wrapper so every email looks like
// the same product: a soft off-white canvas, a single white card with light
// borders, a clean wordmark, and one clear navy call-to-action. No gradients.
// All helpers below build into `renderEmail()` — route/email code should never
// hand-write a full HTML document.
//
// Brand: SeatPing uses deep navy as the single accent. There is intentionally
// NO orange/terracotta anywhere. Off-brand colors are reserved strictly for
// semantic states (success green, warning amber) passed explicitly to callouts.
// ===========================================================================

const COLORS = {
  canvas: "#F4F6FA", // soft, cool off-white background
  card: "#FFFFFF", // white card
  border: "#E4E8EF", // light gray border
  ink: "#0F1A2E", // headings + wordmark (deep navy / near-black)
  body: "#334155", // body copy (slate)
  muted: "#64748B", // footnotes / captions (cool gray)
  accent: "#16294D", // SeatPing navy — primary buttons + links
  accentSoft: "#EEF2F9", // navy tint for highlights / callouts
  panel: "#F7F9FC", // detail-card background (soft off-white)
};

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// Shared section layout. Every block-level section — detail cards, callouts,
// step lists, and the CTA button row — is rendered as a full-width, left-aligned
// table so their left edges line up exactly across every email. Width is forced
// via inline style (not just the width="100%" attribute) because Gmail's mobile
// app ignores the attribute on short-content tables and collapses them to fit —
// which is what misaligned the mini cards/buttons against the wider detail cards.
const SECTION_WIDTH = "width: 100%;"; // every section spans the same content width
const SECTION_GAP = "margin: 0 0 24px;"; // consistent vertical rhythm between sections

/** Escape a dynamic value for safe interpolation into email HTML. */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** A clean paragraph of body copy. */
export function p(html: string): string {
  return `<p style="margin: 0 0 16px; color: ${COLORS.body}; font-size: 15px; line-height: 1.65;">${html}</p>`;
}

/**
 * Bulletproof, single call-to-action button. Rendered as a full-width,
 * left-aligned section (shared layout) wrapping a fixed-width button, so the
 * button's left edge lines up exactly with the cards above/below it instead of
 * floating at a content-dependent x-position.
 */
export function emailButton(href: string, label: string): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${SECTION_WIDTH} margin: 28px 0;">
      <tr>
        <td align="left">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td bgcolor="${COLORS.accent}" style="border-radius: 10px;">
                <a href="${href}" target="_blank"
                   style="display: inline-block; padding: 14px 30px; font-family: ${FONT_STACK}; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 10px;">
                  ${label}
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

/**
 * Secondary / lower-emphasis button: white fill with a navy outline and navy
 * label. Same radius, padding, and weight as {@link emailButton} so primary and
 * secondary actions stay visually consistent across templates.
 */
export function emailSecondaryButton(href: string, label: string): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${SECTION_WIDTH} margin: 28px 0;">
      <tr>
        <td align="left">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td bgcolor="${COLORS.card}" style="border-radius: 10px; border: 1px solid ${COLORS.accent};">
                <a href="${href}" target="_blank"
                   style="display: inline-block; padding: 13px 29px; font-family: ${FONT_STACK}; font-size: 15px; font-weight: 600; color: ${COLORS.accent}; text-decoration: none; border-radius: 10px;">
                  ${label}
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

/** Small "if the button doesn't work" fallback link. */
export function fallbackLink(href: string): string {
  return `<p style="margin: 0 0 8px; color: ${COLORS.muted}; font-size: 13px; line-height: 1.6;">If the button doesn't work, paste this link into your browser:<br><a href="${href}" style="color: ${COLORS.accent}; word-break: break-all;">${href}</a></p>`;
}

/** A soft card for grouped detail rows. Rows are [label, value] pairs. */
export function detailCard(title: string, rows: Array<[string, string]>): string {
  const body = rows
    .map(
      ([label, value]) => `
      <tr>
        <td style="padding: 7px 0; color: ${COLORS.muted}; font-size: 13px; vertical-align: top; width: 130px;">${label}</td>
        <td style="padding: 7px 0; color: ${COLORS.ink}; font-size: 14px; font-weight: 500; word-break: break-word;">${value}</td>
      </tr>`
    )
    .join("");
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="${SECTION_WIDTH} background: ${COLORS.panel}; border: 1px solid ${COLORS.border}; border-radius: 12px; ${SECTION_GAP}">
      <tr><td style="padding: 18px 20px;">
        ${title ? `<p style="margin: 0 0 10px; color: ${COLORS.ink}; font-size: 13px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;">${title}</p>` : ""}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${SECTION_WIDTH}">${body}</table>
      </td></tr>
    </table>`;
}

/** A subtle highlight callout (e.g. status, reminders). */
export function calloutBox(html: string, accent = COLORS.accent, bg = COLORS.accentSoft): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="${SECTION_WIDTH} background: ${bg}; border-left: 3px solid ${accent}; border-radius: 8px; ${SECTION_GAP}">
      <tr><td style="padding: 14px 16px; color: ${COLORS.ink}; font-size: 14px; line-height: 1.55;">${html}</td></tr>
    </table>`;
}

/** A compact numbered/bulleted step list. */
export function stepList(items: string[]): string {
  const lis = items
    .map(
      (item, i) => `
      <tr>
        <td style="padding: 0 12px 14px 0; vertical-align: top;">
          <span style="display: inline-block; width: 24px; height: 24px; line-height: 24px; text-align: center; border-radius: 50%; background: ${COLORS.accentSoft}; color: ${COLORS.accent}; font-size: 13px; font-weight: 700;">${i + 1}</span>
        </td>
        <td style="padding: 0 0 14px; color: ${COLORS.body}; font-size: 14px; line-height: 1.5; vertical-align: top;">${item}</td>
      </tr>`
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${SECTION_WIDTH} margin: 0 0 8px;">${lis}</table>`;
}

/**
 * Wrap body content in the shared SeatPing shell. `preheader` is the hidden
 * inbox-preview line; `heading` is the H1 inside the card; `bodyHtml` is the
 * already-built inner content (use the helpers above to compose it).
 */
export function renderEmail(opts: {
  heading: string;
  bodyHtml: string;
  preheader?: string;
  tagline?: string;
}): string {
  const year = new Date().getFullYear();
  const preheader = opts.preheader
    ? `<span style="display:none !important; visibility:hidden; opacity:0; color:transparent; height:0; width:0; overflow:hidden;">${opts.preheader}</span>`
    : "";
  const tagline = opts.tagline ?? "Queues & Reservations For Hospitality";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <title>${esc(opts.heading)}</title>
</head>
<body style="margin: 0; padding: 0; background: ${COLORS.canvas}; -webkit-font-smoothing: antialiased;">
  ${preheader}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background: ${COLORS.canvas};">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width: 560px; max-width: 100%;">
          <!-- Wordmark -->
          <tr>
            <td style="padding: 0 4px 18px;">
              <span style="font-family: ${FONT_STACK}; font-size: 20px; font-weight: 700; color: ${COLORS.ink}; letter-spacing: -0.01em;">
                Seat<span style="color: ${COLORS.accent};">Ping</span>
              </span>
            </td>
          </tr>
          <!-- Card -->
          <tr>
            <td style="background: ${COLORS.card}; border: 1px solid ${COLORS.border}; border-radius: 16px; padding: 36px 32px;">
              <h1 style="margin: 0 0 18px; font-family: ${FONT_STACK}; color: ${COLORS.ink}; font-size: 22px; font-weight: 700; line-height: 1.3;">${esc(opts.heading)}</h1>
              <div style="font-family: ${FONT_STACK};">
                ${opts.bodyHtml}
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 22px 8px 0; text-align: center;">
              <p style="margin: 0 0 4px; font-family: ${FONT_STACK}; color: ${COLORS.muted}; font-size: 12px; line-height: 1.6;">${esc(tagline)}</p>
              <p style="margin: 0; font-family: ${FONT_STACK}; color: ${COLORS.muted}; font-size: 12px; line-height: 1.6;">
                © ${year} SeatPing ·
                <a href="mailto:${SUPPORT_EMAIL}" style="color: ${COLORS.muted}; text-decoration: underline; word-break: break-word;">${SUPPORT_EMAIL}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

const FRONTEND = () => process.env.FRONTEND_URL || "https://www.seatping.biz";

// ===========================================================================
// Account & security emails
// ===========================================================================

export const sendPasswordResetEmail = async (
  email: string,
  resetToken: string,
  // Carries the account type into the reset link so the reset page shows the
  // matching (customer vs business) header and "back to login" target.
  accountType: "customer" | "business" = "customer",
  // Origin to build the link from (e.g. http://localhost:8080 in dev). Falls
  // back to FRONTEND_URL / the production domain when not provided.
  baseUrl?: string
): Promise<boolean> => {
  const origin = (baseUrl || FRONTEND()).replace(/\/+$/, "");
  const resetUrl = `${origin}/reset?token=${resetToken}${
    accountType === "business" ? "&type=business" : ""
  }`;

  const html = renderEmail({
    heading: "Reset Your Password",
    preheader: "Reset Your SeatPing Password",
    bodyHtml: `
      ${p("We got a request to reset the password on your SeatPing account. Click below to choose a new one.")}
      ${emailButton(resetUrl, "Reset Password")}
      ${p(`This link expires in <strong>1 hour</strong>. If you didn't request a reset, you can safely ignore this email. Your password won't change.`)}
      ${fallbackLink(resetUrl)}
    `,
  });

  return sendEmail({
    to: email,
    subject: "Reset Your SeatPing Password",
    html,
    from: FROM_ADDRESS,
  });
};

export const sendPasswordChangeConfirmationEmail = async (
  email: string,
  name?: string
): Promise<boolean> => {
  const html = renderEmail({
    heading: "Your Password Was Changed",
    preheader: "Your SeatPing Password Was Just Updated",
    bodyHtml: `
      ${p(`${name ? `Hi ${esc(name)}, ` : ""}your SeatPing password was just updated. You can now sign in with your new password.`)}
      ${calloutBox(
        `<strong>Didn't make this change?</strong> Reach out to us right away at <a href="mailto:${SUPPORT_EMAIL}" style="color: ${COLORS.accent}; word-break: break-word;">${SUPPORT_EMAIL}</a> and we'll help secure your account.`
      )}
    `,
  });

  return sendEmail({
    to: email,
    subject: "Your SeatPing Password Was Changed",
    html,
    from: FROM_ADDRESS,
  });
};

// ===========================================================================
// Customer (diner) emails
// ===========================================================================

/** Welcome email for a newly registered customer/user account. */
export const sendCustomerWelcomeEmail = async (
  email: string,
  name: string
): Promise<boolean> => {
  const homeUrl = FRONTEND();
  const profileUrl = `${FRONTEND()}/profile`;

  const html = renderEmail({
    heading: `Welcome to SeatPing, ${esc(name)}`,
    preheader: "Join Queues, Book Tables, And Get Live Updates",
    bodyHtml: `
      ${p("Your account is ready. SeatPing keeps you out of the waiting-room shuffle. Here's what you can do with it:")}
      ${stepList([
        "Join a restaurant's waitlist from your phone and track your spot in line",
        "Book and manage reservations without creating an account each time",
        "Get notified the moment your table is ready",
        "Keep your upcoming and past bookings in one place",
      ])}
      ${emailButton(profileUrl, "View Your Profile")}
      ${p(`Or head to the <a href="${homeUrl}" style="color: ${COLORS.accent};">SeatPing homepage</a> to find a place to eat.`)}
    `,
  });

  return sendEmail({
    to: email,
    subject: "Welcome to SeatPing",
    html,
    from: FROM_ADDRESS,
  });
};

export const sendQueueJoinConfirmationEmail = async (
  email: string,
  firstName: string,
  lastName: string,
  businessName: string,
  address: string,
  position: number
): Promise<boolean> => {
  const html = renderEmail({
    heading: "You're in the Queue",
    preheader: `You're #${Number(position)} In Line At ${esc(businessName)}`,
    bodyHtml: `
      ${p(`Hi ${esc(firstName)}, you're on the waitlist at <strong>${esc(businessName)}</strong>. We'll let you know when your table is ready.`)}
      ${calloutBox(
        `<span style="font-size: 15px; font-weight: 700;">You're #${Number(position)} in line</span>`
      )}
      ${detailCard("Queue details", [
        ["Restaurant", esc(businessName)],
        ["Location", esc(address)],
        ["Name", esc(`${firstName} ${lastName}`.trim())],
        ["Your Spot", `#${Number(position)}`],
      ])}
      ${p("You can close this email — we'll notify you when it's your turn. Thanks for your patience!")}
    `,
  });

  return sendEmail({
    to: email,
    subject: `You're In The Queue`,
    html,
    from: FROM_ADDRESS,
  });
};

/** Sent to a waiting customer when the business admits them ("your turn"). */
export const sendQueueYourTurnEmail = async (
  email: string,
  businessName: string
): Promise<boolean> => {
  const html = renderEmail({
    heading: "Your Table Is Ready",
    preheader: `Your Table Is Ready At ${esc(businessName)}`,
    bodyHtml: `
      ${calloutBox(
        `<span style="font-size: 15px; font-weight: 700;">Your table is ready at ${esc(businessName)}</span>`,
        "#15803D",
        "#E7F4EC"
      )}
      ${p("Please head to the host within the next <strong>5 minutes</strong> to be seated. Thanks for waiting with SeatPing!")}
    `,
  });

  return sendEmail({
    to: email,
    subject: `Your Table Is Ready`,
    html,
    from: FROM_ADDRESS,
  });
};

/**
 * Confirmation email sent after a reservation is created or updated. Includes a
 * secure manage link the customer can use to change or cancel without logging in.
 */
export const sendReservationConfirmationEmail = async (params: {
  email: string;
  firstName: string;
  lastName: string;
  businessName: string;
  address: string;
  dateLabel: string;
  timeLabel: string;
  partySize: number;
  manageUrl: string;
  cancellationPolicy?: string;
}): Promise<boolean> => {
  const {
    email,
    firstName,
    lastName,
    businessName,
    address,
    dateLabel,
    timeLabel,
    partySize,
    manageUrl,
    cancellationPolicy,
  } = params;

  const html = renderEmail({
    heading: "Reservation Confirmed",
    preheader: `Reservation Confirmed For ${esc(businessName)}, ${esc(dateLabel)} At ${esc(timeLabel)}`,
    bodyHtml: `
      ${p(`Hi ${esc(firstName)},`)}
      ${calloutBox(
        `<strong>You're booked. We look forward to seeing you!</strong>`,
        "#15803D",
        "#E7F4EC"
      )}
      ${detailCard("Reservation", [
        ["Restaurant", esc(businessName)],
        ["Location", esc(address)],
        ["Name", esc(`${firstName} ${lastName}`.trim())],
        ["Date", esc(dateLabel)],
        ["Time", esc(timeLabel)],
        ["Number of Guests", `${Number(partySize)} ${partySize === 1 ? "Guest" : "Guests"}`],
      ])}
      ${emailButton(manageUrl, "Manage Reservation")}
      ${p(`Need to change your time, number of guests, or cancel? Use the button above. No login required.`)}
      ${
        cancellationPolicy
          ? calloutBox(
              `<strong>Cancellation Policy:</strong> ${esc(cancellationPolicy)}`,
              COLORS.muted,
              COLORS.panel
            )
          : ""
      }
      ${fallbackLink(manageUrl)}
    `,
  });

  return sendEmail({
    to: email,
    subject: `Reservation Confirmed: ${businessName}`,
    html,
    from: FROM_ADDRESS,
  });
};

/** Reminder sent to the customer ~2 hours before a confirmed reservation. */
export const sendReservationReminderEmail = async (params: {
  email: string;
  firstName: string;
  businessName: string;
  address: string;
  dateLabel: string;
  timeLabel: string;
  partySize: number;
  manageUrl?: string;
}): Promise<boolean> => {
  const { email, firstName, businessName, address, dateLabel, timeLabel, partySize, manageUrl } =
    params;

  const html = renderEmail({
    heading: "Your Reservation Is Coming Up",
    preheader: `Your Reservation At ${esc(businessName)} Is In About 2 Hours`,
    bodyHtml: `
      ${p(`Hi ${esc(firstName)}, a quick reminder that your table at <strong>${esc(businessName)}</strong> is coming up in about 2 hours.`)}
      ${detailCard("Reservation", [
        ["Restaurant", esc(businessName)],
        ["Location", esc(address)],
        ["Date", esc(dateLabel)],
        ["Time", esc(timeLabel)],
        ["Number of Guests", `${Number(partySize)} ${partySize === 1 ? "Guest" : "Guests"}`],
      ])}
      ${manageUrl ? emailButton(manageUrl, "Manage Reservation") : ""}
      ${manageUrl ? fallbackLink(manageUrl) : ""}
    `,
  });

  return sendEmail({
    to: email,
    subject: `Your Reservation Is Coming Up`,
    html,
    from: FROM_ADDRESS,
  });
};

// ===========================================================================
// Business (operator) emails
// ===========================================================================

/** Onboarding email for a newly registered business account. */
export const sendBusinessOnboardingEmail = async (
  email: string,
  name: string,
  _username: string,
  trialDays?: number
): Promise<boolean> => {
  const dashboardUrl = `${FRONTEND()}/business/dashboard`;

  // The body goes through p() (no auto-escaping), so escape the name exactly
  // once here. The heading is static and rendered (and escaped) by renderEmail.
  const trialSentence =
    trialDays && trialDays > 0 ? ` Your ${trialDays}-day trial is active.` : "";
  const intro = `Welcome to SeatPing, ${esc(name)}.${trialSentence} Follow these steps to start accepting queues and reservations.`;

  const html = renderEmail({
    heading: "Set Up Your First Location",
    preheader: "Get Your First Location Live In Six Steps",
    bodyHtml: `
      ${p(intro)}
      ${stepList([
        "Add or review your business profile",
        "Add your first location's details",
        "Set your opening hours",
        "Configure your reservation settings",
        "Download and share your location's QR code",
        "Run a test booking to see the customer flow end to end",
      ])}
      ${emailButton(dashboardUrl, "Open Your Dashboard")}
      ${p(`Anything unclear or not working the way you'd expect? Just reply to this email — it comes straight to us.`)}
    `,
  });

  return sendEmail({
    to: email,
    subject: "Welcome To SeatPing",
    html,
    from: FROM_ADDRESS,
  });
};

/** Notify the business that a new reservation was booked at a location. */
export const sendNewReservationBusinessEmail = async (params: {
  to: string;
  businessName: string;
  locationName: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  dateLabel: string;
  timeLabel: string;
  partySize: number;
  notes?: string;
  dashboardUrl: string;
}): Promise<boolean> => {
  const {
    to,
    locationName,
    customerName,
    customerEmail,
    customerPhone,
    dateLabel,
    timeLabel,
    partySize,
    notes,
    dashboardUrl,
  } = params;

  const rows: Array<[string, string]> = [
    ["Location", esc(locationName)],
    ["Guest", esc(customerName)],
    ["Email", `<a href="mailto:${esc(customerEmail)}" style="color: ${COLORS.accent};">${esc(customerEmail)}</a>`],
  ];
  if (customerPhone) rows.push(["Phone", esc(customerPhone)]);
  rows.push(["Date", esc(dateLabel)]);
  rows.push(["Time", esc(timeLabel)]);
  rows.push(["Number of Guests", `${Number(partySize)} ${partySize === 1 ? "Guest" : "Guests"}`]);
  rows.push(["Status", "Confirmed"]);

  const html = renderEmail({
    heading: "New Reservation",
    preheader: `${esc(customerName)} · Party Of ${Number(partySize)} · ${esc(dateLabel)} At ${esc(timeLabel)}`,
    bodyHtml: `
      ${p(`A new reservation was just booked at <strong>${esc(locationName)}</strong>.`)}
      ${detailCard("Reservation", rows)}
      ${notes ? calloutBox(`<strong>Guest Notes:</strong> ${esc(notes)}`, COLORS.muted, COLORS.panel) : ""}
      ${emailButton(dashboardUrl, "View In Dashboard")}
    `,
  });

  return sendEmail({
    to,
    subject: `New Reservation At ${locationName}`,
    html,
    from: FROM_ADDRESS,
  });
};

// ===========================================================================
// Support: feedback & sales (to the team + confirmations to the submitter)
// ===========================================================================

export interface SalesInquiryData {
  businessName: string;
  businessEmail: string;
  contactName: string;
  phoneNumber: string;
}

export interface FeedbackData {
  name: string;
  email: string;
  businessName?: string;
  phone?: string;
  feedbackType: string;
  subject: string;
  message: string;
  severity?: string;
}

export const sendFeedbackEmail = async (data: FeedbackData): Promise<boolean> => {
  const feedbackTypeLabels: Record<string, string> = {
    bug: "Bug / Something Broken",
    ux: "UX / Usability Issue",
    feature: "Feature Request",
    billing: "Pricing / Billing",
    other: "Other",
  };
  const severityLabels: Record<string, string> = { low: "Low", medium: "Medium", high: "High" };

  const rows: Array<[string, string]> = [
    ["Type", esc(feedbackTypeLabels[data.feedbackType] || data.feedbackType)],
  ];
  if (data.severity) rows.push(["Severity", esc(severityLabels[data.severity] || data.severity)]);
  rows.push(["Name", esc(data.name)]);
  rows.push(["Email", `<a href="mailto:${esc(data.email)}" style="color: ${COLORS.accent};">${esc(data.email)}</a>`]);
  if (data.businessName) rows.push(["Business", esc(data.businessName)]);
  if (data.phone) rows.push(["Phone", esc(data.phone)]);

  const html = renderEmail({
    heading: data.subject || "New Feedback",
    preheader: `New Feedback From ${esc(data.name)}`,
    bodyHtml: `
      ${detailCard("Feedback", rows)}
      ${calloutBox(`<strong>Message</strong><br>${esc(data.message).replace(/\n/g, "<br>")}`, COLORS.muted, COLORS.panel)}
    `,
  });

  return sendEmail({
    to: FROM_ADDRESS,
    subject: `Feedback [${feedbackTypeLabels[data.feedbackType] || data.feedbackType}]: ${data.subject}`,
    html,
  });
};

export const sendSalesInquiryEmail = async (data: SalesInquiryData): Promise<boolean> => {
  const rows: Array<[string, string]> = [
    ["Business Name", esc(data.businessName)],
    ["Business Email", `<a href="mailto:${esc(data.businessEmail)}" style="color: ${COLORS.accent};">${esc(data.businessEmail)}</a>`],
    ["Contact Name", esc(data.contactName)],
    ["Phone Number", esc(data.phoneNumber)],
  ];

  const html = renderEmail({
    heading: `New Sales Inquiry From ${data.businessName}`,
    preheader: `New sales inquiry from ${data.businessName}`,
    bodyHtml: detailCard("Lead", rows),
  });

  return sendEmail({
    to: FROM_ADDRESS,
    subject: `New Sales Inquiry From ${data.businessName}`,
    html,
  });
};

export const sendFeedbackConfirmationEmail = async (
  userEmail: string,
  userName: string,
  ticketNumber: string,
  subject: string
): Promise<boolean> => {
  const html = renderEmail({
    heading: "Thanks For The Feedback",
    preheader: `We've logged your feedback — ${ticketNumber}.`,
    bodyHtml: `
      ${p(`Hi ${esc(userName)}, we've logged your feedback and we'll review it shortly.`)}
      ${detailCard("Your ticket", [
        ["Ticket ID", esc(ticketNumber)],
        ["Subject", esc(subject)],
        ["Status", "Open"],
      ])}
      ${p(`Hold onto your ticket ID (<strong>${esc(ticketNumber)}</strong>) if you need to follow up. You can also reach us anytime at <a href="mailto:${SUPPORT_EMAIL}" style="color: ${COLORS.accent}; word-break: break-word;">${SUPPORT_EMAIL}</a>.`)}
    `,
  });

  return sendEmail({
    to: userEmail,
    subject: `Feedback Received — ${ticketNumber}`,
    html,
    from: FROM_ADDRESS,
  });
};

export const sendSalesInquiryConfirmationEmail = async (
  userEmail: string,
  contactName: string,
  businessName: string,
  ticketNumber: string
): Promise<boolean> => {
  const html = renderEmail({
    heading: "We Received Your SeatPing Inquiry",
    preheader: `We've received your inquiry — ${ticketNumber}.`,
    bodyHtml: `
      ${p(`Hi ${esc(contactName)}, thanks for reaching out about SeatPing for ${esc(businessName)}. We received your inquiry and will get back to you soon.`)}
      ${detailCard("Your ticket", [
        ["Ticket ID", esc(ticketNumber)],
        ["Business", esc(businessName)],
        ["Status", "Open"],
      ])}
      ${p(`Keep your ticket ID (<strong>${esc(ticketNumber)}</strong>) handy for follow-ups. Questions in the meantime? Reach us at <a href="mailto:${SUPPORT_EMAIL}" style="color: ${COLORS.accent}; word-break: break-word;">${SUPPORT_EMAIL}</a>.`)}
    `,
  });

  return sendEmail({
    to: userEmail,
    subject: "We Received Your SeatPing Inquiry",
    html,
    from: FROM_ADDRESS,
  });
};
