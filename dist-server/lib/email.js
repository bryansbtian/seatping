import nodemailer from "nodemailer";
// Create a transporter using SMTP
const transporter = nodemailer.createTransport({
    host: "smtp.porkbun.com", // Porkbun SMTP server for custom domain email
    port: 587,
    secure: false, // true for 465, false for other ports (587 uses STARTTLS)
    auth: {
        user: "bryan.susanto@seatping.biz", // Custom domain email address
        pass: process.env.EMAIL_PASSWORD || "your-app-password-here", // Email password
    },
    tls: {
        rejectUnauthorized: false,
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
});
const FROM_ADDRESS = "bryan.susanto@seatping.biz";
/**
 * Send one email and return the full per-recipient provider result. Use this
 * (over the boolean `sendEmail`) anywhere accurate delivery status matters, e.g.
 * campaign sends that flip a CampaignRecipient to SENT/FAILED.
 */
export const sendEmailDetailed = async (options, retries = 2) => {
    let lastError = null;
    const target = options.to.trim().toLowerCase();
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            if (attempt > 0) {
                console.log(`[EMAIL] Retry attempt ${attempt}/${retries} for:`, options.to);
                // Wait before retrying (exponential backoff)
                await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
            }
            else {
                console.log("[EMAIL] Attempting to send email to:", options.to);
            }
            const mailOptions = {
                from: options.from || FROM_ADDRESS,
                to: options.to,
                subject: options.subject,
                html: options.html,
                ...(options.replyTo ? { replyTo: options.replyTo } : {}),
            };
            const info = await transporter.sendMail(mailOptions);
            const accepted = (info.accepted || []).map((a) => String(a));
            const rejected = (info.rejected || []).map((a) => String(a));
            const messageId = info.messageId || null;
            const response = info.response || null;
            // The SMTP server accepted the message AND this specific recipient.
            const acceptedTarget = accepted.some((a) => a.toLowerCase() === target);
            const rejectedTarget = rejected.some((a) => a.toLowerCase() === target);
            // One structured line per recipient so delivery can be traced end to end.
            console.log(`[EMAIL] Sent email to ${options.to} | messageId=${messageId} | ` +
                `accepted=[${accepted.join(", ")}] | rejected=[${rejected.join(", ")}] | ` +
                `response=${response}`);
            if (!acceptedTarget || rejectedTarget) {
                const reason = `Recipient not accepted by mail server (accepted=[${accepted.join(", ")}], rejected=[${rejected.join(", ")}], response=${response})`;
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
        }
        catch (error) {
            lastError = error;
            console.error(`[EMAIL] Error sending email to ${options.to} (attempt ${attempt + 1}/${retries + 1}):`, error?.message);
            if (attempt === retries) {
                console.error("[EMAIL] All retry attempts failed. Final error:", lastError?.message || lastError);
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
export const sendEmail = async (options, retries = 2) => {
    const result = await sendEmailDetailed(options, retries);
    return result.ok;
};
// ===========================================================================
// SeatPing email design system
// ---------------------------------------------------------------------------
// One shared, mobile-friendly, inline-styled wrapper so every email looks like
// the same product: a warm off-white canvas, a single white card with soft
// borders, a clean wordmark, and one clear call-to-action. No gradients.
// All helpers below build into `renderEmail()` — route/email code should never
// hand-write a full HTML document.
// ===========================================================================
const COLORS = {
    canvas: "#F4F1EC", // warm paper background
    card: "#FFFFFF",
    border: "#E7E2D9",
    ink: "#1C1B19", // headings + wordmark
    body: "#57534E", // body copy (warm gray)
    muted: "#8A8580", // footnotes / captions
    accent: "#C2410C", // warm terracotta — buttons + links
    accentSoft: "#FBEDE6", // accent tint for callouts
    panel: "#FAF8F4", // detail card background
};
const FONT_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
// Shared section layout. Every block-level section — detail cards, callouts,
// step lists, and the CTA button row — is rendered as a full-width, left-aligned
// table so their left edges line up exactly across every email. Width is forced
// via inline style (not just the width="100%" attribute) because Gmail's mobile
// app ignores the attribute on short-content tables and collapses them to fit —
// which is what misaligned the mini cards/buttons against the wider detail cards.
const SECTION_WIDTH = "width: 100%;"; // every section spans the same content width
const SECTION_GAP = "margin: 0 0 24px;"; // consistent vertical rhythm between sections
/** Escape a dynamic value for safe interpolation into email HTML. */
export function esc(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
/** A clean paragraph of body copy. */
export function p(html) {
    return `<p style="margin: 0 0 16px; color: ${COLORS.body}; font-size: 15px; line-height: 1.65;">${html}</p>`;
}
/**
 * Bulletproof, single call-to-action button. Rendered as a full-width,
 * left-aligned section (shared layout) wrapping a fixed-width button, so the
 * button's left edge lines up exactly with the cards above/below it instead of
 * floating at a content-dependent x-position.
 */
export function emailButton(href, label) {
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
/** Small "if the button doesn't work" fallback link. */
export function fallbackLink(href) {
    return `<p style="margin: 0 0 8px; color: ${COLORS.muted}; font-size: 13px; line-height: 1.6;">If the button doesn't work, paste this link into your browser:<br><a href="${href}" style="color: ${COLORS.accent}; word-break: break-all;">${href}</a></p>`;
}
/** A soft card for grouped detail rows. Rows are [label, value] pairs. */
export function detailCard(title, rows) {
    const body = rows
        .map(([label, value]) => `
      <tr>
        <td style="padding: 7px 0; color: ${COLORS.muted}; font-size: 13px; vertical-align: top; width: 130px;">${label}</td>
        <td style="padding: 7px 0; color: ${COLORS.ink}; font-size: 14px; font-weight: 500;">${value}</td>
      </tr>`)
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
export function calloutBox(html, accent = COLORS.accent, bg = COLORS.accentSoft) {
    return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="${SECTION_WIDTH} background: ${bg}; border-left: 3px solid ${accent}; border-radius: 8px; ${SECTION_GAP}">
      <tr><td style="padding: 14px 16px; color: ${COLORS.ink}; font-size: 14px; line-height: 1.55;">${html}</td></tr>
    </table>`;
}
/** A compact numbered/bulleted step list. */
export function stepList(items) {
    const lis = items
        .map((item, i) => `
      <tr>
        <td style="padding: 0 12px 14px 0; vertical-align: top;">
          <span style="display: inline-block; width: 24px; height: 24px; line-height: 24px; text-align: center; border-radius: 50%; background: ${COLORS.accentSoft}; color: ${COLORS.accent}; font-size: 13px; font-weight: 700;">${i + 1}</span>
        </td>
        <td style="padding: 0 0 14px; color: ${COLORS.body}; font-size: 14px; line-height: 1.5; vertical-align: top;">${item}</td>
      </tr>`)
        .join("");
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${SECTION_WIDTH} margin: 0 0 8px;">${lis}</table>`;
}
/**
 * Wrap body content in the shared SeatPing shell. `preheader` is the hidden
 * inbox-preview line; `heading` is the H1 inside the card; `bodyHtml` is the
 * already-built inner content (use the helpers above to compose it).
 */
export function renderEmail(opts) {
    const year = new Date().getFullYear();
    const preheader = opts.preheader
        ? `<span style="display:none !important; visibility:hidden; opacity:0; color:transparent; height:0; width:0; overflow:hidden;">${opts.preheader}</span>`
        : "";
    const tagline = opts.tagline ?? "Queues & Reservations for Hospitality";
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
                <a href="mailto:${FROM_ADDRESS}" style="color: ${COLORS.muted}; text-decoration: underline;">${FROM_ADDRESS}</a>
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
export const sendPasswordResetEmail = async (email, resetToken, 
// Carries the account type into the reset link so the reset page shows the
// matching (customer vs business) header and "back to login" target.
accountType = "customer", 
// Origin to build the link from (e.g. http://localhost:8080 in dev). Falls
// back to FRONTEND_URL / the production domain when not provided.
baseUrl) => {
    const origin = (baseUrl || FRONTEND()).replace(/\/+$/, "");
    const resetUrl = `${origin}/reset?token=${resetToken}${accountType === "business" ? "&type=business" : ""}`;
    const html = renderEmail({
        heading: "Reset Your Password",
        preheader: "Reset your SeatPing password — this link expires in 1 hour.",
        bodyHtml: `
      ${p("We got a request to reset the password on your SeatPing account. Click below to choose a new one.")}
      ${emailButton(resetUrl, "Reset Password")}
      ${p(`This link expires in <strong>1 hour</strong>. If you didn't request a reset, you can safely ignore this email — your password won't change.`)}
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
export const sendPasswordChangeConfirmationEmail = async (email, name) => {
    const html = renderEmail({
        heading: "Your Password Was Changed",
        preheader: "Your SeatPing password was just updated.",
        bodyHtml: `
      ${p(`${name ? `Hi ${esc(name)}, ` : ""}your SeatPing password was just updated. You can now sign in with your new password.`)}
      ${calloutBox(`<strong>Didn't make this change?</strong> Reach out to us right away at <a href="mailto:${FROM_ADDRESS}" style="color: ${COLORS.accent};">${FROM_ADDRESS}</a> and we'll help secure your account.`)}
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
export const sendCustomerWelcomeEmail = async (email, name) => {
    const homeUrl = FRONTEND();
    const profileUrl = `${FRONTEND()}/profile`;
    const html = renderEmail({
        heading: `Welcome to SeatPing, ${esc(name)}`,
        preheader: "Join queues, book tables, and get updates from your favorite spots.",
        bodyHtml: `
      ${p("Your account is ready. SeatPing keeps you out of the waiting-room shuffle — here's what you can do with it:")}
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
export const sendQueueJoinConfirmationEmail = async (email, firstName, lastName, businessName, address, position) => {
    const html = renderEmail({
        heading: "You're in the Queue",
        preheader: `You're #${position} in line at ${businessName}.`,
        bodyHtml: `
      ${p(`Hi ${esc(firstName)}, you're on the waitlist at <strong>${esc(businessName)}</strong>. We'll let you know when your table is ready.`)}
      ${calloutBox(`<span style="font-size: 15px; font-weight: 700;">You're #${Number(position)} in line</span>`)}
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
export const sendQueueYourTurnEmail = async (email, businessName) => {
    const html = renderEmail({
        heading: "Your Table Is Ready",
        preheader: `Your table is ready at ${businessName}.`,
        bodyHtml: `
      ${calloutBox(`<span style="font-size: 15px; font-weight: 700;">Your table is ready at ${esc(businessName)}</span>`, "#15803D", "#E7F4EC")}
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
export const sendReservationConfirmationEmail = async (params) => {
    const { email, firstName, lastName, businessName, address, dateLabel, timeLabel, partySize, status, manageUrl, cancellationPolicy, } = params;
    const pending = status === "pending";
    const statusLine = pending
        ? "Your request is in — the restaurant will confirm shortly."
        : "You're booked. We look forward to seeing you!";
    const html = renderEmail({
        heading: pending ? "Reservation Request Received" : "Reservation Confirmed",
        preheader: `${pending ? "Request Received" : "Confirmed"} — ${businessName}, ${dateLabel} at ${timeLabel}.`,
        bodyHtml: `
      ${p(`Hi ${esc(firstName)},`)}
      ${calloutBox(`<strong>${statusLine}</strong>`, pending ? "#B45309" : "#15803D", pending ? "#FBF3E2" : "#E7F4EC")}
      ${detailCard("Reservation", [
            ["Restaurant", esc(businessName)],
            ["Location", esc(address)],
            ["Name", esc(`${firstName} ${lastName}`.trim())],
            ["Date", esc(dateLabel)],
            ["Time", esc(timeLabel)],
            ["Number of Guests", `${Number(partySize)} ${partySize === 1 ? "Guest" : "Guests"}`],
        ])}
      ${emailButton(manageUrl, "Manage Reservation")}
      ${p(`Need to change your time, number of guests, or cancel? Use the button above — no login required.`)}
      ${cancellationPolicy
            ? calloutBox(`<strong>Cancellation Policy:</strong> ${esc(cancellationPolicy)}`, COLORS.muted, COLORS.panel)
            : ""}
      ${fallbackLink(manageUrl)}
    `,
    });
    return sendEmail({
        to: email,
        subject: pending
            ? `Reservation Request Received — ${businessName}`
            : `Reservation Confirmed — ${businessName}`,
        html,
        from: FROM_ADDRESS,
    });
};
/** Reminder sent to the customer ~2 hours before a confirmed reservation. */
export const sendReservationReminderEmail = async (params) => {
    const { email, firstName, businessName, address, dateLabel, timeLabel, partySize, manageUrl } = params;
    const html = renderEmail({
        heading: "Your Reservation Is Coming Up",
        preheader: `Your reservation at ${businessName} is in about 2 hours.`,
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
export const sendBusinessOnboardingEmail = async (email, name, _username, trialDays) => {
    const dashboardUrl = `${FRONTEND()}/business/dashboard`;
    // The body goes through p() (no auto-escaping), so escape the name exactly
    // once here. The heading is static and rendered (and escaped) by renderEmail.
    const trialSentence = trialDays && trialDays > 0 ? ` Your ${trialDays}-day trial is active.` : "";
    const intro = `Welcome to SeatPing, ${esc(name)}.${trialSentence} Follow these steps to start accepting queues and reservations.`;
    const html = renderEmail({
        heading: "Set Up Your First Location",
        preheader: "Let's get your first location live — here are the six steps.",
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
/** Notify the business that a new reservation was made/requested at a location. */
export const sendNewReservationBusinessEmail = async (params) => {
    const { to, locationName, customerName, customerEmail, customerPhone, dateLabel, timeLabel, partySize, status, notes, dashboardUrl, } = params;
    const pending = status === "pending";
    const rows = [
        ["Location", esc(locationName)],
        ["Guest", esc(customerName)],
        ["Email", `<a href="mailto:${esc(customerEmail)}" style="color: ${COLORS.accent};">${esc(customerEmail)}</a>`],
    ];
    if (customerPhone)
        rows.push(["Phone", esc(customerPhone)]);
    rows.push(["Date", esc(dateLabel)]);
    rows.push(["Time", esc(timeLabel)]);
    rows.push(["Number of Guests", `${Number(partySize)} ${partySize === 1 ? "Guest" : "Guests"}`]);
    rows.push(["Status", pending ? "Pending Confirmation" : "Confirmed"]);
    const html = renderEmail({
        heading: pending ? "New Reservation Request" : "New Reservation",
        preheader: `${customerName} · party of ${partySize} · ${dateLabel} at ${timeLabel}`,
        bodyHtml: `
      ${p(`${pending ? "A new reservation request just came in" : "A new reservation was just booked"} at <strong>${esc(locationName)}</strong>.`)}
      ${detailCard("Reservation", rows)}
      ${notes ? calloutBox(`<strong>Guest Notes:</strong> ${esc(notes)}`, COLORS.muted, COLORS.panel) : ""}
      ${emailButton(dashboardUrl, "View In Dashboard")}
    `,
    });
    return sendEmail({
        to,
        subject: pending
            ? `New Reservation Request At ${locationName}`
            : `New Reservation At ${locationName}`,
        html,
        from: FROM_ADDRESS,
    });
};
export const sendFeedbackEmail = async (data) => {
    const feedbackTypeLabels = {
        bug: "Bug / Something Broken",
        ux: "UX / Usability Issue",
        feature: "Feature Request",
        billing: "Pricing / Billing",
        other: "Other",
    };
    const severityLabels = { low: "Low", medium: "Medium", high: "High" };
    const rows = [
        ["Type", esc(feedbackTypeLabels[data.feedbackType] || data.feedbackType)],
    ];
    if (data.severity)
        rows.push(["Severity", esc(severityLabels[data.severity] || data.severity)]);
    rows.push(["Name", esc(data.name)]);
    rows.push(["Email", `<a href="mailto:${esc(data.email)}" style="color: ${COLORS.accent};">${esc(data.email)}</a>`]);
    if (data.businessName)
        rows.push(["Business", esc(data.businessName)]);
    if (data.phone)
        rows.push(["Phone", esc(data.phone)]);
    const html = renderEmail({
        heading: data.subject || "New feedback",
        preheader: `New feedback from ${data.name}`,
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
export const sendSalesInquiryEmail = async (data) => {
    const rows = [
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
export const sendFeedbackConfirmationEmail = async (userEmail, userName, ticketNumber, subject) => {
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
      ${p(`Hold onto your ticket ID (<strong>${esc(ticketNumber)}</strong>) if you need to follow up. You can also reach us anytime at <a href="mailto:${FROM_ADDRESS}" style="color: ${COLORS.accent};">${FROM_ADDRESS}</a>.`)}
    `,
    });
    return sendEmail({
        to: userEmail,
        subject: `Feedback Received — ${ticketNumber}`,
        html,
        from: FROM_ADDRESS,
    });
};
export const sendSalesInquiryConfirmationEmail = async (userEmail, contactName, businessName, ticketNumber) => {
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
      ${p(`Keep your ticket ID (<strong>${esc(ticketNumber)}</strong>) handy for follow-ups. Questions in the meantime? Reach us at <a href="mailto:${FROM_ADDRESS}" style="color: ${COLORS.accent};">${FROM_ADDRESS}</a>.`)}
    `,
    });
    return sendEmail({
        to: userEmail,
        subject: "We Received Your SeatPing Inquiry",
        html,
        from: FROM_ADDRESS,
    });
};
