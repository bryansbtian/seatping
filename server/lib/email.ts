import nodemailer from "nodemailer";
import { maskEmail, maskEmailList } from "./redact.js";
import { formatEnteredPhone, formatPhoneParts } from "../../shared/phone.js";
import { parsePublicLanguage, type PublicLanguage } from "../../shared/publicLanguage.js";
import { emailCopy, type EmailText } from "./emailCopy.js";

const FROM_ADDRESS = process.env.EMAIL_USER?.trim() || "";

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || "smtp.porkbun.com",
  port: 587,
  secure: false,
  auth: {
    user: FROM_ADDRESS,
    pass: process.env.EMAIL_PASSWORD,
  },
  tls: {
    rejectUnauthorized: process.env.EMAIL_TLS_INSECURE !== "1",
  },
  connectionTimeout: 30000,
  greetingTimeout: 30000,
  socketTimeout: 60000,
  pool: false,
  logger: false,
  debug: false,
} as any);

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
}

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL?.trim();

export interface EmailSendResult {
  ok: boolean;
  deliveryUncertain?: boolean;
  recipient: string;
  messageId: string | null;
  response: string | null;
  accepted: string[];
  rejected: string[];
  envelope: any;
  error?: string;
}

export const sendEmailDetailed = async (
  options: EmailOptions,
  retries = 2,
): Promise<EmailSendResult> => {
  if (!FROM_ADDRESS) {
    return {
      ok: false,
      recipient: options.to,
      messageId: null,
      response: null,
      accepted: [],
      rejected: [options.to],
      envelope: null,
      error: "EMAIL_USER is not configured",
    };
  }

  let lastError: any = null;
  const target = options.to.trim().toLowerCase();

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        console.log("[EMAIL] Retry attempt %d/%d for: %s", attempt, retries, maskEmail(options.to));
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      } else {
        console.log("[EMAIL] Attempting to send email to: %s", maskEmail(options.to));
      }

      const mailOptions: {
        from: string;
        to: string;
        subject: string;
        html: string;
        replyTo?: string;
        messageId?: string;
        inReplyTo?: string;
        references?: string[];
      } = {
        from: options.from || FROM_ADDRESS,
        to: options.to,
        subject: options.subject,
        html: options.html,
      };
      if (options.replyTo) {
        mailOptions.replyTo = options.replyTo;
      }

      if (options.messageId) {
        mailOptions.messageId = options.messageId;
      }
      if (options.inReplyTo) {
        mailOptions.inReplyTo = options.inReplyTo;
      }
      if (options.references?.length) {
        mailOptions.references = options.references;
      }
      const info: any = await transporter.sendMail(mailOptions);
      const accepted: string[] = (info.accepted || []).map((a: any) => String(a));
      const rejected: string[] = (info.rejected || []).map((a: any) => String(a));
      const messageId: string | null = info.messageId || null;
      const response: string | null = info.response || null;

      const acceptedTarget = accepted.some((a) => a.toLowerCase() === target);
      const rejectedTarget = rejected.some((a) => a.toLowerCase() === target);

      console.log(
        "[EMAIL] Sent email to %s | messageId=%s | accepted=[%s] | rejected=[%s] | response=%s",
        maskEmail(options.to),
        messageId,
        maskEmailList(accepted),
        maskEmailList(rejected),
        response,
      );

      if (!acceptedTarget || rejectedTarget) {
        const reason = `Recipient not accepted by mail server (accepted=[${maskEmailList(
          accepted,
        )}], rejected=[${maskEmailList(rejected)}], response=${response})`;
        console.warn("[EMAIL] %s NOT accepted: %s", maskEmail(options.to), reason);
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
        "[EMAIL] Error sending email to %s (attempt %d/%d):",
        maskEmail(options.to),
        attempt + 1,
        retries + 1,
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
    deliveryUncertain: true,
  };
};

export const sendEmail = async (options: EmailOptions, retries = 2): Promise<boolean> => {
  const result = await sendEmailDetailed(options, retries);
  return result.ok;
};

