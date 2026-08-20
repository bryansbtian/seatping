import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEO, { CUSTOMER_DESCRIPTION } from "@/components/SEO";
import { api } from "@/lib/api";
import { CountryCodeSelect } from "@/components/CountryCodeSelect";

const Signup = () => {
  const [formData, setFormData] = useState({
    name: "",
    username: "",
    email: "",
    phone: "",
    countryCode: "+1",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState({
    name: "",
    username: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof typeof errors]) {
      setErrors((p) => ({ ...p, [name]: "" }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors = {
      name: "",
      username: "",
      email: "",
      phone: "",
      password: "",
      confirmPassword: "",
    };

    if (!formData.name) {
      newErrors.name = "Name is required";
    }
    if (!formData.username) {
      newErrors.username = "Username is required";
    } else if (formData.username.length < 3) {
      newErrors.username = "Username must be at least 3 characters";
    }
    if (!formData.email) {
      newErrors.email = "Email is required";
    }
    if (formData.phone && formData.phone.replace(/\D/g, "").length < 6) {
      newErrors.phone = "Phone must be at least 6 digits";
    }
    if (!formData.password) {
      newErrors.password = "Password is required";
    } else if (formData.password.length < 8) {
      newErrors.password = "Password must be at least 8 chars";
    }
    if (!formData.confirmPassword) {
      newErrors.confirmPassword = "Please confirm your password";
    }
    if (
      formData.password &&
      formData.confirmPassword &&
      formData.password !== formData.confirmPassword
    ) {
      newErrors.confirmPassword = "Passwords don't match";
    }

    setErrors(newErrors);
    if (Object.values(newErrors).some(Boolean)) {
      return;
    }

    try {
      setLoading(true);
      let phonePayload: string;
      if (formData.phone.trim()) {
        phonePayload = `${formData.countryCode}${formData.phone.replace(/\D/g, "")}`;
      } else {
        phonePayload = "";
      }
      const payload = {
        name: formData.name,
        username: formData.username,
        email: formData.email,
        phone: phonePayload,
        password: formData.password,
      };
      const res = await api("/auth/signup", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      toast({
        title: "Account created!",
        description: `Welcome, ${res.user.name}`,
      });
      navigate("/");
    } catch (err: any) {
      toast({
        title: "Sign up failed",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  let submitLabel: string;
  if (loading) {
    submitLabel = "Creating...";
  } else {
    submitLabel = "Sign Up";
  }

  return (
    <>
      <SEO title="Sign Up | SeatPing" description={CUSTOMER_DESCRIPTION} canonical="/signup" />
      <Header />
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-success/5 px-4 py-8 pt-24">
        <Card className="w-full max-w-md lg:max-w-2xl shadow-2xl border-0 bg-card/80 backdrop-blur-sm">
          <CardHeader className="space-y-2 px-6 pb-6 pt-8 text-center sm:px-10 sm:pt-10">
            <CardTitle className="text-3xl text-primary">Create Your Account</CardTitle>
            <CardDescription className="text-sm sm:text-base">
              Join SeatPing to discover restaurants and skip the wait
            </CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-8 sm:px-10 sm:pb-10">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  name="name"
                  className="h-11"
                  value={formData.name}
                  onChange={handleChange}
                  required
                />
                {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  name="username"
                  className="h-11"
                  value={formData.username}
                  onChange={handleChange}
                  required
                />
                {errors.username && <p className="text-sm text-destructive">{errors.username}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  className="h-11"
                  value={formData.email}
                  onChange={handleChange}
                  required
                />
                {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">
                  Phone Number <span className="font-normal text-muted-foreground">(Optional)</span>
                </Label>
                <div className="flex gap-2">
                  <CountryCodeSelect
                    className="h-11"
                    value={formData.countryCode}
                    onChange={(dial) => setFormData((p) => ({ ...p, countryCode: dial }))}
                  />
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    placeholder="(555) 123-4567"
                    value={formData.phone}
                    onChange={handleChange}
                    className="h-11 flex-1 placeholder:text-sm sm:placeholder:text-base"
                  />
                </div>
                {errors.phone && <p className="text-sm text-destructive">{errors.phone}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  className="h-11"
                  value={formData.password}
                  onChange={handleChange}
                  required
                />
                {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  className="h-11"
                  value={formData.confirmPassword}
                  onChange={handleChange}
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

            <div className="mt-6 text-center">
              <p className="text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link to="/login" className="text-primary hover:underline">
                  Log In
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
      <Footer />
    </>
  );
};

export default Signup;
