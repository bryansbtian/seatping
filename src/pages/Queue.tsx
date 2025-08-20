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
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";
import Header from "@/components/Header";

/**
 * Replace this with a real API call to fetch a business's locations/addresses.
 * It returns an array of string addresses for demo purposes.
 */
async function fetchAddressesForBusiness(username: string): Promise<string[]> {
  if (!username) return [];
  // TODO: call your backend here
  await new Promise((r) => setTimeout(r, 150));
  // Demo data based on username
  return [
    `${username} HQ — 123 Main St, Jakarta`,
    `${username} Branch — 45 Sunset Rd, Jakarta`,
  ];
}

const Queue = () => {
  const [step, setStep] = useState<1 | 2>(1);

  const [formData, setFormData] = useState({
    businessUsername: "",
    address: "",
    firstName: "",
    lastName: "",
    phoneNumber: "",
  });

  const [errors, setErrors] = useState({
    businessUsername: "",
    address: "",
    firstName: "",
    lastName: "",
    phoneNumber: "",
  });

  const [addresses, setAddresses] = useState<string[]>([]);
  const [loadingAddresses, setLoadingAddresses] = useState(false);

  const [isSubmitted, setIsSubmitted] = useState(false);
  const { toast } = useToast();

  const resetStep2Fields = () => {
    setFormData((p) => ({
      ...p,
      address: "",
      firstName: "",
      lastName: "",
      phoneNumber: "",
    }));
    setErrors((p) => ({
      ...p,
      address: "",
      firstName: "",
      lastName: "",
      phoneNumber: "",
    }));
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    if (errors[name as keyof typeof errors]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handleNext = async (e: React.FormEvent) => {
    e.preventDefault();
    // Validate only businessUsername for step 1
    const newErrors = { ...errors, businessUsername: "" };
    if (!formData.businessUsername) {
      newErrors.businessUsername = "Business username is required";
      setErrors(newErrors);
      return;
    }
    setErrors(newErrors);

    // Load addresses for the business
    setLoadingAddresses(true);
    try {
      const list = await fetchAddressesForBusiness(
        formData.businessUsername.trim()
      );
      setAddresses(list);
    } finally {
      setLoadingAddresses(false);
    }

    // Clear step 2 fields whenever username changes & proceed
    resetStep2Fields();
    setStep(2);
  };

  const handleBack = () => {
    setStep(1);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Step 2 validation
    const newErrors = {
      ...errors,
      address: "",
      firstName: "",
      lastName: "",
      phoneNumber: "",
    };

    if (!formData.address) newErrors.address = "Address is required";
    if (!formData.firstName) newErrors.firstName = "First name is required";
    if (!formData.lastName) newErrors.lastName = "Last name is required";
    if (!formData.phoneNumber)
      newErrors.phoneNumber = "Phone number is required";

    setErrors(newErrors);

    const hasErrors = Object.values(newErrors).some((e) => e !== "");
    if (!hasErrors) {
      toast({
        title: "Successfully joined the queue!",
        description: "You'll receive a text when it's your turn.",
      });
      setIsSubmitted(true);
    }
  };

  const handleJoinAnother = () => {
    setIsSubmitted(false);
    setStep(1);
    setFormData({
      businessUsername: "",
      address: "",
      firstName: "",
      lastName: "",
      phoneNumber: "",
    });
    setErrors({
      businessUsername: "",
      address: "",
      firstName: "",
      lastName: "",
      phoneNumber: "",
    });
    setAddresses([]);
  };

  if (isSubmitted) {
    return (
      <>
        <Header />
        <div className="min-h-screen pt-28 pb-16 flex items-center justify-center bg-gradient-to-br from-success/5 via-background to-primary/5 px-4">
          <Card className="w-full max-w-md shadow-2xl border-0 bg-card/80 backdrop-blur-sm text-center">
            <CardHeader>
              <div className="mx-auto w-16 h-16 bg-gradient-to-r from-success to-success-glow rounded-full flex items-center justify-center mb-4">
                <svg
                  className="w-8 h-8 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <CardTitle className="text-2xl text-success">
                You're in the queue!
              </CardTitle>
              <CardDescription>
                We'll text you at {formData.phoneNumber} when it's your turn.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground mb-2">
                  Queue Details
                </p>
                <p>
                  <strong>Business:</strong> {formData.businessUsername}
                </p>
                <p>
                  <strong>Address:</strong> {formData.address}
                </p>
                <p>
                  <strong>Name:</strong> {formData.firstName}{" "}
                  {formData.lastName}
                </p>
                <p>
                  <strong>Estimated wait:</strong> 15-20 minutes
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleJoinAnother}
                  variant="outline"
                  className="flex-1"
                >
                  Join Another Queue
                </Button>
                <Button asChild variant="ghost" className="flex-1">
                  <Link to="/">Go Home</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

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
              {step === 1
                ? "Choose the business to join"
                : "Confirm your details"}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {step === 1 ? (
              // STEP 1: Only Business Username
              <form onSubmit={handleNext} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="businessUsername">Business Username</Label>
                  <Input
                    id="businessUsername"
                    name="businessUsername"
                    placeholder="e.g., maxbarbershop"
                    value={formData.businessUsername}
                    onChange={handleChange}
                    className={
                      errors.businessUsername
                        ? "border-destructive focus:ring-destructive"
                        : ""
                    }
                    required
                  />
                  {errors.businessUsername && (
                    <p className="text-sm text-destructive">
                      {errors.businessUsername}
                    </p>
                  )}
                </div>

                <Button type="submit" className="w-full" variant="default">
                  Next
                </Button>
              </form>
            ) : (
              // STEP 2: Address + Personal details + Join
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Read-only business username */}
                <div className="space-y-1">
                  <Label>Business</Label>
                  <div className="rounded-md border px-3 py-2 text-sm bg-muted/40">
                    @{formData.businessUsername}
                  </div>
                </div>

                {/* Address selection (from fetched list) */}
                <div className="space-y-2">
                  <Label htmlFor="address">Address</Label>

                  <div className="relative">
                    <select
                      id="address"
                      name="address"
                      value={formData.address}
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

                    {/* Custom arrow */}
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

                  {/* Optional: map picker placeholder */}
                  <div className="mt-2 h-36 w-full rounded-md border bg-muted flex items-center justify-center text-muted-foreground">
                    [ Map picker here ]
                  </div>
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
                      className={
                        errors.firstName
                          ? "border-destructive focus:ring-destructive"
                          : ""
                      }
                      required
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
                      value={formData.lastName}
                      onChange={handleChange}
                      className={
                        errors.lastName
                          ? "border-destructive focus:ring-destructive"
                          : ""
                      }
                      required
                    />
                    {errors.lastName && (
                      <p className="text-sm text-destructive">
                        {errors.lastName}
                      </p>
                    )}
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
                    className={
                      errors.phoneNumber
                        ? "border-destructive focus:ring-destructive"
                        : ""
                    }
                    required
                  />
                  {errors.phoneNumber && (
                    <p className="text-sm text-destructive">
                      {errors.phoneNumber}
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={handleBack}
                  >
                    Back
                  </Button>
                  <Button type="submit" className="flex-1" variant="success">
                    Join Queue
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default Queue;