const COLORS = {
  canvas: "#F4F6FA",
  card: "#FFFFFF",
  border: "#E4E8EF",
  ink: "#0F1A2E",
  body: "#334155",
  muted: "#64748B",
  accent: "#16294D",
  accentSoft: "#EEF2F9",
  panel: "#F7F9FC",
};

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const SECTION_WIDTH = "width: 100%;";
const SECTION_GAP = "margin: 0 0 24px;";

export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function safeUrl(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!/^(https?:|mailto:)/i.test(raw)) {
    return "#";
  }
  return esc(raw);
}

export function p(html: string): string {
  return `<p style="margin: 0 0 16px; color: ${COLORS.body}; font-size: 15px; line-height: 1.65;">${html}</p>`;
}

export function emailButton(href: string, label: string): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${SECTION_WIDTH} margin: 28px 0;">
      <tr>
        <td align="left">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td bgcolor="${COLORS.accent}" style="border-radius: 10px;">
                <a href="${safeUrl(href)}" target="_blank"
                   style="display: inline-block; padding: 14px 30px; font-family: ${FONT_STACK}; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 10px;">
                  ${esc(label)}
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

export function emailSecondaryButton(href: string, label: string): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${SECTION_WIDTH} margin: 28px 0;">
      <tr>
        <td align="left">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td bgcolor="${COLORS.card}" style="border-radius: 10px; border: 1px solid ${COLORS.accent};">
                <a href="${safeUrl(href)}" target="_blank"
                   style="display: inline-block; padding: 13px 29px; font-family: ${FONT_STACK}; font-size: 15px; font-weight: 600; color: ${COLORS.accent}; text-decoration: none; border-radius: 10px;">
                  ${esc(label)}
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

export function emailButtonRow(
  primary: { href: string; label: string },
  secondary: { href: string; label: string },
): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${SECTION_WIDTH} margin: 28px 0;">
      <tr>
        <td align="left">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td bgcolor="${COLORS.accent}" style="border-radius: 10px;">
                <a href="${safeUrl(primary.href)}" target="_blank"
                   style="display: inline-block; padding: 14px 24px; font-family: ${FONT_STACK}; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 10px; white-space: nowrap;">
                  ${esc(primary.label)}
                </a>
              </td>
              <td style="width: 12px; font-size: 0; line-height: 0;">&nbsp;</td>
              <td bgcolor="${COLORS.card}" style="border-radius: 10px; border: 1px solid ${COLORS.accent};">
                <a href="${safeUrl(secondary.href)}" target="_blank"
                   style="display: inline-block; padding: 13px 23px; font-family: ${FONT_STACK}; font-size: 15px; font-weight: 600; color: ${COLORS.accent}; text-decoration: none; border-radius: 10px; white-space: nowrap;">
                  ${esc(secondary.label)}
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

export function fallbackLink(href: string, language: PublicLanguage = "en"): string {
  const t = emailCopy(language);
  return `<p style="margin: 0 0 8px; color: ${COLORS.muted}; font-size: 13px; line-height: 1.6;">${t("If the button doesn't work, paste this link into your browser:")}<br><a href="${safeUrl(href)}" style="color: ${COLORS.accent}; word-break: break-all;">${esc(href)}</a></p>`;
}

