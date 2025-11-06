import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import BusinessHeader from "@/components/BusinessHeader";
import Footer from "@/components/Footer";
import { api } from "@/lib/api";
import { CreditCard } from "lucide-react";

// Keep this to show names/features/prices in the UI.
// (The actual price IDs are now used server-side.)
const PRICING_PLANS = {
  "Starter Monthly": {
    name: "Starter Monthly",
    price: 19,
    interval: "month",
    features: ["• 1 Location", "• 300 SMS/Month", "• 300 Customers/Month"],
    savings: null,
  },
  "Starter Yearly": {
    name: "Starter Yearly",
    price: 190,
    interval: "year",
    features: ["• 1 Location", "• 300 SMS/Month", "• 300 Customers/Month"],
    savings: "Save $38/year",
  },
  "Professional Monthly": {
    name: "Professional Monthly",
    price: 49,
    interval: "month",
    features: ["• 3 Locations", "• 600 SMS/Month", "• 600 Customers/Month"],
    savings: null,
  },
  "Professional Yearly": {
    name: "Professional Yearly",
    price: 490,
    interval: "year",
    features: ["• 3 Locations", "• 600 SMS/Month", "• 600 Customers/Month"],
    savings: "Save $98/year",
  },
};

const Payments = () => {
  const [me, setMe] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>("");
  const [selectedBilling, setSelectedBilling] = useState<"monthly" | "yearly">(
    "monthly"
  );
  const [acceptTerms, setAcceptTerms] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const currentPlan = me?.plan || "Starter";
  const onTrial = me?.trial === true;

  useEffect(() => {
    (async () => {
      try {
        const res = await api("/auth/me");
        setMe(res.user);
        setSelectedPlan(res.user.plan || "Starter Monthly");
      } catch (error) {
        console.error("Failed to fetch user data:", error);
      }
    })();
  }, []);

  const handlePlanChange = (plan: string) => {
    if (!onTrial && plan === currentPlan) {
      toast({
        title: "Plan Already Selected",
        description: `You are already on the ${plan} plan. Use the plan change page to modify your subscription.`,
      });
      return;
    }
    setSelectedPlan(plan);
  };

  const getAvailablePlans = () => {
    return selectedBilling === "monthly"
      ? ["Starter Monthly", "Professional Monthly"]
      : ["Starter Yearly", "Professional Yearly"];
  };

  const getCurrentPlanKey = () => {
    if (currentPlan === "Starter") {
      return selectedBilling === "monthly"
        ? "Starter Monthly"
        : "Starter Yearly";
    } else if (currentPlan === "Professional") {
      return selectedBilling === "monthly"
        ? "Professional Monthly"
        : "Professional Yearly";
    }
    return "Starter Monthly";
  };

  const getUserId = (u: any) => u?.id ?? u?._id ?? null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedPlan) {
      toast({
        title: "Plan Selection Required",
        description: "Please select a plan to continue.",
        variant: "destructive",
      });
      return;
    }
    if (!acceptTerms) {
      toast({
        title: "Terms Acceptance Required",
        description: "Please accept the terms and conditions to continue.",
        variant: "destructive",
      });
      return;
    }

    const userId = getUserId(me);
    if (!userId) {
      toast({
        title: "Session Error",
        description: "We couldn’t find your account id. Please sign in again.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Create a Checkout Session on the server.
      // NOTE: your `api` helper likely auto-sets base URL & credentials.
      const resp = await api("/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planKey: selectedPlan,
          userId, // ← maps in webhook; payer email can be different
        }),
      });

      if (!resp?.url) throw new Error("No session URL returned");

      // Replace current tab with Stripe Checkout.
      window.location.href = resp.url;

      // No navigate() here — Stripe will send the user back to /business/dashboard
      // after payment via the success_url defined server-side.

      setLoading(false);
    } catch (error) {
      console.error(error);
      toast({
        title: "Payment Failed",
        description: "There was an error starting checkout. Please try again.",
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  const isCurrentPlan = (plan: string) => plan === getCurrentPlanKey();

  return (
    <>
      <BusinessHeader />
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50 to-indigo-100 py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <Card className="shadow-xl rounded-xl border-0">
            <CardHeader className="text-center">
              <CardTitle className="text-3xl lg:text-4xl font-semibold">
                Choose Your Plan
              </CardTitle>

              {selectedPlan && (
                <CardDescription className="text-lg font-semibold mt-4">
                  Total - $
                  {
                    PRICING_PLANS[selectedPlan as keyof typeof PRICING_PLANS]
                      ?.price
                  }
                  /
                  {
                    PRICING_PLANS[selectedPlan as keyof typeof PRICING_PLANS]
                      ?.interval
                  }
                </CardDescription>
              )}
            </CardHeader>

            <CardContent className="space-y-8">
              <form onSubmit={handleSubmit} className="space-y-8">
                {/* Billing toggle */}
                <div className="flex items-center justify-center space-x-4">
                  <span
                    className={`text-sm font-medium ${
                      selectedBilling === "monthly"
                        ? "text-gray-900"
                        : "text-gray-500"
                    }`}
                  >
                    Monthly
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedBilling(
                        selectedBilling === "monthly" ? "yearly" : "monthly"
                      )
                    }
                    className="relative inline-flex h-6 w-11 items-center rounded-full bg-gray-200"
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white ${
                        selectedBilling === "yearly"
                          ? "translate-x-6"
                          : "translate-x-1"
                      }`}
                    />
                  </button>
                  <span
                    className={`text-sm font-medium ${
                      selectedBilling === "yearly"
                        ? "text-gray-900"
                        : "text-gray-500"
                    }`}
                  >
                    Yearly
                  </span>
                </div>

                {/* Plan cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {getAvailablePlans().map((planKey) => {
                    const plan =
                      PRICING_PLANS[planKey as keyof typeof PRICING_PLANS];
                    const isCurrent = isCurrentPlan(planKey);
                    const isSelected = selectedPlan === planKey;

                    return (
                      <Card
                        key={planKey}
                        className={`shadow-xl cursor-pointer transition-all ${
                          !onTrial && isCurrent
                            ? "border-2 border-gray-300 bg-gray-50 opacity-60"
                            : isSelected
                            ? "border-2 border-indigo-500 bg-indigo-50 shadow-2xl"
                            : "border-2 border-transparent hover:border-primary hover:shadow-2xl"
                        }`}
                        onClick={() => handlePlanChange(planKey)}
                      >
                        <CardHeader className="text-center">
                          <CardTitle
                            className={`text-lg ${
                              !onTrial && isCurrent ? "text-gray-500" : ""
                            }`}
                          >
                            {plan.name
                              .replace(" Monthly", "")
                              .replace(" Yearly", "")}
                            {!onTrial && isCurrent && (
                              <span className="block text-sm text-gray-400 mt-1">
                                Current Plan
                              </span>
                            )}
                            {isSelected && !(!onTrial && isCurrent) && (
                              <span className="block text-sm text-indigo-600 mt-1 font-medium">
                                Selected
                              </span>
                            )}
                          </CardTitle>
                          <CardDescription
                            className={`text-base ${
                              !onTrial && isCurrent ? "text-gray-400" : ""
                            }`}
                          >
                            ${plan.price}
                            <span className="text-muted-foreground">
                              /{plan.interval}
                            </span>
                            {plan.savings && (
                              <span className="block text-xs text-green-600 font-medium mt-1">
                                {plan.savings}
                              </span>
                            )}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <ul className="space-y-2 text-sm">
                            {plan.features.map((feature, i) => (
                              <li
                                key={i}
                                className={
                                  !onTrial && isCurrent ? "text-gray-400" : ""
                                }
                              >
                                {feature}
                              </li>
                            ))}
                          </ul>
                          <div className="mt-4">
                            <Button
                              type="button"
                              className="w-full"
                              disabled={!onTrial && isCurrent}
                              variant={
                                !onTrial && isCurrent
                                  ? "outline"
                                  : isSelected
                                  ? "default"
                                  : "outline"
                              }
                            >
                              {!onTrial && isCurrent
                                ? "Current Plan"
                                : isSelected
                                ? "Selected"
                                : "Select"}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {/* Payment method + terms */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-800">
                    Payment Method
                  </h3>
                  <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg flex items-center space-x-3">
                    <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center">
                      <CreditCard className="w-4 h-4 text-white" />
                    </div>
                    <Label className="text-base font-medium text-indigo-800">
                      Credit Card
                    </Label>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <label
                    htmlFor="terms"
                    className="flex items-center gap-3 cursor-pointer select-none"
                  >
                    <Checkbox
                      id="terms"
                      checked={acceptTerms}
                      onCheckedChange={(c) => setAcceptTerms(c as boolean)}
                      className="h-5 w-5 shrink-0"
                    />
                    <span className="text-sm text-gray-700 leading-6">
                      By proceeding, I acknowledge that I have read and agree to
                      SeatPing’s{" "}
                      <a href="/terms" className="text-primary hover:underline">
                        Terms of Service
                      </a>{" "}
                      and{" "}
                      <a
                        href="/policy"
                        className="text-primary hover:underline"
                      >
                        Privacy Policy
                      </a>
                      , and I consent to the processing of my information as
                      described therein.
                    </span>
                  </label>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading || !selectedPlan || !acceptTerms}
                >
                  {loading ? "Processing..." : "Checkout"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
      <Footer />
    </>
  );
};

export default Payments;
