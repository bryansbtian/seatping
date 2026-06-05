import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
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
import SEO, { CUSTOMER_DESCRIPTION } from "@/components/SEO";
import { api } from "@/lib/api";

const Login = () => {
  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({ emailOrUsername: "", password: "" });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  // Optional post-login redirect (e.g. back to a restaurant page to auto-save).
  // Only honor relative in-app paths.
  const nextParam = searchParams.get("next");
  const redirectTo = nextParam && nextParam.startsWith("/") ? nextParam : "/";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors = { emailOrUsername: "", password: "" };
    if (!emailOrUsername)
      newErrors.emailOrUsername = "Email or username is required";
    if (!password) newErrors.password = "Password is required";
    setErrors(newErrors);
    if (newErrors.emailOrUsername || newErrors.password) return;

    try {
      setLoading(true);
      const res = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ emailOrUsername, password }),
      });
      toast({
        title: "Log In successful!",
        description: `Welcome back, ${res.user.name}`,
      });
      // Return to the page that sent us here (e.g. a restaurant page that
      // wants to auto-save), or the homepage by default.
      navigate(redirectTo);
    } catch (err: any) {
      toast({
        title: "Log In failed",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <SEO
        title="Log In | SeatPing"
        description={CUSTOMER_DESCRIPTION}
        canonical="/login"
      />
      <Header />
      {/* Full-height flex column: the fixed header is overlaid on top (hence the
          pt-* on <main> so the card clears it), the form is vertically centered
          in the remaining space, and the footer sits at the bottom. Because the
          whole column is exactly min-h-screen, short content never creates a
          giant empty area below the card. */}
      <div className="flex min-h-screen flex-col bg-gradient-to-br from-primary/5 via-background to-success/5">
        <main className="flex flex-1 items-center justify-center px-4 pt-24 pb-10 sm:pt-28 sm:pb-14">
          <Card className="w-full max-w-[540px] shadow-2xl border-0 bg-card/80 backdrop-blur-sm">
            <CardHeader className="space-y-2 px-6 pb-6 pt-8 text-center sm:px-10 sm:pt-10">
              <CardTitle className="text-3xl text-primary">
                Welcome Back
              </CardTitle>
              <CardDescription className="whitespace-nowrap text-sm sm:text-base">
                Sign in to your SeatPing Account
              </CardDescription>
            </CardHeader>
            <CardContent className="px-6 pb-8 sm:px-10 sm:pb-10">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="emailOrUsername">Email or Username</Label>
                  <Input
                    id="emailOrUsername"
                    className="h-11"
                    value={emailOrUsername}
                    onChange={(e) => {
                      setEmailOrUsername(e.target.value);
                      if (errors.emailOrUsername)
                        setErrors((p) => ({ ...p, emailOrUsername: "" }));
                    }}
                    required
                  />
                  {errors.emailOrUsername && (
                    <p className="text-sm text-destructive">
                      {errors.emailOrUsername}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    className="h-11"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (errors.password)
                        setErrors((p) => ({ ...p, password: "" }));
                    }}
                    required
                  />
                  {errors.password && (
                    <p className="text-sm text-destructive">
                      {errors.password}
                    </p>
                  )}
                </div>
                <Button
                  type="submit"
                  className="h-11 w-full text-base"
                  disabled={loading}
                >
                  {loading ? "Signing in..." : "Sign In"}
                </Button>
              </form>

              <div className="mt-5 text-center">
                <Link
                  to="/forgot"
                  className="text-sm text-primary hover:underline"
                >
                  Forgot Password?
                </Link>
              </div>

              <div className="mt-6 text-center">
                <p className="text-sm text-muted-foreground">
                  Don't have an account?{" "}
                  <Link to="/signup" className="text-primary hover:underline">
                    Sign Up
                  </Link>
                </p>
              </div>
            </CardContent>
          </Card>
        </main>
        <Footer />
      </div>
    </>
  );
};

export default Login;