export function detailCard(title: string, rows: Array<[string, string]>): string {
  const body = rows
    .map(
      ([label, value]) => `
      <tr>
        <td style="padding: 7px 0; color: ${COLORS.muted}; font-size: 13px; vertical-align: top; width: 130px;">${label}</td>
        <td style="padding: 7px 0; color: ${COLORS.ink}; font-size: 14px; font-weight: 500; word-break: break-word;">${value}</td>
      </tr>`,
    )
    .join("");
  let titleHtml = "";
  if (title) {
    titleHtml = `<p style="margin: 0 0 10px; color: ${COLORS.ink}; font-size: 13px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;">${title}</p>`;
  }
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="${SECTION_WIDTH} background: ${COLORS.panel}; border: 1px solid ${COLORS.border}; border-radius: 12px; ${SECTION_GAP}">
      <tr><td style="padding: 18px 20px;">
        ${titleHtml}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${SECTION_WIDTH}">${body}</table>
      </td></tr>
    </table>`;
}

export function calloutBox(html: string, accent = COLORS.accent, bg = COLORS.accentSoft): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="${SECTION_WIDTH} background: ${bg}; border-left: 3px solid ${accent}; border-radius: 8px; ${SECTION_GAP}">
      <tr><td style="padding: 14px 16px; color: ${COLORS.ink}; font-size: 14px; line-height: 1.55;">${html}</td></tr>
    </table>`;
}

