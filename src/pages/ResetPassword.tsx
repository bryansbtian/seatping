import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { api } from "@/lib/api";
import { Lock, CheckCircle, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

const ResetPassword = () => {
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
        title: "Invalid Reset Link",
        description: "This password reset link is invalid.",
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
  }, [token, navigate, toast, isBusiness]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setErrors({ newPassword: "", confirmPassword: "" });

    if (!newPassword.trim()) {
      setErrors((prev) => ({ ...prev, newPassword: "New password is required" }));
      return;
    }

    if (newPassword.length < 8) {
      setErrors((prev) => ({ ...prev, newPassword: "Password must be at least 8 characters" }));
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrors((prev) => ({ ...prev, confirmPassword: "Passwords don't match" }));
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
        title: "Password Reset Successful!",
        description: "Your password has been updated. You can now log in with your new password.",
      });
    } catch (err: any) {
      toast({
        title: "Password Reset Failed",
        description: err?.message || "Please try again or request a new reset link.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (passwordReset) {
    return (
      <>
        <Header variant={headerVariant} />
        <div className="flex min-h-screen flex-col bg-gradient-to-br from-primary/5 via-background to-success/5">
          <main className="flex flex-1 items-center justify-center px-4 pt-24 pb-10 sm:pt-28 sm:pb-14">
            <Card className="w-full max-w-[540px] shadow-2xl border-0 bg-card/80 backdrop-blur-sm">
              <CardHeader className="px-6 pb-6 pt-8 text-center sm:px-10 sm:pt-10">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                  <CheckCircle className="h-8 w-8 text-green-600" />
                </div>
                <CardTitle className="text-3xl text-primary">Password Reset Complete!</CardTitle>
                <CardDescription className="text-sm sm:text-base">
                  Your password has been successfully updated.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 px-6 pb-8 sm:px-10 sm:pb-10">
                <div className="text-center space-y-4">
                  <p className="text-sm text-muted-foreground">
                    You can now log in to your account using your new password.
                  </p>
                </div>

                <Button asChild className="h-11 w-full text-base">
                  <Link to={loginPath}>Continue to Log In</Link>
                </Button>
              </CardContent>
            </Card>
          </main>
          <Footer />
        </div>
      </>
    );
  }

  if (!token) {
    return null;
  }

  let submitLabel: string;
  if (loading) {
    submitLabel = "Updating...";
  } else {
    submitLabel = "Update Password";
  }

  return (
    <>
      <Header variant={headerVariant} />
      <div className="flex min-h-screen flex-col bg-gradient-to-br from-primary/5 via-background to-success/5">
        <main className="flex flex-1 items-center justify-center px-4 pt-24 pb-10 sm:pt-28 sm:pb-14">
          <Card className="w-full max-w-[540px] shadow-2xl border-0 bg-card/80 backdrop-blur-sm">
            <CardHeader className="px-6 pb-6 pt-8 text-center sm:px-10 sm:pt-10">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100">
                <Lock className="h-8 w-8 text-indigo-600" />
              </div>
              <CardTitle className="text-3xl text-primary">Reset Your Password</CardTitle>
              <CardDescription className="text-sm sm:text-base">
                Enter your new password below.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-6 pb-8 sm:px-10 sm:pb-10">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    className="h-11 placeholder:text-sm sm:placeholder:text-base"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter your new password"
                    required
                  />
                  {errors.newPassword && (
                    <p className="text-sm text-destructive">{errors.newPassword}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    className="h-11 placeholder:text-sm sm:placeholder:text-base"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm your new password"
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

export default ResetPassword;
