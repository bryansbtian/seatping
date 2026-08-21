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
import { PhoneNumberInput } from "@/components/PhoneNumberInput";

const MAX_MESSAGE = 1200;

const Feedback = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    businessName: "",
    phone: "",
    feedbackType: "bug",
    subject: "",
    message: "",
    allowContact: false,
    severity: "medium",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const isIssue = useMemo(
    () => ["bug", "ux", "billing"].includes(formData.feedbackType),
    [formData.feedbackType],
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type, checked } = e.target as HTMLInputElement;
    let fieldValue: string | boolean;
    if (type === "checkbox") {
      fieldValue = checked;
    } else {
      fieldValue = value;
    }
    setFormData((prev) => ({
      ...prev,
      [name]: fieldValue,
    }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handleTypeChange = (value: string) => {
    setFormData((prev) => ({ ...prev, feedbackType: value }));
    if (errors["feedbackType"]) {
      setErrors((prev) => ({ ...prev, feedbackType: "" }));
    }
  };

  const handleSeverityChange = (value: string) => {
    setFormData((prev) => ({ ...prev, severity: value }));
  };

  const validate = () => {
    const next: Record<string, string> = {};

    if (!formData.subject.trim()) {
      next.subject = "Subject is required";
    }
    if (!formData.message.trim()) {
      next.message = "Please describe your feedback";
    }
    if (formData.message.length > MAX_MESSAGE) {
      next.message = `Message exceeds ${MAX_MESSAGE} characters`;
    }
    if (!formData.email.trim()) {
      next.email = "Email is required";
    }
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      next.email = "Enter a valid email";
    }
    if (!formData.name.trim()) {
      next.name = "Your name is required";
    }
    if (isIssue && !formData.severity) {
      next.severity = "Pick a severity";
    }
    if (!formData.allowContact) {
      next.allowContact = "Please allow us to contact you to follow up.";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      return;
    }

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
          description: "We've received your message and will get back to you if needed.",
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
    } finally {
      setSubmitting(false);
    }
  };

  let subjectErrorClass: string;
  if (errors.subject) {
    subjectErrorClass = "border-destructive";
  } else {
    subjectErrorClass = "";
  }
  let messageCountClass: string;
  if (formData.message.length > MAX_MESSAGE) {
    messageCountClass = "text-destructive";
  } else {
    messageCountClass = "text-muted-foreground";
  }
  let messageErrorClass: string;
  if (errors.message) {
    messageErrorClass = "border-destructive";
  } else {
    messageErrorClass = "";
  }
  let nameErrorClass: string;
  if (errors.name) {
    nameErrorClass = "border-destructive";
  } else {
    nameErrorClass = "";
  }
  let emailErrorClass: string;
  if (errors.email) {
    emailErrorClass = "border-destructive";
  } else {
    emailErrorClass = "";
  }
  let submitLabel: string;
  if (submitting) {
    submitLabel = "Sending...";
  } else {
    submitLabel = "Submit Feedback";
  }

  return (
    <>
      <Header />

      <main className="bg-gradient-to-br from-primary/5 via-background to-success/5 px-4 pb-12 pt-24 sm:pb-16 sm:pt-28">
        <div className="mx-auto grid w-full max-w-6xl gap-10 lg:grid-cols-2 lg:items-stretch lg:gap-14">
          <div className="hidden lg:block">
            <div className="relative flex h-full min-h-[480px] flex-col justify-end overflow-hidden rounded-3xl bg-slate-900 p-8 text-white shadow-2xl">
              <img
                src="https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=1100&q=80"
                alt=""
                aria-hidden="true"
                loading="lazy"
                className="pointer-events-none absolute inset-0 h-full w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-slate-950/90 via-slate-900/80 to-primary/60" />

              <div className="relative z-10">
                <h2 className="text-2xl font-semibold leading-snug sm:text-[1.65rem]">
                  Help Us Improve SeatPing
                </h2>
                <p className="mt-4 text-base leading-relaxed text-white/80">
                  Share bugs, feature ideas, or workflow issues so we can make queues, reservations,
                  and guest communication smoother.
                </p>
                <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-white/60">
                  Built with feedback from real service businesses
                </p>
              </div>
            </div>
          </div>

          <div className="mx-auto w-full max-w-2xl lg:mx-0 lg:max-w-none">
            <h1 className="text-3xl sm:text-4xl font-semibold leading-tight text-slate-900">
              Tell Us What We Can Improve
            </h1>
            <p className="mt-4 text-base sm:text-lg text-slate-600">
              Send feedback, report issues, or suggest features for SeatPing.
            </p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="feedbackType">Feedback Type</Label>
                  <Select value={formData.feedbackType} onValueChange={handleTypeChange}>
                    <SelectTrigger id="feedbackType" className="h-11">
                      <SelectValue placeholder="Choose a type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bug">Bug / Something Broken</SelectItem>
                      <SelectItem value="ux">UX / Usability Issue</SelectItem>
                      <SelectItem value="feature">Feature Request</SelectItem>
                      <SelectItem value="billing">Pricing / Billing</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.feedbackType && (
                    <p className="text-sm text-destructive">{errors.feedbackType}</p>
                  )}
                </div>

                {isIssue && (
                  <div className="space-y-2">
                    <Label htmlFor="severity">Severity</Label>
                    <Select value={formData.severity} onValueChange={handleSeverityChange}>
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
                      <p className="text-sm text-destructive">{errors.severity}</p>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  name="subject"
                  placeholder="Short summary of your feedback"
                  value={formData.subject}
                  onChange={handleChange}
                  className={`h-11 placeholder:text-sm sm:placeholder:text-base ${
                    subjectErrorClass
                  }`}
                  required
                />
                {errors.subject && <p className="text-sm text-destructive">{errors.subject}</p>}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="message">Message</Label>
                  <span className={`text-xs ${messageCountClass}`}>
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
                    messageErrorClass
                  }`}
                  required
                />
                {errors.message && <p className="text-sm text-destructive">{errors.message}</p>}
              </div>

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
                      nameErrorClass
                    }`}
                    required
                  />
                  {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
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
                      emailErrorClass
                    }`}
                    required
                  />
                  {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
                </div>
              </div>

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
                  <PhoneNumberInput
                    id="phone"
                    name="phone"
                    countryCode="+1"
                    value={formData.phone}
                    onValueChange={(phone) => setFormData((prev) => ({ ...prev, phone }))}
                    className="h-11 placeholder:text-sm sm:placeholder:text-base"
                  />
                </div>
              </div>

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
                {submitLabel}
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
