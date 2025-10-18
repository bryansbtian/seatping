import { Card, CardContent } from "@/components/ui/card";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const LAST_UPDATED = "21st August 2025";

const Terms = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero (matches LandingPage rhythm & tokens) */}
      <section className="pt-28 md:pt-32 lg:pt-40 pb-10 px-4">
        <div className="container mx-auto">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-primary to-success bg-clip-text text-transparent pb-2">
              Terms of Service
            </h1>
            <p className="text-muted-foreground">
              Last Updated: <span className="font-medium">{LAST_UPDATED}</span>
            </p>
            <p className="text-lg md:text-xl text-muted-foreground">
              Thank you for using{" "}
              <span className="font-semibold">SeatPing</span>. These Terms
              govern your access to and use of our queue management platform,
              websites, and related services.
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
              {/* 1. Acceptance */}
              <h2
                id="acceptance"
                className="text-xl sm:text-2xl font-semibold text-primary mt-6"
              >
                1. Acceptance of Terms
              </h2>
              <p className="text-muted-foreground">
                By creating an account, accessing, or using SeatPing, you agree
                to be bound by these Terms and our{" "}
                <a href="/policy" className="underline font-medium">
                  Privacy Policy
                </a>
                . If you use SeatPing on behalf of a business, you represent
                that you have authority to bind that business.
              </p>

              {/* 2. Eligibility & Accounts */}
              <h2
                id="eligibility"
                className="text-xl sm:text-2xl font-semibold text-primary mt-10"
              >
                2. Eligibility & Account Responsibilities
              </h2>
              <ul className="ml-6 list-disc text-muted-foreground">
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

              {/* 3. Services & License */}
              <h2
                id="services"
                className="text-xl sm:text-2xl font-semibold text-primary mt-10"
              >
                3. Services & Limited License
              </h2>
              <p className="text-muted-foreground">
                Subject to these Terms, SeatPing grants you a limited,
                non-exclusive, non-transferable license to access and use the
                Services for your internal business purposes related to managing
                walk-in queues and notifications.
              </p>

              {/* 4. Customer Obligations */}
              <h2
                id="obligations"
                className="text-xl sm:text-2xl font-semibold text-primary mt-10"
              >
                4. Customer Obligations
              </h2>
              <ul className="ml-6 list-disc text-muted-foreground">
                <li>
                  Comply with all applicable laws and obtain necessary consents
                  to contact guests.
                </li>
                <li>
                  Configure queue settings responsibly and ensure accurate
                  communications.
                </li>
                <li>
                  Do not misuse notifications or store prohibited content in the
                  system.
                </li>
              </ul>

              {/* 5. Prohibited Uses */}
              <h2
                id="prohibited"
                className="text-xl sm:text-2xl font-semibold text-primary mt-10"
              >
                5. Prohibited Uses
              </h2>
              <ul className="ml-6 list-disc text-muted-foreground">
                <li>
                  Reverse engineering, scraping, or exploiting vulnerabilities.
                </li>
                <li>Interference with platform operation or security.</li>
                <li>
                  Use that violates privacy, spam, or consumer protection laws.
                </li>
              </ul>

              {/* 6. Subscriptions & Billing */}
              <h2
                id="billing"
                className="text-xl sm:text-2xl font-semibold text-primary mt-10"
              >
                6. Subscriptions, Billing & Taxes
              </h2>
              <ul className="ml-6 list-disc text-muted-foreground">
                <li>
                  Paid features are billed in advance on a subscription basis.
                </li>
                <li>
                  Prices may change with prior notice for upcoming billing
                  cycles.
                </li>
                <li>You are responsible for any applicable taxes and fees.</li>
              </ul>

              {/* 7. Trials & Betas */}
              <h2
                id="trials"
                className="text-xl sm:text-2xl font-semibold text-primary mt-10"
              >
                7. Trials, Free Tiers & Beta Features
              </h2>
              <p className="text-muted-foreground">
                We may offer free trials, free tiers, or beta features. These
                are provided “as is,” may be limited or discontinued, and may
                not include support or SLAs.
              </p>

              {/* 8. Cancellations & Refunds */}
              <h2
                id="cancellations"
                className="text-xl sm:text-2xl font-semibold text-primary mt-10"
              >
                8. Cancellations & Refunds
              </h2>
              <p className="text-muted-foreground">
                You can cancel at any time effective at the end of the current
                billing period. Unless required by law, fees are non-refundable
                and partial periods are not credited.
              </p>

              {/* 9. Availability & Support */}
              <h2
                id="availability"
                className="text-xl sm:text-2xl font-semibold text-primary mt-10"
              >
                9. Service Availability & Support
              </h2>
              <p className="text-muted-foreground">
                We aim for high availability but do not guarantee uninterrupted
                service. Maintenance, updates, or factors beyond our control may
                impact access.
              </p>

              {/* 10. Data & Privacy */}
              <h2
                id="privacy"
                className="text-xl sm:text-2xl font-semibold text-primary mt-10"
              >
                10. Data & Privacy
              </h2>
              <p className="text-muted-foreground">
                Our handling of personal data is described in our{" "}
                <a href="/policy" className="underline font-medium">
                  Privacy Policy
                </a>
                . You are responsible for providing any required notices and
                obtaining guest consents where applicable.
              </p>

              {/* 11. Intellectual Property */}
              <h2
                id="ip"
                className="text-xl sm:text-2xl font-semibold text-primary mt-10"
              >
                11. Intellectual Property
              </h2>
              <p className="text-muted-foreground">
                SeatPing, including all software, branding, and content, is
                owned by us or our licensors. No rights are granted to you
                except as expressly stated in these Terms.
              </p>

              {/* 12. Feedback */}
              <h2
                id="feedback"
                className="text-xl sm:text-2xl font-semibold text-primary mt-10"
              >
                12. Feedback
              </h2>
              <p className="text-muted-foreground">
                If you provide feedback or suggestions, you grant SeatPing a
                worldwide, royalty‑free, perpetual license to use and
                incorporate them without obligation.
              </p>

              {/* 13. Third-Party Services */}
              <h2
                id="thirdparty"
                className="text-xl sm:text-2xl font-semibold text-primary mt-10"
              >
                13. Third‑Party Services & Links
              </h2>
              <p className="text-muted-foreground">
                The Services may integrate or link to third‑party offerings. We
                are not responsible for third‑party content, policies, or
                practices. Your use is at your own risk.
              </p>

              {/* 14. Disclaimers */}
              <h2
                id="disclaimers"
                className="text-xl sm:text-2xl font-semibold text-primary mt-10"
              >
                14. Disclaimers
              </h2>
              <p className="text-muted-foreground">
                THE SERVICES ARE PROVIDED “AS IS” AND “AS AVAILABLE.” TO THE
                MAXIMUM EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES,
                INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
                PARTICULAR PURPOSE, AND NON‑INFRINGEMENT.
              </p>

              {/* 15. Liability */}
              <h2
                id="liability"
                className="text-xl sm:text-2xl font-semibold text-primary mt-10"
              >
                15. Limitation of Liability
              </h2>
              <p className="text-muted-foreground">
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, SEATPING AND ITS
                AFFILIATES WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL,
                CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS,
                REVENUE, DATA, OR GOODWILL. OUR AGGREGATE LIABILITY WILL NOT
                EXCEED THE AMOUNT PAID BY YOU TO SEATPING FOR THE SERVICES IN
                THE 12 MONTHS PRECEDING THE CLAIM.
              </p>

              {/* 16. Indemnification */}
              <h2
                id="indemnity"
                className="text-xl sm:text-2xl font-semibold text-primary mt-10"
              >
                16. Indemnification
              </h2>
              <p className="text-muted-foreground">
                You agree to defend, indemnify, and hold harmless SeatPing and
                its affiliates from any claims, damages, liabilities, costs, and
                expenses arising from your use of the Services, your content, or
                your violation of these Terms.
              </p>

              {/* 17. Termination */}
              <h2
                id="termination"
                className="text-xl sm:text-2xl font-semibold text-primary mt-10"
              >
                17. Suspension & Termination
              </h2>
              <p className="text-muted-foreground">
                We may suspend or terminate access immediately for violations of
                these Terms or to address security, legal, or operational
                concerns. Upon termination, your right to use the Services
                ceases.
              </p>

              {/* 18. Governing Law */}
              <h2
                id="law"
                className="text-xl sm:text-2xl font-semibold text-primary mt-10"
              >
                18. Governing Law & Dispute Resolution
              </h2>
              <p className="text-muted-foreground">
                These Terms are governed by the laws of the Republic of
                Indonesia, without regard to conflict‑of‑laws principles. Any
                dispute shall be subject to the exclusive jurisdiction of the
                courts located in Jakarta, Indonesia.
              </p>

              {/* 19. Changes to Terms */}
              <h2
                id="changes"
                className="text-xl sm:text-2xl font-semibold text-primary mt-10"
              >
                19. Changes to These Terms
              </h2>
              <p className="text-muted-foreground">
                We may update these Terms from time to time. We will post the
                updated version with a new “Last Updated” date and, where
                required, provide additional notice. Continued use constitutes
                acceptance of the updated Terms.
              </p>

              {/* 20. Contact */}
              <h2
                id="contact"
                className="text-xl sm:text-2xl font-semibold text-primary mt-10"
              >
                20. Contact Us
              </h2>
              <p className="text-muted-foreground">
                Questions about these Terms? Email us at{" "}
                <a
                  href="mailto:bryan.susanto@seatping.biz"
                  className="underline font-medium"
                >
                  bryan.susanto@seatping.biz
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
