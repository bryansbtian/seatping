import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, ArrowRight } from "lucide-react";
import BusinessHeader from "@/components/BusinessHeader";
import Footer from "@/components/Footer";

const PaymentSuccess = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [countdown, setCountdown] = useState(5);

  const sessionId = searchParams.get("session_id");
  const plan = searchParams.get("plan") || "your selected plan";

  useEffect(() => {
    // Countdown timer to redirect to dashboard
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          navigate("/business/dashboard");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [navigate]);

  return (
    <>
      <BusinessHeader />
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-green-100 py-24 sm:py-16 md:py-24 lg:py-32 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto">
          <Card className="shadow-xl rounded-xl border-0">
            <CardHeader className="text-center px-4 sm:px-6 lg:px-8">
              <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <CardTitle className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-green-800">
                Payment Successful!
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 px-4 sm:px-6 lg:px-8 text-center">
              <div className="space-y-4">
                <p className="text-lg text-gray-700">
                  Thank you for your payment! Your subscription to the{" "}
                  <span className="font-semibold text-green-700">{plan}</span>{" "}
                  has been activated.
                </p>
                
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h3 className="font-semibold text-green-800 mb-2">What's Next?</h3>
                  <ul className="text-sm text-green-700 space-y-1 text-left">
                    <li>• Your account has been upgraded</li>
                    <li>• You now have access to all premium features</li>
                    <li>• Your billing cycle has started</li>
                    <li>• You'll receive a confirmation email shortly</li>
                  </ul>
                </div>

                {sessionId && (
                  <p className="text-xs text-gray-500">
                    Session ID: {sessionId}
                  </p>
                )}
              </div>

              <div className="space-y-4">
                <Button
                  onClick={() => navigate("/business/dashboard")}
                  className="w-full bg-green-600 hover:bg-green-700 text-white py-3 sm:py-4 text-base sm:text-lg font-semibold rounded-lg"
                >
                  Go to Dashboard
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
                
                <p className="text-sm text-gray-500">
                  Redirecting automatically in {countdown} seconds...
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <Footer />
    </>
  );
};

export default PaymentSuccess;

