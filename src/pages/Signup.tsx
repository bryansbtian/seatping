import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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

const Signup = () => {
  const [formData, setFormData] = useState({
    businessName: "",
    businessUsername: "",
    email: "",
    phone: "",
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof typeof errors])
      setErrors((p) => ({ ...p, [name]: "" }));
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

    if (!formData.businessName)
      newErrors.businessName = "Business name is required";
    if (!formData.businessUsername)
      newErrors.businessUsername = "Business username is required";
    else if (formData.businessUsername.length < 3)
      newErrors.businessUsername = "Username must be at least 3 characters";
    if (!formData.email) newErrors.email = "Email is required";
    if (!formData.phone) newErrors.phone = "Phone number is required";
    else if (formData.phone.length < 6)
      newErrors.phone = "Phone must be at least 6 characters";
    if (!formData.password) newErrors.password = "Password is required";
    else if (formData.password.length < 8)
      newErrors.password = "Password must be at least 8 chars";
    if (!formData.confirmPassword)
      newErrors.confirmPassword = "Please confirm your password";
    if (
      formData.password &&
      formData.confirmPassword &&
      formData.password !== formData.confirmPassword
    ) {
      newErrors.confirmPassword = "Passwords don't match";
    }

    setErrors(newErrors);
    if (Object.values(newErrors).some(Boolean)) return;

    try {
      setLoading(true);
      // map fields to API payload - automatically assign Starter plan for free trial
      const payload = {
        name: formData.businessName,
        username: formData.businessUsername,
        email: formData.email,
        phone: formData.phone,
        password: formData.password,
        plan: "Starter", // Always Starter plan for free trial
      };
      const res = await api("/auth/signup", {
        method: "POST",
        body: JSON.stringify(payload),
      });

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

  return (
    <>
      <Header />
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-success/5 px-4 py-8 pt-24">
        <Card className="w-full max-w-md shadow-2xl border-0 bg-card/80 backdrop-blur-sm">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl bg-gradient-to-r from-primary to-success bg-clip-text text-transparent">
              Create Your Account
            </CardTitle>
            <CardDescription>
              Join SeatPing and transform your business
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Business Name */}
              <div className="space-y-2">
                <Label htmlFor="businessName">Business Name</Label>
                <Input
                  id="businessName"
                  name="businessName"
                  value={formData.businessName}
                  onChange={handleChange}
                  required
                />
                {errors.businessName && (
                  <p className="text-sm text-destructive">
                    {errors.businessName}
                  </p>
                )}
              </div>
              
              {/* Business Username */}
              <div className="space-y-2">
                <Label htmlFor="businessUsername">Business Username</Label>
                <Input
                  id="businessUsername"
                  name="businessUsername"
                  value={formData.businessUsername}
                  onChange={handleChange}
                  required
                />
                {errors.businessUsername && (
                  <p className="text-sm text-destructive">
                    {errors.businessUsername}
                  </p>
                )}
              </div>
              
              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                />
                {errors.email && (
                  <p className="text-sm text-destructive">{errors.email}</p>
                )}
              </div>
              
              {/* Phone */}
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={handleChange}
                  required
                />
                {errors.phone && (
                  <p className="text-sm text-destructive">{errors.phone}</p>
                )}
              </div>
              
              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                />
                {errors.password && (
                  <p className="text-sm text-destructive">
                    {errors.password}
                  </p>
                )}
              </div>
              
              {/* Confirm Password */}
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  required
                />
                {errors.confirmPassword && (
                  <p className="text-sm text-destructive">
                    {errors.confirmPassword}
                  </p>
                )}
              </div>



              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Creating..." : "Start Free Trial"}
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
