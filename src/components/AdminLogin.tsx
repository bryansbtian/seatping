import { useRef, useState } from "react";
import Header from "@/components/Header";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AdminLoginProps = {
  onSubmit: (credentials: { username: string; password: string }) => Promise<void>;
  loading: boolean;
};

export default function AdminLogin({ onSubmit, loading }: AdminLoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({ username: "", password: "" });
  const usernameInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) {
      return;
    }

    const nextErrors = { username: "", password: "" };
    if (!username) {
      nextErrors.username = "Username is required";
    }
    if (!password) {
      nextErrors.password = "Password is required";
    }
    setErrors(nextErrors);

    if (nextErrors.username) {
      usernameInput.current?.focus();
      return;
    }
    if (nextErrors.password) {
      passwordInput.current?.focus();
      return;
    }

    await onSubmit({ username, password });
  };

  let submitLabel = "Sign In";
  if (loading) {
    submitLabel = "Signing in...";
  }

  let usernameDescription: string | undefined;
  if (errors.username) {
    usernameDescription = "admin-username-error";
  }
  let passwordDescription: string | undefined;
  if (errors.password) {
    passwordDescription = "admin-password-error";
  }

  return (
    <>
      <SEO
        title="Admin Login | SeatPing"
        description="Sign in to the SeatPing Admin Portal."
        canonical="/admin"
      />
      <Header variant="business" />
      <div data-page-background="auth" className="flex min-h-screen flex-col">
        <main className="flex flex-1 items-center justify-center px-4 pt-24 pb-10 sm:pt-28 sm:pb-14">
          <Card className="w-full max-w-[540px] shadow-2xl border-0 bg-card/80 backdrop-blur-sm">
            <CardHeader className="space-y-2 px-6 pb-6 pt-8 text-center sm:px-10 sm:pt-10">
              <CardTitle className="text-3xl text-primary">Admin Log In</CardTitle>
              <CardDescription className="text-sm sm:text-base">
                Sign in to your SeatPing Admin Portal
              </CardDescription>
            </CardHeader>
            <CardContent className="px-6 pb-8 sm:px-10 sm:pb-10">
              <form noValidate onSubmit={handleSubmit} className="space-y-5" aria-busy={loading}>
                <div className="space-y-2">
                  <Label htmlFor="admin-username">Username</Label>
                  <Input
                    ref={usernameInput}
                    id="admin-username"
                    name="username"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    className="h-11"
                    value={username}
                    onChange={(event) => {
                      setUsername(event.target.value);
                      if (errors.username) {
                        setErrors((previous) => ({ ...previous, username: "" }));
                      }
                    }}
                    aria-invalid={Boolean(errors.username)}
                    aria-describedby={usernameDescription}
                    required
                  />
                  {errors.username && (
                    <p
                      id="admin-username-error"
                      className="text-body text-destructive"
                      role="alert"
                    >
                      {errors.username}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admin-password">Password</Label>
                  <Input
                    ref={passwordInput}
                    id="admin-password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    className="h-11"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      if (errors.password) {
                        setErrors((previous) => ({ ...previous, password: "" }));
                      }
                    }}
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby={passwordDescription}
                    required
                  />
                  {errors.password && (
                    <p
                      id="admin-password-error"
                      className="text-body text-destructive"
                      role="alert"
                    >
                      {errors.password}
                    </p>
                  )}
                </div>
                <Button type="submit" className="h-11 w-full text-base" disabled={loading}>
                  {submitLabel}
                </Button>
              </form>
            </CardContent>
          </Card>
        </main>
      </div>
    </>
  );
}
