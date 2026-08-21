import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEO, { BUSINESS_DESCRIPTION, BUSINESS_IMAGE } from "@/components/SEO";
import { api } from "@/lib/api";
import { CountryCodeSelect } from "@/components/CountryCodeSelect";
import { analytics } from "@/lib/analytics";
import { PhoneNumberInput } from "@/components/PhoneNumberInput";

const BusinessSignup = () => {
  const [formData, setFormData] = useState({
    businessName: "",
    businessUsername: "",
    email: "",
    phone: "",
    countryCode: "+1",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState({
    businessName: "",
    businessUsername: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    analytics.businessSignupStarted();
  }, []);

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
      businessName: "",
      businessUsername: "",
      email: "",
      phone: "",
      password: "",
      confirmPassword: "",
    };

    if (!formData.businessName) {
      newErrors.businessName = "Business name is required";
    }
    if (!formData.businessUsername) {
      newErrors.businessUsername = "Business username is required";
    } else if (formData.businessUsername.length < 3) {
      newErrors.businessUsername = "Username must be at least 3 characters";
    }
    if (!formData.email) {
      newErrors.email = "Email is required";
    }
    if (!formData.phone) {
      newErrors.phone = "Phone number is required";
    } else if (formData.phone.replace(/\D/g, "").length < 6) {
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
      const payload = {
        name: formData.businessName,
        username: formData.businessUsername,
        email: formData.email,
        phone: `${formData.countryCode}${formData.phone.replace(/\D/g, "")}`,
        password: formData.password,
      };
      const res = await api("/auth/business/signup", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      analytics.businessSignupCompleted();
      toast({
        title: "Account created!",
        description: `Welcome, ${res.user.name}`,
      });
      navigate("/business/dashboard");
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
    submitLabel = "Start Free Trial";
  }

  return (
    <>
      <SEO
        title="Create a Business Account | SeatPing"
        description={BUSINESS_DESCRIPTION}
        image={BUSINESS_IMAGE}
        canonical="/business/signup"
      />
      <Header variant="business" />
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-success/5 px-4 py-8 pt-24">
        <Card className="w-full max-w-md lg:max-w-2xl shadow-2xl border-0 bg-card/80 backdrop-blur-sm">
          <CardHeader className="space-y-2 px-6 pb-6 pt-8 text-center sm:px-10 sm:pt-10">
            <CardTitle className="text-3xl text-primary">Create Your Business Account</CardTitle>
            <CardDescription className="text-sm sm:text-base">
              Join SeatPing and transform your business
            </CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-8 sm:px-10 sm:pb-10">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="businessName">Business Name</Label>
                <Input
                  id="businessName"
                  name="businessName"
                  className="h-11"
                  value={formData.businessName}
                  onChange={handleChange}
                  required
                />
                {errors.businessName && (
                  <p className="text-sm text-destructive">{errors.businessName}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="businessUsername">Business Username</Label>
                <Input
                  id="businessUsername"
                  name="businessUsername"
                  className="h-11"
                  value={formData.businessUsername}
                  onChange={handleChange}
                  required
                />
                {errors.businessUsername && (
                  <p className="text-sm text-destructive">{errors.businessUsername}</p>
                )}
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
                <Label htmlFor="phone">Phone Number</Label>
                <div className="flex gap-2">
                  <CountryCodeSelect
                    className="h-11"
                    value={formData.countryCode}
                    onChange={(dial) => setFormData((p) => ({ ...p, countryCode: dial }))}
                  />
                  <PhoneNumberInput
                    id="phone"
                    name="phone"
                    countryCode={formData.countryCode}
                    value={formData.phone}
                    onValueChange={(phone) => {
                      setFormData((prev) => ({ ...prev, phone }));
                      if (errors.phone) {
                        setErrors((p) => ({ ...p, phone: "" }));
                      }
                    }}
                    required
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
                Already have a business account?{" "}
                <Link to="/business/login" className="text-primary hover:underline">
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

export default BusinessSignup;
