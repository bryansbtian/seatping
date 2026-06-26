import { Card, CardContent } from "@/components/ui/card";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const LAST_UPDATED = "2nd June 2026";

const Terms = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />

      {}
      <section className="pt-28 md:pt-32 lg:pt-40 pb-10 px-4">
        <div className="container mx-auto">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <h1 className="text-4xl md:text-6xl font-semibold text-slate-900 pb-2">
              Terms of Service
            </h1>
            <p className="text-muted-foreground">
              Last Updated: <span className="font-medium">{LAST_UPDATED}</span>
            </p>
            <p className="text-lg md:text-xl text-muted-foreground">
              Thank you for using{" "}
              <span className="font-semibold">SeatPing</span>. These Terms
              govern your access to and use of our restaurant waitlist, queue,
              and reservation platform, websites, and related services.
            </p>
          </div>
        </div>
      </section>

      {}
      <section className="px-4 pb-16">
        <div className="container mx-auto max-w-4xl">
          <Card className="border rounded-2xl shadow-sm bg-card/80 backdrop-blur-sm">
            {}
            <CardContent className="prose prose-neutral max-w-none text-foreground text-sm sm:text-base">
              {}
              <h2
                id="acceptance"
                className="text-lg sm:text-2xl font-semibold text-primary mt-6"
              >
                1. Acceptance of Terms
              </h2>
              <p className="text-muted-foreground text-sm sm:text-base">
                By creating an account, accessing, or using SeatPing, you agree
                to be bound by these Terms and our{" "}
                <a href="/policy" className="underline font-medium">
                  Privacy Policy
                </a>
                . If you use SeatPing on behalf of a business, you represent
                that you have authority to bind that business.
              </p>

              {}
              <h2
                id="eligibility"
                className="text-lg sm:text-2xl font-semibold text-primary mt-10"
              >
                2. Eligibility & Account Responsibilities
              </h2>
              <ul className="ml-6 list-disc text-muted-foreground text-sm sm:text-base">
                <li>
                  You must be at least 18 years old to create a business
                  account.
                </li>
                <li>
                  Provide accurate information and keep your credentials secure.
                </li>
                <li>
                  You are responsible for all activity under your account.
                </li>
              </ul>

              {}
              <h2
                id="services"
                className="text-lg sm:text-2xl font-semibold text-primary mt-10"
              >
                3. Services & Limited License
              </h2>
              <p className="text-muted-foreground text-sm sm:text-base">
                Subject to these Terms, SeatPing grants you a limited,
                non-exclusive, non-transferable license to access and use the
                Services for your internal business purposes related to managing
                walk-in waitlists and queues, table reservations, restaurant
                location profiles, and guest notifications sent by SMS,
                WhatsApp, or email.
              </p>

              {}
              <h2
                id="obligations"
                className="text-lg sm:text-2xl font-semibold text-primary mt-10"
              >
                4. Customer Obligations
              </h2>
              <ul className="ml-6 list-disc text-muted-foreground text-sm sm:text-base">
                <li>
                  Comply with all applicable laws and obtain the consents
                  required to contact guests by SMS, WhatsApp, or email,
                  including honoring opt-outs and any marketing-consent
                  requirements.
                </li>
                <li>
                  Configure waitlist, queue, and reservation settings
                  responsibly and ensure accurate communications.
                </li>
                <li>
                  Only upload restaurant images and content you have the rights
                  to use, and do not store prohibited content in the system.
                </li>
                <li>
                  Do not misuse notifications or send messages that violate
                  anti-spam or consumer-protection laws.
                </li>
              </ul>

              {}
              <h2
                id="prohibited"
                className="text-lg sm:text-2xl font-semibold text-primary mt-10"
              >
                5. Prohibited Uses
              </h2>
              <ul className="ml-6 list-disc text-muted-foreground text-sm sm:text-base">
                <li>
                  Reverse engineering, scraping, or exploiting vulnerabilities.
                </li>
                <li>Interference with platform operation or security.</li>
                <li>
                  Use that violates privacy, spam, or consumer protection laws.
                </li>
              </ul>

              {}
              <h2
                id="billing"
                className="text-lg sm:text-2xl font-semibold text-primary mt-10"
              >
                6. Billing & Taxes
              </h2>
              <ul className="ml-6 list-disc text-muted-foreground text-sm sm:text-base">
                <li>
                  Paid access is arranged manually with SeatPing and billed
                  according to the terms agreed with your account; we do not
                  currently process payments through the platform.
                </li>
                <li>
                  Guest notifications are powered by a credit system. Each SMS,
                  WhatsApp, or email notification consumes credits from the
                  relevant location, and credits may refill periodically based
                  on your plan.
                </li>
                <li>
                  Prices and credit allowances may change with prior notice for
                  future billing periods.
                </li>
                <li>You are responsible for any applicable taxes and fees.</li>
              </ul>

              {}
              <h2
                id="trials"
                className="text-lg sm:text-2xl font-semibold text-primary mt-10"
              >
                7. Trials, Free Tiers & Beta Features
              </h2>
              <p className="text-muted-foreground text-sm sm:text-base">
                We may offer free trials, free tiers, or beta features. These
                are provided “as is,” may be limited or discontinued, and may
                not include support or SLAs.
              </p>

              {}
              <h2
                id="cancellations"
                className="text-lg sm:text-2xl font-semibold text-primary mt-10"
              >
                8. Cancellations & Refunds
              </h2>
              <p className="text-muted-foreground text-sm sm:text-base">
                You can cancel at any time effective at the end of the current
                billing period. Unless required by law, fees are non-refundable
                and partial periods are not credited.
              </p>

              {}
              <h2
                id="availability"
                className="text-lg sm:text-2xl font-semibold text-primary mt-10"
              >
                9. Service Availability & Support
              </h2>
              <p className="text-muted-foreground text-sm sm:text-base">
                We aim for high availability but do not guarantee uninterrupted
                service. Maintenance, updates, or factors beyond our control may
                impact access.
              </p>

              {}
              <h2
                id="privacy"
                className="text-lg sm:text-2xl font-semibold text-primary mt-10"
              >
                10. Data & Privacy
              </h2>
              <p className="text-muted-foreground text-sm sm:text-base">
                Our handling of personal data is described in our{" "}
                <a href="/policy" className="underline font-medium">
                  Privacy Policy
                </a>
                . You are responsible for providing any required notices and
                obtaining guest consents where applicable.
              </p>

              {}
              <h2
                id="ip"
                className="text-lg sm:text-2xl font-semibold text-primary mt-10"
              >
                11. Intellectual Property
              </h2>
              <p className="text-muted-foreground text-sm sm:text-base">
                SeatPing, including all software, branding, and content, is
                owned by us or our licensors. No rights are granted to you
                except as expressly stated in these Terms.
              </p>

              {}
              <h2
                id="feedback"
                className="text-lg sm:text-2xl font-semibold text-primary mt-10"
              >
                12. Feedback
              </h2>
              <p className="text-muted-foreground text-sm sm:text-base">
                If you provide feedback or suggestions, you grant SeatPing a
                worldwide, royalty‑free, perpetual license to use and
                incorporate them without obligation.
              </p>

              {}
              <h2
                id="thirdparty"
                className="text-lg sm:text-2xl font-semibold text-primary mt-10"
              >
                13. Third‑Party Services & Links
              </h2>
              <p className="text-muted-foreground text-sm sm:text-base">
                The Services rely on third‑party providers — including Telnyx
                and Meta's WhatsApp Cloud API (via Kapso) for messaging,
                Cloudinary for image hosting, and our email and infrastructure
                providers — and may link to other third‑party offerings. We are
                not responsible for third‑party content, policies, or practices,
                and your use of them is subject to their terms and at your own
                risk.
              </p>

              {}
              <h2
                id="disclaimers"
                className="text-lg sm:text-2xl font-semibold text-primary mt-10"
              >
                14. Disclaimers
              </h2>
              <p className="text-muted-foreground text-sm sm:text-base">
                THE SERVICES ARE PROVIDED “AS IS” AND “AS AVAILABLE.” TO THE
                MAXIMUM EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES,
                INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
                PARTICULAR PURPOSE, AND NON‑INFRINGEMENT.
              </p>

              {}
              <h2
                id="liability"
                className="text-lg sm:text-2xl font-semibold text-primary mt-10"
              >
                15. Limitation of Liability
              </h2>
              <p className="text-muted-foreground text-sm sm:text-base">
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, SEATPING AND ITS
                AFFILIATES WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL,
                CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS,
                REVENUE, DATA, OR GOODWILL. OUR AGGREGATE LIABILITY WILL NOT
                EXCEED THE AMOUNT PAID BY YOU TO SEATPING FOR THE SERVICES IN
                THE 12 MONTHS PRECEDING THE CLAIM.
              </p>

              {}
              <h2
                id="indemnity"
                className="text-lg sm:text-2xl font-semibold text-primary mt-10"
              >
                16. Indemnification
              </h2>
              <p className="text-muted-foreground text-sm sm:text-base">
                You agree to defend, indemnify, and hold harmless SeatPing and
                its affiliates from any claims, damages, liabilities, costs, and
                expenses arising from your use of the Services, your content, or
                your violation of these Terms.
              </p>

              {}
              <h2
                id="termination"
                className="text-lg sm:text-2xl font-semibold text-primary mt-10"
              >
                17. Suspension & Termination
              </h2>
              <p className="text-muted-foreground text-sm sm:text-base">
                We may suspend or terminate access immediately for violations of
                these Terms or to address security, legal, or operational
                concerns. Upon termination, your right to use the Services
                ceases.
              </p>

              {}
              <h2
                id="law"
                className="text-lg sm:text-2xl font-semibold text-primary mt-10"
              >
                18. Governing Law & Dispute Resolution
              </h2>
              <p className="text-muted-foreground text-sm sm:text-base">
                These Terms are governed by the laws of the Republic of
                Indonesia, without regard to conflict‑of‑laws principles. Any
                dispute shall be subject to the exclusive jurisdiction of the
                courts located in Jakarta, Indonesia.
              </p>

              {}
              <h2
                id="changes"
                className="text-lg sm:text-2xl font-semibold text-primary mt-10"
              >
                19. Changes to These Terms
              </h2>
              <p className="text-muted-foreground text-sm sm:text-base">
                We may update these Terms from time to time. We will post the
                updated version with a new “Last Updated” date and, where
                required, provide additional notice. Continued use constitutes
                acceptance of the updated Terms.
              </p>

              {}
              <h2
                id="contact"
                className="text-lg sm:text-2xl font-semibold text-primary mt-10"
              >
                20. Contact Us
              </h2>
              <p className="text-muted-foreground text-sm sm:text-base">
                Questions about these Terms? Email us at{" "}
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

export default Terms;
