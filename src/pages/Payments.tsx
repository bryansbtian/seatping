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
import { CreditCard, Edit, Clock, Calendar, DollarSign } from "lucide-react";

// Stripe pricing plans configuration
const PRICING_PLANS = {
  "Starter Monthly": {
    name: "Starter Monthly",
    price: 30,
    interval: "month",
    stripeUrl: "https://buy.stripe.com/test_bJe7sLcTN6t5fMJ9PJbfO07",
    stripePriceId: "price_1S5GXlDHwj4NMuGRzrNP0h6Y",
    features: ["• 1 Location", "• 200 SMS/Month", "• 50 Customers/Day"],
    savings: null
  },
  "Starter Yearly": {
    name: "Starter Yearly", 
    price: 250,
    interval: "year",
    stripeUrl: "https://buy.stripe.com/test_6oU14n4nh8Bd2ZXd1VbfO06",
    stripePriceId: "price_1S5GisDHwj4NMuGRvS2GIgze",
    features: ["• 1 Location", "• 200 SMS/Month", "• 50 Customers/Day"],
    savings: "Save $110/year"
  },
  "Professional Monthly": {
    name: "Professional Monthly",
    price: 65,
    interval: "month", 
    stripeUrl: "https://buy.stripe.com/test_aFacN54nhg3FcAx6DxbfO08",
    stripePriceId: "price_1S5GaEDHwj4NMuGRnRGHxklm",
    features: ["• 3 Locations", "• 500 SMS/Month", "• 100 Customers/Day"],
    savings: null
  },
  "Professional Yearly": {
    name: "Professional Yearly",
    price: 550,
    interval: "year",
    stripeUrl: "https://buy.stripe.com/test_eVq00jg5ZdVxeIFaTNbfO09", 
    stripePriceId: "price_1S5Gn4DHwj4NMuGR4yoViRmE",
    features: ["• 3 Locations", "• 500 SMS/Month", "• 100 Customers/Day"],
    savings: "Save $230/year"
  }
};

