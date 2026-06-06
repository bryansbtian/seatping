import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import NotFound from "@/pages/NotFound";
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
import { Check, ChevronsUpDown, Users } from "lucide-react";
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

type AddressOption = {
  id?: string;
  address: string;
  businessName: string;
  restaurantName?: string | null;
  displayName?: string | null;
  name?: string | null;
  area?: string | null;
  city?: string | null;
  country?: string | null;
  googleMapsUrl?: string | null;
};

/** API call to get addresses (locations) for this business. */
async function fetchAddressesForBusiness(
  username: string,
): Promise<AddressOption[]> {
  if (!username) return [];
  try {
    const response = await api(`/auth/business/${username}/addresses`);
    return response.addresses || [];
  } catch (error) {
    console.error("Failed to fetch addresses:", error);
    return [];
  }
}

/** Friendly label for a location, with safe fallbacks for legacy data. */
function locationLabel(loc: AddressOption | null): string {
  if (!loc) return "";
  return loc.displayName || loc.name || loc.address || "Location";
}

// Display label for a notification channel (SMS / WhatsApp / Email).
function notificationLabel(method?: string): string {
  switch (method) {
    case "sms":
      return "SMS";
    case "whatsapp":
      return "WhatsApp";
    case "email":
      return "Email";
    default:
      return "—";
  }
}

// Step 2 = join form, Step 4 = queue status, Step 5 = admitted (countdown),
// Step 6 = checked in (business confirmed arrival — terminal).
type Step = 2 | 4 | 5 | 6;

