import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const Help = () => {
  return (
    <>
      <Header />

      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-success/5 px-4 py-12 sm:py-16 md:py-20">
        <div className="max-w-4xl mx-auto space-y-10">
          {/* Page Title */}
          <div className="text-center space-y-4">
            <h1 className="text-3xl md:text-5xl font-bold bg-gradient-to-r from-primary to-success bg-clip-text text-transparent leading-tight pb-3 pt-10 sm:pt-12 md:pt-16">
              Help & FAQ
            </h1>
            <p className="text-muted-foreground text-lg md:text-xl">
              Find quick answers to the most common questions about SeatPing.
            </p>
          </div>

          {/* FAQ Section */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  How does SeatPing notify my guests?
                </CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground">
                Guests receive real-time notifications via SMS when their turn
                is approaching. This helps reduce waiting congestion and
                improves customer satisfaction.
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  Can I customize the queue settings for my business?
                </CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground">
                Yes. Businesses can customize waitlist rules, messaging, and
                notifications from the SeatPing dashboard. You can also pause,
                skip, or reorder guests as needed.
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  Does SeatPing work for multiple locations?
                </CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground">
                Absolutely. SeatPing supports managing multiple branches under a
                single account. Each location can have independent queues while
                sharing reports across the organization.
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  Do I need to download an app?
                </CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground">
                Guests do not need to download an app—SeatPing works through web
                links and SMS notifications. Staff can access the SeatPing
                dashboard from any browser.
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  What if I need more advanced features?
                </CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground">
                Advanced features like custom integrations, analytics, or bulk
                SMS packages are available on our Custom Plan. You can contact
                Sales to learn more.
              </CardContent>
            </Card>
          </div>

          {/* Contact note */}
          <div className="text-center pt-6 border-t">
            <p className="text-muted-foreground">
              Still need help? Contact us anytime at{" "}
              <a
                href="mailto:help@seatping.com"
                className="underline font-medium"
              >
                help@seatping.com
              </a>
            </p>
          </div>
        </div>
      </div>

      <Footer />
    </>
  );
};

export default Help;