const Payments = () => {
  const [me, setMe] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>("");
  const [selectedBilling, setSelectedBilling] = useState<"monthly" | "yearly">("monthly");
  const [paymentMethod, setPaymentMethod] = useState("stripe");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Get current plan info
  const currentPlan = me?.plan || "Starter";
  const onTrial = me?.trial === true;

  useEffect(() => {
    (async () => {
      try {
        const res = await api("/auth/me");
        setMe(res.user);
        // Set current plan as selected by default
        setSelectedPlan(res.user.plan || "Starter Monthly");
      } catch (error) {
        console.error("Failed to fetch user data:", error);
      }
    })();
  }, []);

  const handlePlanChange = (plan: string) => {
    // For trial users, they can select any plan
    // For existing subscribers, they should use the plan change page
    if (!onTrial && plan === currentPlan) {
      toast({
        title: "Plan Already Selected",
        description: `You are already on the ${plan} plan. Use the plan change page to modify your subscription.`,
        variant: "default",
      });
      return;
    }
    setSelectedPlan(plan);
  };

  const getAvailablePlans = () => {
    const plans = [];
    if (selectedBilling === "monthly") {
      plans.push("Starter Monthly", "Professional Monthly");
    } else {
      plans.push("Starter Yearly", "Professional Yearly");
    }
    return plans;
  };

  const getCurrentPlanKey = () => {
    if (currentPlan === "Starter") {
      return selectedBilling === "monthly" ? "Starter Monthly" : "Starter Yearly";
    } else if (currentPlan === "Professional") {
      return selectedBilling === "monthly" ? "Professional Monthly" : "Professional Yearly";
    }
    return "Starter Monthly";
  };

  // Support id or _id coming from /auth/me
  const getUserId = (u: any) => (u?.id ?? u?._id ?? null);

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
      const planData = PRICING_PLANS[selectedPlan as keyof typeof PRICING_PLANS];
      if (!planData) throw new Error("Invalid plan selected");

      // Append client_reference_id (and optional prefilled_email) to Payment Link
      const url = new URL(planData.stripeUrl);
      url.searchParams.set("client_reference_id", String(userId)); // maps purchase to your DB user regardless of payer email
      if (me?.email) url.searchParams.set("prefilled_email", String(me.email)); // optional UX helper

      // Open Stripe Checkout in a new tab
      window.open(url.toString(), "_blank");

      // Immediately redirect this tab to dashboard
      navigate("/business/dashboard");

      setLoading(false);
    } catch (error) {
      toast({
        title: "Payment Failed",
        description: "There was an error processing your payment. Please try again.",
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  const isCurrentPlan = (plan: string) => {
    const currentPlanKey = getCurrentPlanKey();
    return plan === currentPlanKey;
  };

  return (
    <>
      <BusinessHeader />
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-teal-50 to-blue-100 py-24 sm:py-16 md:py-24 lg:py-32 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <Card className="shadow-xl rounded-xl border-0">
            <CardHeader className="text-center px-4 sm:px-6 lg:px-8">
              <CardTitle className="text-2xl sm:text-3xl lg:text-4xl font-bold">Choose Your Plan</CardTitle>
              
              {/* Billing Toggle */}
              <div className="flex items-center justify-center space-x-4 mt-6">
                <span className={`text-sm font-medium ${selectedBilling === "monthly" ? "text-gray-900" : "text-gray-500"}`}>
                  Monthly
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedBilling(selectedBilling === "monthly" ? "yearly" : "monthly")}
                  className="relative inline-flex h-6 w-11 items-center rounded-full bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      selectedBilling === "yearly" ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
                <span className={`text-sm font-medium ${selectedBilling === "yearly" ? "text-gray-900" : "text-gray-500"}`}>
                  Yearly
                </span>
                {selectedBilling === "yearly" && (
                  <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full font-medium">
                    Save up to 17%
                  </span>
                )}
              </div>

              {selectedPlan && (
                <CardDescription className="text-base sm:text-lg font-semibold text-center mt-4">
                  Total - ${PRICING_PLANS[selectedPlan as keyof typeof PRICING_PLANS]?.price}/{PRICING_PLANS[selectedPlan as keyof typeof PRICING_PLANS]?.interval}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-6 sm:space-y-8 px-4 sm:px-6 lg:px-8">
              <form onSubmit={handleSubmit} className="space-y-6 sm:space-y-8">
                {/* Plan Selection Cards */}
                <div className="space-y-4 sm:space-y-6">
                  <h3 className="text-base sm:text-lg font-semibold text-center text-gray-800">
                    {onTrial ? "Upgrade Your Trial" : "Select Your Plan"}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                    {getAvailablePlans().map((planKey) => {
                      const plan = PRICING_PLANS[planKey as keyof typeof PRICING_PLANS];
                      const isCurrent = isCurrentPlan(planKey);
                      const isSelected = selectedPlan === planKey;
                      
                      return (
                        <Card
                          key={planKey}
                          className={`shadow-xl cursor-pointer transition-all ${
                            !onTrial && isCurrent
                              ? "border-2 border-gray-300 bg-gray-50 opacity-60"
                              : isSelected
                              ? "border-2 border-blue-500 bg-blue-50 shadow-2xl"
                              : "border-2 border-transparent hover:border-primary hover:shadow-2xl"
                          }`}
                          onClick={() => handlePlanChange(planKey)}
                        >
                          <CardHeader className="text-center px-4 sm:px-6">
                            <CardTitle className={`text-base sm:text-lg ${!onTrial && isCurrent ? "text-gray-500" : ""}`}>
                              {plan.name.replace(" Monthly", "").replace(" Yearly", "")}
                              {!onTrial && isCurrent && (
                                <span className="block text-xs sm:text-sm text-gray-400 mt-1">
                                  Current Plan
                                </span>
                              )}
                              {isSelected && !(!onTrial && isCurrent) && (
                                <span className="block text-xs sm:text-sm text-blue-600 mt-1 font-medium">
                                  Selected
                                </span>
                              )}
                            </CardTitle>
                            <CardDescription className={`text-sm sm:text-base ${!onTrial && isCurrent ? "text-gray-400" : ""}`}>
                              ${plan.price}
                              <span className="text-muted-foreground">/{plan.interval}</span>
                              {plan.savings && (
                                <span className="block text-xs text-green-600 font-medium mt-1">
                                  {plan.savings}
                                </span>
                              )}
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="px-4 sm:px-6">
                            <ul className="space-y-1 sm:space-y-2 text-xs sm:text-sm">
                              {plan.features.map((feature, index) => (
                                <li key={index} className={!onTrial && isCurrent ? "text-gray-400" : ""}>
                                  {feature}
                                </li>
                              ))}
                            </ul>
                            <div className="mt-3 sm:mt-4">
                              <Button
                                type="button"
                                className="w-full text-sm sm:text-base py-2 sm:py-3"
                                disabled={!onTrial && isCurrent}
                                variant={!onTrial && isCurrent ? "outline" : isSelected ? "default" : "outline"}
                              >
                                {!onTrial && isCurrent ? "Current Plan" : isSelected ? "Selected" : "Select"}
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                  
                  {/* Plan Change Link for Existing Subscribers */}
                  {!onTrial && (
                    <div className="text-center">
                      <p className="text-sm text-gray-600 mb-2">
                        Want to change your current plan?
                      </p>
                      <Button
                        variant="link"
                        className="text-primary hover:underline p-0 h-auto"
                        onClick={() => navigate("/plan-change")}
                      >
                        Go to Plan Change Page
                      </Button>
                    </div>
                  )}
                </div>

                {/* Payment Method Selection */}
                <div className="space-y-4">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-800">Payment Method</h3>
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                        <CreditCard className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1">
                        <Label className="text-sm sm:text-base font-medium text-blue-800">
                          Credit Card
                        </Label>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="text-xs bg-blue-600 text-white px-2 sm:px-3 py-1 rounded-md font-medium">VISA</span>
                        <span className="text-xs bg-red-500 text-white px-2 sm:px-3 py-1 rounded-md font-medium">MasterCard</span>
                        <span className="text-xs bg-blue-700 text-white px-2 sm:px-3 py-1 rounded-md font-medium">AMEX</span>
                        <span className="text-xs bg-gray-800 text-white px-2 sm:px-3 py-1 rounded-md font-medium">Discover</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Terms and Conditions */}
                <div className="flex items-start space-x-2 sm:space-x-3 pt-2">
                  <Checkbox
                    id="terms"
                    checked={acceptTerms}
                    onCheckedChange={(checked) => setAcceptTerms(checked as boolean)}
                    className="text-green-600 border-green-600 data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600 mt-0.5 flex-shrink-0"
                  />
                  <Label htmlFor="terms" className="text-xs sm:text-sm text-gray-700 leading-relaxed">
                    I have read and accept the{" "}
                    <a href="/terms" className="text-primary hover:underline">
                      terms of use
                    </a>
                    ,{" "}
                    <a href="/policy" className="text-primary hover:underline">
                      rules of flight
                    </a>{" "}
                    and{" "}
                    <a href="/policy" className="text-primary hover:underline">
                      privacy policy
                    </a>
                  </Label>
                </div>

                {/* Pay Now Button */}
                <Button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 sm:py-4 text-base sm:text-lg font-semibold rounded-lg mt-4 sm:mt-6"
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
