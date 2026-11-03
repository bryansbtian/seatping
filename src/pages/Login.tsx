import { usePublicLanguage } from "@/lib/publicLanguage";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "@/lib/publicNavigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import SEO, { CUSTOMER_DESCRIPTION } from "@/components/SEO";
import { api } from "@/lib/api";
import { resetSessionQueries } from "@/lib/queryClient";

const Login = () => {
  const { t: tp } = usePublicLanguage();

  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({ emailOrUsername: "", password: "" });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const nextParam = searchParams.get("next");
  let redirectTo: string;
  if (nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")) {
    redirectTo = nextParam;
  } else {
    redirectTo = "/";
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors = { emailOrUsername: "", password: "" };
    if (!emailOrUsername) {
      newErrors.emailOrUsername = tp("Email or username is required");
    }
    if (!password) {
      newErrors.password = tp("Password is required");
    }
    setErrors(newErrors);
    if (newErrors.emailOrUsername || newErrors.password) {
      return;
    }

    try {
      setLoading(true);
      const res = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ emailOrUsername, password }),
      });
      await resetSessionQueries();
      toast({
        title: tp("Log In successful!"),
        description: tp(`Welcome back, ${res.user.name}`),
      });
      navigate(redirectTo);
    } catch (err: any) {
      toast({
        title: tp("Log In failed"),
        description: tp(err?.message || tp("Please try again.")),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  let submitLabel: string;
  if (loading) {
    submitLabel = tp("Signing in...");
  } else {
    submitLabel = tp("Sign In");
  }

  return (
    <>
      <SEO title={tp("Log In | SeatPing")} description={CUSTOMER_DESCRIPTION} canonical="/login" />
      <Header />
      <div data-page-background="auth" className="flex min-h-screen flex-col">
        <main className="flex flex-1 items-center justify-center px-4 pt-24 pb-10 sm:pt-28 sm:pb-14">
          <Card className="w-full max-w-[540px] shadow-2xl border-0 bg-card/80 backdrop-blur-sm">
            <CardHeader className="space-y-2 px-6 pb-6 pt-8 text-center sm:px-10 sm:pt-10">
              <CardTitle className="text-3xl text-primary">{tp("Welcome Back")}</CardTitle>
              <CardDescription className="text-sm sm:text-base">
                {tp("Sign in to your SeatPing Account")}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-6 pb-8 sm:px-10 sm:pb-10">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="emailOrUsername">{tp("Email or Username")}</Label>
                  <Input
                    id="emailOrUsername"
                    className="h-11"
                    value={emailOrUsername}
                    onChange={(e) => {
                      setEmailOrUsername(e.target.value);
                      if (errors.emailOrUsername) {
                        setErrors((p) => ({ ...p, emailOrUsername: "" }));
                      }
                    }}
                    required
                  />
                  {errors.emailOrUsername && (
                    <p className="text-sm text-destructive">{errors.emailOrUsername}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">{tp("Password")}</Label>
                  <Input
                    id="password"
                    type="password"
                    className="h-11"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (errors.password) {
                        setErrors((p) => ({ ...p, password: "" }));
                      }
                    }}
                    required
                  />
                  {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
                </div>
                <Button type="submit" className="h-11 w-full text-base" disabled={loading}>
                  {submitLabel}
                </Button>
              </form>

              <div className="mt-5 text-center">
                <Link to="/forgot" className="text-sm text-primary hover:underline">
                  {tp("Forgot Password?")}
                </Link>
              </div>

              <div className="mt-6 text-center">
                <p className="text-sm text-muted-foreground">
                  {tp("Don't have an account?")}{" "}
                  <Link to="/signup" className="text-primary hover:underline">
                    {tp("Sign Up")}
                  </Link>
                </p>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    </>
  );
};

export default Login;
