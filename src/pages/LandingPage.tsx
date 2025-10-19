import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { CheckCircle } from "@mynaui/icons-react";
import {
  Clock,
  Smartphone,
  Bell,
  ClipboardList,
  Star,
  Utensils,
  Scissors,
  Sparkles,
  Building2,
  Building,
  User,
  QrCode,
  Users,
} from "lucide-react";
import Header from "@/components/Header";
import heroImage from "@/assets/hero-image.jpg";
import Footer from "@/components/Footer";

const LandingPage = () => {
  const features = [
    {
      icon: <Clock className="w-8 h-8 text-blue-600" />,
      title: "Set up in 2 minutes",
      description: "Quick setup with no hardware needed",
    },
    {
      icon: <Smartphone className="w-8 h-8 text-blue-600" />,
      title: "Works on any phone",
      description: "No app downloads required",
    },
    {
      icon: <Bell className="w-8 h-8 text-blue-600" />,
      title: "Smart notifications",
      description: "SMS alerts when ready",
    },
  ];

  const businessTypes = [
    {
      icon: <Utensils className="w-8 h-8 text-orange-600" />,
      title: "Restaurants",
      description: "Handle lunch rush without the stress",
      before: "Line chaos",
      after: "Smooth flow",
    },
    {
      icon: <Scissors className="w-8 h-8 text-purple-600" />,
      title: "Barbershops",
      description: "Turn Saturday chaos into extra revenue",
      before: "8 walk-aways",
      after: "0 walk-aways",
    },
    {
      icon: <Sparkles className="w-8 h-8 text-pink-600" />,
      title: "Nail Salons",
      description: "Fill dead afternoon slots with morning overflow",
      before: "2hr waits",
      after: "45min waits",
    },
    {
      icon: <Building2 className="w-8 h-8 text-green-600" />,
      title: "Walk-in Clinics",
      description: "Clear your waiting room, keep patients happy",
      before: "15 in lobby",
      after: "5 in lobby",
    },
  ];

  const steps = [
    {
      icon: <User className="w-8 h-8 text-blue-600" />,
      title: "Sign Up & Get QR",
      description: "Create account in seconds",
      time: "1 min",
    },
    {
      icon: <QrCode className="w-8 h-8 text-blue-600" />,
      title: "Display QR Code",
      description: "Print and post at entrance",
      time: "1 min",
    },
    {
      icon: <Bell className="w-8 h-8 text-blue-600" />,
      title: "Notify Customer",
      description: "One tap when ready",
      time: "1 tap",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero Section */}
      <section className="pt-28 md:pt-32 lg:pt-40 pb-16 px-4">
        <div className="container mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <div className="space-y-4">
                <h1 className="text-4xl md:text-6xl font-bold leading-tight">
                  Hold every walk-in.
                  <br />
                  <span className="bg-gradient-to-r from-success to-success-glow bg-clip-text text-transparent">
                    Boost revenue.
                  </span>
                </h1>
                <p className="text-xl text-muted-foreground leading-relaxed">
                  Let customers queue digitally and wait wherever they want.
                  <br />
                  They save time. You save sales.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <Button size="lg" asChild>
                  <Link to="/signup">Start Free Trial</Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link to="/demo">Watch Demo</Link>
                </Button>
              </div>
            </div>

            <div className="relative">
              <img
                src={heroImage}
                alt="SeatPing digital queue management system"
                className="w-full rounded-2xl shadow-2xl"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Features Bar */}
      <section className="py-8 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap justify-center gap-8">
            {features.map((feature, index) => (
              <div
                key={index}
                className="flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-2 sm:gap-3"
              >
                <div className="flex-shrink-0">{feature.icon}</div>
                <div>
                  <p className="font-semibold">{feature.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Revenue Impact */}
      <section className="py-16 px-4">
        <div className="container mx-auto text-center">
          <div className="space-y-8">
            <h2 className="text-3xl md:text-4xl font-bold">
              Your Saturday:{" "}
              <span className="text-destructive">16 customers at 10am.</span>{" "}
              <span className="text-muted-foreground">0 at 2pm.</span>
              <br />
              That's money walking out the door.
            </h2>

            <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto mt-12">
              <Card className="shadow-lg border-0 bg-destructive/5">
                <CardHeader className="text-center">
                  <CardTitle className="text-destructive text-2xl">
                    Without SeatPing
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                  <div className="text-6xl text-destructive mb-4">❌</div>
                  <div className="text-4xl font-bold text-destructive mb-2">
                    8 of 16 leave
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-lg border-0 bg-success/5">
                <CardHeader className="text-center">
                  <CardTitle className="text-success text-2xl">
                    With SeatPing
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                  <div className="text-6xl text-success mb-4">✅</div>
                  <div className="text-4xl font-bold text-success mb-2">
                    16 of 16 served
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="features" className="py-16 px-4 bg-muted/30">
        <div className="container mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              How It Works
            </h2>
            <p className="text-xl text-muted-foreground">
              Three simple steps to transform your business
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {steps.map((step, index) => (
              <Card
                key={index}
                className="shadow-lg border rounded-2xl hover:scale-105 hover:shadow-xl transition-transform duration-300"
              >
                <CardHeader className="text-center">
                  <div className="mb-4 flex justify-center">{step.icon}</div>
                  <CardTitle className="text-lg">{step.title}</CardTitle>
                  <CardDescription className="text-sm">
                    {step.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-center">
                  <Badge
                    variant="secondary"
                    className="bg-success/10 text-success"
                  >
                    {step.time}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* One Line, Two Ways to Wait */}
      <section id="wait-modes" className="py-16 px-4">
        <div className="container mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              One Line, Two Ways to Wait
            </h2>
            <p className="text-xl text-muted-foreground">
              Let guests choose how they wait—inside your shop or out and about.
            </p>
          </div>

          <div className="relative grid md:grid-cols-3 gap-6 items-start">
            {/* Left card */}
            <Card className="shadow-lg border rounded-2xl hover:scale-105 hover:shadow-xl transition-transform duration-300">
              <CardHeader className="text-center">
                <div className="mb-4 flex justify-center">
                  <Building className="w-10 h-10 text-blue-600" />
                </div>
                <CardTitle className="text-xl">Stay Inside</CardTitle>
                <CardDescription>
                  Great for visitors who prefer to wait in-store.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 text-muted-foreground">
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-500 mt-0.5" />
                    <span>Phone-free check-ins—no number required</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-500 mt-0.5" />
                    <span>Save on messaging costs</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-500 mt-0.5" />
                    <span>Call names directly from the counter or screen</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-500 mt-0.5" />
                    <span>Easy for less tech-savvy guests</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            {/* Center pill + vertical divider on md+ */}
            <div className="hidden md:flex h-full items-center justify-center relative">
              <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-border" />
              <div className="relative z-10">
                <span className="px-5 py-2 rounded-full bg-success text-white text-sm font-medium shadow animate-fadePulse [will-change:opacity]">
                  Switch modes anytime
                </span>
              </div>
            </div>

            {/* Right card */}
            <Card className="shadow-lg border rounded-2xl hover:scale-105 hover:shadow-xl transition-transform duration-300">
              <CardHeader className="text-center">
                <div className="mb-4 flex justify-center">
                  <Smartphone className="w-10 h-10 text-blue-600" />
                </div>
                <CardTitle className="text-xl">Step Out Nearby</CardTitle>
                <CardDescription>
                  Perfect for guests who want flexibility.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 text-muted-foreground">
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-500 mt-0.5" />
                    <span>SMS when it's your turn</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-500 mt-0.5" />
                    <span>Grab coffee or run a quick errand</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-500 mt-0.5" />
                    <span>Automatic status reminders</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-500 mt-0.5" />
                    <span>Relax at a nearby spot while you wait</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-16 px-4 bg-muted/30">
        <div className="container mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Pricing That Makes Sense for Your Business
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <Card className="shadow-2xl border-0 bg-card/80 backdrop-blur-sm">
              <CardHeader className="text-center">
                <CardTitle className="text-xl">Starter</CardTitle>
                <div className="text-3xl font-bold text-success">
                  $19
                  <span className="text-lg text-muted-foreground">/month</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3 mb-0 md:mb-10">
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 bg-success rounded-full"></span>
                    <span>1 Location</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 bg-success rounded-full"></span>
                    <span>300 SMS/Month</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 bg-success rounded-full"></span>
                    <span>300 Customers/Month</span>
                  </div>
                </div>

                <Button className="w-full" size="lg" asChild>
                  <Link to="/signup">Start Free Trial</Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="shadow-2xl border-2 border-primary bg-card/80 backdrop-blur-sm">
              <CardHeader className="text-center">
                <Badge className="mx-auto mb-2 bg-primary text-primary-foreground">
                  Most Popular
                </Badge>
                <CardTitle className="text-xl">Professional</CardTitle>
                <div className="text-3xl font-bold text-success">
                  $49
                  <span className="text-lg text-muted-foreground">/month</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 bg-success rounded-full"></span>
                    <span>3 Locations</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 bg-success rounded-full"></span>
                    <span>1500 SMS/Month</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 bg-success rounded-full"></span>
                    <span>1500 Customers/Month</span>
                  </div>
                </div>

                <Button className="w-full" size="lg" asChild>
                  <Link to="/signup">Start Free Trial</Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="shadow-2xl border-0 bg-card/80 backdrop-blur-sm">
              <CardHeader className="text-center">
                <CardTitle className="text-xl">Custom</CardTitle>
                <div className="text-3xl font-bold text-success">
                  Custom
                  <span className="text-lg text-muted-foreground">/month</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3 mb-0 md:mb-10">
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 bg-success rounded-full"></span>
                    <span>Custom Locations</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 bg-success rounded-full"></span>
                    <span>Custom SMS Credits</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 bg-success rounded-full"></span>
                    <span>Custom Customers Credits</span>
                  </div>
                </div>

                <Button className="w-full" size="lg" asChild>
                  <Link to="/sales">Contact Sales</Link>
                </Button>
              </CardContent>
            </Card>

            <div className="md:col-span-3 text-center mt-6">
              <p className="text-muted-foreground">
                <Star className="w-4 h-4 inline-block mr-1 text-yellow-500" />{" "}
                All plans include 14-day free trial • No credit card required •
                Cancel anytime
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4">
        <div className="container mx-auto text-center">
          <div className="max-w-2xl mx-auto space-y-6">
            <h2 className="text-3xl md:text-4xl font-bold">
              Ready to Hold Every Walk-In?
            </h2>
            <p className="text-xl text-muted-foreground">
              Start your free trial today. No credit card required.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button variant="outline" size="lg" asChild>
                <Link to="/signup">Start Free Trial</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
};

export default LandingPage;
