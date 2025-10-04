// BusinessSettings.tsx
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import BusinessHeader from "@/components/BusinessHeader";
import { MapPin, Plus, Trash2, Calendar, QrCode, Download } from "lucide-react";
import QRCode from "qrcode";
import Footer from "@/components/Footer";

const BILLING_PORTAL_URL =
  "https://billing.stripe.com/p/login/test_aFa3cvcTN7x98khge7bfO00";

interface Location {
  address: string;
  queue: string[];
  smsCredits: number;
  customerCredits: number;
}

interface User {
  name: string;
  username: string;
  email: string;
  plan: string;
  locations: Location[];
  maxLocations: number;
  trial: boolean;
  trialDurationDays: number;
  createdAt: string;
}

const BusinessSettings = () => {
  const [me, setMe] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [newLocationAddress, setNewLocationAddress] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
  const [showQrCode, setShowQrCode] = useState(false);
  const [trialTimeLeft, setTrialTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
  } | null>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const trialCountdownRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  const locations: Location[] = me?.locations || [];
  const maxLocations = me?.maxLocations ?? 1;

  const onTrial =
    me &&
    (() => {
      const createdAt = new Date(me.createdAt);
      const trialDurationDays = me.trialDurationDays || 7;
      const trialEndDate = new Date(
        createdAt.getTime() + trialDurationDays * 24 * 60 * 60 * 1000
      );
      const now = new Date();
      return now <= trialEndDate;
    })();

  // Calculate trial time remaining
  useEffect(() => {
    const calculateTrialTimeLeft = () => {
      if (!me || !me.trial || !me.createdAt || !me.trialDurationDays)
        return null;
      const createdAt = new Date(me.createdAt);
      const trialDurationDays = me.trialDurationDays || 7;
      const trialEndDate = new Date(
        createdAt.getTime() + trialDurationDays * 24 * 60 * 60 * 1000
      );
      const now = new Date();
      const timeLeft = trialEndDate.getTime() - now.getTime();
      if (timeLeft <= 0) return null;
      const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
      const hours = Math.floor(
        (timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
      );
      const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
      return { days, hours, minutes };
    };

    if (trialCountdownRef.current) clearInterval(trialCountdownRef.current);
    if (me && me.trial) {
      setTrialTimeLeft(calculateTrialTimeLeft());
      trialCountdownRef.current = setInterval(() => {
        const timeLeft = calculateTrialTimeLeft();
        setTrialTimeLeft(timeLeft);
        if (!timeLeft && trialCountdownRef.current)
          clearInterval(trialCountdownRef.current);
      }, 60000);
    } else {
      setTrialTimeLeft(null);
    }
    return () => {
      if (trialCountdownRef.current) clearInterval(trialCountdownRef.current);
    };
  }, [me]);

  useEffect(() => {
    (async () => {
      try {
        const res = await api("/auth/me");
        setMe(res.user);
      } catch {
        // ignore errors
      }
    })();
  }, []);

  const getCurrentDate = () =>
    new Date().toLocaleDateString("en-US", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  // Add location
  const addLocation = async () => {
    if (!newLocationAddress.trim()) {
      toast({
        title: "Address required",
        description: "Please enter a location address.",
        variant: "destructive",
      });
      return;
    }
    if (locations.length >= maxLocations) {
      toast({
        title: "Limit reached",
        description: `You have reached the maximum locations (${maxLocations}).`,
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {
      const updated = await api("/auth/locations", {
        method: "POST",
        body: JSON.stringify({ address: newLocationAddress.trim() }),
      });
      setMe(updated.user);
      setNewLocationAddress("");
      toast({
        title: "Location added",
        description: "New location has been added successfully.",
      });
    } catch (e: Error) {
      toast({
        title: "Failed to add location",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Remove location
  const removeLocation = async (locationIndex: number) => {
    setLoading(true);
    try {
      const updatedLocations = locations.filter(
        (_, index) => index !== locationIndex
      );
      const updated = await api("/auth/me", {
        method: "PUT",
        body: JSON.stringify({ locations: updatedLocations }),
      });
      setMe(updated.user);
      toast({
        title: "Location removed",
        description: "Location has been removed successfully.",
      });
    } catch (e: Error) {
      toast({
        title: "Failed to remove location",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Generate QR Code
  const generateQrCode = async () => {
    if (!me?.username) {
      toast({
        title: "Error",
        description: "Business username not found",
        variant: "destructive",
      });
      return;
    }
    try {
      const queueUrl = `${window.location.origin}/queue/${me.username}`;
      const dataUrl = await QRCode.toDataURL(queueUrl, {
        width: 300,
        margin: 2,
        color: { dark: "#000000", light: "#FFFFFF" },
      });
      setQrCodeUrl(dataUrl);
      setShowQrCode(true);
      toast({
        title: "QR Code Generated",
        description: "Your queue QR code has been generated successfully",
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to generate QR code",
        variant: "destructive",
      });
    }
  };

  const downloadQrCode = () => {
    if (!qrCodeUrl) return;
    const link = document.createElement("a");
    link.download = `${me?.username || "business"}-queue-qr.png`;
    link.href = qrCodeUrl;
    link.click();
  };

  return (
    <>
      <BusinessHeader />
      <div className="min-h-screen pt-20 bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="container mx-auto px-4 py-8">
          {/* Trial banners */}
          {me && me.trial === true && me.trialDurationDays > 0 && (
            <>
              {(() => {
                const createdAt = new Date(me.createdAt);
                const trialDurationDays = me.trialDurationDays || 7;
                const trialEndDate = new Date(
                  createdAt.getTime() + trialDurationDays * 24 * 60 * 60 * 1000
                );
                const now = new Date();
                return now > trialEndDate;
              })() ? (
                <div className="mb-6">
                  <div className="bg-gradient-to-r from-red-500 to-red-600 rounded-xl shadow-lg p-4 md:p-6 text-white">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-3 md:space-y-0">
                      <div>
                        <h3 className="text-lg md:text-xl font-bold">
                          ⚠️ Trial Expired
                        </h3>
                        <p className="text-sm md:text-base opacity-90">
                          Your trial has expired. Upgrade to continue using
                          SeatPing with full features.
                        </p>
                      </div>
                      <div className="flex justify-end">
                        <Button
                          variant="outline"
                          className="border-white text-white hover:bg-white hover:text-red-600"
                          onClick={() => (window.location.href = "/payments")}
                        >
                          Upgrade Now
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mb-6">
                  <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl shadow-lg p-4 md:p-6 text-white">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-3 md:space-y-0">
                      <div>
                        <h3 className="text-lg md:text-xl font-bold">
                          You're on a Free Trial!
                        </h3>
                        <p className="text-sm md:text-base opacity-90">
                          Upgrade now to unlock unlimited locations and premium
                          features
                        </p>
                        {trialTimeLeft && (
                          <div className="mt-2 flex items-center space-x-2 text-blue-100">
                            <span className="text-sm font-medium">
                              Trial expires in: {trialTimeLeft.days}d{" "}
                              {trialTimeLeft.hours}h {trialTimeLeft.minutes}m
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex justify-end">
                        <Button
                          variant="outline"
                          className="border-white text-white hover:bg-white hover:text-blue-600"
                          onClick={() => (window.location.href = "/payments")}
                        >
                          Upgrade Now
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* No credits banner */}
          {me &&
            !me.trial &&
            locations.length > 0 &&
            locations.some(
              (location: Location) =>
                location.smsCredits === 0 && location.customerCredits === 0
            ) && (
              <div className="mb-6">
                <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-xl shadow-lg p-4 md:p-6 text-white">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-3 md:space-y-0">
                    <div>
                      <h3 className="text-lg md:text-xl font-bold">
                        ⚠️ No Credits Available
                      </h3>
                      <p className="text-sm md:text-base opacity-90">
                        You have no credits available. Please contact support or
                        upgrade your plan.
                      </p>
                    </div>
                    <div className="flex justify-end">
                      <Button
                        asChild
                        variant="outline"
                        className="border-white text-white hover:bg-white hover:text-orange-600"
                      >
                        <a
                          href={BILLING_PORTAL_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Change Plan
                        </a>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

          {/* Manage subscription banner */}
          {me && me.trial === false && me.trialDurationDays !== 0 && (
            <div className="mb-6">
              <div className="bg-gradient-to-r from-gray-600 to-gray-700 rounded-xl shadow-lg p-3 md:p-4 text-white">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
                  <div>
                    <h4 className="text-sm md:text-base font-semibold">
                      Manage Your Subscription
                    </h4>
                    <p className="text-xs md:text-sm opacity-80">
                      Change your plan or billing settings
                    </p>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="border-white text-white hover:bg-white hover:text-gray-700 text-xs md:text-sm"
                    >
                      <a
                        href={BILLING_PORTAL_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Manage Subscription
                      </a>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Expired trial banner */}
          {me && me.trial === true && me.trialDurationDays === 0 && (
            <div className="mb-6">
              <div className="bg-gradient-to-r from-red-500 to-red-600 rounded-xl shadow-lg p-3 md:p-4 text-white">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
                  <div>
                    <h4 className="text-sm md:text-base font-semibold">
                      Your trial has expired
                    </h4>
                    <p className="text-xs md:text-sm opacity-80">
                      Please upgrade to a paid plan to continue using our
                      service.
                    </p>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-white text-white hover:bg-white hover:text-gray-700 text-xs md:text-sm"
                      onClick={() => (window.location.href = "/payments")}
                    >
                      Upgrade
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Settings header */}
          <div className="bg-white rounded-xl shadow-sm p-4 md:p-6 mb-6">
            <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-gray-800">
                  Business Settings
                </h1>
                <p className="text-gray-600 text-sm md:text-base">
                  Manage your business locations and preferences
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <Calendar size={16} className="text-gray-400" />
                <span className="text-sm text-gray-600">
                  {getCurrentDate()}
                </span>
              </div>
            </div>
          </div>

          {/* Business info */}
          <div className="space-y-4 md:space-y-6">
            <Card className="bg-white rounded-xl shadow-sm border-0">
              <CardHeader className="p-4 md:p-6">
                <CardTitle className="text-lg md:text-xl text-gray-800">
                  Business Information
                </CardTitle>
                <CardDescription className="text-gray-600 text-sm md:text-base">
                  Your business details and account information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 p-4 md:p-6 pt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label
                      htmlFor="businessName"
                      className="text-sm md:text-base"
                    >
                      Business Name
                    </Label>
                    <Input
                      id="businessName"
                      value={me?.name || ""}
                      disabled
                      className="bg-gray-50 text-sm md:text-base"
                    />
                  </div>
                  <div>
                    <Label htmlFor="username" className="text-sm md:text-base">
                      Username
                    </Label>
                    <Input
                      id="username"
                      value={me?.username || ""}
                      disabled
                      className="bg-gray-50 text-sm md:text-base"
                    />
                  </div>
                  <div>
                    <Label htmlFor="email" className="text-sm md:text-base">
                      Email
                    </Label>
                    <Input
                      id="email"
                      value={me?.email || ""}
                      disabled
                      className="bg-gray-50 text-sm md:text-base"
                    />
                  </div>
                  <div>
                    <Label htmlFor="plan" className="text-sm md:text-base">
                      Plan
                    </Label>
                    <Input
                      id="plan"
                      value={me?.plan || "Basic"}
                      disabled
                      className="bg-gray-50 text-sm md:text-base"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* QR code generator */}
            <Card className="bg-white shadow-lg border-0 mb-6">
              <CardHeader className="bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-t-xl">
                <div className="flex flex-col space-y-2 md:flex-row md:items-center md:justify-between md:space-y-0">
                  <div>
                    <CardTitle className="text-lg md:text-xl font-bold">
                      <QrCode className="inline-block w-5 h-5 md:w-6 md:h-6 mr-2" />
                      Queue QR Code
                    </CardTitle>
                    <CardDescription className="text-purple-100 text-sm md:text-base">
                      Generate a QR code for your business queue
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 md:p-6">
                <div className="space-y-4">
                  <div className="text-center">
                    <p className="text-gray-600 text-sm md:text-base mb-4">
                      Generate a QR code that customers can scan to join your
                      queue at:
                    </p>
                    <code className="bg-gray-100 px-3 py-2 rounded text-sm text-blue-600 font-mono">
                      {window.location.origin}/queue/
                      {me?.username || "your-business"}
                    </code>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Button
                      onClick={generateQrCode}
                      className="bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      <QrCode size={16} className="mr-2" /> Generate QR Code
                    </Button>
                    {qrCodeUrl && (
                      <Button
                        onClick={downloadQrCode}
                        variant="outline"
                        className="border-purple-600 text-purple-600 hover:bg-purple-50"
                      >
                        <Download size={16} className="mr-2" /> Download QR Code
                      </Button>
                    )}
                  </div>
                  {showQrCode && qrCodeUrl && (
                    <div className="mt-6 text-center">
                      <div className="inline-block p-4 bg-white border-2 border-gray-200 rounded-xl shadow-sm">
                        <img
                          src={qrCodeUrl}
                          alt="Queue QR Code"
                          className="w-64 h-64 mx-auto"
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        Customers can scan this QR code to join your queue
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Location management (unchanged) */}
            <Card className="bg-white rounded-xl shadow-sm border-0">
              <CardHeader className="p-4 md:p-6">
                <CardTitle className="text-lg md:text-xl text-gray-800">
                  Location Management
                </CardTitle>
                <CardDescription className="text-gray-600 text-sm md:text-base">
                  Add and manage your business locations ({locations.length}/
                  {maxLocations} locations used)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 md:space-y-6 p-4 md:p-6 pt-0">
                {/* Add New Location */}
                <div className="border border-dashed border-gray-300 rounded-lg p-4 md:p-6">
                  <h3 className="text-base md:text-lg font-semibold text-gray-800 mb-3 md:mb-4">
                    Add New Location
                  </h3>
                  <div className="flex flex-col space-y-3 md:flex-row md:space-y-0 md:space-x-4">
                    <div className="flex-1">
                      <Label
                        htmlFor="newLocation"
                        className="text-sm md:text-base"
                      >
                        Location Address
                      </Label>
                      <Input
                        id="newLocation"
                        placeholder={
                          locations.length >= maxLocations
                            ? `Maximum ${maxLocations} locations reached`
                            : "Enter location address (e.g., 123 Main St, City, State)"
                        }
                        value={newLocationAddress}
                        onChange={(e) => setNewLocationAddress(e.target.value)}
                        onKeyPress={(e) => {
                          if (
                            e.key === "Enter" &&
                            locations.length < maxLocations
                          ) {
                            addLocation();
                          }
                        }}
                        disabled={locations.length >= maxLocations}
                        className={`mt-2 text-sm md:text-base ${
                          locations.length >= maxLocations
                            ? "bg-gray-100 cursor-not-allowed"
                            : ""
                        }`}
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        onClick={addLocation}
                        disabled={loading || locations.length >= maxLocations}
                        className="bg-blue-600 hover:bg-blue-700 text-white w-full md:w-auto text-sm md:text-base"
                      >
                        <Plus size={16} className="mr-2" /> Add Location
                      </Button>
                    </div>
                  </div>
                  {locations.length >= maxLocations && (
                    <p className="text-xs md:text-sm text-orange-600 mt-2">
                      You have reached the maximum number of locations for your
                      plan.
                    </p>
                  )}
                </div>

                {/* Existing Locations */}
                <div>
                  <h3 className="text-base md:text-lg font-semibold text-gray-800 mb-3 md:mb-4">
                    Current Locations
                  </h3>
                  {locations.length === 0 ? (
                    <div className="text-center py-6 md:py-8">
                      <MapPin className="w-10 h-10 md:w-12 md:h-12 text-gray-300 mx-auto mb-3 md:mb-4" />
                      <p className="text-gray-500 text-sm md:text-base">
                        No locations added yet.
                      </p>
                      <p className="text-xs md:text-sm text-gray-400 mt-1">
                        Add your first location above to get started.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {locations.map((location: Location, index: number) => (
                        <div
                          key={index}
                          className="flex flex-col space-y-3 md:flex-row md:items-center md:justify-between md:space-y-0 p-3 md:p-4 bg-gray-50 rounded-lg"
                        >
                          <div className="flex items-center space-x-3">
                            <MapPin className="w-4 h-4 md:w-5 md:h-5 text-gray-400 flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-gray-800 text-sm md:text-base break-words">
                                {location.address}
                              </p>
                              <p className="text-xs md:text-sm text-gray-500 mb-2">
                                {(location.queue || []).length} customers in
                                queue
                              </p>
                              <div className="flex flex-col sm:flex-row gap-2">
                                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                                  Customer Credits:{" "}
                                  {location?.customerCredits || 0}
                                </span>
                                <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                                  SMS Credits: {location?.smsCredits || 0}
                                </span>
                              </div>
                            </div>
                          </div>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50 w-full md:w-auto"
                                disabled={loading}
                              >
                                <Trash2 size={16} className="mr-2 md:mr-0" />
                                <span className="md:hidden">
                                  Remove Location
                                </span>
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="max-w-sm md:max-w-lg mx-4">
                              <AlertDialogHeader>
                                <AlertDialogTitle className="text-base md:text-lg">
                                  Remove Location
                                </AlertDialogTitle>
                                <AlertDialogDescription className="text-sm md:text-base">
                                  Are you sure you want to remove "
                                  {location.address}"? This action cannot be
                                  undone and will remove all customers from the
                                  queue at this location.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter className="flex-col space-y-2 md:flex-row md:space-y-0 md:space-x-2">
                                <AlertDialogCancel className="w-full md:w-auto">
                                  Cancel
                                </AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => removeLocation(index)}
                                  className="bg-red-600 hover:bg-red-700 w-full md:w-auto"
                                >
                                  Remove Location
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
};

export default BusinessSettings;
