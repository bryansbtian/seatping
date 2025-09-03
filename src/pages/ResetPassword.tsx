import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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

  useEffect(() => {
    if (!token) {
      toast({
        title: "Invalid Reset Link",
        description: "This password reset link is invalid.",
        variant: "destructive",
      });
      navigate("/forgot");
    }
  }, [token, navigate, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Clear previous errors
    setErrors({ newPassword: "", confirmPassword: "" });
    
    // Validation
    if (!newPassword.trim()) {
      setErrors(prev => ({ ...prev, newPassword: "New password is required" }));
      return;
    }
    
    if (newPassword.length < 8) {
      setErrors(prev => ({ ...prev, newPassword: "Password must be at least 8 characters" }));
      return;
    }
    
    if (newPassword !== confirmPassword) {
      setErrors(prev => ({ ...prev, confirmPassword: "Passwords don't match" }));
      return;
    }

    try {
      setLoading(true);
      await api("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ 
          token, 
          newPassword: newPassword.trim() 
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
        <Header />
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-success/5 px-4">
          <Card className="w-full max-w-md shadow-2xl border-0 bg-card/80 backdrop-blur-sm">
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <CardTitle className="text-2xl bg-gradient-to-r from-primary to-success bg-clip-text text-transparent">
                Password Reset Complete!
              </CardTitle>
              <CardDescription>
                Your password has been successfully updated.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center space-y-4">
                <p className="text-sm text-muted-foreground">
                  You can now log in to your account using your new password.
                </p>
              </div>
              
              <Button asChild className="w-full">
                <Link to="/login">
                  Continue to Login
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
        <Footer />
      </>
    );
  }

  if (!token) {
    return null; // Will redirect in useEffect
  }

  return (
    <>
      <Header />
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-success/5 px-4">
        <Card className="w-full max-w-md shadow-2xl border-0 bg-card/80 backdrop-blur-sm">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
              <Lock className="w-8 h-8 text-blue-600" />
            </div>
            <CardTitle className="text-2xl bg-gradient-to-r from-primary to-success bg-clip-text text-transparent">
              Reset Your Password
            </CardTitle>
            <CardDescription>
              Enter your new password below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter your new password"
                  required
                />
                {errors.newPassword && (
                  <p className="text-sm text-destructive">
                    {errors.newPassword}
                  </p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your new password"
                  required
                />
                {errors.confirmPassword && (
                  <p className="text-sm text-destructive">
                    {errors.confirmPassword}
                  </p>
                )}
              </div>
              
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Updating..." : "Update Password"}
              </Button>
            </form>
            
            <div className="mt-6 text-center">
              <Button asChild variant="link" className="text-muted-foreground">
                <Link to="/login">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Login
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
      <Footer />
    </>
  );
};

export default ResetPassword;
