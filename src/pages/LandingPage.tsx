import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import Header from "@/components/Header";
import heroImage from "@/assets/hero-image.jpg";

const LandingPage = () => {
  const features = [
    {
      icon: "⏱️",
      title: "Set up in 2 minutes",
      description: "Quick setup with no hardware needed"
    },
    {
      icon: "📱",
      title: "Works on any phone",
      description: "No app downloads required"
    },
    {
      icon: "🔔",
      title: "Smart notifications",
      description: "SMS alerts when ready"
    }
  ];

  const businessTypes = [
    {
      icon: "✂️",
      title: "Barbershops",
      description: "Turn Saturday chaos into $400 extra revenue",
      before: "8 walk-aways",
      after: "0 walk-aways"
    },
    {
      icon: "💅",
      title: "Nail Salons", 
      description: "Fill dead afternoon slots with morning overflow",
      before: "2hr waits",
      after: "45min waits"
    },
    {
      icon: "🏥",
      title: "Walk-in Clinics",
      description: "Clear your waiting room, keep patients happy",
      before: "15 in lobby",
      after: "5 in lobby"
    },
    {
      icon: "⚡",
      title: "Quick-Service",
      description: "Handle lunch rush without the stress",
      before: "Line chaos",
      after: "Smooth flow"
    }
  ];

  const steps = [
    {
      icon: "👤",
      title: "Sign Up & Get QR",
      description: "Create account in seconds",
      time: "30s"
    },
    {
      icon: "📋",
      title: "Display QR Code", 
      description: "Print and post at entrance",
      time: "30s"
    },
    {
      icon: "📞",
      title: "Call Customer",
      description: "One tap when ready",
      time: "1 tap"
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      {/* Hero Section */}
      <section className="pt-20 pb-16 px-4">
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
                  <Link to="#demo">Watch Demo</Link>
                </Button>
              </div>
              
              <div className="p-4 bg-muted/50 rounded-lg border-l-4 border-primary">
                <div className="flex items-center gap-2 text-sm">
                  <span className="w-2 h-2 bg-success rounded-full"></span>
                  <strong>Already using Booksy or Square?</strong> QueuePro works alongside them for walk-ins only.
                </div>
              </div>
            </div>
            
            <div className="relative">
              <img 
                src={heroImage} 
                alt="QueuePro digital queue management system" 
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
              <div key={index} className="flex items-center gap-3">
                <span className="text-2xl">{feature.icon}</span>
                <div>
                  <p className="font-semibold">{feature.title}</p>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
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
              Your Saturday: <span className="text-destructive">16 customers at 10am.</span> <span className="text-muted-foreground">0 at 2pm.</span>
              <br />
              That's <span className="text-destructive text-4xl">$200</span> walking out the door.
            </h2>
            
            <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto mt-12">
              <Card className="shadow-lg border-0 bg-destructive/5">
                <CardHeader className="text-center">
                  <CardTitle className="text-destructive text-2xl">Without QueuePro</CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                  <div className="text-6xl text-destructive mb-4">❌</div>
                  <div className="text-4xl font-bold text-destructive mb-2">8 of 16 leave</div>
                </CardContent>
              </Card>
              
              <Card className="shadow-lg border-0 bg-success/5">
                <CardHeader className="text-center">
                  <CardTitle className="text-success text-2xl">With QueuePro</CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                  <div className="text-6xl text-success mb-4">✅</div>
                  <div className="text-4xl font-bold text-success mb-2">16 of 16 served</div>
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
            <h2 className="text-3xl md:text-4xl font-bold mb-4">How It Works</h2>
            <p className="text-xl text-muted-foreground">Three simple steps to transform your business</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((step, index) => (
              <div key={index} className="text-center">
                <div className="w-20 h-20 bg-gradient-to-r from-primary to-primary-glow rounded-full flex items-center justify-center text-2xl text-white mx-auto mb-6">
                  {step.icon}
                </div>
                <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
                <p className="text-muted-foreground mb-4">{step.description}</p>
                <Badge variant="secondary" className="bg-success/10 text-success">
                  {step.time}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Business Types */}
      <section className="py-16 px-4">
        <div className="container mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Built for Businesses That Value Walk-Ins
            </h2>
            <p className="text-xl text-muted-foreground">See your exact business transformation</p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {businessTypes.map((business, index) => (
              <Card key={index} className="shadow-lg border-0 hover:scale-105 transition-transform duration-300">
                <CardHeader className="text-center">
                  <div className="text-4xl mb-4">{business.icon}</div>
                  <CardTitle className="text-lg">{business.title}</CardTitle>
                  <CardDescription className="text-sm">
                    "{business.description}"
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-center space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-destructive">{business.before}</span>
                    <span>→</span>
                    <span className="text-success">{business.after}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-16 px-4 bg-muted/30">
        <div className="container mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Pricing That Makes Sense for Small Business
            </h2>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <Card className="shadow-2xl border-0 bg-card/80 backdrop-blur-sm">
              <CardHeader className="text-center">
                <CardTitle className="text-xl">Starter</CardTitle>
                <div className="text-3xl font-bold text-success">
                  $9<span className="text-lg text-muted-foreground">/month</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 bg-success rounded-full"></span>
                    <span>100 SMS credits monthly</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 bg-success rounded-full"></span>
                    <span>Up to 50 customers/day</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 bg-success rounded-full"></span>
                    <span>Basic queue management</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 bg-success rounded-full"></span>
                    <span>Email support</span>
                  </div>
                </div>
                
                <Button className="w-full" size="lg" asChild>
                  <Link to="/signup">Start Free Trial</Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="shadow-2xl border-2 border-primary bg-card/80 backdrop-blur-sm">
              <CardHeader className="text-center">
                <Badge className="mx-auto mb-2 bg-primary text-primary-foreground">Most Popular</Badge>
                <CardTitle className="text-xl">Professional</CardTitle>
                <div className="text-3xl font-bold text-success">
                  $29<span className="text-lg text-muted-foreground">/month</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 bg-success rounded-full"></span>
                    <span>500 SMS credits monthly</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 bg-success rounded-full"></span>
                    <span>Unlimited customers</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 bg-success rounded-full"></span>
                    <span>Advanced analytics</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 bg-success rounded-full"></span>
                    <span>Priority support</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 bg-success rounded-full"></span>
                    <span>Custom branding</span>
                  </div>
                </div>
                
                <Button className="w-full" size="lg" asChild>
                  <Link to="/signup">Start Free Trial</Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="shadow-2xl border-0 bg-card/80 backdrop-blur-sm">
              <CardHeader className="text-center">
                <CardTitle className="text-xl">Enterprise</CardTitle>
                <div className="text-3xl font-bold text-success">
                  $99<span className="text-lg text-muted-foreground">/month</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 bg-success rounded-full"></span>
                    <span>Unlimited SMS credits</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 bg-success rounded-full"></span>
                    <span>Multiple locations</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 bg-success rounded-full"></span>
                    <span>API access</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 bg-success rounded-full"></span>
                    <span>White-label solution</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 bg-success rounded-full"></span>
                    <span>24/7 phone support</span>
                  </div>
                </div>
                
                <Button className="w-full" size="lg" asChild>
                  <Link to="/signup">Contact Sales</Link>
                </Button>
              </CardContent>
            </Card>
            
            <div className="md:col-span-3 text-center mt-6">
              <p className="text-muted-foreground">
                ⭐ All plans include 14-day free trial • No credit card required • Cancel anytime
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
              <Button size="lg" asChild>
                <Link to="/signup">Start Free Trial</Link>
              </Button>
              <Button size="lg" variant="success" asChild>
                <Link to="/queue">Join a Queue</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default LandingPage;