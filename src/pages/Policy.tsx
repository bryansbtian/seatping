import { Card, CardContent } from "@/components/ui/card";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const LAST_UPDATED = "2nd June 2026";

const Policy = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero (matches LandingPage rhythm & tokens) */}
      <section className="pt-28 md:pt-32 lg:pt-40 pb-10 px-4">
        <div className="container mx-auto">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <h1 className="text-4xl md:text-6xl font-semibold text-slate-900 pb-2">
              Privacy Policy
            </h1>
            <p className="text-muted-foreground">
              Last Updated: <span className="font-medium">{LAST_UPDATED}</span>
            </p>
            <p className="text-lg md:text-xl text-muted-foreground">
              Welcome to <span className="font-semibold">SeatPing</span>. Your
              privacy is important to us. This policy explains how we collect,
              use, share, and protect your information when you use SeatPing to
              discover restaurants, join waitlists, make reservations, and run
              restaurant waitlist, queue, and reservation services.
            </p>
          </div>
        </div>
      </section>

      {/* Content wrapper styled like your screenshots (rounded card, subtle border) */}
      <section className="px-4 pb-16">
        <div className="container mx-auto max-w-4xl">
          <Card className="border rounded-2xl shadow-sm bg-card/80 backdrop-blur-sm">
            {/* Base text smaller on mobile, normal from sm and up */}
            <CardContent className="prose prose-neutral max-w-none text-foreground text-sm sm:text-base">
              {/* 1. Information We Collect */}
              <h2
                id="collect"
                className="text-lg sm:text-2xl font-semibold text-primary mt-6"
              >
                1. Information We Collect
              </h2>

              <p className="font-semibold mt-4 text-sm sm:text-base">
                For Business Users:
              </p>
              <ul className="ml-6 list-disc text-muted-foreground text-sm sm:text-base">
                <li>Name and Email Address</li>
                <li>Phone Number</li>
                <li>
                  Restaurant and Location Details (Business Name, Addresses,
                  Opening Hours, and Waitlist/Reservation Settings)
                </li>
                <li>
                  Banner and Gallery Images you upload for your Restaurant
                  Locations
                </li>
                <li>Log In Credentials</li>
              </ul>

              <p className="font-semibold mt-6 text-sm sm:text-base">
                For Guests (Waitlist &amp; Reservations):
              </p>
              <ul className="ml-6 list-disc text-muted-foreground text-sm sm:text-base">
                <li>Name</li>
                <li>
                  Phone Number and Country Code (Used to Send Waitlist and
                  Reservation Notifications)
                </li>
                <li>
                  Email Address (Used for Reservation Confirmations and
                  Reminders)
                </li>
                <li>
                  Your Chosen Notification Method (SMS, WhatsApp, or Email) and
                  Any SMS or Marketing Consent You Provide
                </li>
                <li>
                  Reservation Details (Number of Guests, Date, Time, and Any
                  Notes You Add)
                </li>
                <li>Waitlist Entries, Queue Position, and Visit History</li>
                <li>Device/Browser Info (May Be Anonymized)</li>
              </ul>

              <p className="font-semibold mt-6 text-sm sm:text-base">
                Automatically Collected:
              </p>
              <ul className="ml-6 list-disc text-muted-foreground text-sm sm:text-base">
                <li>IP Address</li>
                <li>Browser/User Agent Details</li>
                <li>Usage and Interaction Analytics</li>
              </ul>

              {/* 2. How We Use Your Information */}
              <h2
                id="use"
                className="text-lg sm:text-2xl font-semibold text-primary mt-10"
              >
                2. How We Use Your Information
              </h2>
              <ul className="ml-6 list-disc text-muted-foreground text-sm sm:text-base">
                <li>To manage waitlists, queues, reservations, and settings</li>
                <li>
                  To notify guests by SMS, WhatsApp, or Email — for example when
                  it's their turn or to confirm and remind them about a
                  reservation
                </li>
                <li>To authenticate users and secure accounts</li>
                <li>
                  To operate our credit-based notification billing and manage
                  your account
                </li>
                <li>To analyze product usage and improve our services</li>
                <li>To prevent fraud, abuse, and maintain platform security</li>
              </ul>
              <p className="text-muted-foreground text-sm sm:text-base mt-4">
                Where you choose SMS or WhatsApp notifications, we only send
                messages with the consent collected at sign-up, and marketing
                messages only where you have separately opted in. Message and
                data rates may apply, and you can opt out of SMS at any time by
                replying STOP.
              </p>

              {/* 3. Sharing Your Data */}
              <h2
                id="share"
                className="text-lg sm:text-2xl font-semibold text-primary mt-10"
              >
                3. Sharing Your Data
              </h2>
              <p className="text-muted-foreground text-sm sm:text-base">
                We never sell your data. We only share information with trusted
                providers to operate the Services:
              </p>
              <ul className="ml-6 list-disc text-muted-foreground text-sm sm:text-base">
                <li>Telnyx (to deliver SMS notifications)</li>
                <li>
                  Meta's WhatsApp Cloud API, accessed via Kapso (to deliver
                  WhatsApp notifications)
                </li>
                <li>
                  Our Email delivery provider (to send account, reservation, and
                  password-reset Emails)
                </li>
                <li>
                  Cloudinary (to store and serve restaurant banner and gallery
                  images)
                </li>
                <li>
                  Hosting and infrastructure providers that run the platform
                </li>
                <li>Analytics providers (aggregated usage analytics)</li>
                <li>Service providers under confidentiality obligations</li>
                <li>
                  Law enforcement or regulators when required by applicable law
                </li>
              </ul>

              {/* 4. Data Retention */}
              <h2
                id="retention"
                className="text-lg sm:text-2xl font-semibold text-primary mt-10"
              >
                4. Data Retention
              </h2>
              <p className="text-muted-foreground text-sm sm:text-base">
                We retain personal data only as long as necessary for the
                purposes described in this policy or as required by law. You may
                request deletion of your data by contacting us.
              </p>

              {/* 5. Your Rights */}
              <h2
                id="rights"
                className="text-lg sm:text-2xl font-semibold text-primary mt-10"
              >
                5. Your Rights
              </h2>
              <p className="text-muted-foreground text-sm sm:text-base">
                Depending on your location, you may have rights to access,
                correct, delete, or export your personal data, and to object to
                or restrict certain processing. You can exercise these rights by
                contacting us.
              </p>

              {/* 6. Security */}
              <h2
                id="security"
                className="text-lg sm:text-2xl font-semibold text-primary mt-10"
              >
                6. Security
              </h2>
              <p className="text-muted-foreground text-sm sm:text-base">
                We implement administrative, technical, and physical safeguards
                to protect your information. However, no method of transmission
                or storage is completely secure.
              </p>

              {/* 7. International Transfers */}
              <h2
                id="transfers"
                className="text-lg sm:text-2xl font-semibold text-primary mt-10"
              >
                7. International Transfers
              </h2>
              <p className="text-muted-foreground text-sm sm:text-base">
                Your data may be processed in countries other than your own.
                Where required, we use appropriate safeguards (e.g., Standard
                Contractual Clauses) to protect your information.
              </p>

              {/* 8. Children's Privacy */}
              <h2
                id="children"
                className="text-lg sm:text-2xl font-semibold text-primary mt-10"
              >
                8. Children's Privacy
              </h2>
              <p className="text-muted-foreground text-sm sm:text-base">
                Our Services are not directed to children under 13. We do not
                knowingly collect personal information from children. If you
                believe a child has provided us data, please contact us so we
                can delete it.
              </p>

              {/* 9. Changes */}
              <h2
                id="changes"
                className="text-lg sm:text-2xl font-semibold text-primary mt-10"
              >
                9. Changes to This Policy
              </h2>
              <p className="text-muted-foreground text-sm sm:text-base">
                We may update this policy from time to time. We will post the
                updated version with a new “Last Updated” date and, when
                required, notify you via Email or in-app notice.
              </p>

              {/* 10. Contact */}
              <h2
                id="contact"
                className="text-lg sm:text-2xl font-semibold text-primary mt-10"
              >
                10. Contact Us
              </h2>
              <p className="text-muted-foreground text-sm sm:text-base">
                If you have questions or requests regarding this policy, contact
                us at{" "}
                <a
                  href="mailto:help@seatping.biz"
                  className="underline font-medium"
                >
                  help@seatping.biz
                </a>
                .
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Policy;
