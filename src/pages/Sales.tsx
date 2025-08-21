import { useState, useMemo } from "react";
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

const MAX_MESSAGE = 1400;

const Sales = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    businessName: "",
    businessWebsite: "",
    contactName: "",
    workEmail: "",
    phone: "",
    locations: "",
    smsPerMonth: "",
    customersPerDay: "",
    useCase: "restaurant", // restaurant | clinic | retail | salon | other
    budget: "mid", // low | mid | high | not_sure
    subject: "Custom Plan Inquiry",
    message: "",
    allowContact: false,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

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

  const handleSelect = (field: keyof typeof formData) => (value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field as string])
      setErrors((prev) => ({ ...prev, [field as string]: "" }));
  };

  const numericOk = useMemo(() => {
    const mayNum = (v: string) => v === "" || /^\d+$/.test(v);
    return (
      mayNum(formData.locations) &&
      mayNum(formData.smsPerMonth) &&
      mayNum(formData.customersPerDay)
    );
  }, [formData.locations, formData.smsPerMonth, formData.customersPerDay]);

  const validate = () => {
    const next: Record<string, string> = {};

    if (!formData.businessName.trim())
      next.businessName = "Business name is required";
    if (!formData.contactName.trim())
      next.contactName = "Contact name is required";
    if (!formData.workEmail.trim()) next.workEmail = "Work email is required";
    if (
      formData.workEmail &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.workEmail.trim())
    ) {
      next.workEmail = "Enter a valid email";
    }
    if (!numericOk) next.numeric = "Locations/SMS/Customers must be numbers";
    if (!formData.subject.trim()) next.subject = "Subject is required";
    if (!formData.message.trim()) next.message = "Please describe your needs";
    if (formData.message.length > MAX_MESSAGE)
      next.message = `Message exceeds ${MAX_MESSAGE} characters`;
    if (!formData.allowContact)
      next.allowContact = "Please allow us to contact you about this request.";

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    // TODO: POST to backend (e.g., /api/sales)
    // await fetch("/api/sales", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(formData) });

    toast({
      title: "Thanks! Our sales team will reach out.",
      description: "We've received your custom plan request.",
    });
    navigate("/");
  };

  return (
    <>
      <Header />

      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-success/5 px-4 py-8 pt-24">
        <Card className="w-full max-w-2xl shadow-2xl border-0 bg-card/80 backdrop-blur-sm">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl bg-gradient-to-r from-primary to-success bg-clip-text text-transparent">
              Contact Sales — Custom Plan
            </CardTitle>
            <CardDescription>
              Tell us what you need and we'll tailor SeatPing to your scale
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Company & Contact */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="businessName">Business Name</Label>
                  <Input
                    id="businessName"
                    name="businessName"
                    placeholder="SeatPing Café Group"
                    value={formData.businessName}
                    onChange={handleChange}
                    className={errors.businessName ? "border-destructive" : ""}
                    required
                  />
                  {errors.businessName && (
                    <p className="text-sm text-destructive">
                      {errors.businessName}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="businessWebsite">Website (optional)</Label>
                  <Input
                    id="businessWebsite"
                    name="businessWebsite"
                    placeholder="https://yourdomain.com"
                    value={formData.businessWebsite}
                    onChange={handleChange}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contactName">Contact Name</Label>
                  <Input
                    id="contactName"
                    name="contactName"
                    placeholder="Jane Doe"
                    value={formData.contactName}
                    onChange={handleChange}
                    className={errors.contactName ? "border-destructive" : ""}
                    required
                  />
                  {errors.contactName && (
                    <p className="text-sm text-destructive">
                      {errors.contactName}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="workEmail">Work Email</Label>
                  <Input
                    id="workEmail"
                    name="workEmail"
                    type="email"
                    placeholder="you@company.com"
                    value={formData.workEmail}
                    onChange={handleChange}
                    className={errors.workEmail ? "border-destructive" : ""}
                    required
                  />
                  {errors.workEmail && (
                    <p className="text-sm text-destructive">
                      {errors.workEmail}
                    </p>
                  )}
                </div>

                <div className="space-y-2 sm:col-span-2">
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

              {/* Requirements */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="locations">Locations (approx.)</Label>
                  <Input
                    id="locations"
                    name="locations"
                    inputMode="numeric"
                    placeholder="e.g., 10"
                    value={formData.locations}
                    onChange={handleChange}
                    className={errors.numeric ? "border-destructive" : ""}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="smsPerMonth">SMS / Month (approx.)</Label>
                  <Input
                    id="smsPerMonth"
                    name="smsPerMonth"
                    inputMode="numeric"
                    placeholder="e.g., 5000"
                    value={formData.smsPerMonth}
                    onChange={handleChange}
                    className={errors.numeric ? "border-destructive" : ""}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="customersPerDay">
                    Customers / Day (approx.)
                  </Label>
                  <Input
                    id="customersPerDay"
                    name="customersPerDay"
                    inputMode="numeric"
                    placeholder="e.g., 800"
                    value={formData.customersPerDay}
                    onChange={handleChange}
                    className={errors.numeric ? "border-destructive" : ""}
                  />
                </div>
              </div>

              {/* Use case & budget */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="useCase">Primary Use Case</Label>
                  <Select
                    value={formData.useCase}
                    onValueChange={handleSelect("useCase")}
                  >
                    <SelectTrigger id="useCase">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="restaurant">
                        Restaurant / F&amp;B
                      </SelectItem>
                      <SelectItem value="clinic">
                        Clinic / Healthcare
                      </SelectItem>
                      <SelectItem value="retail">Retail / Service</SelectItem>
                      <SelectItem value="salon">Salon / Beauty</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="budget">Budget Range</Label>
                  <Select
                    value={formData.budget}
                    onValueChange={handleSelect("budget")}
                  >
                    <SelectTrigger id="budget">
                      <SelectValue placeholder="Select range" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Entry</SelectItem>
                      <SelectItem value="mid">Mid</SelectItem>
                      <SelectItem value="high">Enterprise</SelectItem>
                      <SelectItem value="not_sure">Not Sure Yet</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Subject & Message */}
              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  name="subject"
                  placeholder="Custom Plan for 10+ locations"
                  value={formData.subject}
                  onChange={handleChange}
                  className={errors.subject ? "border-destructive" : ""}
                  required
                />
                {errors.subject && (
                  <p className="text-sm text-destructive">{errors.subject}</p>
                )}
              </div>

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
                  placeholder="Describe your rollout plan, integrations, reporting needs, and any SLAs or security requirements."
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
                    I'm okay with SeatPing contacting me about this custom plan
                    request.
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
                Contact Sales
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Footer />
    </>
  );
};

export default Sales;