export function stepList(items: string[]): string {
  const lis = items
    .map(
      (item, i) => `
      <tr>
        <td style="padding: 0 12px 14px 0; vertical-align: top;">
          <span style="display: inline-block; width: 24px; height: 24px; line-height: 24px; text-align: center; border-radius: 50%; background: ${COLORS.accentSoft}; color: ${COLORS.accent}; font-size: 13px; font-weight: 700;">${i + 1}</span>
        </td>
        <td style="padding: 0 0 14px; color: ${COLORS.body}; font-size: 14px; line-height: 1.5; vertical-align: top;">${item}</td>
      </tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${SECTION_WIDTH} margin: 0 0 8px;">${lis}</table>`;
}

export function renderEmail(opts: {
  heading: string;
  bodyHtml: string;
  preheader?: string;
  tagline?: string;
  language?: PublicLanguage;
}): string {
  const language = parsePublicLanguage(opts.language) ?? "en";
  const t = emailCopy(language);
  const year = new Date().getFullYear();
  let preheader = "";
  if (opts.preheader) {
    preheader = `<span style="display:none !important; visibility:hidden; opacity:0; color:transparent; height:0; width:0; overflow:hidden;">${esc(opts.preheader)}</span>`;
  }
  const tagline = opts.tagline ?? t("Queues & Reservations For Hospitality");
  let supportFooter = "";
  if (SUPPORT_EMAIL) {
    supportFooter = ` · <a href="mailto:${esc(SUPPORT_EMAIL)}" style="color: ${COLORS.muted}; text-decoration: underline; word-break: break-word;">${esc(SUPPORT_EMAIL)}</a>`;
  }

  return `<!DOCTYPE html>
<html lang="${language}">
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
          <tr>
            <td style="padding: 0 4px 18px;">
              <span style="font-family: ${FONT_STACK}; font-size: 20px; font-weight: 700; color: ${COLORS.ink}; letter-spacing: -0.01em;">
                Seat<span style="color: ${COLORS.accent};">Ping</span>
              </span>
            </td>
          </tr>
          <tr>
            <td style="background: ${COLORS.card}; border: 1px solid ${COLORS.border}; border-radius: 16px; padding: 36px 32px;">
              <h1 style="margin: 0 0 18px; font-family: ${FONT_STACK}; color: ${COLORS.ink}; font-size: 22px; font-weight: 700; line-height: 1.3;">${esc(opts.heading)}</h1>
              <div style="font-family: ${FONT_STACK};">
                ${opts.bodyHtml}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 22px 8px 0; text-align: center;">
              <p style="margin: 0 0 4px; font-family: ${FONT_STACK}; color: ${COLORS.muted}; font-size: 12px; line-height: 1.6;">${esc(tagline)}</p>
              <p style="margin: 0; font-family: ${FONT_STACK}; color: ${COLORS.muted}; font-size: 12px; line-height: 1.6;">
                © ${year} SeatPing${supportFooter}
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

function emailGuestCount(partySize: number, language: PublicLanguage): string {
  let key: EmailText = "{partySize} Guests";
  if (partySize === 1) {
    key = "{partySize} Guest";
  }
  return emailCopy(language)(key, { partySize: Number(partySize) });
}

export const sendPasswordResetEmail = async (
  email: string,
  resetToken: string,
  accountType: "customer" | "business" = "customer",
  baseUrl?: string,
  language: PublicLanguage = "en",
): Promise<boolean> => {
  const t = emailCopy(language);
  const origin = (baseUrl || FRONTEND()).replace(/\/+$/, "");
  let accountTypeParam = "";
  if (accountType === "business") {
    accountTypeParam = "&type=business";
  }
  const resetUrl = `${origin}/reset?token=${resetToken}${accountTypeParam}`;

  const html = renderEmail({
    language,
    heading: t("Reset Your Password"),
    preheader: t("Reset Your SeatPing Password"),
    bodyHtml: `
      ${p(t("We got a request to reset the password on your SeatPing account. Click below to choose a new one."))}
      ${emailButton(resetUrl, t("Reset Password"))}
      ${p(t("This link expires in <strong>1 hour</strong>. If you didn't request a reset, you can safely ignore this email. Your password won't change."))}
      ${fallbackLink(resetUrl, language)}
    `,
  });

  return sendEmail({
    to: email,
    subject: t("Reset Your SeatPing Password"),
    html,
    from: FROM_ADDRESS,
  });
};

export const sendPasswordChangeConfirmationEmail = async (
  email: string,
  name?: string,
  language: PublicLanguage = "en",
): Promise<boolean> => {
  const t = emailCopy(language);
  let greeting = "";
  if (name) {
    greeting = t("Hi {name}, ", { name: esc(name) });
  }
  let securityMessage = t(
    "<strong>Didn't make this change?</strong> Contact support right away so we can help secure your account.",
  );
  if (SUPPORT_EMAIL) {
    securityMessage = t(
      "<strong>Didn't make this change?</strong> Reach out to us right away at {supportLink} and we'll help secure your account.",
      {
        supportLink: `<a href="mailto:${esc(SUPPORT_EMAIL)}" style="color: ${COLORS.accent}; word-break: break-word;">${esc(SUPPORT_EMAIL)}</a>`,
      },
    );
  }
  const html = renderEmail({
    language,
    heading: t("Your Password Was Changed"),
    preheader: t("Your SeatPing Password Was Just Updated"),
    bodyHtml: `
      ${p(`${greeting}${t("your SeatPing password was just updated. You can now sign in with your new password.")}`)}
      ${calloutBox(securityMessage)}
    `,
  });

  return sendEmail({
    to: email,
    subject: t("Your SeatPing Password Was Changed"),
    html,
    from: FROM_ADDRESS,
  });
};

export const sendCustomerWelcomeEmail = async (
  email: string,
  name: string,
  language: PublicLanguage = "en",
): Promise<boolean> => {
  const t = emailCopy(language);
  const homeUrl = FRONTEND();
  const profileUrl = `${FRONTEND()}/profile`;

  const html = renderEmail({
    language,
    heading: t("Welcome to SeatPing, {name}", { name: esc(name) }),
    preheader: t("Join Queues, Book Tables, And Get Live Updates"),
    bodyHtml: `
      ${p(t("Your account is ready. SeatPing keeps you out of the waiting-room shuffle. Here's what you can do with it:"))}
      ${stepList([
        t("Join a restaurant's waitlist from your phone and track your spot in line"),
        t("Book and manage reservations without creating an account each time"),
        t("Get notified the moment your table is ready"),
        t("Keep your upcoming and past bookings in one place"),
      ])}
      ${emailButton(profileUrl, t("View Your Profile"))}
      ${p(t('Or head to the <a href="{homeUrl}" style="color: {accent};">SeatPing homepage</a> to find a place to eat.', { homeUrl: safeUrl(homeUrl), accent: COLORS.accent }))}
    `,
  });

  return sendEmail({
    to: email,
    subject: t("Welcome To SeatPing"),
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
  position: number,
  language: PublicLanguage = "en",
): Promise<boolean> => {
  const t = emailCopy(language);
  const html = renderEmail({
    language,
    heading: t("You're in the Queue"),
    preheader: t("You're #{position} In Line At {businessName}", {
      position: Number(position),
      businessName,
    }),
    bodyHtml: `
      ${p(t("Hi {firstName}, you're on the waitlist at <strong>{businessName}</strong>. We'll let you know when your table is ready.", { firstName: esc(firstName), businessName: esc(businessName) }))}
      ${calloutBox(
        `<span style="font-size: 15px; font-weight: 700;">${t("You're #{position} in line", { position: Number(position) })}</span>`,
      )}
      ${detailCard(t("Queue details"), [
        [t("Restaurant"), esc(businessName)],
        [t("Location"), esc(address)],
        [t("Name"), esc(`${firstName} ${lastName}`.trim())],
        [t("Your Spot"), `#${Number(position)}`],
      ])}
      ${p(t("You can close this email. We'll notify you when it's your turn. Thanks for your patience!"))}
    `,
  });

  return sendEmail({
    to: email,
    subject: t("You're In The Queue"),
    html,
    from: FROM_ADDRESS,
  });
};

export const sendQueueYourTurnEmail = async (
  email: string,
  businessName: string,
  language: PublicLanguage = "en",
): Promise<boolean> => {
  const t = emailCopy(language);
  const html = renderEmail({
    language,
    heading: t("Your Table Is Ready"),
    preheader: t("Your Table Is Ready At {businessName}", { businessName }),
    bodyHtml: `
      ${calloutBox(
        `<span style="font-size: 15px; font-weight: 700;">${t("Your table is ready at {businessName}", { businessName: esc(businessName) })}</span>`,
        "#15803D",
        "#E7F4EC",
      )}
      ${p(t("Please head to the host within the next <strong>5 minutes</strong> to be seated. Thanks for waiting with SeatPing!"))}
    `,
  });

  return sendEmail({
    to: email,
    subject: t("Your Table Is Ready"),
    html,
    from: FROM_ADDRESS,
  });
};

export const sendReservationConfirmationEmail = async (params: {
  language?: PublicLanguage;
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
  const language = params.language ?? "en";
  const t = emailCopy(language);
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

  let cancellationPolicyHtml = "";
  if (cancellationPolicy) {
    cancellationPolicyHtml = calloutBox(
      `<strong>${t("Cancellation Policy:")}</strong> ${esc(cancellationPolicy)}`,
      COLORS.muted,
      COLORS.panel,
    );
  }
  const html = renderEmail({
    language,
    heading: t("Reservation Confirmed"),
    preheader: t("Reservation Confirmed For {businessName}, {dateLabel} At {timeLabel}", {
      businessName,
      dateLabel,
      timeLabel,
    }),
    bodyHtml: `
      ${p(t("Hi {firstName},", { firstName: esc(firstName) }))}
      ${calloutBox(
        `<strong>${t("You're booked. We look forward to seeing you!")}</strong>`,
        "#15803D",
        "#E7F4EC",
      )}
      ${detailCard(t("Reservation"), [
        [t("Restaurant"), esc(businessName)],
        [t("Location"), esc(address)],
        [t("Name"), esc(`${firstName} ${lastName}`.trim())],
        [t("Date"), esc(dateLabel)],
        [t("Time"), esc(timeLabel)],
        [t("Number of Guests"), emailGuestCount(partySize, language)],
      ])}
      ${emailButton(manageUrl, t("Manage Reservation"))}
      ${p(t("Need to change your time, number of guests, or cancel? Use the button above. No login required."))}
      ${cancellationPolicyHtml}
      ${fallbackLink(manageUrl, language)}
    `,
  });

  return sendEmail({
    to: email,
    subject: t("Reservation Confirmed: {businessName}", { businessName }),
    html,
    from: FROM_ADDRESS,
  });
};

export const sendReservationReminderEmail = async (params: {
  language?: PublicLanguage;
  email: string;
  firstName: string;
  businessName: string;
  address: string;
  dateLabel: string;
  timeLabel: string;
  partySize: number;
  manageUrl?: string;
}): Promise<boolean> => {
  const language = params.language ?? "en";
  const t = emailCopy(language);
  const { email, firstName, businessName, address, dateLabel, timeLabel, partySize, manageUrl } =
    params;

  let manageButtonHtml = "";
  let manageFallbackHtml = "";
  if (manageUrl) {
    manageButtonHtml = emailButton(manageUrl, t("Manage Reservation"));
    manageFallbackHtml = fallbackLink(manageUrl, language);
  }
  const html = renderEmail({
    language,
    heading: t("Your Reservation Is Coming Up"),
    preheader: t("Your Reservation At {businessName} Is In About 2 Hours", { businessName }),
    bodyHtml: `
      ${p(t("Hi {firstName}, a quick reminder that your table at <strong>{businessName}</strong> is coming up in about 2 hours.", { firstName: esc(firstName), businessName: esc(businessName) }))}
      ${detailCard(t("Reservation"), [
        [t("Restaurant"), esc(businessName)],
        [t("Location"), esc(address)],
        [t("Date"), esc(dateLabel)],
        [t("Time"), esc(timeLabel)],
        [t("Number of Guests"), emailGuestCount(partySize, language)],
      ])}
      ${manageButtonHtml}
      ${manageFallbackHtml}
    `,
  });

  return sendEmail({
    to: email,
    subject: t("Your Reservation Is Coming Up"),
    html,
    from: FROM_ADDRESS,
  });
};

export const sendBusinessOnboardingEmail = async (
  email: string,
  name: string,
  _username: string,
  trialDays?: number,
  language: PublicLanguage = "en",
): Promise<boolean> => {
  const t = emailCopy(language);
  const dashboardUrl = `${FRONTEND()}/business/overview`;

  let trialSentence = "";
  if (trialDays && trialDays > 0) {
    trialSentence = t(" Your {trialDays}-day trial is active.", { trialDays });
  }
  const intro = t(
    "Welcome to SeatPing, {name}.{trialSentence} Follow these steps to start accepting queues and reservations.",
    { name: esc(name), trialSentence },
  );

  const html = renderEmail({
    language,
    heading: t("Set Up Your First Location"),
    preheader: t("Get Your First Location Live In Six Steps"),
    bodyHtml: `
      ${p(intro)}
      ${stepList([
        t("Add or review your business profile"),
        t("Add your first location's details"),
        t("Set your opening hours"),
        t("Configure your reservation settings"),
        t("Download and share your location's QR code"),
        t("Run a test booking to see the customer flow end to end"),
      ])}
      ${emailButton(dashboardUrl, t("Open Your Dashboard"))}
      ${p(t("Anything unclear or not working the way you'd expect? Just reply to this email. It comes straight to us."))}
    `,
  });

  return sendEmail({
    to: email,
    subject: t("Welcome To SeatPing"),
    html,
    from: FROM_ADDRESS,
  });
};

export const sendNewReservationBusinessEmail = async (params: {
  language?: PublicLanguage;
  to: string;
  businessName: string;
  locationName: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  customerCountryCode?: string;
  dateLabel: string;
  timeLabel: string;
  partySize: number;
  notes?: string;
  dashboardUrl: string;
}): Promise<boolean> => {
  const language = params.language ?? "en";
  const t = emailCopy(language);
  const {
    to,
    locationName,
    customerName,
    customerEmail,
    customerPhone,
    customerCountryCode,
    dateLabel,
    timeLabel,
    partySize,
    notes,
    dashboardUrl,
  } = params;

  const rows: Array<[string, string]> = [
    [t("Location"), esc(locationName)],
    [t("Guest"), esc(customerName)],
    [
      t("Email"),
      `<a href="mailto:${esc(customerEmail)}" style="color: ${COLORS.accent};">${esc(customerEmail)}</a>`,
    ],
  ];
  if (customerPhone) {
    let phoneLabel = formatEnteredPhone(customerPhone) ?? customerPhone;
    if (customerCountryCode) {
      phoneLabel = formatPhoneParts(customerCountryCode, customerPhone) ?? customerPhone;
    }
    rows.push([t("Phone"), esc(phoneLabel)]);
  }
  rows.push([t("Date"), esc(dateLabel)]);
  rows.push([t("Time"), esc(timeLabel)]);
  rows.push([t("Number of Guests"), emailGuestCount(partySize, language)]);
  rows.push([t("Status"), t("Confirmed")]);

  let guestNotesHtml = "";
  if (notes) {
    guestNotesHtml = calloutBox(
      `<strong>${t("Guest Notes:")}</strong> ${esc(notes)}`,
      COLORS.muted,
      COLORS.panel,
    );
  }

  const html = renderEmail({
    language,
    heading: t("New Reservation"),
    preheader: t("{customerName} · Party Of {partySize} · {dateLabel} At {timeLabel}", {
      customerName,
      partySize: Number(partySize),
      dateLabel,
      timeLabel,
    }),
    bodyHtml: `
      ${p(t("A new reservation was just booked at <strong>{locationName}</strong>.", { locationName: esc(locationName) }))}
      ${detailCard(t("Reservation"), rows)}
      ${guestNotesHtml}
      ${emailButton(dashboardUrl, t("View In Dashboard"))}
    `,
  });

  return sendEmail({
    to,
    subject: t("New Reservation At {locationName}", { locationName }),
    html,
    from: FROM_ADDRESS,
  });
};

export const NEEDS_REVIEW_REASONS: Record<string, string> = {
  NO_TABLE: "No table was free for the whole reservation window.",
};

export function needsReviewReasonLabel(
  reason: string | null | undefined,
  language: PublicLanguage = "en",
): string {
  const t = emailCopy(language);
  if (reason && Object.hasOwn(NEEDS_REVIEW_REASONS, reason)) {
    return t("No table was free for the whole reservation window.");
  }
  return t("Smart Assignment could not find a table for this reservation.");
}

export const sendReservationNeedsReviewEmail = async (params: {
  language?: PublicLanguage;
  to: string;
  locationName: string;
  customerName: string;
  dateLabel: string;
  timeLabel: string;
  partySize: number;
  reservationId: string;
  reason?: string | null;
  reservationsUrl: string;
  floorUrl: string;
}): Promise<boolean> => {
  const language = params.language ?? "en";
  const t = emailCopy(language);
  const {
    to,
    locationName,
    customerName,
    dateLabel,
    timeLabel,
    partySize,
    reservationId,
    reason,
    reservationsUrl,
    floorUrl,
  } = params;

  const rows: Array<[string, string]> = [
    [t("Location"), esc(locationName)],
    [t("Guest"), esc(customerName)],
    [t("Date"), esc(dateLabel)],
    [t("Time"), esc(timeLabel)],
    [t("Number of Guests"), emailGuestCount(partySize, language)],
    [t("Reservation ID"), esc(reservationId)],
    [t("Status"), t("Needs Review")],
  ];

  const html = renderEmail({
    language,
    heading: t("Reservation Needs A Table"),
    preheader: t("{customerName} · Party Of {partySize} · {dateLabel} at {timeLabel}", {
      customerName,
      partySize: Number(partySize),
      dateLabel,
      timeLabel,
    }),
    bodyHtml: `
      ${p(t("A reservation at <strong>{locationName}</strong> was confirmed, but no table could be assigned automatically.", { locationName: esc(locationName) }))}
      ${calloutBox(`<strong>${t("Why:")}</strong> ${esc(needsReviewReasonLabel(reason, language))}`)}
      ${detailCard(t("Reservation"), rows)}
      ${p(t("The booking is held for the guest. Assign a table when one frees up, or join tables on the floor plan."))}
      ${emailButtonRow(
        { href: reservationsUrl, label: t("Review Reservation") },
        { href: floorUrl, label: t("Open Floor Management") },
      )}
      ${fallbackLink(reservationsUrl, language)}
    `,
  });

  return sendEmail({
    to,
    subject: t("Reservation Needs A Table At {locationName}", { locationName }),
    html,
    from: FROM_ADDRESS,
  });
};

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

export const sendFeedbackEmail = async (
  data: FeedbackData,
  language: PublicLanguage = "en",
): Promise<boolean> => {
  const t = emailCopy(language);
  const feedbackTypeLabels: Record<string, EmailText> = {
    bug: "Bug / Something Broken",
    ux: "UX / Usability Issue",
    feature: "Feature Request",
    billing: "Pricing / Billing",
    other: "Other",
  };
  const severityLabels: Record<string, EmailText> = { low: "Low", medium: "Medium", high: "High" };
  let feedbackTypeLabel = data.feedbackType;
  if (Object.hasOwn(feedbackTypeLabels, data.feedbackType)) {
    feedbackTypeLabel = t(feedbackTypeLabels[data.feedbackType]);
  }
  let severityLabel = data.severity || "";
  if (data.severity && Object.hasOwn(severityLabels, data.severity)) {
    severityLabel = t(severityLabels[data.severity]);
  }

  const rows: Array<[string, string]> = [[t("Type"), esc(feedbackTypeLabel)]];
  if (data.severity) {
    rows.push([t("Severity"), esc(severityLabel)]);
  }
  rows.push([t("Name"), esc(data.name)]);
  rows.push([
    t("Email"),
    `<a href="mailto:${esc(data.email)}" style="color: ${COLORS.accent};">${esc(data.email)}</a>`,
  ]);
  if (data.businessName) {
    rows.push([t("Business"), esc(data.businessName)]);
  }
  if (data.phone) {
    rows.push([t("Phone"), esc(formatEnteredPhone(data.phone) ?? data.phone)]);
  }

  const html = renderEmail({
    language,
    heading: data.subject || t("New Feedback"),
    preheader: t("New Feedback From {name}", { name: data.name }),
    bodyHtml: `
      ${detailCard(t("Feedback"), rows)}
      ${calloutBox(`<strong>${t("Message")}</strong><br>${esc(data.message).replace(/\n/g, "<br>")}`, COLORS.muted, COLORS.panel)}
    `,
  });

  return sendEmail({
    to: FROM_ADDRESS,
    subject: t("Feedback [{type}]: {subject}", { type: feedbackTypeLabel, subject: data.subject }),
    html,
  });
};

export const sendFeedbackConfirmationEmail = async (
  userEmail: string,
  userName: string,
  ticketNumber: string,
  subject: string,
  messageId?: string,
  language: PublicLanguage = "en",
): Promise<boolean> => {
  const t = emailCopy(language);
  let followUp = t(
    "Hold onto your ticket ID (<strong>{ticketNumber}</strong>) if you need to follow up.",
    { ticketNumber: esc(ticketNumber) },
  );
  if (SUPPORT_EMAIL) {
    followUp += t(" You can also reach us anytime at {supportLink}.", {
      supportLink: `<a href="mailto:${esc(SUPPORT_EMAIL)}" style="color: ${COLORS.accent}; word-break: break-word;">${esc(SUPPORT_EMAIL)}</a>`,
    });
  }
  const html = renderEmail({
    language,
    heading: t("Thanks For The Feedback"),
    preheader: t("We've Logged Your Feedback: {ticketNumber}", { ticketNumber }),
    bodyHtml: `
      ${p(t("Hi {userName}, we've logged your feedback and we'll review it shortly.", { userName: esc(userName) }))}
      ${detailCard(t("Your ticket"), [
        [t("Ticket ID"), esc(ticketNumber)],
        [t("Subject"), esc(subject)],
        [t("Status"), t("Open")],
      ])}
      ${p(followUp)}
    `,
  });

  return sendEmail({
    to: userEmail,
    subject: t("Feedback Received: {ticketNumber}", { ticketNumber }),
    messageId,
    replyTo: FROM_ADDRESS,
    html,
    from: FROM_ADDRESS,
  });
};
