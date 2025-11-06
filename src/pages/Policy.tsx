import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const LAST_UPDATED = "21st August 2025";

const Policy = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero (matches LandingPage rhythm & tokens) */}
      <section className="pt-28 md:pt-32 lg:pt-40 pb-10 px-4">
        <div className="container mx-auto">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <h1 className="text-4xl md:text-6xl font-semibold bg-gradient-to-r from-primary to-success bg-clip-text text-transparent pb-2">
              Privacy Policy
            </h1>
            <p className="text-muted-foreground">
              Last Updated: <span className="font-medium">{LAST_UPDATED}</span>
            </p>
            <p className="text-lg md:text-xl text-muted-foreground">
              Welcome to <span className="font-semibold">SeatPing</span>. Your
              privacy is important to us. This policy explains how we collect,
              use, share, and protect your information when you use our digital
              queue management services.
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
                className="text-xl sm:text-2xl font-semibold text-primary mt-6"
              >
                1. Information We Collect
              </h2>

              <p className="font-semibold mt-4 text-sm sm:text-base">
                For Business Users:
              </p>
              <ul className="ml-6 list-disc text-muted-foreground text-sm sm:text-base">
                <li>Name</li>
                <li>Email address</li>
                <li>Phone number</li>
                <li>Business profile details</li>
                <li>Login information</li>
              </ul>

              <p className="font-semibold mt-6 text-sm sm:text-base">
                For Guests (Queue Participants):
              </p>
              <ul className="ml-6 list-disc text-muted-foreground text-sm sm:text-base">
                <li>Optional name</li>
                <li>Phone number (for notifications)</li>
                <li>Queue entries and visit history</li>
                <li>Device/browser info (may be anonymized)</li>
              </ul>

              <p className="font-semibold mt-6 text-sm sm:text-base">
                Automatically Collected:
              </p>
              <ul className="ml-6 list-disc text-muted-foreground text-sm sm:text-base">
                <li>IP address</li>
                <li>Browser/user agent details</li>
                <li>
                  Usage and interaction analytics (e.g., Google Analytics)
                </li>
              </ul>

              {/* 2. How We Use Your Information */}
              <h2
                id="use"
                className="text-xl sm:text-2xl font-semibold text-primary mt-10"
              >
                2. How We Use Your Information
              </h2>
              <ul className="ml-6 list-disc text-muted-foreground text-sm sm:text-base">
                <li>To manage queue entries and service settings</li>
                <li>To notify guests when it's their turn</li>
                <li>To authenticate users</li>
                <li>To process and manage payments</li>
                <li>To analyze product usage and improve our services</li>
                <li>To prevent fraud, abuse, and maintain platform security</li>
              </ul>

              {/* 3. Sharing Your Data */}
              <h2
                id="share"
                className="text-xl sm:text-2xl font-semibold text-primary mt-10"
              >
                3. Sharing Your Data
              </h2>
              <p className="text-muted-foreground text-sm sm:text-base">
                We never sell your data. We only share information with trusted
                providers to operate the Services:
              </p>
              <ul className="ml-6 list-disc text-muted-foreground text-sm sm:text-base">
                <li>Stripe (for payments & subscriptions)</li>
                <li>Telnyx (for communications)</li>
                <li>Analytics providers (aggregated usage analytics)</li>
                <li>Service providers under confidentiality obligations</li>
                <li>
                  Law enforcement or regulators when required by applicable law
                </li>
              </ul>

              {/* 4. Data Retention */}
              <h2
                id="retention"
                className="text-xl sm:text-2xl font-semibold text-primary mt-10"
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
                className="text-xl sm:text-2xl font-semibold text-primary mt-10"
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
                className="text-xl sm:text-2xl font-semibold text-primary mt-10"
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
                className="text-xl sm:text-2xl font-semibold text-primary mt-10"
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
                className="text-xl sm:text-2xl font-semibold text-primary mt-10"
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
                className="text-xl sm:text-2xl font-semibold text-primary mt-10"
              >
                9. Changes to This Policy
              </h2>
              <p className="text-muted-foreground text-sm sm:text-base">
                We may update this policy from time to time. We will post the
                updated version with a new “Last Updated” date and, when
                required, notify you via email or in-app notice.
              </p>

              {/* 10. Contact */}
              <h2
                id="contact"
                className="text-xl sm:text-2xl font-semibold text-primary mt-10"
              >
                10. Contact Us
              </h2>
              <p className="text-muted-foreground text-sm sm:text-base">
                If you have questions or requests regarding this policy, contact
                us at{" "}
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

export default Policy;
