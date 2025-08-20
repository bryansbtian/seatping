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

const Signup = () => {
  const [formData, setFormData] = useState({
    businessName: "",
    businessUsername: "",
    address: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });

  const [errors, setErrors] = useState({
    businessName: "",
    businessUsername: "",
    address: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });

  const navigate = useNavigate();
  const { toast } = useToast();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    if (errors[name as keyof typeof errors]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors = {
      businessName: "",
      businessUsername: "",
      address: "",
      email: "",
      phone: "",
      password: "",
      confirmPassword: "",
    };

    if (!formData.businessName)
      newErrors.businessName = "Business name is required";
    if (!formData.businessUsername)
      newErrors.businessUsername = "Business username is required";
    if (!formData.address) newErrors.address = "Address is required";
    if (!formData.email) newErrors.email = "Email is required";
    if (!formData.phone) newErrors.phone = "Phone number is required";
    if (!formData.password) newErrors.password = "Password is required";
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

    const hasErrors = Object.values(newErrors).some((error) => error !== "");
    if (!hasErrors) {
      toast({
        title: "Account created successfully!",
        description: "Welcome to SeatPing. Setting up your dashboard...",
      });
      navigate("/dashboard");
    }
  };

  return (
    <>
      <Header />

      {/* Page content */}
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
                  placeholder="Your business name"
                  value={formData.businessName}
                  onChange={handleChange}
                  className={
                    errors.businessName
                      ? "border-destructive focus:ring-destructive"
                      : ""
                  }
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
                  placeholder="Choose a username"
                  value={formData.businessUsername}
                  onChange={handleChange}
                  className={
                    errors.businessUsername
                      ? "border-destructive focus:ring-destructive"
                      : ""
                  }
                  required
                />
                {errors.businessUsername && (
                  <p className="text-sm text-destructive">
                    {errors.businessUsername}
                  </p>
                )}
              </div>

              {/* Address (map selection) */}
              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  name="address"
                  placeholder="Select from map"
                  value={formData.address}
                  onChange={handleChange}
                  className={
                    errors.address
                      ? "border-destructive focus:ring-destructive"
                      : ""
                  }
                  required
                />
                {errors.address && (
                  <p className="text-sm text-destructive">{errors.address}</p>
                )}
                {/* Placeholder for map widget */}
                <div className="mt-2 h-40 w-full rounded-md border bg-muted flex items-center justify-center text-muted-foreground">
                  [ Map integration here ]
                </div>
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="your@email.com"
                  value={formData.email}
                  onChange={handleChange}
                  className={
                    errors.email
                      ? "border-destructive focus:ring-destructive"
                      : ""
                  }
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
                  placeholder="(555) 123-4567"
                  value={formData.phone}
                  onChange={handleChange}
                  className={
                    errors.phone
                      ? "border-destructive focus:ring-destructive"
                      : ""
                  }
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
                  placeholder="Create a strong password"
                  value={formData.password}
                  onChange={handleChange}
                  className={
                    errors.password
                      ? "border-destructive focus:ring-destructive"
                      : ""
                  }
                  required
                />
                {errors.password && (
                  <p className="text-sm text-destructive">{errors.password}</p>
                )}
              </div>

              {/* Confirm Password */}
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  placeholder="Confirm your password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  className={
                    errors.confirmPassword
                      ? "border-destructive focus:ring-destructive"
                      : ""
                  }
                  required
                />
                {errors.confirmPassword && (
                  <p className="text-sm text-destructive">
                    {errors.confirmPassword}
                  </p>
                )}
              </div>

              <Button type="submit" className="w-full">
                Create Account
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link to="/login" className="text-primary hover:underline">
                  Sign in
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default Signup;
