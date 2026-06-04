import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { api } from "@/lib/api";
import { Mail, ArrowLeft } from "lucide-react";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const { toast } = useToast();

  // Context-aware: a business arriving from /business/login (?type=business)
  // gets the business header and is sent back to the business login.
  const [searchParams] = useSearchParams();
  const isBusiness = searchParams.get("type") === "business";
  const headerVariant = isBusiness ? "business" : "customer";
  const loginPath = isBusiness ? "/business/login" : "/login";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim()) {
      toast({
        title: "Email Required",
        description: "Please enter your email address.",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      await api("/auth/forgot-password", {
        method: "POST",
        // Send the account type so the reset targets the right collection
        // (customer vs business) when the same email exists in both.
        body: JSON.stringify({
          email: email.trim(),
          type: isBusiness ? "business" : "customer",
        }),
      });

      setEmailSent(true);
      toast({
        title: "Email Sent!",
        description: "If an account with that email exists, a password reset link has been sent.",
      });
    } catch (err: any) {
      toast({
        title: "Failed to Send Email",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (emailSent) {
    return (
      <>
        <Header variant={headerVariant} />
        <div className="flex min-h-screen flex-col bg-gradient-to-br from-primary/5 via-background to-success/5">
          <main className="flex flex-1 items-center justify-center px-4 pt-24 pb-10 sm:pt-28 sm:pb-14">
            <Card className="w-full max-w-[540px] shadow-2xl border-0 bg-card/80 backdrop-blur-sm">
              <CardHeader className="px-6 pb-6 pt-8 text-center sm:px-10 sm:pt-10">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                  <Mail className="h-8 w-8 text-green-600" />
                </div>
                <CardTitle className="text-3xl text-primary">
                  Check Your Email
                </CardTitle>
                <CardDescription className="text-sm sm:text-base">
                  We've sent a password reset link to your email address.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 px-6 pb-8 sm:px-10 sm:pb-10">
                <div className="text-center space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Click the link in the email to reset your password. The link will expire in 1 hour.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Didn't receive the email? Check your spam folder or try again.
                  </p>
                </div>

                <div>
                  <Button
                    onClick={() => setEmailSent(false)}
                    className="h-11 w-full text-base"
                  >
                    Try Another Email
                  </Button>
                  <div className="mt-5 text-center">
                    <Button
                      asChild
                      variant="link"
                      className="text-muted-foreground"
                    >
                      <Link to={loginPath}>
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back to Log In
                      </Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </main>
          <Footer />
        </div>
      </>
    );
  }

  return (
    <>
      <Header variant={headerVariant} />
      {/* Full-height flex column: fixed header overlaid on top (pt-* on <main>
          clears it), card centered in the remaining space, footer at the bottom.
          The whole column is exactly min-h-screen so short content never leaves a
          giant empty area below the card. Matches the login/signup layout. */}
      <div className="flex min-h-screen flex-col bg-gradient-to-br from-primary/5 via-background to-success/5">
        <main className="flex flex-1 items-center justify-center px-4 pt-24 pb-10 sm:pt-28 sm:pb-14">
          <Card className="w-full max-w-[540px] shadow-2xl border-0 bg-card/80 backdrop-blur-sm">
            <CardHeader className="px-6 pb-6 pt-8 text-center sm:px-10 sm:pt-10">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100">
                <Mail className="h-8 w-8 text-indigo-600" />
              </div>
              <CardTitle className="text-3xl text-primary">
                Forgot Password?
              </CardTitle>
              <CardDescription className="text-sm sm:text-base">
                Enter your email address and we'll send you a link to reset your password.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-6 pb-8 sm:px-10 sm:pb-10">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    className="h-11 placeholder:text-sm sm:placeholder:text-base"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email address"
                    required
                  />
                </div>

                <Button
                  type="submit"
                  className="h-11 w-full text-base"
                  disabled={loading}
                >
                  {loading ? "Sending..." : "Send Reset Link"}
                </Button>
              </form>

              <div className="mt-5 text-center">
                <Button asChild variant="link" className="text-muted-foreground">
                  <Link to={loginPath}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Log In
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>
        <Footer />
      </div>
    </>
  );
};

export default ForgotPassword;
