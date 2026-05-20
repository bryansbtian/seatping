import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type CountryOption = { name: string; dial: string; flag: string };

const SMS_COUNTRIES: CountryOption[] = [
  { name: "United States", dial: "+1", flag: "🇺🇸" },
];

const WHATSAPP_COUNTRIES: CountryOption[] = [
  { name: "China", dial: "+86", flag: "🇨🇳" },
  { name: "Indonesia", dial: "+62", flag: "🇮🇩" },
  { name: "Japan", dial: "+81", flag: "🇯🇵" },
  { name: "Malaysia", dial: "+60", flag: "🇲🇾" },
  { name: "Philippines", dial: "+63", flag: "🇵🇭" },
  { name: "Singapore", dial: "+65", flag: "🇸🇬" },
  { name: "South Korea", dial: "+82", flag: "🇰🇷" },
  { name: "Taiwan", dial: "+886", flag: "🇹🇼" },
  { name: "United Kingdom", dial: "+44", flag: "🇬🇧" },
  { name: "United States", dial: "+1", flag: "🇺🇸" },
];

/** API call to get addresses for this business */
async function fetchAddressesForBusiness(
  username: string
): Promise<Array<{ address: string; businessName: string }>> {
  if (!username) return [];
  try {
    const response = await api(`/auth/business/${username}/addresses`);
    return response.addresses || [];
  } catch (error) {
    console.error("Failed to fetch addresses:", error);
    return [];
  }
}

type Step = 2 | 3 | 4 | 5;

