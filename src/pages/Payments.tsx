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
import { CreditCard, Edit, Clock } from "lucide-react";

const Payments = () => {
  const [me, setMe] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState("card");
  const [formData, setFormData] = useState({
    cardholderName: "",
    cardNumber: "",
    expiryMonth: "",
    expiryYear: "",
    cvv: "",
  });
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
        setSelectedPlan(res.user.plan || "Starter");
      } catch (error) {
        console.error("Failed to fetch user data:", error);
      }
    })();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

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

    if (paymentMethod === "card") {
      if (!formData.cardholderName || !formData.cardNumber || !formData.expiryMonth || !formData.expiryYear || !formData.cvv) {
        toast({
          title: "Payment Details Required",
          description: "Please fill in all payment details.",
          variant: "destructive",
        });
        return;
      }
    }

    setLoading(true);
    try {
      // Here you would integrate with your payment processor
      // For now, we'll simulate a successful payment
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Update user's plan
      await api("/auth/purchase-plan", {
        method: "POST",
        body: JSON.stringify({ plan: selectedPlan }),
      });

      toast({
        title: "Payment Successful!",
        description: `Your plan has been upgraded to ${selectedPlan}.`,
        variant: "default",
      });

      // Redirect to dashboard
      navigate("/business/dashboard");
    } catch (error) {
      toast({
        title: "Payment Failed",
        description: "There was an error processing your payment. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getPlanPrice = (plan: string) => {
    switch (plan) {
      case "Starter":
        return "Rp 449.000";
      case "Professional":
        return "Rp 979.000";
      default:
        return "Rp 449.000";
    }
  };

  const getPlanFeatures = (plan: string) => {
    switch (plan) {
      case "Starter":
        return [
          "• 1 Location",
          "• 200 SMS/Month",
          "• 50 Customers/Day",
        ];
      case "Professional":
        return [
          "• 3 Locations",
          "• 500 SMS/Month",
          "• 100 Customers/Day",
        ];
      default:
        return [];
    }
  };

  const isCurrentPlan = (plan: string) => plan === currentPlan;

  return (
    <>
      <BusinessHeader />
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-teal-50 to-blue-100 py-24 sm:py-16 md:py-24 lg:py-32 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <Card className="shadow-xl rounded-xl border-0">
            <CardHeader className="text-center px-4 sm:px-6 lg:px-8">
              <CardTitle className="text-2xl sm:text-3xl lg:text-4xl font-bold">Payment Options</CardTitle>
              {selectedPlan && (
                <div className="flex flex-col sm:flex-row items-center justify-center space-y-2 sm:space-y-0 sm:space-x-4 text-gray-600">
                  <span className="text-sm sm:text-base text-center">Plan - {selectedPlan} {getPlanPrice(selectedPlan)}/month</span>
                  
                </div>
              )}
              {selectedPlan && (
                <CardDescription className="text-base sm:text-lg font-semibold text-center">
                  Total - {getPlanPrice(selectedPlan)}/month
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
                    {["Starter", "Professional"].map((plan) => (
                      <Card
                        key={plan}
                        className={`shadow-xl cursor-pointer transition-all ${
                          !onTrial && isCurrentPlan(plan)
                            ? "border-2 border-gray-300 bg-gray-50 opacity-60"
                            : selectedPlan === plan
                            ? "border-2 border-blue-500 bg-blue-50 shadow-2xl"
                            : "border-2 border-transparent hover:border-primary hover:shadow-2xl"
                        }`}
                        onClick={() => handlePlanChange(plan)}
                      >
                        <CardHeader className="text-center px-4 sm:px-6">
                          <CardTitle className={`text-base sm:text-lg ${!onTrial && isCurrentPlan(plan) ? "text-gray-500" : ""}`}>
                            {plan}
                            {!onTrial && isCurrentPlan(plan) && (
                              <span className="block text-xs sm:text-sm text-gray-400 mt-1">
                                Current Plan
                              </span>
                            )}
                            {selectedPlan === plan && !(!onTrial && isCurrentPlan(plan)) && (
                              <span className="block text-xs sm:text-sm text-blue-600 mt-1 font-medium">
                                Selected
                              </span>
                            )}
                          </CardTitle>
                          <CardDescription className={`text-sm sm:text-base ${!onTrial && isCurrentPlan(plan) ? "text-gray-400" : ""}`}>
                            {getPlanPrice(plan)}{" "}
                            <span className="text-muted-foreground">/month</span>
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="px-4 sm:px-6">
                          <ul className="space-y-1 sm:space-y-2 text-xs sm:text-sm">
                            {getPlanFeatures(plan).map((feature, index) => (
                              <li key={index} className={!onTrial && isCurrentPlan(plan) ? "text-gray-400" : ""}>
                                {feature}
                              </li>
                            ))}
                          </ul>
                          <div className="mt-3 sm:mt-4">
                            <Button
                              type="button"
                              className="w-full text-sm sm:text-base py-2 sm:py-3"
                              disabled={!onTrial && isCurrentPlan(plan)}
                              variant={!onTrial && isCurrentPlan(plan) ? "outline" : selectedPlan === plan ? "default" : "outline"}
                            >
                              {!onTrial && isCurrentPlan(plan) ? "Current Plan" : selectedPlan === plan ? "Selected" : "Select"}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
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
                  <RadioGroup
                    value={paymentMethod}
                    onValueChange={setPaymentMethod}
                    className="space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-3 sm:space-y-0 sm:space-x-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                      <RadioGroupItem value="card" id="card" className="text-green-600" />
                      <div className="flex-1">
                        <Label htmlFor="card" className="text-sm sm:text-base font-medium text-green-800">
                          Credit & Debit cards
                        </Label>
                        <p className="text-xs sm:text-sm text-green-600">
                          Transaction fee may apply
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                        <span className="text-xs bg-blue-600 text-white px-2 sm:px-3 py-1 rounded-md font-medium">VISA</span>
                        <span className="text-xs bg-red-500 text-white px-2 sm:px-3 py-1 rounded-md font-medium">MasterCard</span>
                        <span className="text-xs bg-blue-700 text-white px-2 sm:px-3 py-1 rounded-md font-medium">Maestro</span>
                      </div>
                    </div>


                  </RadioGroup>
                </div>

                {/* Credit Card Form */}
                {paymentMethod === "card" && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                      <div className="space-y-2 sm:space-y-3">
                        <Label htmlFor="cardholderName" className="text-sm sm:text-base text-gray-700 font-medium">Cardholder Name</Label>
                        <Input
                          id="cardholderName"
                          name="cardholderName"
                          placeholder="Enter cardholder name"
                          value={formData.cardholderName}
                          onChange={handleChange}
                          className="border-gray-300 focus:border-green-500 focus:ring-green-500 text-sm sm:text-base"
                          required
                        />
                      </div>
                      <div className="space-y-2 sm:space-y-3">
                        <Label htmlFor="cardNumber" className="text-sm sm:text-base text-gray-700 font-medium">Card Number</Label>
                        <div className="relative">
                          <Input
                            id="cardNumber"
                            name="cardNumber"
                            placeholder="1234 5678 9012 3456"
                            value={formData.cardNumber}
                            onChange={handleChange}
                            maxLength={19}
                            className="border-gray-300 focus:border-green-500 focus:ring-green-500 pr-16 text-sm sm:text-base"
                            required
                          />
                          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                            <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded font-medium">VISA</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                      <div className="space-y-2 sm:space-y-3">
                        <Label htmlFor="expiryMonth" className="text-sm sm:text-base text-gray-700 font-medium">End Date</Label>
                        <div className="grid grid-cols-2 gap-2 sm:gap-3">
                          <select
                            name="expiryMonth"
                            value={formData.expiryMonth}
                            onChange={(e) => setFormData(prev => ({ ...prev, expiryMonth: e.target.value }))}
                            className="px-2 sm:px-3 py-2 border border-gray-300 rounded-md focus:border-green-500 focus:ring-green-500 text-sm sm:text-base"
                            required
                          >
                            <option value="">mm</option>
                            {Array.from({ length: 12 }, (_, i) => i + 1).map(month => (
                              <option key={month} value={month.toString().padStart(2, '0')}>
                                {month.toString().padStart(2, '0')}
                              </option>
                            ))}
                          </select>
                          <select
                            name="expiryYear"
                            value={formData.expiryYear}
                            onChange={(e) => setFormData(prev => ({ ...prev, expiryYear: e.target.value }))}
                            className="px-2 sm:px-3 py-2 border border-gray-300 rounded-md focus:border-green-500 focus:ring-green-500 text-sm sm:text-base"
                            required
                          >
                            <option value="">yyyy</option>
                            {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() + i).map(year => (
                              <option key={year} value={year}>{year}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="space-y-2 sm:space-y-3">
                        <Label htmlFor="cvv" className="text-sm sm:text-base text-gray-700 font-medium">CVV</Label>
                        <div className="flex items-center space-x-2 sm:space-x-3">
                          <Input
                            id="cvv"
                            name="cvv"
                            placeholder="123"
                            value={formData.cvv}
                            onChange={handleChange}
                            maxLength={4}
                            className="w-20 sm:w-24 border-gray-300 focus:border-green-500 focus:ring-green-500 text-sm sm:text-base"
                            required
                          />
                          <div className="flex items-center space-x-1 sm:space-x-2 text-xs sm:text-sm text-gray-500">
                            <div className="w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-gray-200 flex items-center justify-center">
                              <span className="text-xs">i</span>
                            </div>
                            <span>3 digits</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

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
                  className="w-full bg-red-600 hover:bg-red-700 text-white py-3 sm:py-4 text-base sm:text-lg font-semibold rounded-lg mt-4 sm:mt-6"
                  disabled={loading || !selectedPlan || !acceptTerms}
                >
                  {loading ? "Processing..." : "Pay Now ≫"}
                </Button>
              </form>



              {/* Trial Banner */}
              {onTrial && (
                <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl p-3 sm:p-4 text-white text-center">
                  <div className="flex items-center justify-center space-x-2 mb-2">
                    <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
                    <span className="text-sm sm:text-base font-semibold">Free Trial Active</span>
                  </div>
                  <p className="text-xs sm:text-sm opacity-90">
                    Upgrade now to unlock premium features and remove trial limitations
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <Footer />
    </>
  );
};

export default Payments;