export default function QueueBusiness() {
  const { businessUsername = "", locationId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>(2);

  const [loadingAddresses, setLoadingAddresses] = useState(false);
  // The location the customer is joining. Comes from the QR code URL
  // (locationId) when present; otherwise from the legacy selector.
  const [selectedLocation, setSelectedLocation] =
    useState<AddressOption | null>(null);
  const [invalidLink, setInvalidLink] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [joiningQueue, setJoiningQueue] = useState(false);
  const [hasLeftQueue, setHasLeftQueue] = useState(false);

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    numGuests: "1",
    notificationMethod: "" as "" | "sms" | "whatsapp" | "email",
    phoneNumber: "",
    countryCode: "+1", // default to US
    email: "",
    joinedAt: "", // set when the customer joins the queue
    smsConsent: false, // required when SMS — transactional messages
    smsMarketingConsent: false, // optional — marketing messages
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [queueToken, setQueueToken] = useState<string | null>(null);
  const [whatsappCountryOpen, setWhatsappCountryOpen] = useState(false);
  const [smsCountryOpen, setSmsCountryOpen] = useState(false);

  // localStorage key for queue persistence — scoped to the location when known
  // so different locations of the same business don't collide.
  const storageKey = useMemo(
    () => `queue_${businessUsername}${locationId ? `_${locationId}` : ""}`,
    [businessUsername, locationId],
  );

  const selectedWhatsappCountry = useMemo(
    () =>
      WHATSAPP_COUNTRIES.find((c) => c.dial === form.countryCode) ||
      WHATSAPP_COUNTRIES.find((c) => c.dial === "+1")!,
    [form.countryCode],
  );

  const selectedSmsCountry = useMemo(
    () =>
      SMS_COUNTRIES.find((c) => c.dial === form.countryCode) ||
      SMS_COUNTRIES[0],
    [form.countryCode],
  );

  // Status placeholders
  const [peopleAhead, setPeopleAhead] = useState(3);
  const positionInLine = useMemo(() => peopleAhead + 1, [peopleAhead]);

  // Smart estimated wait — computed on the backend (see server/lib/queueEta.ts).
  const [eta, setEta] = useState<{
    displayText: string;
    estimatedWaitMin: number;
    estimatedWaitMax: number;
  } | null>(null);
  const [etaLoading, setEtaLoading] = useState(false);
  const [etaError, setEtaError] = useState(false);

  // Step 5 countdown (5 minutes). The hold window is anchored to the server's
  // `admittedAt` timestamp so it survives refreshes/reopens — once it elapses we
  // show an expired state instead of restarting the timer.
  const HOLD_SECONDS = 5 * 60;
  const [secondsLeft, setSecondsLeft] = useState(HOLD_SECONDS);
  const [admittedAt, setAdmittedAt] = useState<string | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  // The admitted hold has expired once the countdown anchored to admittedAt
  // reaches zero. On step 5 this drives the expired vs. active screen.
  const turnExpired = step === 5 && secondsLeft <= 0;

  // Load the business + location and restore any saved queue session on mount.
  useEffect(() => {
    if (!businessUsername) {
      navigate("/");
      return;
    }

    (async () => {
      setLoadingAddresses(true);
      try {
        const list = await fetchAddressesForBusiness(businessUsername);

        if (list.length === 0) {
          toast({
            title: "No Locations Found",
            description: "This business doesn't have any locations set up yet.",
            variant: "destructive",
          });
          navigate("/");
          return;
        }

        setBusinessName(list[0].businessName);

        // Resolve the target location from the QR/URL locationId. The location
        // must exist and belong to this business, or the link is invalid.
        const match = list.find((l) => l.id === locationId);
        if (!match) {
          setInvalidLink(true);
          return;
        }
        setSelectedLocation(match);

        // Restore a saved queue session. Prefer the device's localStorage token;
        // fall back to a `?token=` URL param (used by the profile's "View live
        // queue" link so the session restores on any device). Persist it so
        // subsequent polls/refreshes work without the query string.
        const urlToken = searchParams.get("token");
        const lsToken = localStorage.getItem(storageKey);
        // Prefer the device's stored token; fall back to an explicit ?token=
        // link (used by the profile's "View live queue" link so the session can
        // be restored on any device).
        const savedToken = lsToken || urlToken;
        // True when the customer arrived via an explicit token link rather than
        // a token already persisted on this device.
        const fromUrl = !!urlToken && savedToken === urlToken;
        if (savedToken) {
          try {
            const response = await api(
              `/auth/business/${businessUsername}/queue/token/${savedToken}/status`,
            );

            if (response.checkedIn) {
              // Arrival confirmed → this queue session is COMPLETE. A completed
              // ticket must never block rejoining, so always drop the
              // device-stored token. Only when the customer explicitly opened
              // the old token link do we still show the checked-in confirmation
              // for that past ticket; from the normal join page they simply see
              // the form and can queue again.
              localStorage.removeItem(storageKey);
              if (fromUrl) {
                setQueueToken(savedToken);
                setForm((prev) => ({
                  ...prev,
                  firstName: response.customer?.firstName || prev.firstName,
                  lastName: response.customer?.lastName || prev.lastName,
                  numGuests: String(
                    response.customer?.numGuests || prev.numGuests,
                  ),
                }));
                setBusinessName(response.businessName || list[0].businessName);
                setStep(6);
              }
            } else if (response.admitted && response.expired) {
              // The previous hold window has already passed. Drop the stale
              // session so this page just shows the join form and the customer
              // can queue again (e.g. the next day) at the same restaurant.
              localStorage.removeItem(storageKey);
            } else if (response.customer && !response.removed) {
              // Active session (waiting or admitted) — persist the token so a
              // refresh/reopen on this device restores the live state.
              localStorage.setItem(storageKey, savedToken);
              setQueueToken(savedToken);
              setForm((prev) => ({
                ...prev,
                firstName: response.customer.firstName || "",
                lastName: response.customer.lastName || "",
                numGuests: String(response.customer.numGuests || 1),
                phoneNumber: response.customer.phoneNumber || "",
                countryCode: response.customer.countryCode || "+1",
                email: response.customer.email || "",
                notificationMethod: response.customer.notificationMethod || "",
                joinedAt: response.customer.joinedAt || "",
                smsConsent: response.customer.smsConsent || false,
                smsMarketingConsent:
                  response.customer.smsMarketingConsent || false,
              }));
              setBusinessName(response.businessName || list[0].businessName);

              if (response.admitted) {
                setAdmittedAt(
                  response.admittedAt || response.customer?.admittedAt || null,
                );
                setStep(5);
                toast({
                  title: "Welcome Back!",
                  description:
                    "You've been admitted. Please proceed to your turn.",
                });
              } else {
                setStep(4);
                setPeopleAhead(Math.max(0, (response.position || 1) - 1));
                toast({
                  title: "Queue Restored",
                  description: "Your queue position has been restored.",
                });
              }
            } else if (response.removed) {
              localStorage.removeItem(storageKey);
              toast({
                title: "Queue Session Ended",
                description:
                  response.message || "Your queue session has ended.",
                variant: "destructive",
              });
            }
          } catch (error) {
            localStorage.removeItem(storageKey);
            console.log("Failed to restore queue state:", error);
          }
        }
      } catch (error) {
        toast({
          title: "Error Loading Business",
          description: "Failed to load business information. Please try again.",
          variant: "destructive",
        });
        navigate("/");
      } finally {
        setLoadingAddresses(false);
      }
    })();
  }, [businessUsername, locationId, storageKey, navigate, toast, searchParams]);

  // Prefill the join form from the logged-in customer's account (if any).
  // Guest / business sessions return 401 and are ignored. Only empty fields are
  // filled, so a restored queue session (above) is never overwritten.
  useEffect(() => {
    let cancelled = false;
    api("/auth/me")
      .then((d) => {
        if (cancelled || !d?.user) return;
        const full = String(d.user.name || "").trim();
        const sp = full.indexOf(" ");
        const first = sp === -1 ? full : full.slice(0, sp);
        const last = sp === -1 ? "" : full.slice(sp + 1);
        setForm((prev) => ({
          ...prev,
          firstName: prev.firstName || first,
          lastName: prev.lastName || last,
          email: prev.email || d.user.email || "",
        }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Poll for admission/removal while the customer is waiting (step 4) AND after
  // admission (step 5), so the page picks up the business confirming arrival
  // (-> checked-in) or marking a no-show without a manual refresh.
  useEffect(() => {
    if ((step !== 4 && step !== 5) || hasLeftQueue) return;

    const checkAdmissionStatus = async () => {
      try {
        let response: any;
        if (queueToken) {
          response = await api(
            `/auth/business/${businessUsername}/queue/token/${queueToken}/status`,
          );
        } else {
          const customerId = `${form.firstName}${form.lastName}${form.joinedAt}`;
          if (!customerId || !form.joinedAt) return;
          response = await api(
            `/auth/business/${businessUsername}/queue/${customerId}/status`,
          );
        }

        if (response.checkedIn) {
          // Business confirmed arrival → terminal checked-in screen. This
          // session is now complete, so clear the device-stored token: the
          // current screen stays (state is in memory) but a later reopen of the
          // join page won't restore this completed ticket and can queue again.
          localStorage.removeItem(storageKey);
          setStep(6);
          toast({
            title: "Arrival Confirmed",
            description:
              "You're all set. Please follow the host's instructions.",
          });
        } else if (response.removed) {
          localStorage.removeItem(storageKey);
          if (response.status === "no_show") {
            toast({
              title: "Marked as No-Show",
              description: "The restaurant marked this spot as a no-show.",
              variant: "destructive",
            });
          } else if (response.status === "left") {
            toast({
              title: "You Left the Queue",
              description: "You have left the queue.",
            });
          } else {
            toast({
              title: "Removed from Queue",
              description:
                "You have been removed from the queue by the business.",
              variant: "destructive",
            });
          }
          setTimeout(() => {
            navigate("/");
          }, 2000);
        } else if (response.admitted) {
          setAdmittedAt(
            response.admittedAt || response.customer?.admittedAt || null,
          );
          // Only announce the transition once (when coming from the waiting
          // screen); step 5 keeps polling, so guard against repeat toasts.
          if (step !== 5) {
            setStep(5);
            if (!response.expired) {
              toast({
                title: "You've Been Admitted!",
                description:
                  "The business has called you. Please proceed to your turn.",
              });
            }
          }
        } else if (response.position) {
          setPeopleAhead(Math.max(0, response.position - 1));
        }
      } catch (error) {
        console.log("Checking admission status...");
      }
    };

    const interval = setInterval(checkAdmissionStatus, 2000);
    checkAdmissionStatus();

    return () => clearInterval(interval);
  }, [
    step,
    businessUsername,
    form.firstName,
    form.lastName,
    form.joinedAt,
    queueToken,
    storageKey,
    toast,
    hasLeftQueue,
    navigate,
  ]);

  // Fetch the backend-computed ETA while waiting. Refreshes every 30s and
  // whenever the queue position changes (admit/remove/leave shifts the line).
  useEffect(() => {
    if (step !== 4 || !queueToken || !businessUsername) {
      setEta(null);
      setEtaError(false);
      return;
    }
    let cancelled = false;
    const fetchEta = async () => {
      setEtaLoading(true);
      try {
        const res = await api(
          `/auth/business/${businessUsername}/queue/token/${queueToken}/eta`,
        );
        if (!cancelled) {
          setEta(res.eta ?? null);
          setEtaError(false);
        }
      } catch {
        if (!cancelled) setEtaError(true);
      } finally {
        if (!cancelled) setEtaLoading(false);
      }
    };
    fetchEta();
    const id = setInterval(fetchEta, 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [step, queueToken, businessUsername, peopleAhead]);

  // Start countdown for Step 5. Remaining time is derived from the absolute
  // expiry (admittedAt + 5 min) on every tick, so a refresh or reopen continues
  // from the real remaining time and reads 0 once the window has already passed.
  useEffect(() => {
    if (step !== 5) return;
    if (countdownRef.current) clearInterval(countdownRef.current);

    const startMs = admittedAt ? new Date(admittedAt).getTime() : Date.now();
    const expiresMs = startMs + HOLD_SECONDS * 1000;
    const remaining = () =>
      Math.max(0, Math.ceil((expiresMs - Date.now()) / 1000));

    setSecondsLeft(remaining());
    if (remaining() <= 0) return; // Already expired — no ticking needed.

    countdownRef.current = setInterval(() => {
      const left = remaining();
      setSecondsLeft(left);
      if (left <= 0 && countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    }, 1000);
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [step, admittedAt]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
    if (errors[name]) setErrors((p) => ({ ...p, [name]: "" }));
  };

  // Submit the join form → Step 4.
  const joinQueue = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!selectedLocation) newErrors.location = "Please select a location";
    if (!form.firstName.trim()) newErrors.firstName = "First name is required";
    if (!form.lastName.trim()) newErrors.lastName = "Last name is required";
    const numGuests = parseInt(form.numGuests);
    if (isNaN(numGuests) || numGuests < 1)
      newErrors.numGuests = "Number of guests must be at least 1";

    if (!form.notificationMethod) {
      newErrors.notificationMethod = "Please choose how we should notify you";
    } else if (form.notificationMethod === "sms") {
      if (!form.phoneNumber.trim()) {
        newErrors.phoneNumber =
          "Phone number is required for SMS notifications";
      }
      if (!form.smsConsent) {
        newErrors.smsConsent =
          "You must agree to receive transactional text messages";
      }
    } else if (form.notificationMethod === "whatsapp") {
      if (!form.phoneNumber.trim()) {
        newErrors.phoneNumber =
          "Phone number is required for WhatsApp notifications";
      }
    } else if (form.notificationMethod === "email") {
      if (!form.email.trim()) {
        newErrors.email = "Email address is required for email notifications";
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
        newErrors.email = "Please enter a valid email address";
      }
    }

    setErrors(newErrors);
    if (Object.keys(newErrors).length) return;

    setJoiningQueue(true);
    try {
      const response = await api(`/auth/business/${businessUsername}/queue`, {
        method: "POST",
        body: JSON.stringify({
          locationId: selectedLocation?.id,
          address: selectedLocation?.address,
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          numGuests,
          phoneNumber: form.phoneNumber,
          countryCode: form.countryCode,
          email: form.email,
          notificationMethod: form.notificationMethod,
          smsConsent: form.smsConsent,
          smsMarketingConsent: form.smsMarketingConsent,
        }),
      });

      if (response.success) {
        setForm((prev) => ({ ...prev, joinedAt: response.customer.joinedAt }));

        if (response.queueToken) {
          setQueueToken(response.queueToken);
          localStorage.setItem(storageKey, response.queueToken);
        }

        let toastDescription: ReactNode =
          "We'll let you know when it's your turn.";
        if (form.notificationMethod === "sms") {
          toastDescription = `We'll text you at ${form.countryCode} ${form.phoneNumber} when it's your turn.`;
        } else if (form.notificationMethod === "whatsapp") {
          toastDescription = `We'll message you on WhatsApp at ${form.countryCode} ${form.phoneNumber} when it's your turn.`;
        } else if (form.notificationMethod === "email") {
          // The email is wrapped in `normal-case` so the toast's title-case
          // styling doesn't capitalize it — show the address exactly as typed.
          toastDescription = (
            <>
              We'll email you at{" "}
              <span className="normal-case lowercase">
                {form.email.toLowerCase()}
              </span>{" "}
              when it's your turn.
            </>
          );
        }

        toast({
          title: "You're in the Queue!",
          description: toastDescription,
        });

        setPeopleAhead(Math.max(0, response.position - 1));
        setStep(4);
      }
    } catch (error: any) {
      toast({
        title: "Failed to Join Queue",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setJoiningQueue(false);
    }
  };

  const leaveQueue = async () => {
    setHasLeftQueue(true);
    localStorage.removeItem(storageKey);

    if (!form.joinedAt) {
      toast({ title: "You Left the Queue" });
      navigate("/");
      return;
    }

    try {
      const customerId = `${form.firstName}${form.lastName}${form.joinedAt}`;
      await api(
        `/auth/business/${businessUsername}/queue/${customerId}/leave`,
        { method: "POST" },
      );
      toast({
        title: "You Left the Queue",
        description: "You have been removed from the queue.",
      });
      navigate("/");
    } catch (error: any) {
      console.error("Failed to leave queue:", error);
      toast({
        title: "Error Leaving Queue",
        description: error.message || "Please try again",
        variant: "destructive",
      });
      navigate("/");
    }
  };

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  // The location is fixed by the QR/URL — the customer can never change it.
  const selectedLabel = locationLabel(selectedLocation);
  // Public restaurant name for this location, falling back to the business name.
  const restaurantName =
    selectedLocation?.restaurantName || businessName || `@${businessUsername}`;

  // Invalid / expired QR link — treat it like any other dead link and show
  // the standard 404 page instead of a bespoke "Queue Link Unavailable" card.
  if (invalidLink) {
    return <NotFound />;
  }

  return (
    <>
      <Header />
      {/* Full-height flex column: fixed header overlaid on top (pt-* on <main>
          clears it), card centered in the remaining space, footer at the bottom.
          The column is exactly min-h-screen so short content doesn't leave a
          large empty band above or below the card. */}
      <div className="flex min-h-screen flex-col bg-gradient-to-br from-success/5 via-background to-primary/5">
        <main className="flex flex-1 items-center justify-center px-4 pt-24 pb-10">
          <Card className="w-full max-w-xl shadow-2xl border-0 bg-card/80 backdrop-blur-sm">
            <CardHeader className="text-center">
              <CardTitle className="text-xl sm:text-2xl text-primary">
                {step === 2 ? "Join The Queue" : restaurantName}
              </CardTitle>
              {step !== 5 && (
                <CardDescription>
                  {step === 2 &&
                    (selectedLabel
                      ? `You're joining the queue at ${selectedLabel}. We'll notify you when your it's your turn.`
                      : "Enter your details to join the queue.")}
                  {step === 4 && "Queue Status"}
                </CardDescription>
              )}
            </CardHeader>

            <CardContent>
              {step === 2 && (
                <form onSubmit={joinQueue} className="space-y-4">
                  {/* Location is fixed by the QR/URL — shown read-only, never
                    selectable by the customer. */}
                  {selectedLocation && (
                    <div className="min-w-0 rounded-lg border bg-muted/40 p-3">
                      <p className="font-medium text-foreground break-words">
                        {restaurantName}
                      </p>
                      <p className="text-sm text-muted-foreground break-words">
                        {selectedLabel}
                      </p>
                    </div>
                  )}

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
                        setForm((p) => ({ ...p, numGuests: e.target.value }))
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

                  {/* Notification method */}
                  <div className="space-y-2">
                    <Label>How should we notify you?</Label>
                    <div className="grid grid-cols-1 gap-3">
                      {(
                        [
                          {
                            key: "sms",
                            title: "SMS",
                            desc: "Receive Text Message Notifications",
                          },
                          {
                            key: "whatsapp",
                            title: "WhatsApp",
                            desc: "Receive WhatsApp Queue Notifications",
                          },
                          {
                            key: "email",
                            title: "Email",
                            desc: "Receive Email Notifications",
                          },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() =>
                            setForm((p) => ({
                              ...p,
                              notificationMethod: opt.key,
                              // Reset to a valid default dial code per channel.
                              countryCode:
                                opt.key === "sms" ? "+1" : p.countryCode,
                            }))
                          }
                          className={`rounded-lg border px-4 py-3 text-left transition ${
                            form.notificationMethod === opt.key
                              ? "border-primary ring-2 ring-primary/30"
                              : "hover:bg-muted"
                          }`}
                        >
                          <div className="font-medium">{opt.title}</div>
                          <div className="text-sm text-muted-foreground">
                            {opt.desc}
                          </div>
                        </button>
                      ))}
                    </div>
                    {errors.notificationMethod && (
                      <p className="text-sm text-destructive">
                        {errors.notificationMethod}
                      </p>
                    )}
                  </div>

                  {/* SMS phone + consent */}
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
                                  const term = search
                                    .toLowerCase()
                                    .replace(/\+/g, "");
                                  return value.toLowerCase().includes(term)
                                    ? 1
                                    : 0;
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
                                              : "opacity-0",
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
                            placeholder="(555) 123-4567"
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

                      {/* SMS Consent */}
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
                              "mt-1.5 flex-shrink-0",
                            )}
                          />
                          <div className="flex-1">
                            <label
                              htmlFor="smsConsent"
                              className="text-sm leading-5 cursor-pointer"
                            >
                              By checking this box and submitting this form, you
                              consent to receive transactional text messages for
                              queue notifications from SeatPing. Reply STOP to
                              opt out. Reply HELP for help. Standard message and
                              data rates may apply. Message frequency may vary.
                              View our{" "}
                              <a
                                href="/terms"
                                className="underline text-primary"
                              >
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
                            onCheckedChange={(checked) =>
                              setForm((p) => ({
                                ...p,
                                smsMarketingConsent: checked as boolean,
                              }))
                            }
                            className="mt-1.5 flex-shrink-0"
                          />
                          <div className="flex-1">
                            <label
                              htmlFor="smsMarketingConsent"
                              className="text-sm leading-5 cursor-pointer"
                            >
                              (Optional) By checking this box, you consent to
                              receive text messages for marketing from SeatPing.
                              Reply STOP to opt out. Reply HELP for help.
                              Message and data rates may apply. Message
                              frequency may vary. View our{" "}
                              <a
                                href="/terms"
                                className="underline text-primary"
                              >
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
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {/* WhatsApp phone */}
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
                                const term = search
                                  .toLowerCase()
                                  .replace(/\+/g, "");
                                return value.toLowerCase().includes(term)
                                  ? 1
                                  : 0;
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
                                            : "opacity-0",
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
                          placeholder="(555) 123-4567"
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

                  {/* Email */}
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

                  <Button
                    type="submit"
                    variant="outline"
                    className="w-full"
                    disabled={joiningQueue || loadingAddresses}
                  >
                    <Users className="h-4 w-4" />
                    {joiningQueue ? "Joining..." : "Join Queue"}
                  </Button>
                </form>
              )}

              {step === 4 && (
                <div className="space-y-5">
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground mb-2">
                      Queue Details
                    </p>
                    <p>
                      <strong>Restaurant:</strong> {restaurantName}
                    </p>
                    <p>
                      <strong>Location:</strong> {selectedLabel}
                    </p>
                    <p>
                      <strong>Name:</strong> {form.firstName} {form.lastName}
                    </p>
                    <p>
                      <strong>Number of Guests:</strong>{" "}
                      {parseInt(form.numGuests)}
                    </p>
                  </div>

                  <div className="text-center space-y-1">
                    <div className="text-xl font-semibold">
                      You are #{positionInLine} in line
                    </div>
                    <div className="text-sm text-muted-foreground">
                      There {peopleAhead === 1 ? "is" : "are"} {peopleAhead}{" "}
                      {peopleAhead === 1 ? "party" : "parties"} ahead of you
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-lg border p-4 text-center">
                      <div className="text-sm text-muted-foreground">
                        Estimated Wait
                      </div>
                      <div className="text-lg font-semibold">
                        {eta
                          ? eta.displayText
                          : etaLoading
                            ? "Calculating wait time…"
                            : etaError
                              ? "Updating soon"
                              : "Calculating wait time…"}
                      </div>
                    </div>
                    <div className="rounded-lg border p-4 text-center">
                      <div className="text-sm text-muted-foreground">
                        Notifications
                      </div>
                      <div className="text-lg font-medium">
                        {notificationLabel(form.notificationMethod)}
                      </div>
                    </div>
                  </div>

                  <p className="text-center text-xs text-muted-foreground">
                    Wait time may change based on queue movement and upcoming
                    reservations.
                  </p>

                  <div className="flex gap-2">
                    <Button
                      variant="destructiveOutline"
                      className="flex-1"
                      onClick={leaveQueue}
                    >
                      Leave Queue
                    </Button>
                  </div>
                </div>
              )}

              {step === 5 && (
                <div className="space-y-5 text-center">
                  {turnExpired ? (
                    <>
                      <h2 className="text-2xl sm:text-3xl font-bold text-destructive">
                        Time's Up
                      </h2>

                      {/* Expired state — the hold window has passed. */}
                      <div className="rounded-2xl border border-destructive/15 bg-destructive/5 px-6 py-6">
                        <p className="text-base font-semibold text-foreground">
                          Time's up. Your spot has been released.
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Please speak with the host if you still need
                          assistance.
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <h2 className="text-2xl sm:text-3xl font-bold text-primary">
                        It's Your Turn!
                      </h2>

                      {/* Countdown — the primary focus */}
                      <div className="rounded-2xl border border-primary/10 bg-primary/5 px-6 py-6">
                        <p className="text-xs sm:text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                          Please Arrive Within
                        </p>
                        <div className="mt-2 text-6xl sm:text-7xl font-bold leading-none tabular-nums text-primary">
                          {mm}:{ss}
                        </div>
                        <p className="mt-3 text-sm text-muted-foreground">
                          Your spot will be held for 5 minutes.
                        </p>
                      </div>
                    </>
                  )}

                  {/* Details */}
                  <div className="rounded-xl bg-muted px-4 py-3 text-left">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Details
                    </p>
                    <dl className="space-y-1.5 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <dt className="text-muted-foreground">Restaurant</dt>
                        <dd className="text-right font-medium">
                          {restaurantName}
                        </dd>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <dt className="text-muted-foreground">Location</dt>
                        <dd className="text-right font-medium">
                          {selectedLabel}
                        </dd>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <dt className="text-muted-foreground">Name</dt>
                        <dd className="text-right font-medium">
                          {form.firstName} {form.lastName}
                        </dd>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <dt className="text-muted-foreground">
                          Number of Guests
                        </dt>
                        <dd className="text-right font-medium">
                          {parseInt(form.numGuests)}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
              )}

              {step === 6 && (
                <div className="space-y-5 text-center">
                  <h2 className="text-2xl sm:text-3xl font-bold text-primary">
                    You're Checked In.
                  </h2>

                  <div className="rounded-2xl border border-primary/10 bg-primary/5 px-6 py-6">
                    <p className="text-base font-semibold text-foreground">
                      Arrival Confirmed. You're All Set.
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      The restaurant has confirmed your arrival. Please follow
                      the host's instructions.
                    </p>
                  </div>

                  {/* Details */}
                  <div className="rounded-xl bg-muted px-4 py-3 text-left">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Details
                    </p>
                    <dl className="space-y-1.5 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <dt className="text-muted-foreground">Restaurant</dt>
                        <dd className="text-right font-medium">
                          {restaurantName}
                        </dd>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <dt className="text-muted-foreground">Location</dt>
                        <dd className="text-right font-medium">
                          {selectedLabel}
                        </dd>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <dt className="text-muted-foreground">Name</dt>
                        <dd className="text-right font-medium">
                          {form.firstName} {form.lastName}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </main>
        <Footer />
      </div>
    </>
  );
}
