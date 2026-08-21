import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { CountryCodeSelect } from "@/components/CountryCodeSelect";
import { Users, CalendarDays, Bell } from "lucide-react";
import { PhoneNumberInput } from "@/components/PhoneNumberInput";

const FloatingStat = ({
  icon,
  title,
  detail,
  className = "",
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  className?: string;
}) => (
  <div
    className={`flex max-w-[280px] items-center gap-3 rounded-xl border border-white/15 bg-white/10 px-4 py-3 shadow-xl backdrop-blur-md ${className}`}
  >
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-indigo-500/20 text-indigo-200">
      {icon}
    </span>
    <div className="min-w-0">
      <p className="text-sm font-semibold leading-tight text-white">{title}</p>
      <p className="truncate text-xs text-white/70">{detail}</p>
    </div>
  </div>
);

const Sales = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    businessName: "",
    businessEmail: "",
    contactName: "",
    phone: "",
    countryCode: "+1",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!formData.businessName.trim()) {
      next.businessName = "Business name is required";
    }
    if (!formData.businessEmail.trim()) {
      next.businessEmail = "Business email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.businessEmail.trim())) {
      next.businessEmail = "Enter a valid email";
    }
    if (!formData.contactName.trim()) {
      next.contactName = "Contact name is required";
    }
    if (!formData.phone.trim()) {
      next.phone = "Phone number is required";
    } else if (formData.phone.replace(/\D/g, "").length < 6) {
      next.phone = "Phone must be at least 6 digits";
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
      const response = await fetch("/api/sales/inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: formData.businessName.trim(),
          businessEmail: formData.businessEmail.trim(),
          contactName: formData.contactName.trim(),
          phoneNumber: `${formData.countryCode}${formData.phone.replace(/\D/g, "")}`,
        }),
      });
      const data = await response.json();

      if (response.ok) {
        toast({
          title: "Thanks! Our sales team will reach out.",
          description: "We've received your request and will be in touch soon.",
        });
        navigate("/");
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to submit your request. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error submitting sales inquiry:", error);
      toast({
        title: "Error",
        description: "Failed to submit your request. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  let businessNameErrorClass: string;
  if (errors.businessName) {
    businessNameErrorClass = "border-destructive";
  } else {
    businessNameErrorClass = "";
  }
  let businessEmailErrorClass: string;
  if (errors.businessEmail) {
    businessEmailErrorClass = "border-destructive";
  } else {
    businessEmailErrorClass = "";
  }
  let contactNameErrorClass: string;
  if (errors.contactName) {
    contactNameErrorClass = "border-destructive";
  } else {
    contactNameErrorClass = "";
  }
  let phoneErrorClass: string;
  if (errors.phone) {
    phoneErrorClass = "border-destructive";
  } else {
    phoneErrorClass = "";
  }
  let submitLabel: string;
  if (submitting) {
    submitLabel = "Sending...";
  } else {
    submitLabel = "Request A Demo";
  }

  return (
    <>
      <Header />

      <main className="bg-gradient-to-br from-slate-50 via-white to-indigo-50/70 px-4 pb-12 pt-24 sm:pb-16 sm:pt-28">
        <div className="mx-auto grid w-full max-w-6xl gap-10 lg:grid-cols-2 lg:items-stretch lg:gap-14">
          <div className="mx-auto w-full max-w-xl lg:mx-0">
            <h1
              className="text-4xl sm:text-5xl font-semibold leading-tight text-slate-900"
              aria-label="Manage Guest Flow In Seconds"
            >
              Manage Guest Flow In{" "}
              <span className="relative inline-block whitespace-nowrap text-slate-400">
                Minutes
                <svg
                  aria-hidden="true"
                  viewBox="0 0 120 16"
                  preserveAspectRatio="none"
                  className="pointer-events-none absolute inset-x-0 top-[62%] h-[0.55em] w-full -translate-y-1/2 text-indigo-500"
                >
                  <path
                    d="M3 9 C 28 3, 46 14, 66 7 S 100 3, 117 9"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
              </span>{" "}
              <span className="text-indigo-600">Seconds</span>
            </h1>
            <p className="mt-4 text-base sm:text-lg text-slate-600">
              Tell us about your business and we'll get back to you with the best SeatPing setup for
              your locations.
            </p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="businessName">Business Name</Label>
                <Input
                  id="businessName"
                  name="businessName"
                  placeholder="SeatPing Café Group"
                  value={formData.businessName}
                  onChange={handleChange}
                  className={`h-11 placeholder:text-sm sm:placeholder:text-base ${
                    businessNameErrorClass
                  }`}
                  required
                />
                {errors.businessName && (
                  <p className="text-sm text-destructive">{errors.businessName}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="businessEmail">Business Email</Label>
                <Input
                  id="businessEmail"
                  name="businessEmail"
                  type="email"
                  placeholder="you@company.com"
                  value={formData.businessEmail}
                  onChange={handleChange}
                  className={`h-11 placeholder:text-sm sm:placeholder:text-base ${
                    businessEmailErrorClass
                  }`}
                  required
                />
                {errors.businessEmail && (
                  <p className="text-sm text-destructive">{errors.businessEmail}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="contactName">Contact Name</Label>
                <Input
                  id="contactName"
                  name="contactName"
                  placeholder="Jane Doe"
                  value={formData.contactName}
                  onChange={handleChange}
                  className={`h-11 placeholder:text-sm sm:placeholder:text-base ${
                    contactNameErrorClass
                  }`}
                  required
                />
                {errors.contactName && (
                  <p className="text-sm text-destructive">{errors.contactName}</p>
                )}
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
                    className={`h-11 flex-1 placeholder:text-sm sm:placeholder:text-base ${
                      phoneErrorClass
                    }`}
                    required
                  />
                </div>
                {errors.phone && <p className="text-sm text-destructive">{errors.phone}</p>}
              </div>

              <Button type="submit" className="h-11 w-full text-base" disabled={submitting}>
                {submitLabel}
              </Button>
            </form>
          </div>

          <div className="hidden lg:block">
            <div className="relative flex h-full min-h-[480px] flex-col justify-between overflow-hidden rounded-3xl bg-slate-900 p-8 text-white shadow-2xl">
              <img
                src="https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1100&q=80"
                alt=""
                aria-hidden="true"
                loading="lazy"
                className="pointer-events-none absolute inset-0 h-full w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-slate-950/90 via-slate-900/80 to-primary/60" />

              <div className="relative z-10 mb-8 space-y-3">
                <FloatingStat
                  icon={<Users className="h-5 w-5" />}
                  title="Queue"
                  detail="3 Guests Waiting"
                  className="ml-0"
                />
                <FloatingStat
                  icon={<CalendarDays className="h-5 w-5" />}
                  title="Reservations"
                  detail="12 Booked Today"
                  className="ml-10"
                />
                <FloatingStat
                  icon={<Bell className="h-5 w-5" />}
                  title="Guest Notifications"
                  detail="SMS · WhatsApp · Email"
                  className="ml-4"
                />
              </div>

              <div className="relative z-10">
                <p className="text-xl font-medium leading-snug sm:text-2xl">
                  SeatPing helps restaurants manage queues, reservations, and guest communication
                  from one simple dashboard.
                </p>
                <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-white/60">
                  Built for restaurants, cafes, and service businesses
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
};

export default Sales;
