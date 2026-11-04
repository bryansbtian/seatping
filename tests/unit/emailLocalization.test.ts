import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicLanguage } from "../../shared/publicLanguage.js";
import { sinks } from "../setup/externalMocks.js";

const ORIGINAL_ENV = { ...process.env };
const baseline: Record<string, { subject: string; html: string }> = JSON.parse(
  readFileSync("tests/fixtures/email-english.json", "utf8"),
);
const booking = {
  email: "guest@test.invalid",
  firstName: "Ada <Guest>",
  lastName: "Lovelace & Co",
  businessName: "Bistro & Grill",
  address: "1 Test Street",
  dateLabel: "Wed, Nov 4, 2026",
  timeLabel: "7:30 PM",
  partySize: 2,
  manageUrl: "https://frontend.test.invalid/reservations/manage/test-placeholder",
  cancellationPolicy: "Contact us <24 hours before arrival>.",
};

async function templateActions(language?: PublicLanguage) {
  const email = await import("../../server/lib/email.js");
  return {
    reset: () =>
      email.sendPasswordResetEmail(
        booking.email,
        "test-placeholder",
        "customer",
        undefined,
        language,
      ),
    changed: () =>
      email.sendPasswordChangeConfirmationEmail(booking.email, booking.firstName, language),
    welcome: () => email.sendCustomerWelcomeEmail(booking.email, booking.firstName, language),
    onboarding: () =>
      email.sendBusinessOnboardingEmail(booking.email, booking.firstName, "bistro", 7, language),
    joined: () =>
      email.sendQueueJoinConfirmationEmail(
        booking.email,
        booking.firstName,
        booking.lastName,
        booking.businessName,
        booking.address,
        4,
        language,
      ),
    called: () => email.sendQueueYourTurnEmail(booking.email, booking.businessName, language),
    confirmed: () => email.sendReservationConfirmationEmail({ ...booking, language }),
    reminder: () => email.sendReservationReminderEmail({ ...booking, language }),
    newReservation: () =>
      email.sendNewReservationBusinessEmail({
        ...booking,
        language,
        to: "owner@test.invalid",
        locationName: "Main <Floor>",
        customerName: "Ada <Guest>",
        customerEmail: booking.email,
        customerPhone: "2065550100",
        customerCountryCode: "+1",
        notes: "Window <please>",
        dashboardUrl: "https://frontend.test.invalid/business",
      }),
    needsTable: () =>
      email.sendReservationNeedsReviewEmail({
        ...booking,
        language,
        to: "owner@test.invalid",
        locationName: "Main <Floor>",
        customerName: "Ada <Guest>",
        reservationId: "reservation-test",
        reason: "NO_TABLE",
        reservationsUrl: "https://frontend.test.invalid/business/reservations",
        floorUrl: "https://frontend.test.invalid/business/floor",
      }),
    feedback: () =>
      email.sendFeedbackEmail(
        {
          name: booking.firstName,
          email: booking.email,
          businessName: booking.businessName,
          phone: "+12065550100",
          feedbackType: "bug",
          subject: "Help <please>",
          message: "Line one\n<script>unsafe</script>",
          severity: "high",
        },
        language,
      ),
    feedbackConfirmation: () =>
      email.sendFeedbackConfirmationEmail(
        booking.email,
        booking.firstName,
        "TEST-1",
        "Help <please>",
        "<test-thread@test.invalid>",
        language,
      ),
  };
}

function lastEmail() {
  const sent = sinks().email.at(-1);
  if (!sent) {
    throw new Error("No email was captured");
  }
  return sent;
}

