import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MAX_MESSAGE = 1200;

const Feedback = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    businessName: "",
    phone: "",
    feedbackType: "bug", // bug | feature | ux | billing | other
    subject: "",
    message: "",
    allowContact: false, // must be checked to submit
    severity: "medium", // low | medium | high (for bug/issue)
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const isIssue = useMemo(
    () => ["bug", "ux", "billing"].includes(formData.feedbackType),
    [formData.feedbackType]
  );

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type, checked } = e.target as HTMLInputElement;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handleTypeChange = (value: string) => {
    setFormData((prev) => ({ ...prev, feedbackType: value }));
    if (errors["feedbackType"])
      setErrors((prev) => ({ ...prev, feedbackType: "" }));
  };

  const handleSeverityChange = (value: string) => {
    setFormData((prev) => ({ ...prev, severity: value }));
  };

  const validate = () => {
    const next: Record<string, string> = {};

    if (!formData.subject.trim()) next.subject = "Subject is required";
    if (!formData.message.trim())
      next.message = "Please describe your feedback";
    if (formData.message.length > MAX_MESSAGE)
      next.message = `Message exceeds ${MAX_MESSAGE} characters`;
    if (!formData.email.trim()) next.email = "Email is required";
    if (
      formData.email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())
    ) {
      next.email = "Enter a valid email";
    }
    if (!formData.name.trim()) next.name = "Your name is required";
    if (isIssue && !formData.severity) next.severity = "Pick a severity";
    if (!formData.allowContact)
      next.allowContact = "Please allow us to contact you to follow up.";

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      const response = await fetch("/feedback/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (response.ok) {
        toast({
          title: "Thanks for your feedback!",
          description:
            "We've received your message and will get back to you if needed.",
        });
        navigate("/");
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to submit feedback. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error submitting feedback:", error);
      toast({
        title: "Error",
        description: "Failed to submit feedback. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <Header />

      {/* Page content */}
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-success/5 px-4 py-8 pt-24">
        <Card className="w-full max-w-2xl shadow-2xl border-0 bg-card/80 backdrop-blur-sm">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl bg-gradient-to-r from-primary to-success bg-clip-text text-transparent">
              Share Your Feedback
            </CardTitle>
            <CardDescription>
              Help us make SeatPing better for you and your guests
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Row: Type & (optional) Severity for issues */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="feedbackType">Feedback Type</Label>
                  <Select
                    value={formData.feedbackType}
                    onValueChange={handleTypeChange}
                  >
                    <SelectTrigger id="feedbackType">
                      <SelectValue placeholder="Choose a type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bug">
                        Bug / Something Broken
                      </SelectItem>
                      <SelectItem value="ux">UX / Usability Issue</SelectItem>
                      <SelectItem value="feature">Feature Request</SelectItem>
                      <SelectItem value="billing">Pricing / Billing</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.feedbackType && (
                    <p className="text-sm text-destructive">
                      {errors.feedbackType}
                    </p>
                  )}
                </div>

                {isIssue && (
                  <div className="space-y-2">
                    <Label htmlFor="severity">Severity</Label>
                    <Select
                      value={formData.severity}
                      onValueChange={handleSeverityChange}
                    >
                      <SelectTrigger id="severity">
                        <SelectValue placeholder="Select severity" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                    {errors.severity && (
                      <p className="text-sm text-destructive">
                        {errors.severity}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Subject */}
              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  name="subject"
                  placeholder="Short summary of your feedback"
                  value={formData.subject}
                  onChange={handleChange}
                  className={errors.subject ? "border-destructive" : ""}
                  required
                />
                {errors.subject && (
                  <p className="text-sm text-destructive">{errors.subject}</p>
                )}
              </div>

              {/* Message with counter */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="message">Message</Label>
                  <span
                    className={`text-xs ${
                      formData.message.length > MAX_MESSAGE
                        ? "text-destructive"
                        : "text-muted-foreground"
                    }`}
                  >
                    {formData.message.length}/{MAX_MESSAGE}
                  </span>
                </div>
                <Textarea
                  id="message"
                  name="message"
                  placeholder="Describe the issue, idea, or request. Include steps to reproduce if it's a bug."
                  value={formData.message}
                  onChange={handleChange}
                  className={`min-h-[140px] ${
                    errors.message ? "border-destructive" : ""
                  }`}
                  required
                />
                {errors.message && (
                  <p className="text-sm text-destructive">{errors.message}</p>
                )}
              </div>

              {/* Contact Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Your Name</Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder="Jane Doe"
                    value={formData.name}
                    onChange={handleChange}
                    className={errors.name ? "border-destructive" : ""}
                    required
                  />
                  {errors.name && (
                    <p className="text-sm text-destructive">{errors.name}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="you@company.com"
                    value={formData.email}
                    onChange={handleChange}
                    className={errors.email ? "border-destructive" : ""}
                    required
                  />
                  {errors.email && (
                    <p className="text-sm text-destructive">{errors.email}</p>
                  )}
                </div>
              </div>

              {/* Optional business + phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="businessName">Business (optional)</Label>
                  <Input
                    id="businessName"
                    name="businessName"
                    placeholder="SeatPing Café"
                    value={formData.businessName}
                    onChange={handleChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone (optional)</Label>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    placeholder="(555) 123-4567"
                    value={formData.phone}
                    onChange={handleChange}
                  />
                </div>
              </div>

              {/* Consent */}
              <div className="space-y-2">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    name="allowContact"
                    checked={formData.allowContact}
                    onChange={handleChange}
                    required
                    className="mt-1 h-4 w-4"
                    aria-invalid={!!errors.allowContact}
                    aria-describedby="allowContactHelp"
                  />
                  <span className="text-sm text-muted-foreground">
                    I'm okay with SeatPing contacting me about this feedback.
                  </span>
                </label>
                {errors.allowContact && (
                  <p id="allowContactHelp" className="text-sm text-destructive">
                    {errors.allowContact}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={!formData.allowContact}
              >
                Submit Feedback
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Footer />
    </>
  );
};

export default Feedback;
