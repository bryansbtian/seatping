import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
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

/** Placeholder API call to get addresses for this business */
async function fetchAddressesForBusiness(username: string): Promise<string[]> {
  if (!username) return [];
  await new Promise((r) => setTimeout(r, 150));
  return [
    `${username} HQ — 123 Main St, Jakarta`,
    `${username} Branch — 45 Sunset Rd, Jakarta`,
    `${username} Mall Kiosk — Podomoro City, Jakarta`,
  ];
}

type Step = 2 | 3 | 4 | 5;

export default function QueueBusiness() {
  const { businessUsername = "" } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>(2);

  const [addresses, setAddresses] = useState<string[]>([]);
  const [loadingAddresses, setLoadingAddresses] = useState(false);

  const [form, setForm] = useState({
    address: "",
    firstName: "",
    lastName: "",
    phoneNumber: "", // required only when wait_anywhere
    waitingPreference: "on_premises" as "on_premises" | "wait_anywhere",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

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

  // NEW: ref to focus Step 4 phone input when needed
  const phoneStatusRef = useRef<HTMLInputElement | null>(null);

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
      } finally {
        setLoadingAddresses(false);
      }
    })();
  }, [businessUsername, navigate]);

  // Simulate queue moving on Status step → when 0, go to Step 5
  useEffect(() => {
    if (step !== 4) return;
    const tick = setInterval(() => {
      setPeopleAhead((n) => {
        if (n <= 1) {
          clearInterval(tick);
          // Move to "It's your turn" screen
          setStep(5);
          return 0;
        }
        return n - 1;
      });
    }, 8000);
    return () => clearInterval(tick);
  }, [step]);

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
    if (!form.address) newErrors.address = "Address is required";
    if (!form.firstName) newErrors.firstName = "First name is required";
    if (!form.lastName) newErrors.lastName = "Last name is required";
    setErrors(newErrors);
    if (Object.keys(newErrors).length) return;
    setStep(3);
  };

  // Step 3 → Step 4
  const nextFromStep3 = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};
    if (form.waitingPreference === "wait_anywhere" && !form.phoneNumber) {
      newErrors.phoneNumber = "Phone number is required for Wait Anywhere";
    }
    setErrors(newErrors);
    if (Object.keys(newErrors).length) return;

    toast({
      title: "You're in the queue!",
      description:
        form.waitingPreference === "wait_anywhere"
          ? `We'll text you at ${form.phoneNumber} when it's almost your turn.`
          : "Stay nearby — we'll call your name on site.",
    });

    // Seed placeholders for the status step
    setPeopleAhead(2); // example: after joining, there are 2 ahead
    setStep(4);
  };

  // UPDATED: Always show a catchy toast when switching; if phone missing, prompt + focus
  const changePreferenceOnStatus = (pref: "on_premises" | "wait_anywhere") => {
    if (pref === "wait_anywhere" && !form.phoneNumber) {
      // ensure the phone field appears
      setForm((p) => ({ ...p, waitingPreference: "wait_anywhere" }));
      setErrors((p) => ({
        ...p,
        phoneNumber: "Phone number is required if you want to wait anywhere",
      }));

      // fun toast even when phone missing
      toast({
        title: "Almost there!",
        description:
          "Add your phone number so we can text you when it's nearly your turn",
      });

      // focus the phone field
      setTimeout(() => phoneStatusRef.current?.focus(), 0);
      return;
    }

    setErrors((p) => ({ ...p, phoneNumber: "" }));
    setForm((p) => ({ ...p, waitingPreference: pref }));

    if (pref === "on_premises") {
      toast({
        title: "You're staying close!",
        description: "We'll call your name when it's your turn",
      });
    } else {
      toast({
        title: "Switched to Wait Anywhere!",
        description: `We'll text you at ${form.phoneNumber} when it's almost your turn.`,
      });
    }
  };

  const leaveQueue = () => {
    toast({ title: "You left the queue" });
    navigate("/queue");
  };

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  return (
    <>
      <Header />
      <div className="min-h-screen pt-28 pb-16 flex items-center justify-center bg-gradient-to-br from-success/5 via-background to-primary/5 px-4">
        <Card className="w-full max-w-xl shadow-2xl border-0 bg-card/80 backdrop-blur-sm">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl bg-gradient-to-r from-primary to-success bg-clip-text text-transparent">
              @{businessUsername}
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
                  <Label htmlFor="address">Address</Label>
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
                          : "Select an address"}
                      </option>
                      {addresses.map((a) => (
                        <option key={a} value={a}>
                          {a}
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

                {/* Phone only when Wait Anywhere */}
                {form.waitingPreference === "wait_anywhere" && (
                  <div className="space-y-2">
                    <Label htmlFor="phoneNumber">Phone Number</Label>
                    <Input
                      id="phoneNumber"
                      name="phoneNumber"
                      type="tel"
                      placeholder="(555) 123-4567"
                      value={form.phoneNumber}
                      onChange={handleChange}
                      className={
                        errors.phoneNumber
                          ? "border-destructive focus:ring-destructive"
                          : ""
                      }
                    />
                    {errors.phoneNumber && (
                      <p className="text-sm text-destructive">
                        {errors.phoneNumber}
                      </p>
                    )}
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={() => setStep(2)}
                    >
                      Back
                    </Button>
                    <Button type="submit" className="flex-1">
                      Next
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    You can change your waiting preference later on the Queue
                    Status page.
                  </p>
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
                    <strong>Business:</strong> @{businessUsername}
                  </p>
                  <p>
                    <strong>Address:</strong> {form.address}
                  </p>
                  <p>
                    <strong>Name:</strong> {form.firstName} {form.lastName}
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

                {/* Change preference (phone required for Wait Anywhere) */}
                <div className="space-y-3 text-center">
                  <Label className="block text-center">
                    Change Waiting Preference
                  </Label>

                  {/* Full-width left & right buttons */}
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      className="w-full"
                      variant={
                        form.waitingPreference === "on_premises"
                          ? "default"
                          : "outline"
                      }
                      onClick={() => changePreferenceOnStatus("on_premises")}
                    >
                      Stay on Premises
                    </Button>
                    <Button
                      className="w-full"
                      variant={
                        form.waitingPreference === "wait_anywhere"
                          ? "default"
                          : "outline"
                      }
                      onClick={() => changePreferenceOnStatus("wait_anywhere")}
                    >
                      Wait Anywhere
                    </Button>
                  </div>

                  {form.waitingPreference === "wait_anywhere" && (
                    <div className="space-y-2">
                      <Label htmlFor="phoneNumber_status">Phone Number</Label>
                      <Input
                        id="phoneNumber_status"
                        name="phoneNumber"
                        type="tel"
                        placeholder="(555) 123-4567"
                        value={form.phoneNumber}
                        onChange={handleChange}
                        ref={phoneStatusRef} // focus target
                        className={
                          errors.phoneNumber
                            ? "border-destructive focus:ring-destructive"
                            : ""
                        }
                      />
                      {errors.phoneNumber && (
                        <p className="text-sm text-destructive">
                          {errors.phoneNumber}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="success"
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
                <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-r from-primary to-success flex items-center justify-center">
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
                    <strong>Business:</strong> @{businessUsername}
                  </p>
                  <p>
                    <strong>Address:</strong> {form.address}
                  </p>
                  <p>
                    <strong>Name:</strong> {form.firstName} {form.lastName}
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
