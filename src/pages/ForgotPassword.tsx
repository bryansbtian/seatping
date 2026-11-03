import SEO from "@/components/SEO";
import { PUBLIC_PAGE_COPY } from "@shared/pageMeta";
import { usePublicLanguage } from "@/lib/publicLanguage";
import { useState } from "react";
import { Link, useSearchParams } from "@/lib/publicNavigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import { api } from "@/lib/api";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft02Icon, Mail01Icon } from "@hugeicons/core-free-icons";

const ForgotPassword = () => {
  const { t: tp } = usePublicLanguage();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const { toast } = useToast();

  const [searchParams] = useSearchParams();
  const isBusiness = searchParams.get("type") === "business";
  let headerVariant: "business" | "customer";
  let loginPath: string;
  if (isBusiness) {
    headerVariant = "business";
    loginPath = "/business/login";
  } else {
    headerVariant = "customer";
    loginPath = "/login";
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      toast({
        title: tp("Email Required"),
        description: tp("Please enter your email address."),
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      let accountType: string;
      if (isBusiness) {
        accountType = "business";
      } else {
        accountType = "customer";
      }
      await api("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          type: accountType,
        }),
      });

      setEmailSent(true);
      toast({
        title: tp("Email Sent!"),
        description: tp(
          "If an account with that email exists, a password reset link has been sent.",
        ),
      });
    } catch (err: any) {
      toast({
        title: tp("Failed to Send Email"),
        description: tp(err?.message || tp("Please try again.")),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (emailSent) {
    return (
      <>
        <SEO
          title={PUBLIC_PAGE_COPY["/forgot"].title}
          description={PUBLIC_PAGE_COPY["/forgot"].description}
          canonical="/forgot"
        />
        <Header variant={headerVariant} />
        <div data-page-background="auth" className="flex min-h-screen flex-col">
          <main className="flex flex-1 items-center justify-center px-4 pt-24 pb-10 sm:pt-28 sm:pb-14">
            <Card className="w-full max-w-[540px] shadow-2xl border-0 bg-card/80 backdrop-blur-sm">
              <CardHeader className="px-6 pb-6 pt-8 text-center sm:px-10 sm:pt-10">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                  <HugeiconsIcon icon={Mail01Icon} className="h-8 w-8 text-green-600" />
                </div>
                <CardTitle className="text-3xl text-primary">{tp("Check Your Email")}</CardTitle>
                <CardDescription className="text-sm sm:text-base">
                  {tp("We've sent a password reset link to your email address.")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 px-6 pb-8 sm:px-10 sm:pb-10">
                <div className="text-center space-y-4">
                  <p className="text-sm text-muted-foreground">
                    {tp(
                      "Click the link in the email to reset your password. The link will expire in 1 hour.",
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {tp("Didn't receive the email? Check your spam folder or try again.")}
                  </p>
                </div>

                <div>
                  <Button onClick={() => setEmailSent(false)} className="h-11 w-full text-base">
                    {tp("Try Another Email")}
                  </Button>
                  <div className="mt-5 text-center">
                    <Button asChild variant="link" className="text-muted-foreground">
                      <Link to={loginPath}>
                        <HugeiconsIcon icon={ArrowLeft02Icon} className="w-4 h-4 mr-2" />
                        {tp("Back to Log In")}
                      </Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </main>
        </div>
      </>
    );
  }

  let submitLabel: string;
  if (loading) {
    submitLabel = tp("Sending...");
  } else {
    submitLabel = tp("Send Reset Link");
  }

  return (
    <>
      <SEO
        title={PUBLIC_PAGE_COPY["/forgot"].title}
        description={PUBLIC_PAGE_COPY["/forgot"].description}
        canonical="/forgot"
      />
      <Header variant={headerVariant} />
      <div data-page-background="auth" className="flex min-h-screen flex-col">
        <main className="flex flex-1 items-center justify-center px-4 pt-24 pb-10 sm:pt-28 sm:pb-14">
          <Card className="w-full max-w-[540px] shadow-2xl border-0 bg-card/80 backdrop-blur-sm">
            <CardHeader className="px-6 pb-6 pt-8 text-center sm:px-10 sm:pt-10">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100">
                <HugeiconsIcon icon={Mail01Icon} className="h-8 w-8 text-indigo-600" />
              </div>
              <CardTitle className="text-3xl text-primary">{tp("Forgot Password?")}</CardTitle>
              <CardDescription className="text-sm sm:text-base">
                {tp("Enter your email address and we'll send you a link to reset your password.")}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-6 pb-8 sm:px-10 sm:pb-10">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email">{tp("Email Address")}</Label>
                  <Input
                    id="email"
                    type="email"
                    className="h-11 placeholder:text-sm sm:placeholder:text-base"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={tp("Enter your email address")}
                    required
                  />
                </div>

                <Button type="submit" className="h-11 w-full text-base" disabled={loading}>
                  {submitLabel}
                </Button>
              </form>

              <div className="mt-5 text-center">
                <Button asChild variant="link" className="text-muted-foreground">
                  <Link to={loginPath}>
                    <HugeiconsIcon icon={ArrowLeft02Icon} className="w-4 h-4 mr-2" />
                    {tp("Back to Log In")}
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    </>
  );
};

export default ForgotPassword;
