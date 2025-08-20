import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";

const Queue = () => {
  const [formData, setFormData] = useState({
    businessUsername: "",
    firstName: "",
    lastName: "",
    phoneNumber: "",
  });
  const [isSubmitted, setIsSubmitted] = useState(false);
  const { toast } = useToast();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Simulate joining queue - in real app, this would add to queue and send notifications
    toast({
      title: "Successfully joined the queue!",
      description: "You'll receive a text when it's your turn.",
    });
    
    setIsSubmitted(true);
  };

  const handleJoinAnother = () => {
    setIsSubmitted(false);
    setFormData({
      businessUsername: "",
      firstName: "",
      lastName: "",
      phoneNumber: "",
    });
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-success/5 via-background to-primary/5 px-4">
        <Card className="w-full max-w-md shadow-2xl border-0 bg-card/80 backdrop-blur-sm text-center">
          <CardHeader>
            <div className="mx-auto w-16 h-16 bg-gradient-to-r from-success to-success-glow rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <CardTitle className="text-2xl text-success">You're in the queue!</CardTitle>
            <CardDescription>
              We'll text you at {formData.phoneNumber} when it's your turn.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground mb-2">Queue Details</p>
              <p><strong>Business:</strong> {formData.businessUsername}</p>
              <p><strong>Name:</strong> {formData.firstName} {formData.lastName}</p>
              <p><strong>Estimated wait:</strong> 15-20 minutes</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleJoinAnother} variant="outline" className="flex-1">
                Join Another Queue
              </Button>
              <Button asChild variant="ghost" className="flex-1">
                <Link to="/">Go Home</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-success/5 px-4">
      <Card className="w-full max-w-md shadow-2xl border-0 bg-card/80 backdrop-blur-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl bg-gradient-to-r from-primary to-success bg-clip-text text-transparent">
            Join the Queue
          </CardTitle>
          <CardDescription>
            Enter your details to get in line
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="businessUsername">Business Username</Label>
              <Input
                id="businessUsername"
                name="businessUsername"
                placeholder="e.g., maxbarbershop"
                value={formData.businessUsername}
                onChange={handleChange}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  name="firstName"
                  placeholder="John"
                  value={formData.firstName}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  name="lastName"
                  placeholder="Doe"
                  value={formData.lastName}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phoneNumber">Phone Number</Label>
              <Input
                id="phoneNumber"
                name="phoneNumber"
                type="tel"
                placeholder="(555) 123-4567"
                value={formData.phoneNumber}
                onChange={handleChange}
                required
              />
            </div>
            <Button type="submit" className="w-full" variant="success">
              Join Queue
            </Button>
          </form>
          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground">
              Business owner?{" "}
              <Link to="/signup" className="text-primary hover:underline">
                Create your account
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Queue;