beforeEach(() => {
  process.env.SUPPORT_EMAIL = "support@test.invalid";
  process.env.FRONTEND_URL = "https://frontend.test.invalid";
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-04T12:00:00Z"));
  vi.resetModules();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("English email compatibility", () => {
  it.each([undefined, "en"] as const)(
    "preserves every original subject and HTML byte for %s",
    async (language) => {
      for (const [name, action] of Object.entries(await templateActions(language))) {
        await action();
        const sent = lastEmail();
        expect({ subject: sent.subject, html: sent.html }, name).toEqual(baseline[name]);
      }
    },
  );
});

const indonesianTemplates = [
  {
    name: "reset",
    subject: "Atur Ulang Kata Sandi SeatPing Anda",
    heading: "Atur Ulang Kata Sandi Anda",
    preheader: "Atur Ulang Kata Sandi SeatPing Anda",
    fragments: ["Kami menerima permintaan", "Atur Ulang Kata Sandi</a>", "<strong>1 jam</strong>"],
  },
  {
    name: "changed",
    subject: "Kata Sandi SeatPing Anda Telah Diubah",
    heading: "Kata Sandi Anda Telah Diubah",
    preheader: "Kata Sandi SeatPing Anda Baru Saja Diperbarui",
    fragments: [
      "Halo Ada &lt;Guest&gt;, kata sandi SeatPing Anda baru saja diperbarui.",
      "Tidak merasa melakukan perubahan ini?",
      "Segera hubungi kami melalui",
    ],
  },
  {
    name: "welcome",
    subject: "Selamat Datang di SeatPing",
    heading: "Selamat Datang di SeatPing, Ada &amp;lt;Guest&amp;gt;",
    preheader: "Ikuti Antrean, Pesan Meja, dan Dapatkan Informasi Terbaru",
    fragments: [
      "Akun Anda sudah siap digunakan.",
      "Bergabung dengan antrean restoran melalui ponsel dan memantau posisi antrean.",
      "Lihat Profil Anda</a>",
      "halaman utama SeatPing</a> untuk menemukan restoran pilihan Anda.",
    ],
  },
  {
    name: "onboarding",
    subject: "Selamat Datang di SeatPing",
    heading: "Siapkan Lokasi Pertama Anda",
    preheader: "Aktifkan Lokasi Pertama Anda dalam Enam Langkah",
    fragments: [
      "Masa uji coba Anda selama 7 hari telah aktif.",
      "Konfigurasikan pengaturan reservasi.",
      "Buka Dashboard Anda</a>",
      "Pesan Anda akan langsung sampai kepada tim kami.",
    ],
  },
  {
    name: "joined",
    subject: "Anda Sudah Masuk Antrean",
    heading: "Anda Sudah Masuk Antrean",
    preheader: "Posisi Anda Nomor 4 di Bistro &amp; Grill",
    fragments: [
      "Anda sudah masuk daftar antrean di <strong>Bistro &amp; Grill</strong>",
      "Posisi antrean Anda: #4",
      "Detail Antrean",
      "Posisi Antrean",
      "Terima kasih telah menunggu!",
    ],
  },
  {
    name: "called",
    subject: "Meja Anda Sudah Siap",
    heading: "Meja Anda Sudah Siap",
    preheader: "Meja Anda Sudah Siap di Bistro &amp; Grill",
    fragments: [
      "Meja Anda di Bistro &amp; Grill sudah siap.",
      "<strong>5 menit</strong>",
      "Terima kasih telah menunggu bersama SeatPing!",
    ],
  },
  {
    name: "confirmed",
    subject: "Reservasi Dikonfirmasi: Bistro & Grill",
    heading: "Reservasi Dikonfirmasi",
    preheader:
      "Reservasi di Bistro &amp; Grill untuk Wed, Nov 4, 2026 pukul 7:30 PM telah dikonfirmasi",
    fragments: [
      "Reservasi Anda berhasil! Kami menantikan kedatangan Anda.",
      "Detail Reservasi",
      "Jumlah Tamu",
      "2 orang",
      "Kelola Reservasi</a>",
      "Kebijakan Pembatalan:",
      "Contact us &lt;24 hours before arrival&gt;.",
      "Tidak perlu login.",
    ],
  },
  {
    name: "reminder",
    subject: "Waktu Reservasi Anda Sebentar Lagi",
    heading: "Waktu Reservasi Anda Sebentar Lagi",
    preheader: "Reservasi Anda di Bistro &amp; Grill Sekitar 2 Jam Lagi",
    fragments: [
      "kami ingin mengingatkan bahwa reservasi meja Anda",
      "akan dimulai sekitar 2 jam lagi.",
      "Kelola Reservasi</a>",
      "2 orang",
    ],
  },
  {
    name: "newReservation",
    subject: "Reservasi Baru di Main <Floor>",
    heading: "Reservasi Baru",
    preheader: "Ada &lt;Guest&gt; · 2 Tamu · Wed, Nov 4, 2026 pukul 7:30 PM",
    fragments: [
      "Reservasi baru telah dibuat di <strong>Main &lt;Floor&gt;</strong>.",
      "Telepon",
      "Dikonfirmasi",
      "Catatan Tamu:",
      "Window &lt;please&gt;",
      "Lihat di Dashboard</a>",
    ],
  },
  {
    name: "needsTable",
    subject: "Reservasi Memerlukan Meja di Main <Floor>",
    heading: "Reservasi Memerlukan Meja",
    preheader: "Ada &lt;Guest&gt; · 2 Tamu · Wed, Nov 4, 2026 pukul 7:30 PM",
    fragments: [
      "sistem belum dapat menetapkan meja secara otomatis.",
      "Tidak ada meja yang tersedia selama seluruh durasi reservasi.",
      "ID Reservasi",
      "Perlu Ditinjau",
      "Tinjau Reservasi</a>",
      "Buka Manajemen Lantai</a>",
    ],
  },
  {
    name: "feedback",
    subject: "Masukan [Bug / Fitur Tidak Berfungsi]: Help <please>",
    heading: "Help &lt;please&gt;",
    preheader: "Masukan Baru dari Ada &lt;Guest&gt;",
    fragments: [
      "Detail Masukan",
      "Tingkat Keparahan",
      "Tinggi",
      "Bisnis",
      "<strong>Pesan</strong>",
      "Line one<br>&lt;script&gt;unsafe&lt;/script&gt;",
    ],
  },
  {
    name: "feedbackConfirmation",
    subject: "Masukan Diterima: TEST-1",
    heading: "Terima Kasih atas Masukan Anda",
    preheader: "Masukan Anda Telah Dicatat: TEST-1",
    fragments: [
      "masukan Anda telah kami catat dan akan segera kami tinjau.",
      "Tiket Anda",
      "ID Tiket",
      "Subjek",
      "Terbuka",
      "Simpan ID tiket Anda",
      "Anda juga dapat menghubungi kami kapan saja melalui",
    ],
  },
] as const;

describe("Indonesian fixed email templates", () => {
  it("localizes a missing campaign heading and omits absent offer and CTA blocks", async () => {
    const { renderCampaignEmailHtml } = await import("../../server/lib/campaigns.js");
    const html = renderCampaignEmailHtml({
      language: "id",
      heading: "",
      bodyText: "My Original Message",
      businessName: "Bistro & Grill",
    });
    expect(html).toContain(">Pesan</h1>");
    expect(html).toContain("My Original Message");
    expect(html).toContain("Dikirim oleh SeatPing atas nama Bistro &amp; Grill");
    expect(html).not.toMatch(/<a href="https?:/);
  });

  it.each(indonesianTemplates)(
    "localizes $name without translating dynamic content",
    async ({ name, subject, heading, preheader, fragments }) => {
      const actions = await templateActions("id");
      await actions[name]();
      const sent = lastEmail();
      expect(sent.subject).toBe(subject);
      expect(sent.html).toContain(`<html lang="id">`);
      expect(sent.html).toContain(`>${heading}</h1>`);
      expect(sent.html).toContain(`>${preheader}</span>`);
      expect(sent.html).toContain("Antrean &amp; Reservasi untuk Industri Hospitality");
      expect(sent.html).toContain('href="mailto:support@test.invalid"');
      expect(sent.html).not.toContain("<script>");
      for (const fragment of fragments) {
        expect(sent.html.replace(/\s+<\/a>/g, "</a>"), fragment).toContain(fragment);
      }
    },
  );

  it("preserves customer and business reset destinations and tokens", async () => {
    const email = await import("../../server/lib/email.js");
    for (const account of ["customer", "business"] as const) {
      await email.sendPasswordResetEmail(
        booking.email,
        "token-with-$&",
        account,
        "https://reset.test.invalid",
        "id",
      );
      let destination = "https://reset.test.invalid/reset?token=token-with-$&amp;";
      if (account === "business") {
        destination += "&amp;type=business";
      }
      expect(lastEmail().html).toContain(`href="${destination}"`);
    }
  });

  it("preserves reservation destinations and excludes optional content when absent", async () => {
    const email = await import("../../server/lib/email.js");
    await email.sendReservationConfirmationEmail({
      ...booking,
      language: "id",
      partySize: 1,
      cancellationPolicy: undefined,
    });
    expect(lastEmail().html).toContain(
      'href="https://frontend.test.invalid/reservations/manage/test-placeholder"',
    );
    expect(lastEmail().html).toContain("1 orang");
    expect(lastEmail().html).not.toContain("Kebijakan Pembatalan");
    expect(lastEmail().html).toContain(
      "Jika tombol tidak berfungsi, salin tautan ini ke browser Anda:",
    );
    await email.sendReservationReminderEmail({ ...booking, language: "id", manageUrl: undefined });
    expect(lastEmail().html).not.toContain("Kelola Reservasi");
    expect(lastEmail().html).not.toContain("Jika tombol tidak berfungsi");
  });

  it("omits missing names, support links, and trial sentences", async () => {
    delete process.env.SUPPORT_EMAIL;
    vi.resetModules();
    const email = await import("../../server/lib/email.js");
    await email.sendPasswordChangeConfirmationEmail(booking.email, undefined, "id");
    expect(lastEmail().html).not.toContain("Halo");
    expect(lastEmail().html).not.toContain("mailto:");
    expect(lastEmail().html).toContain(
      "Segera hubungi tim dukungan agar kami dapat membantu mengamankan akun Anda.",
    );
    await email.sendBusinessOnboardingEmail(booking.email, "Ada", "bistro", 0, "id");
    expect(lastEmail().html).not.toContain("Masa uji coba");
    expect(lastEmail().html).toContain(
      "Selamat datang di SeatPing, Ada. Ikuti langkah-langkah berikut",
    );
    await email.sendFeedbackConfirmationEmail(
      booking.email,
      "Ada",
      "TEST-1",
      "Untouched",
      "<thread@test.invalid>",
      "id",
    );
    expect(lastEmail().html).not.toContain("Anda juga dapat menghubungi");
    expect(lastEmail()).toMatchObject({
      messageId: "<thread@test.invalid>",
      replyTo: "sender@test.invalid",
    });
  });

  it("translates every known feedback type and severity, preserving unknown values", async () => {
    const email = await import("../../server/lib/email.js");
    for (const [code, label] of [
      ["bug", "Bug / Fitur Tidak Berfungsi"],
      ["ux", "Masalah Pengalaman Pengguna / Kemudahan Penggunaan"],
      ["feature", "Permintaan Fitur"],
      ["billing", "Harga / Tagihan"],
      ["other", "Lainnya"],
      ["custom <type>", "custom &lt;type&gt;"],
    ]) {
      await email.sendFeedbackEmail(
        {
          name: "Ada",
          email: booking.email,
          subject: "Untouched",
          message: "Original text",
          feedbackType: code,
        },
        "id",
      );
      expect(lastEmail().html).toContain(label);
      expect(lastEmail().html).not.toContain("Tingkat Keparahan");
    }
    for (const [code, label] of [
      ["low", "Rendah"],
      ["medium", "Sedang"],
      ["high", "Tinggi"],
      ["custom <severity>", "custom &lt;severity&gt;"],
    ]) {
      await email.sendFeedbackEmail(
        {
          name: "Ada",
          email: booking.email,
          subject: "",
          message: "Original text",
          feedbackType: "other",
          severity: code,
        },
        "id",
      );
      expect(lastEmail().html).toContain(label);
      expect(lastEmail().html).toContain(">Masukan Baru</h1>");
    }
  });

  it("uses the fallback table assignment reason and preserves optional business fields", async () => {
    const email = await import("../../server/lib/email.js");
    expect(email.needsReviewReasonLabel("UNKNOWN", "id")).toBe(
      "Smart Assignment tidak dapat menemukan meja untuk reservasi ini.",
    );
    await email.sendNewReservationBusinessEmail({
      ...booking,
      language: "id",
      to: "owner@test.invalid",
      locationName: "Bistro",
      customerName: "Ada",
      customerEmail: booking.email,
      dashboardUrl: "https://frontend.test.invalid/business",
    });
    expect(lastEmail().html).not.toContain("Telepon");
    expect(lastEmail().html).not.toContain("Catatan Tamu");
    expect(lastEmail().html).toContain('href="https://frontend.test.invalid/business"');
  });
});