export default function QueueBusiness() {
  const { businessUsername = "" } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>(2);

  const [addresses, setAddresses] = useState<
    Array<{ address: string; businessName: string }>
  >([]);
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [joiningQueue, setJoiningQueue] = useState(false);
  const [hasLeftQueue, setHasLeftQueue] = useState(false);

  const [form, setForm] = useState({
    address: "",
    firstName: "",
    lastName: "",
    numGuests: "1",
    phoneNumber: "", // required only when wait_anywhere with SMS/WhatsApp
    countryCode: "+1", // default to US
    email: "", // required when wait_anywhere with Email
    waitingPreference: "on_premises" as "on_premises" | "wait_anywhere",
    notificationMethod: "" as "" | "sms" | "email" | "whatsapp", // selected when wait_anywhere
    joinedAt: "", // Will be set when customer joins queue
    smsConsent: false, // required when wait_anywhere - transactional messages
    smsMarketingConsent: false, // optional - marketing messages
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [queueToken, setQueueToken] = useState<string | null>(null);
  const [whatsappCountryOpen, setWhatsappCountryOpen] = useState(false);
  const [smsCountryOpen, setSmsCountryOpen] = useState(false);

  const selectedWhatsappCountry = useMemo(
    () =>
      WHATSAPP_COUNTRIES.find((c) => c.dial === form.countryCode) ||
      WHATSAPP_COUNTRIES.find((c) => c.dial === "+1")!,
    [form.countryCode]
  );

  const selectedSmsCountry = useMemo(
    () =>
      SMS_COUNTRIES.find((c) => c.dial === form.countryCode) || SMS_COUNTRIES[0],
    [form.countryCode]
  );

  // Status placeholders
  const [peopleAhead, setPeopleAhead] = useState(3); // example: user is #4 initially
  const avgPerPersonMin = 5;
  const etaMinutes = useMemo(
    () => Math.max(peopleAhead, 0) * avgPerPersonMin,
    [peopleAhead]
  );
  const positionInLine = useMemo(() => peopleAhead + 1, [peopleAhead]);

  // Step 5 countdown (5 minutes)
  const [secondsLeft, setSecondsLeft] = useState(5 * 60);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  // Restore queue state from localStorage on mount
  useEffect(() => {
    if (!businessUsername) {
      navigate("/queue");
      return;
    }

    (async () => {
      setLoadingAddresses(true);
      try {
        const list = await fetchAddressesForBusiness(businessUsername);
        setAddresses(list);
        if (list.length > 0) {
          setBusinessName(list[0].businessName);
        } else {
          // No locations found for this business
          toast({
            title: "No locations found",
            description: "This business doesn't have any locations set up yet.",
            variant: "destructive",
          });
          navigate("/queue");
          return;
        }

        // Check for existing queue session in localStorage
        const storageKey = `queue_${businessUsername}`;
        const savedToken = localStorage.getItem(storageKey);

        if (savedToken) {
          // Restore queue state from backend using token
          try {
            const response = await api(
              `/auth/business/${businessUsername}/queue/token/${savedToken}/status`
            );

            if (response.customer && !response.removed) {
              // Restore customer data and show appropriate step
              setQueueToken(savedToken);
              setForm({
                address: response.address || response.customer.address || "",
                firstName: response.customer.firstName || "",
                lastName: response.customer.lastName || "",
                numGuests: String(response.customer.numGuests || 1),
                phoneNumber: response.customer.phoneNumber || "",
                countryCode: response.customer.countryCode || "+1",
                email: response.customer.email || "",
                waitingPreference:
                  response.customer.waitingPreference || "on_premises",
                notificationMethod: response.customer.notificationMethod || "",
                joinedAt: response.customer.joinedAt || "",
                smsConsent: response.customer.smsConsent || false,
                smsMarketingConsent:
                  response.customer.smsMarketingConsent || false,
              });
              setBusinessName(response.businessName || list[0].businessName);

              if (response.admitted) {
                setStep(5); // Customer admitted
                toast({
                  title: "Welcome back!",
                  description:
                    "You've been admitted. Please proceed to your turn.",
                });
              } else {
                setStep(4); // Still in queue
                setPeopleAhead(Math.max(0, (response.position || 1) - 1));
                toast({
                  title: "Queue restored",
                  description: "Your queue position has been restored.",
                });
              }
            } else if (response.removed) {
              // Queue session ended
              localStorage.removeItem(storageKey);
              toast({
                title: "Queue session ended",
                description:
                  response.message || "Your queue session has ended.",
                variant: "destructive",
              });
            }
          } catch (error) {
            // Token expired or invalid - clear it
            localStorage.removeItem(storageKey);
            console.log("Failed to restore queue state:", error);
          }
        }
      } catch (error) {
        toast({
          title: "Error loading business",
          description: "Failed to load business information. Please try again.",
          variant: "destructive",
        });
        navigate("/queue");
      } finally {
        setLoadingAddresses(false);
      }
    })();
  }, [businessUsername, navigate, toast]);

  // Check if customer has been admitted by the business - more frequent checking for real-time updates
  useEffect(() => {
    if (step !== 4 || hasLeftQueue) return; // Only check when on step 4 (Queue status) and haven't left

    // Use token-based status check if token exists, otherwise fall back to customerId
    const checkAdmissionStatus = async () => {
      try {
        let response;
        if (queueToken) {
          // Use token-based endpoint for better reliability
          response = await api(
            `/auth/business/${businessUsername}/queue/token/${queueToken}/status`
          );
        } else {
          // Fallback to customerId-based endpoint
          const customerId = `${form.firstName}${form.lastName}${form.joinedAt}`;
          if (!customerId || !form.joinedAt) return;
          response = await api(
            `/auth/business/${businessUsername}/queue/${customerId}/status`
          );
        }

        if (response.removed) {
          // Clear localStorage token
          const storageKey = `queue_${businessUsername}`;
          localStorage.removeItem(storageKey);

          // Check if customer left themselves or was removed by business
          if (response.status === "left") {
            // Customer left the queue themselves - this shouldn't happen here
            // since they should have already navigated away after clicking "Leave Queue"
            toast({
              title: "You left the queue",
              description: "You have left the queue.",
            });
          } else {
            // Customer has been removed from the queue by the business
            toast({
              title: "Removed from queue",
              description:
                "You have been removed from the queue by the business.",
              variant: "destructive",
            });
          }
          // Redirect back to queue selection after a short delay
          setTimeout(() => {
            navigate("/queue");
          }, 2000);
        } else if (response.admitted) {
          // Customer has been admitted by the business
          setStep(5);
          toast({
            title: "You've been admitted!",
            description:
              "The business has called you. Please proceed to your turn.",
          });
        } else if (response.position) {
          // Update position if it changed
          setPeopleAhead(Math.max(0, response.position - 1));
        }
      } catch (error) {
        // Silently handle errors - customer might not be found if they just joined
        console.log("Checking admission status...");
      }
    };

    // Check admission status every 2 seconds when on step 4 for real-time updates
    const interval = setInterval(checkAdmissionStatus, 2000);

    // Also check immediately
    checkAdmissionStatus();

    return () => clearInterval(interval);
  }, [
    step,
    businessUsername,
    form.firstName,
    form.lastName,
    form.joinedAt,
    queueToken,
    toast,
    hasLeftQueue,
    navigate,
  ]);

  // Start countdown for Step 5
  useEffect(() => {
    if (step !== 5) return;
    if (countdownRef.current) clearInterval(countdownRef.current);
    setSecondsLeft(5 * 60);
    countdownRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [step]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
    if (errors[name]) setErrors((p) => ({ ...p, [name]: "" }));
  };

  // Step 2 → Step 3
  const nextFromStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};
    if (!form.address) newErrors.address = "Location is required";
    if (!form.firstName) newErrors.firstName = "First name is required";
    if (!form.lastName) newErrors.lastName = "Last name is required";
    const numGuests = parseInt(form.numGuests);
    if (isNaN(numGuests) || numGuests < 1)
      newErrors.numGuests = "Number of guests must be at least 1";
    setErrors(newErrors);
    if (Object.keys(newErrors).length) return;
    setStep(3);
  };

  // Step 3 → Step 4
  const nextFromStep3 = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    // Validate notification method selection if wait_anywhere
    if (form.waitingPreference === "wait_anywhere" && !form.notificationMethod) {
      newErrors.notificationMethod = "Please select a notification method";
    }

    // Validate based on notification method
    if (form.waitingPreference === "wait_anywhere" && form.notificationMethod === "sms") {
      if (!form.phoneNumber) {
        newErrors.phoneNumber = "Phone number is required for SMS notifications";
      }
      if (!form.smsConsent) {
        newErrors.smsConsent =
          "You must agree to receive transactional text messages";
      }
      if (!form.smsMarketingConsent) {
        newErrors.smsMarketingConsent =
          "You must agree to receive marketing text messages";
      }
    }

    if (form.waitingPreference === "wait_anywhere" && form.notificationMethod === "whatsapp") {
      if (!form.phoneNumber) {
        newErrors.phoneNumber = "Phone number is required for WhatsApp notifications";
      }
    }

    if (form.waitingPreference === "wait_anywhere" && form.notificationMethod === "email") {
      if (!form.email) {
        newErrors.email = "Email address is required for email notifications";
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
        newErrors.email = "Please enter a valid email address";
      }
    }

    setErrors(newErrors);
    if (Object.keys(newErrors).length) return;

    setJoiningQueue(true);
    try {
      // Add customer to the queue in the database
      const response = await api(`/auth/business/${businessUsername}/queue`, {
        method: "POST",
        body: JSON.stringify({
          address: form.address,
          firstName: form.firstName,
          lastName: form.lastName,
          numGuests: parseInt(form.numGuests),
          phoneNumber: form.phoneNumber,
          countryCode: form.countryCode,
          email: form.email,
          waitingPreference: form.waitingPreference,
          notificationMethod: form.notificationMethod,
          smsConsent: form.smsConsent,
          smsMarketingConsent: form.smsMarketingConsent,
        }),
      });

      if (response.success) {
        // Set the joinedAt timestamp for admission status checking
        setForm((prev) => ({ ...prev, joinedAt: response.customer.joinedAt }));

        // Save queue token to localStorage for persistence
        const storageKey = `queue_${businessUsername}`;
        if (response.queueToken) {
          setQueueToken(response.queueToken);
          localStorage.setItem(storageKey, response.queueToken);
        }

        // Generate appropriate toast message based on notification method
        let toastDescription = "Stay nearby — we'll call your name on site.";
        if (form.waitingPreference === "wait_anywhere") {
          if (form.notificationMethod === "sms") {
            toastDescription = `We'll text you at ${form.countryCode} ${form.phoneNumber} when it's almost your turn.`;
          } else if (form.notificationMethod === "whatsapp") {
            toastDescription = `We'll message you on WhatsApp at ${form.countryCode} ${form.phoneNumber} when it's almost your turn.`;
          } else if (form.notificationMethod === "email") {
            toastDescription = `We'll email you at ${form.email} when it's your turn.`;
          }
        }

        toast({
          title: "You're in the queue!",
          description: toastDescription,
        });

        // Set the actual position from the database
        setPeopleAhead(Math.max(0, response.position - 1)); // people ahead = position - 1
        setStep(4);
      }
    } catch (error: any) {
      toast({
        title: "Failed to join queue",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setJoiningQueue(false);
    }
  };

  const leaveQueue = async () => {
    // Set flag to prevent status checking from running
    setHasLeftQueue(true);

    // Clear localStorage token
    const storageKey = `queue_${businessUsername}`;
    localStorage.removeItem(storageKey);

    if (!form.joinedAt) {
      // If customer hasn't joined queue yet, just navigate away
      toast({ title: "You left the queue" });
      navigate("/queue");
      return;
    }

    try {
      const customerId = `${form.firstName}${form.lastName}${form.joinedAt}`;

      // Call API to remove customer from queue
      await api(
        `/auth/business/${businessUsername}/queue/${customerId}/leave`,
        {
          method: "POST",
        }
      );

      toast({
        title: "You left the queue",
        description: "You have been removed from the queue.",
      });
      navigate("/queue");
    } catch (error: any) {
      console.error("Failed to leave queue:", error);
      toast({
        title: "Error leaving queue",
        description: error.message || "Please try again",
        variant: "destructive",
      });
      // Still navigate away even if API call fails
      navigate("/queue");
    }
  };

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  return (
    <>
      <Header />
      <div className="min-h-screen pt-28 pb-16 flex items-center justify-center bg-gradient-to-br from-success/5 via-background to-primary/5 px-4">
        <Card className="w-full max-w-xl shadow-2xl border-0 bg-card/80 backdrop-blur-sm">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl text-primary">
              {businessName || `@${businessUsername}`}
            </CardTitle>
            <CardDescription>
              {step === 2 && "Enter your details"}
              {step === 3 && "Choose how you want to wait"}
              {step === 4 && "Queue status"}
              {step === 5 && "It's your turn"}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {step === 2 && (
              <form onSubmit={nextFromStep2} className="space-y-4">
                {/* Address (no map) */}
                <div className="space-y-2">
                  <Label htmlFor="address">Location</Label>
                  <div className="relative">
                    <select
                      id="address"
                      name="address"
                      value={form.address}
                      onChange={handleChange}
                      className={`w-full appearance-none rounded-md border bg-background px-3 py-2 pr-10 text-sm ${
                        errors.address
                          ? "border-destructive focus:ring-destructive"
                          : ""
                      }`}
                      disabled={loadingAddresses}
                    >
                      <option value="" disabled>
                        {loadingAddresses
                          ? "Loading addresses..."
                          : "Select a Location"}
                      </option>
                      {addresses.map((a) => (
                        <option key={a.address} value={a.address}>
                          {a.businessName} - {a.address}
                        </option>
                      ))}
                    </select>
                    <svg
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </div>
                  {errors.address && (
                    <p className="text-sm text-destructive">{errors.address}</p>
                  )}
                </div>

                {/* Names */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      name="firstName"
                      placeholder="John"
                      value={form.firstName}
                      onChange={handleChange}
                      className={
                        errors.firstName
                          ? "border-destructive focus:ring-destructive"
                          : ""
                      }
                    />
                    {errors.firstName && (
                      <p className="text-sm text-destructive">
                        {errors.firstName}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      name="lastName"
                      placeholder="Doe"
                      value={form.lastName}
                      onChange={handleChange}
                      className={
                        errors.lastName
                          ? "border-destructive focus:ring-destructive"
                          : ""
                      }
                    />
                    {errors.lastName && (
                      <p className="text-sm text-destructive">
                        {errors.lastName}
                      </p>
                    )}
                  </div>
                </div>

                {/* Number of guests */}
                <div className="space-y-2">
                  <Label htmlFor="numGuests">Number of Guests</Label>
                  <Input
                    id="numGuests"
                    name="numGuests"
                    type="text"
                    placeholder="1"
                    value={form.numGuests}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        numGuests: e.target.value,
                      }))
                    }
                    className={
                      errors.numGuests
                        ? "border-destructive focus:ring-destructive"
                        : ""
                    }
                  />
                  {errors.numGuests && (
                    <p className="text-sm text-destructive">
                      {errors.numGuests}
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => navigate("/queue")}
                  >
                    Back
                  </Button>
                  <Button type="submit" className="flex-1">
                    Next
                  </Button>
                </div>
              </form>
            )}

            {step === 3 && (
              <form onSubmit={nextFromStep3} className="space-y-4">
                {/* Preference */}
                <div className="space-y-2">
                  <Label>Waiting Preference</Label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setForm((p) => ({
                          ...p,
                          waitingPreference: "on_premises",
                        }))
                      }
                      className={`rounded-lg border px-4 py-3 text-left transition ${
                        form.waitingPreference === "on_premises"
                          ? "border-primary ring-2 ring-primary/30"
                          : "hover:bg-muted"
                      }`}
                    >
                      <div className="font-medium">Stay on Premises</div>
                      <div className="text-sm text-muted-foreground">
                        <em>“Hang tight—your spot's coming up fast.”</em>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setForm((p) => ({
                          ...p,
                          waitingPreference: "wait_anywhere",
                        }))
                      }
                      className={`rounded-lg border px-4 py-3 text-left transition ${
                        form.waitingPreference === "wait_anywhere"
                          ? "border-primary ring-2 ring-primary/30"
                          : "hover:bg-muted"
                      }`}
                    >
                      <div className="font-medium">Wait Anywhere</div>
                      <div className="text-sm text-muted-foreground">
                        <em>
                          “Roam freely—we'll ping you when it's nearly your
                          turn.”
                        </em>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Notification method selection when Wait Anywhere */}
                {form.waitingPreference === "wait_anywhere" && (
                  <>
                    <div className="space-y-2">
                      <Label>How would you like to be notified?</Label>
                      <div className="grid grid-cols-1 gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            setForm((p) => ({
                              ...p,
                              notificationMethod: "sms",
                              countryCode: "+1",
                            }))
                          }
                          className={`rounded-lg border px-4 py-3 text-left transition ${
                            form.notificationMethod === "sms"
                              ? "border-primary ring-2 ring-primary/30"
                              : "hover:bg-muted"
                          }`}
                        >
                          <div className="font-medium">SMS</div>
                          <div className="text-sm text-muted-foreground">
                            Receive text message notifications
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setForm((p) => ({
                              ...p,
                              notificationMethod: "whatsapp",
                            }))
                          }
                          className={`rounded-lg border px-4 py-3 text-left transition ${
                            form.notificationMethod === "whatsapp"
                              ? "border-primary ring-2 ring-primary/30"
                              : "hover:bg-muted"
                          }`}
                        >
                          <div className="font-medium">WhatsApp</div>
                          <div className="text-sm text-muted-foreground">
                            Receive WhatsApp queue notifications
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setForm((p) => ({
                              ...p,
                              notificationMethod: "email",
                            }))
                          }
                          className={`rounded-lg border px-4 py-3 text-left transition ${
                            form.notificationMethod === "email"
                              ? "border-primary ring-2 ring-primary/30"
                              : "hover:bg-muted"
                          }`}
                        >
                          <div className="font-medium">Email</div>
                          <div className="text-sm text-muted-foreground">
                            Receive email notifications
                          </div>
                        </button>
                      </div>
                      {errors.notificationMethod && (
                        <p className="text-sm text-destructive">
                          {errors.notificationMethod}
                        </p>
                      )}
                    </div>

                    {/* Phone number input for SMS */}
                    {form.notificationMethod === "sms" && (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="phoneNumber">Phone Number</Label>
                          <div className="flex gap-2">
                            <Popover
                              open={smsCountryOpen}
                              onOpenChange={setSmsCountryOpen}
                            >
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  role="combobox"
                                  aria-expanded={smsCountryOpen}
                                  className="flex h-10 w-32 items-center justify-between rounded-md border bg-background px-3 py-2 text-sm hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
                                >
                                  <span className="truncate">
                                    {selectedSmsCountry.flag}{" "}
                                    {selectedSmsCountry.dial}
                                  </span>
                                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-64 p-0" align="start">
                                <Command
                                  filter={(value, search) => {
                                    const term = search.toLowerCase().replace(/\+/g, "");
                                    return value.toLowerCase().includes(term) ? 1 : 0;
                                  }}
                                >
                                  <CommandInput placeholder="Search country or code..." />
                                  <CommandList>
                                    <CommandEmpty>No country found.</CommandEmpty>
                                    <CommandGroup>
                                      {SMS_COUNTRIES.map((c) => (
                                        <CommandItem
                                          key={c.dial}
                                          value={`${c.name} ${c.dial}`}
                                          onSelect={() => {
                                            setForm((p) => ({
                                              ...p,
                                              countryCode: c.dial,
                                            }));
                                            setSmsCountryOpen(false);
                                          }}
                                        >
                                          <Check
                                            className={cn(
                                              "mr-2 h-4 w-4",
                                              form.countryCode === c.dial
                                                ? "opacity-100"
                                                : "opacity-0"
                                            )}
                                          />
                                          <span className="mr-2">{c.flag}</span>
                                          <span className="flex-1">{c.name}</span>
                                          <span className="text-muted-foreground">
                                            {c.dial}
                                          </span>
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                            <Input
                              id="phoneNumber"
                              name="phoneNumber"
                              type="tel"
                              placeholder="5551234567"
                              value={form.phoneNumber}
                              onChange={handleChange}
                              className={
                                errors.phoneNumber
                                  ? "border-destructive focus:ring-destructive flex-1"
                                  : "flex-1"
                              }
                            />
                          </div>
                          {errors.phoneNumber && (
                            <p className="text-sm text-destructive">
                              {errors.phoneNumber}
                            </p>
                          )}
                        </div>

                        {/* SMS Consent Checkboxes */}
                        <div className="space-y-3">
                          <div className="flex items-start gap-2">
                            <Checkbox
                              id="smsConsent"
                              checked={form.smsConsent}
                              onCheckedChange={(checked) => {
                                setForm((p) => ({
                                  ...p,
                                  smsConsent: checked as boolean,
                                }));
                                if (errors.smsConsent)
                                  setErrors((p) => ({ ...p, smsConsent: "" }));
                              }}
                              className={cn(
                                errors.smsConsent ? "border-destructive" : "",
                                "mt-1.5 flex-shrink-0"
                              )}
                            />
                            <div className="flex-1">
                              <label
                                htmlFor="smsConsent"
                                className="text-sm leading-5 cursor-pointer"
                              >
                                By checking this box and submitting this form, you
                                consent to receive transactional text messages for
                                queue notifications from SeatPing. Reply STOP to opt
                                out. Reply HELP for help. Standard message and data
                                rates may apply. Message frequency may vary. View
                                our{" "}
                                <a href="/terms" className="underline text-primary">
                                  Terms and Conditions
                                </a>
                                . View our{" "}
                                <a
                                  href="/policy"
                                  className="underline text-primary"
                                >
                                  Privacy Policy
                                </a>
                                .
                              </label>
                              {errors.smsConsent && (
                                <p className="text-sm text-destructive mt-1">
                                  {errors.smsConsent}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-start gap-2">
                            <Checkbox
                              id="smsMarketingConsent"
                              checked={form.smsMarketingConsent}
                              onCheckedChange={(checked) => {
                                setForm((p) => ({
                                  ...p,
                                  smsMarketingConsent: checked as boolean,
                                }));
                                if (errors.smsMarketingConsent)
                                  setErrors((p) => ({
                                    ...p,
                                    smsMarketingConsent: "",
                                  }));
                              }}
                              className={cn(
                                errors.smsMarketingConsent
                                  ? "border-destructive"
                                  : "",
                                "mt-1.5 flex-shrink-0"
                              )}
                            />
                            <div className="flex-1">
                              <label
                                htmlFor="smsMarketingConsent"
                                className="text-sm leading-5 cursor-pointer"
                              >
                                By checking this box and submitting this form, you
                                consent to receive text messages for marketing from
                                SeatPing. Reply STOP to opt out. Reply HELP for
                                help. Message and data rates may apply. Message
                                frequency may vary. View our{" "}
                                <a href="/terms" className="underline text-primary">
                                  Terms and Conditions
                                </a>
                                . View our{" "}
                                <a
                                  href="/policy"
                                  className="underline text-primary"
                                >
                                  Privacy Policy
                                </a>
                                .
                              </label>
                              {errors.smsMarketingConsent && (
                                <p className="text-sm text-destructive mt-1">
                                  {errors.smsMarketingConsent}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                    {/* Phone number input for WhatsApp (no consent checkboxes) */}
                    {form.notificationMethod === "whatsapp" && (
                      <div className="space-y-2">
                        <Label htmlFor="whatsappPhoneNumber">Phone Number</Label>
                        <div className="flex gap-2">
                          <Popover
                            open={whatsappCountryOpen}
                            onOpenChange={setWhatsappCountryOpen}
                          >
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                role="combobox"
                                aria-expanded={whatsappCountryOpen}
                                className="flex h-10 w-32 items-center justify-between rounded-md border bg-background px-3 py-2 text-sm hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
                              >
                                <span className="truncate">
                                  {selectedWhatsappCountry.flag}{" "}
                                  {selectedWhatsappCountry.dial}
                                </span>
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-64 p-0" align="start">
                              <Command
                                filter={(value, search) => {
                                  const term = search.toLowerCase().replace(/\+/g, "");
                                  return value.toLowerCase().includes(term) ? 1 : 0;
                                }}
                              >
                                <CommandInput placeholder="Search country or code..." />
                                <CommandList>
                                  <CommandEmpty>No country found.</CommandEmpty>
                                  <CommandGroup>
                                    {WHATSAPP_COUNTRIES.map((c) => (
                                      <CommandItem
                                        key={c.dial}
                                        value={`${c.name} ${c.dial}`}
                                        onSelect={() => {
                                          setForm((p) => ({
                                            ...p,
                                            countryCode: c.dial,
                                          }));
                                          setWhatsappCountryOpen(false);
                                        }}
                                      >
                                        <Check
                                          className={cn(
                                            "mr-2 h-4 w-4",
                                            form.countryCode === c.dial
                                              ? "opacity-100"
                                              : "opacity-0"
                                          )}
                                        />
                                        <span className="mr-2">{c.flag}</span>
                                        <span className="flex-1">{c.name}</span>
                                        <span className="text-muted-foreground">
                                          {c.dial}
                                        </span>
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                          <Input
                            id="whatsappPhoneNumber"
                            name="phoneNumber"
                            type="tel"
                            placeholder="5551234567"
                            value={form.phoneNumber}
                            onChange={handleChange}
                            className={
                              errors.phoneNumber
                                ? "border-destructive focus:ring-destructive flex-1"
                                : "flex-1"
                            }
                          />
                        </div>
                        {errors.phoneNumber && (
                          <p className="text-sm text-destructive">
                            {errors.phoneNumber}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Email input for Email notification */}
                    {form.notificationMethod === "email" && (
                      <div className="space-y-2">
                        <Label htmlFor="email">Email Address</Label>
                        <Input
                          id="email"
                          name="email"
                          type="email"
                          placeholder="you@example.com"
                          value={form.email}
                          onChange={handleChange}
                          className={
                            errors.email
                              ? "border-destructive focus:ring-destructive"
                              : ""
                          }
                        />
                        {errors.email && (
                          <p className="text-sm text-destructive">
                            {errors.email}
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setStep(2)}
                  >
                    Back
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={joiningQueue}
                  >
                    {joiningQueue ? "Joining..." : "Next"}
                  </Button>
                </div>
              </form>
            )}

            {step === 4 && (
              <div className="space-y-5">
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground mb-2">
                    Queue Details
                  </p>
                  <p>
                    <strong>Business:</strong>{" "}
                    {businessName || `@${businessUsername}`}
                  </p>
                  <p>
                    <strong>Address:</strong> {form.address}
                  </p>
                  <p>
                    <strong>Name:</strong> {form.firstName} {form.lastName}
                  </p>
                  <p>
                    <strong>Guests:</strong> {parseInt(form.numGuests)}
                  </p>
                </div>

                {/* Line position text first */}
                <div className="text-center space-y-1">
                  <div className="text-xl font-semibold">
                    You are #{positionInLine} in line
                  </div>
                  <div className="text-sm text-muted-foreground">
                    There {peopleAhead === 1 ? "is" : "are"} {peopleAhead}{" "}
                    {peopleAhead === 1 ? "person" : "people"} ahead of you
                  </div>
                </div>

                {/* Cards below the text */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-lg border p-4 text-center">
                    <div className="text-sm text-muted-foreground">
                      Estimated Wait
                    </div>
                    <div className="text-3xl font-semibold">
                      {etaMinutes} min
                    </div>
                  </div>
                  <div className="rounded-lg border p-4 text-center">
                    <div className="text-sm text-muted-foreground">
                      Preference
                    </div>
                    <div className="text-lg font-medium">
                      {form.waitingPreference === "on_premises"
                        ? "Stay on Premises"
                        : "Wait Anywhere"}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={leaveQueue}
                  >
                    Leave Queue
                  </Button>
                </div>
              </div>
            )}

            {/* Step 5 content */}
            {step === 5 && (
              <div className="space-y-6 text-center">
                <div className="mx-auto w-16 h-16 rounded-full bg-primary flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-white"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <path
                      d="M12 6v6l4 2"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>

                <div className="space-y-2">
                  <div className="text-2xl font-semibold">It's your turn!</div>
                  <p className="text-muted-foreground">
                    Please arrive within{" "}
                    <span className="font-medium">
                      {mm}:{ss}
                    </span>
                    . Your spot will be held for 5 minutes.
                  </p>
                </div>

                <div className="p-4 bg-muted rounded-lg text-left">
                  <p className="text-sm text-muted-foreground mb-2">Details</p>
                  <p>
                    <strong>Business:</strong>{" "}
                    {businessName || `@${businessUsername}`}
                  </p>
                  <p>
                    <strong>Address:</strong> {form.address}
                  </p>
                  <p>
                    <strong>Name:</strong> {form.firstName} {form.lastName}
                  </p>
                  <p>
                    <strong>Guests:</strong> {parseInt(form.numGuests)}
                  </p>
                  <p>
                    <strong>Preference:</strong>{" "}
                    {form.waitingPreference === "on_premises"
                      ? "Stay on Premises"
                      : "Wait Anywhere"}
                  </p>
                </div>

                {secondsLeft === 0 && (
                  <p className="text-destructive text-sm">
                    Timer expired — your spot will be released.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <Footer />
    </>
  );
}
