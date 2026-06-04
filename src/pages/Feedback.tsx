import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  const [submitting, setSubmitting] = useState(false);

  const isIssue = useMemo(
    () => ["bug", "ux", "billing"].includes(formData.feedbackType),
    [formData.feedbackType],
  );

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
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

    setSubmitting(true);
    try {
      const response = await fetch("/api/feedback/submit", {
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
          description:
            data.error || "Failed to submit feedback. Please try again.",
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
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Header />

      {/* Two-column layout matching /sales: form on the left, dark support card
          on the right (stacks below the form on mobile). */}
      <main className="bg-gradient-to-br from-primary/5 via-background to-success/5 px-4 pb-12 pt-24 sm:pb-16 sm:pt-28">
        <div className="mx-auto grid w-full max-w-6xl gap-10 lg:grid-cols-2 lg:items-stretch lg:gap-14">
          {/* Left — visual support card (desktop only; hidden on mobile). */}
          <div className="hidden lg:block">
            <div className="relative flex h-full min-h-[480px] flex-col justify-end overflow-hidden rounded-3xl bg-slate-900 p-8 text-white shadow-2xl">
              {/* Hospitality / staff-workflow backdrop. The slate-900 base shows
                  through if the photo can't load, so the panel still looks
                  polished. */}
              <img
                src="https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=1100&q=80"
                alt=""
                aria-hidden="true"
                loading="lazy"
                className="pointer-events-none absolute inset-0 h-full w-full object-cover"
              />
              {/* Dark navy overlay for contrast + brand tint. */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-slate-950/90 via-slate-900/80 to-primary/60" />

              {/* Heading + body + supporting label */}
              <div className="relative z-10">
                <h2 className="text-2xl font-semibold leading-snug sm:text-[1.65rem]">
                  Help Us Improve SeatPing
                </h2>
                <p className="mt-4 text-base leading-relaxed text-white/80">
                  Share bugs, feature ideas, or workflow issues so we can make
                  queues, reservations, and guest communication smoother.
                </p>
                <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-white/60">
                  Built with feedback from real service businesses
                </p>
              </div>
            </div>
          </div>

          {/* Right — title + form */}
          <div className="mx-auto w-full max-w-2xl lg:mx-0 lg:max-w-none">
            <h1 className="text-3xl sm:text-4xl font-semibold leading-tight text-slate-900">
              Tell Us What We Can Improve
            </h1>
            <p className="mt-4 text-base sm:text-lg text-slate-600">
              Send feedback, report issues, or suggest features for SeatPing.
            </p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              {/* Row: Type & (optional) Severity for issues */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="feedbackType">Feedback Type</Label>
                  <Select
                    value={formData.feedbackType}
                    onValueChange={handleTypeChange}
                  >
                    <SelectTrigger id="feedbackType" className="h-11">
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
                      <SelectTrigger id="severity" className="h-11">
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
                  className={`h-11 placeholder:text-sm sm:placeholder:text-base ${
                    errors.subject ? "border-destructive" : ""
                  }`}
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
                  className={`min-h-[140px] placeholder:text-sm sm:placeholder:text-base ${
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
                    className={`h-11 placeholder:text-sm sm:placeholder:text-base ${
                      errors.name ? "border-destructive" : ""
                    }`}
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
                    className={`h-11 placeholder:text-sm sm:placeholder:text-base ${
                      errors.email ? "border-destructive" : ""
                    }`}
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
                  <Label htmlFor="businessName">Business (Optional)</Label>
                  <Input
                    id="businessName"
                    name="businessName"
                    placeholder="SeatPing Café"
                    value={formData.businessName}
                    onChange={handleChange}
                    className="h-11 placeholder:text-sm sm:placeholder:text-base"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone (Optional)</Label>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    placeholder="(555) 123-4567"
                    value={formData.phone}
                    onChange={handleChange}
                    className="h-11 placeholder:text-sm sm:placeholder:text-base"
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
                className="h-11 w-full text-base"
                disabled={!formData.allowContact || submitting}
              >
                {submitting ? "Sending..." : "Submit Feedback"}
              </Button>
            </form>
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
};

export default Feedback;
