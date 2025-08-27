import { useState } from "react";
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
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";

const Queue = () => {
  const [businessUsername, setBusinessUsername] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleNext = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = businessUsername.trim().replace(/^@/, "");
    if (!clean) {
      setError("Business username is required");
      return;
    }
    try {
      const check = await api(
        `/auth/exists?username=${encodeURIComponent(clean)}`
      );
      if (!check?.exists) {
        setError("That business username does not exist");
        return;
      }
      navigate(`/queue/${clean}`);
    } catch (err: any) {
      setError(err?.message || "Unable to verify business username");
    }
  };

  return (
    <>
      <Header />
      <div className="min-h-screen pt-28 pb-16 flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-success/5 px-4">
        <Card className="w-full max-w-md shadow-2xl border-0 bg-card/80 backdrop-blur-sm">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl bg-gradient-to-r from-primary to-success bg-clip-text text-transparent">
              Join the Queue
            </CardTitle>
            <CardDescription>
              Enter the business username to continue
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleNext} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="businessUsername">Business Username</Label>
                <Input
                  id="businessUsername"
                  name="businessUsername"
                  placeholder="e.g., maxbarbershop"
                  value={businessUsername}
                  onChange={(e) => {
                    setBusinessUsername(e.target.value);
                    if (error) setError("");
                  }}
                  className={
                    error ? "border-destructive focus:ring-destructive" : ""
                  }
                  required
                />
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>

              <Button type="submit" className="w-full" variant="default">
                Next
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
      <Footer />
    </>
  );
};

export default Queue;
