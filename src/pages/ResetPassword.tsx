import SEO from "@/components/SEO";
import { PUBLIC_PAGE_COPY } from "@shared/pageMeta";
import { usePublicLanguage } from "@/lib/publicLanguage";
import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "@/lib/publicNavigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import { api } from "@/lib/api";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft02Icon, CheckmarkCircle02Icon, LockIcon } from "@hugeicons/core-free-icons";
import { Link } from "@/lib/publicNavigation";

const ResetPassword = () => {
  const { t: tp } = usePublicLanguage();

  const [searchParams] = useSearchParams();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [passwordReset, setPasswordReset] = useState(false);
  const [errors, setErrors] = useState({ newPassword: "", confirmPassword: "" });
  const navigate = useNavigate();
  const { toast } = useToast();

  const token = searchParams.get("token");

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

  useEffect(() => {
    if (!token) {
      toast({
        title: tp("Invalid Reset Link"),
        description: tp("This password reset link is invalid."),
        variant: "destructive",
      });
      let forgotPath: string;
      if (isBusiness) {
        forgotPath = "/forgot?type=business";
      } else {
        forgotPath = "/forgot";
      }
      navigate(forgotPath);
    }
  }, [token, navigate, toast, isBusiness, tp]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setErrors({ newPassword: "", confirmPassword: "" });

    if (!newPassword.trim()) {
      setErrors((prev) => ({ ...prev, newPassword: tp("New password is required") }));
      return;
    }

    if (newPassword.length < 8) {
      setErrors((prev) => ({ ...prev, newPassword: tp("Password must be at least 8 characters") }));
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrors((prev) => ({ ...prev, confirmPassword: tp("Passwords don't match") }));
      return;
    }

    try {
      setLoading(true);
      await api("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          token,
          newPassword: newPassword.trim(),
        }),
      });

      setPasswordReset(true);
      toast({
        title: tp("Password Reset Successful!"),
        description: tp(
          "Your password has been updated. You can now log in with your new password.",
        ),
      });
    } catch (err: any) {
      toast({
        title: tp("Password Reset Failed"),
        description: tp(err?.message || tp("Please try again or request a new reset link.")),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (passwordReset) {
    return (
      <>
        <SEO
          title={PUBLIC_PAGE_COPY["/reset"].title}
          description={PUBLIC_PAGE_COPY["/reset"].description}
          canonical="/reset"
        />
        <Header variant={headerVariant} />
        <div data-page-background="auth" className="flex min-h-screen flex-col">
          <main className="flex flex-1 items-center justify-center px-4 pt-24 pb-10 sm:pt-28 sm:pb-14">
            <Card className="w-full max-w-[540px] shadow-2xl border-0 bg-card/80 backdrop-blur-sm">
              <CardHeader className="px-6 pb-6 pt-8 text-center sm:px-10 sm:pt-10">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                  <HugeiconsIcon icon={CheckmarkCircle02Icon} className="h-8 w-8 text-green-600" />
                </div>
                <CardTitle className="text-3xl text-primary">
                  {tp("Password Reset Complete!")}
                </CardTitle>
                <CardDescription className="text-sm sm:text-base">
                  {tp("Your password has been successfully updated.")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 px-6 pb-8 sm:px-10 sm:pb-10">
                <div className="text-center space-y-4">
                  <p className="text-sm text-muted-foreground">
                    {tp("You can now log in to your account using your new password.")}
                  </p>
                </div>

                <Button asChild className="h-11 w-full text-base">
                  <Link to={loginPath}>{tp("Continue to Log In")}</Link>
                </Button>
              </CardContent>
            </Card>
          </main>
        </div>
      </>
    );
  }

  if (!token) {
    return null;
  }

  let submitLabel: string;
  if (loading) {
    submitLabel = tp("Updating...");
  } else {
    submitLabel = tp("Update Password");
  }

  return (
    <>
      <SEO
        title={PUBLIC_PAGE_COPY["/reset"].title}
        description={PUBLIC_PAGE_COPY["/reset"].description}
        canonical="/reset"
      />
      <Header variant={headerVariant} />
      <div data-page-background="auth" className="flex min-h-screen flex-col">
        <main className="flex flex-1 items-center justify-center px-4 pt-24 pb-10 sm:pt-28 sm:pb-14">
          <Card className="w-full max-w-[540px] shadow-2xl border-0 bg-card/80 backdrop-blur-sm">
            <CardHeader className="px-6 pb-6 pt-8 text-center sm:px-10 sm:pt-10">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100">
                <HugeiconsIcon icon={LockIcon} className="h-8 w-8 text-indigo-600" />
              </div>
              <CardTitle className="text-3xl text-primary">{tp("Reset Your Password")}</CardTitle>
              <CardDescription className="text-sm sm:text-base">
                {tp("Enter your new password below.")}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-6 pb-8 sm:px-10 sm:pb-10">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">{tp("New Password")}</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    className="h-11 placeholder:text-sm sm:placeholder:text-base"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={tp("Enter your new password")}
                    required
                  />
                  {errors.newPassword && (
                    <p className="text-sm text-destructive">{errors.newPassword}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">{tp("Confirm New Password")}</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    className="h-11 placeholder:text-sm sm:placeholder:text-base"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={tp("Confirm your new password")}
                    required
                  />
                  {errors.confirmPassword && (
                    <p className="text-sm text-destructive">{errors.confirmPassword}</p>
                  )}
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

export default ResetPassword;
