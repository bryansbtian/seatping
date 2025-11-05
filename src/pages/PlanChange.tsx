import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { useToast } from "@/hooks/use-toast";
import BusinessHeader from "@/components/BusinessHeader";
import Footer from "@/components/Footer";
import { api } from "@/lib/api";
import { ArrowLeft } from "lucide-react";

const PlanChange = () => {
  const [me, setMe] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>("");
  const [showConfirmation, setShowConfirmation] = useState(false);
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

        // Redirect trial users to payments page
        if (res.user.trial === true) {
          toast({
            title: "Trial Users",
            description: "Trial users should use the payments page to upgrade.",
            variant: "default",
          });
          navigate("/payments");
          return;
        }

        // Set current plan as selected by default
        setSelectedPlan(res.user.plan || "Starter");
      } catch (error) {
        console.error("Failed to fetch user data:", error);
      }
    })();
  }, [navigate, toast]);

  const handlePlanChange = (plan: string) => {
    // Don't allow selecting the current plan
    if (plan === currentPlan) {
      toast({
        title: "Plan Already Selected",
        description: `You are already on the ${plan} plan.`,
        variant: "default",
      });
      return;
    }
    setSelectedPlan(plan);
  };

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

    // Show confirmation popup instead of immediately processing
    setShowConfirmation(true);
  };

  const handleConfirmPlanChange = async () => {
    setLoading(true);
    setShowConfirmation(false);

    try {
      // Update user's plan and set trial = false
      await api("/auth/purchase-plan", {
        method: "POST",
        body: JSON.stringify({ plan: selectedPlan }),
      });

      toast({
        title: "Plan Changed Successfully!",
        description: `Your plan has been changed to ${selectedPlan}. Credits have been updated and billing will be adjusted automatically.`,
        variant: "default",
      });

      // Redirect to dashboard
      navigate("/business/dashboard");
    } catch (error) {
      toast({
        title: "Plan Change Failed",
        description:
          "There was an error processing your plan change. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getPlanPrice = (plan: string) => {
    switch (plan) {
      case "Starter":
        return "$19";
      case "Professional":
        return "$49";
      default:
        return "$19";
    }
  };

  const getPlanFeatures = (plan: string) => {
    switch (plan) {
      case "Starter":
        return ["• 1 Location", "• 300 SMS/Month", "• 300 Customers/Month"];
      case "Professional":
        return ["• 3 Locations", "• 600 SMS/Month", "• 600 Customers/Month"];
      default:
        return [];
    }
  };

  const isCurrentPlan = (plan: string) => plan === currentPlan;

  // Don't render if user is on trial
  if (onTrial) {
    return null;
  }

  return (
    <>
      <BusinessHeader />
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-teal-50 to-blue-100 py-24 sm:py-16 md:py-24 lg:py-32 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          {/* Back Button */}
          <div className="mb-6">
            <Button
              variant="ghost"
              onClick={() => navigate("/business/dashboard")}
              className="flex items-center space-x-2 text-gray-600 hover:text-gray-800"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Dashboard</span>
            </Button>
          </div>

          <Card className="shadow-xl rounded-xl border-0">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl sm:text-3xl lg:text-4xl font-bold">
                Change Your Plan
              </CardTitle>
              {selectedPlan && (
                <div className="flex flex-col sm:flex-row items-center justify-center space-y-2 sm:space-y-0 sm:space-x-4 text-gray-600">
                  <span className="text-sm sm:text-base text-center">
                    Plan - {selectedPlan} {getPlanPrice(selectedPlan)}/month
                  </span>
                </div>
              )}
              {selectedPlan && (
                <CardDescription className="text-base sm:text-lg font-semibold">
                  Total - {getPlanPrice(selectedPlan)}/month
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-6 sm:space-y-8 px-4 sm:px-6 lg:px-8">
              <form onSubmit={handleSubmit} className="space-y-6 sm:space-y-8">
                {/* Plan Selection Cards */}
                <div className="space-y-4 sm:space-y-6">
                  <h3 className="text-base sm:text-lg font-semibold text-center text-gray-800">
                    Select New Plan
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                    {["Starter", "Professional"].map((plan) => (
                      <Card
                        key={plan}
                        className={`shadow-xl cursor-pointer transition-all ${
                          isCurrentPlan(plan)
                            ? "border-2 border-gray-300 bg-gray-50 opacity-60"
                            : selectedPlan === plan
                            ? "border-2 border-blue-500 bg-blue-50 shadow-2xl"
                            : "border-2 border-transparent hover:border-primary hover:shadow-2xl"
                        }`}
                        onClick={() =>
                          !isCurrentPlan(plan) && handlePlanChange(plan)
                        }
                      >
                        <CardHeader className="text-center px-4 sm:px-6">
                          <CardTitle
                            className={`text-base sm:text-lg ${
                              isCurrentPlan(plan) ? "text-gray-500" : ""
                            }`}
                          >
                            {plan}
                            {isCurrentPlan(plan) && (
                              <span className="block text-xs sm:text-sm text-gray-400 mt-1">
                                Current Plan
                              </span>
                            )}
                            {selectedPlan === plan && !isCurrentPlan(plan) && (
                              <span className="block text-xs sm:text-sm text-blue-600 mt-1 font-medium">
                                Selected
                              </span>
                            )}
                          </CardTitle>
                          <CardDescription
                            className={`text-sm sm:text-base ${
                              isCurrentPlan(plan) ? "text-gray-400" : ""
                            }`}
                          >
                            {getPlanPrice(plan)}{" "}
                            <span className="text-muted-foreground">
                              /month
                            </span>
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="px-4 sm:px-6">
                          <ul className="space-y-1 sm:space-y-2 text-xs sm:text-sm">
                            {getPlanFeatures(plan).map((feature, index) => (
                              <li
                                key={index}
                                className={
                                  isCurrentPlan(plan) ? "text-gray-400" : ""
                                }
                              >
                                {feature}
                              </li>
                            ))}
                          </ul>
                          <div className="mt-3 sm:mt-4">
                            <Button
                              type="button"
                              className="w-full text-sm sm:text-base py-2 sm:py-3"
                              disabled={isCurrentPlan(plan)}
                              variant={
                                isCurrentPlan(plan)
                                  ? "outline"
                                  : selectedPlan === plan
                                  ? "default"
                                  : "outline"
                              }
                            >
                              {isCurrentPlan(plan)
                                ? "Current Plan"
                                : selectedPlan === plan
                                ? "Selected"
                                : "Select"}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>

                {/* Change Plan Button */}
                <Button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 sm:py-4 text-base sm:text-lg font-semibold rounded-lg mt-4 sm:mt-6"
                  disabled={loading || !selectedPlan}
                >
                  {loading ? "Processing..." : "Update Billing"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {showConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Confirm Plan Change
              </h3>
              <p className="text-gray-600 mb-6">
                Are you sure you want to change your plan to{" "}
                <strong>{selectedPlan}</strong>? This will update your billing
                and credits immediately.
              </p>
              <div className="flex space-x-3">
                <Button
                  variant="outline"
                  onClick={() => setShowConfirmation(false)}
                  className="flex-1"
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleConfirmPlanChange}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                  disabled={loading}
                >
                  {loading ? "Updating..." : "Confirm Change"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </>
  );
};

export default PlanChange;
