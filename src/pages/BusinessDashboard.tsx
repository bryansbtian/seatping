import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import BusinessHeader from "@/components/BusinessHeader";
import {
  Users,
  Clock,
  TrendingUp,
  Star,
  RefreshCw,
  Calendar,
  ChevronDown,
} from "lucide-react";
import Footer from "@/components/Footer";

const BusinessDashboard = () => {
  const [me, setMe] = useState<any | null>(null);
  const [selectedLocationIndex, setSelectedLocationIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [trialTimeLeft, setTrialTimeLeft] = useState<{ days: number; hours: number; minutes: number } | null>(null);
  const trialCountdownRef = useRef<NodeJS.Timeout | null>(null);
  const locations = (me?.locations as any[]) || [];
  const maxLocations = me?.maxLocations ?? 1;
  // Check if account is still in trial period (≤ 7 days old)
  const onTrial = me && (() => {
    const createdAt = new Date(me.createdAt);
    const trialDurationDays = me.trialDurationDays || 7;
    const trialEndDate = new Date(createdAt.getTime() + (trialDurationDays * 24 * 60 * 60 * 1000));
    const now = new Date();
    return now <= trialEndDate;
  })();
  const { toast } = useToast();

  // Get current location and queue
  const currentLocation = locations[selectedLocationIndex];
  const queueData = currentLocation?.queue || [];

  // Calculate real-time statistics
  const calculateStats = () => {
    if (!currentLocation) {
      return {
        totalServed: 0,
        currentQueue: 0,
        avgWaitTime: 0,
        successRate: 0,
        leftToday: 0,
      };
    }

    const admittedCustomers = currentLocation.admittedCustomers || [];
    const removedCustomers = currentLocation.removedCustomers || [];
    const currentQueue = queueData.length;

    // Filter for today's customers
    const today = new Date().toDateString();
    const todayAdmitted = admittedCustomers.filter((customer: any) => {
      const admittedDate = new Date(customer.admittedAt);
      return admittedDate.toDateString() === today;
    });

    const todayRemoved = removedCustomers.filter((customer: any) => {
      const removedDate = new Date(customer.removedAt || customer.leftAt);
      return removedDate.toDateString() === today;
    });

    // Count customers who left today (not removed by business)
    const leftToday = removedCustomers.filter((customer: any) => {
      const leftDate = new Date(customer.leftAt);
      return leftDate.toDateString() === today;
    }).length;

    // Calculate average wait time (admitted customers only)
    let totalWaitTime = 0;
    let waitTimeCount = 0;

    todayAdmitted.forEach((customer: any) => {
      if (customer.joinedAt && customer.admittedAt) {
        const joinTime = new Date(customer.joinedAt).getTime();
        const admitTime = new Date(customer.admittedAt).getTime();
        const waitTime = (admitTime - joinTime) / (1000 * 60); // Convert to minutes
        totalWaitTime += waitTime;
        waitTimeCount++;
      }
    });

    const avgWaitTime =
      waitTimeCount > 0 ? Math.round(totalWaitTime / waitTimeCount) : 0;

    // Calculate success rate (admitted / (admitted + removed))
    const totalProcessed = todayAdmitted.length + todayRemoved.length;
    const successRate =
      totalProcessed > 0
        ? Math.round((todayAdmitted.length / totalProcessed) * 100)
        : 100;

    return {
      totalServed: todayAdmitted.length,
      currentQueue,
      avgWaitTime,
      successRate,
      leftToday,
    };
  };

  const todayStats = calculateStats();

  // Calculate trial time remaining
  const calculateTrialTimeLeft = () => {
    if (!me || !me.trial || !me.createdAt) {
      return null;
    }

    const createdAt = new Date(me.createdAt);
    const trialDurationDays = typeof me.trialDurationDays === 'number' ? me.trialDurationDays : 7;
    const trialEndDate = new Date(createdAt.getTime() + (trialDurationDays * 24 * 60 * 60 * 1000));
    const now = new Date();
    const timeLeft = trialEndDate.getTime() - now.getTime();

    if (timeLeft <= 0) {
      return null; // Trial has expired
    }

    const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));

    return { days, hours, minutes };
  };

  // Update trial countdown
  useEffect(() => {
    if (trialCountdownRef.current) {
      clearInterval(trialCountdownRef.current);
    }

    if (me && me.trial) {
      // Calculate initial time left
      setTrialTimeLeft(calculateTrialTimeLeft());

      // Update countdown every minute
      trialCountdownRef.current = setInterval(() => {
        const timeLeft = calculateTrialTimeLeft();
        setTrialTimeLeft(timeLeft);
        
        // If trial has expired, clear the interval
        if (!timeLeft) {
          if (trialCountdownRef.current) {
            clearInterval(trialCountdownRef.current);
          }
        }
      }, 60000); // Update every minute
    } else {
      setTrialTimeLeft(null);
    }

    return () => {
      if (trialCountdownRef.current) {
        clearInterval(trialCountdownRef.current);
      }
    };
  }, [me]);

  useEffect(() => {
    if (me && me.trial) {
      const createdAt = new Date(me.createdAt);
      const trialDurationDays = me.trialDurationDays || 0;
      const trialEndDate = new Date(createdAt.getTime() + (trialDurationDays * 24 * 60 * 60 * 1000));
      const now = new Date();
      const isExpired = now > trialEndDate;

      if (isExpired) {
        const updatedLocations = me.locations.map((location: any) => ({
          ...location,
          customerCredits: 0,
          smsCredits: 0,
        }));

        setMe((prevMe: any) => ({
          ...prevMe,
          locations: updatedLocations,
        }));
      }
    }
  }, [me]);

  useEffect(() => {
    (async () => {
      try {
        const res = await api("/auth/me");
        setMe(res.user);
      } catch {}
    })();
  }, []);

  // Auto-refresh queue data every 10 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await api("/auth/me");
        setMe(res.user);
      } catch {}
    }, 10000); // Refresh every 10 seconds

    return () => clearInterval(interval);
  }, []);

  // Function to admit a customer (they go to Step 5)
  const admitCustomer = async (customerIndex: number) => {
    if (!currentLocation) return;

    setLoading(true);
    try {
      const customer = queueData[customerIndex];
      const customerId = `${customer.firstName}${customer.lastName}${customer.joinedAt}`;

      // Call the new admit endpoint
      await api(`/auth/business/${me?.username}/queue/${customerId}/admit`, {
        method: "POST",
      });

      // Refresh the business data
      const updated = await api("/auth/me");
      setMe(updated.user);

      toast({
        title: "Customer admitted",
        description: `${customer.firstName} ${customer.lastName} has been admitted and will proceed to their turn.`,
      });
    } catch (error: any) {
      toast({
        title: "Failed to admit customer",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Function to remove a customer from queue (they get kicked out)
  const removeCustomer = async (customerIndex: number) => {
    if (!currentLocation) return;

    setLoading(true);
    try {
      const customer = queueData[customerIndex];
      const customerId = `${customer.firstName}${customer.lastName}${customer.joinedAt}`;

      // Call the new remove endpoint
      await api(`/auth/business/${me?.username}/queue/${customerId}`, {
        method: "DELETE",
      });

      // Refresh the business data
      const updated = await api("/auth/me");
      setMe(updated.user);

      toast({
        title: "Customer removed",
        description: `${customer.firstName} ${customer.lastName} has been removed from the queue.`,
      });
    } catch (error: any) {
      toast({
        title: "Failed to remove customer",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Format time since customer joined
  const formatTimeSince = (joinedAt: string) => {
    const joined = new Date(joinedAt);
    const now = new Date();
    const diffMs = now.getTime() - joined.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    return `${diffHours}h ${diffMins % 60}m ago`;
  };

  // Get current date
  const getCurrentDate = () => {
    const now = new Date();
    return now.toLocaleDateString("en-US", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <>
      <BusinessHeader />
      <div className="min-h-screen pt-20 bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="container mx-auto px-4 py-8">
          {/* Trial Banner Logic */}
          {me && me.trial === true && (
            <>
              {/* Trial Expired Banner - Shows when trial has expired (account > 7 days old) */}
              {(() => {
                const createdAt = new Date(me.createdAt);
                const trialDurationDays = typeof me.trialDurationDays === 'number' ? me.trialDurationDays : 7;
                const trialEndDate = new Date(createdAt.getTime() + (trialDurationDays * 24 * 60 * 60 * 1000));
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
                          Your trial has expired. Upgrade to continue using SeatPing with full features.
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
                /* Trial Active Banner - Shows when trial is still active */
                <div className="mb-6">
                  <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl shadow-lg p-4 md:p-6 text-white">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-3 md:space-y-0">
                      <div>
                        <h3 className="text-lg md:text-xl font-bold">
                          You're on a Free Trial!
                        </h3>
                        <p className="text-sm md:text-base opacity-90">
                          Upgrade now to unlock unlimited locations and premium features
                        </p>
                        {trialTimeLeft && (
                          <div className="mt-2 flex items-center space-x-2 text-blue-100">
                            <span className="text-sm font-medium">
                              Trial expires in: {trialTimeLeft.days}d {trialTimeLeft.hours}h {trialTimeLeft.minutes}m
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

          {/* Show upgrade banner for users who are not on trial but have 0 credits */}
          {me && me.trial === false && currentLocation && (currentLocation.smsCredits === 0 && currentLocation.customerCredits === 0) && (
            <div className="mb-6">
              <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-xl shadow-lg p-4 md:p-6 text-white">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-3 md:space-y-0">
                <div>
                    <h3 className="text-lg md:text-xl font-bold">
                      ⚠️ No Credits Available
                    </h3>
                    <p className="text-sm md:text-base opacity-90">
                      You have no credits available. Please contact support or upgrade your plan.
                    </p>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      className="border-white text-white hover:bg-white hover:text-orange-600"
                      onClick={() => (window.location.href = "/plan-change")}
                    >
                      Change Plan
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Dashboard Header */}
          <div className="bg-white rounded-xl shadow-sm p-4 md:p-6 mb-6">
            <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-gray-800">
                  Hello {me?.name || "Business Owner"}!
                </h1>
                <p className="text-gray-600 text-sm md:text-base">
                  Here is your daily statistic
                </p>
                {currentLocation && (
                  <div className="flex flex-col sm:flex-row gap-2 mt-2">
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                      Customer Credits: {currentLocation?.customerCredits || 0}
                    </span>
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                      SMS Credits: {currentLocation?.smsCredits || 0}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-col space-y-2 md:flex-row md:items-center md:space-y-0 md:space-x-4">
                <div className="flex items-center space-x-2">
                  <Calendar size={16} className="text-gray-400" />
                  <span className="text-sm text-gray-600">
                    {getCurrentDate()}
                  </span>
                </div>

                {/* Location Selector */}
                <div className="relative">
                <select
                    className="appearance-none bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full md:w-auto"
                    value={selectedLocationIndex}
                  onChange={(e) =>
                    setSelectedLocationIndex(Number(e.target.value))
                  }
                >
                    {locations.length > 0 ? (
                      locations.map((loc, idx) => (
                    <option key={idx} value={idx}>
                      {loc?.address || `Location ${idx + 1}`}
                    </option>
                      ))
                    ) : (
                      <option value={0}>No locations</option>
                    )}
                </select>
                  <ChevronDown
                    size={16}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 md:gap-6 mb-6">
            <Card className="p-4 md:p-6 bg-white rounded-xl shadow-sm border-0">
              <div className="flex items-center justify-between">
              <div>
                  <p className="text-gray-600 text-xs md:text-sm">
                    Total Queue
                  </p>
                  <p className="text-2xl md:text-3xl font-bold text-gray-800">
                    {todayStats.currentQueue}
                  </p>
                </div>
                <div className="p-2 md:p-3 bg-blue-100 rounded-full">
                  <Users className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
                </div>
              </div>
          </Card>

            <Card className="p-4 md:p-6 bg-white rounded-xl shadow-sm border-0">
              <div className="flex items-center justify-between">
              <div>
                  <p className="text-gray-600 text-xs md:text-sm">
                    Avg Wait Time
                  </p>
                  <p className="text-2xl md:text-3xl font-bold text-gray-800">
                    {todayStats.avgWaitTime}m
                  </p>
              </div>
                <div className="p-2 md:p-3 bg-green-100 rounded-full">
                  <Clock className="w-5 h-5 md:w-6 md:h-6 text-green-600" />
              </div>
              </div>
            </Card>

            <Card className="p-4 md:p-6 bg-white rounded-xl shadow-sm border-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-xs md:text-sm">
                    Served Today
                  </p>
                  <p className="text-2xl md:text-3xl font-bold text-gray-800">
                    {todayStats.totalServed}
                  </p>
                </div>
                <div className="p-2 md:p-3 bg-orange-100 rounded-full">
                  <TrendingUp className="w-5 h-5 md:w-6 md:h-6 text-orange-600" />
                </div>
              </div>
            </Card>

            <Card className="p-4 md:p-6 bg-white rounded-xl shadow-sm border-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-xs md:text-sm">
                    Success Rate
                  </p>
                  <p className="text-2xl md:text-3xl font-bold text-gray-800">
                    {todayStats.successRate}%
                  </p>
                </div>
                <div className="p-2 md:p-3 bg-purple-100 rounded-full">
                  <Star className="w-5 h-5 md:w-6 md:h-6 text-purple-600" />
                </div>
              </div>
            </Card>

            <Card className="p-4 md:p-6 bg-white rounded-xl shadow-sm border-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-xs md:text-sm">
                    Left Today
                  </p>
                  <p className="text-2xl md:text-3xl font-bold text-gray-800">
                    {todayStats.leftToday}
                  </p>
                </div>
                <div className="p-2 md:p-3 bg-orange-100 rounded-full">
                  <Users className="w-5 h-5 md:w-6 md:h-6 text-orange-600" />
                </div>
              </div>
            </Card>
          </div>

          {/* Queue Management */}
          <Card className="bg-white rounded-xl shadow-sm border-0">
            <CardHeader className="border-b border-gray-100 p-4 md:p-6">
              <div className="flex flex-col space-y-3 md:flex-row md:items-center md:justify-between md:space-y-0">
                <div>
                  <CardTitle className="text-lg md:text-xl text-gray-800">
                    Queue Management
              </CardTitle>
                  <CardDescription className="text-gray-600 text-sm">
                    {currentLocation
                      ? `Managing queue for: ${currentLocation.address}`
                      : "No location selected"}
                  </CardDescription>
                </div>
                <div className="flex flex-col space-y-2 md:flex-row md:items-center md:space-y-0 md:space-x-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        const res = await api("/auth/me");
                        setMe(res.user);
                        toast({
                          title: "Queue refreshed",
                          description: "Queue data has been updated.",
                        });
                      } catch (error: any) {
                        toast({
                          title: "Failed to refresh",
                          description: error.message || "Please try again.",
                          variant: "destructive",
                        });
                      }
                    }}
                    disabled={loading}
                    className="flex items-center space-x-2 w-full md:w-auto"
                  >
                    <RefreshCw size={16} />
                    <span>Refresh</span>
                  </Button>
                  <Badge
                    variant="secondary"
                    className="bg-blue-100 text-blue-700 text-center md:text-left"
                  >
                    {queueData.length}{" "}
                    {queueData.length === 1 ? "customer" : "customers"}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 md:p-6">
              {queueData.length === 0 ? (
                <div className="text-center py-8 md:py-12">
                  <Users className="w-10 h-10 md:w-12 md:h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 text-sm md:text-base">
                    No customers in queue at this location.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 md:space-y-4">
                  {queueData.map((customer: any, index: number) => (
                    <div
                      key={index}
                      className="flex flex-col space-y-3 md:flex-row md:items-center md:justify-between md:space-y-0 p-3 md:p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center space-x-3 md:space-x-4">
                        <div className="w-8 h-8 md:w-10 md:h-10 bg-gradient-to-r from-blue-400 to-blue-600 rounded-full flex items-center justify-center text-white font-semibold text-sm md:text-base">
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-800 text-sm md:text-base">
                            {customer.firstName} {customer.lastName}
                          </h3>
                          <div className="flex flex-col space-y-1 md:flex-row md:items-center md:space-y-0 md:space-x-4 text-xs md:text-sm text-gray-600">
                            <span>
                              Joined: {formatTimeSince(customer.joinedAt)}
                            </span>
                            <span className="hidden md:inline">•</span>
                            <span>
                              {customer.numGuests}{" "}
                              {customer.numGuests === 1 ? "guest" : "guests"}
                            </span>
                            <span className="hidden md:inline">•</span>
                            <span>
                              {customer.waitingPreference === "on_premises"
                                ? "Stay on Premises"
                                : "Wait Anywhere"}
                            </span>
                          </div>
                          {customer.phoneNumber && (
                            <p className="text-xs md:text-sm text-gray-500 mt-1">
                              Phone: {customer.phoneNumber}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 md:space-x-3 ml-11 md:ml-0">
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white flex-1 md:flex-none"
                          onClick={() => admitCustomer(index)}
                          disabled={loading}
                        >
                          Admit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => removeCustomer(index)}
                          disabled={loading}
                          className="flex-1 md:flex-none"
                        >
                          Remove
                </Button>
              </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recently Left Customers */}
          {currentLocation?.removedCustomers && currentLocation.removedCustomers.length > 0 && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Users className="w-5 h-5" />
                  <span>Recently Left Customers</span>
                </CardTitle>
                <CardDescription>
                  Customers who have left the queue recently
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 md:p-6">
                <div className="space-y-3 md:space-y-4">
                  {currentLocation.removedCustomers
                    .slice(-5) // Show last 5 customers
                    .map((customer: any, index: number) => (
                      <div
                        key={index}
                        className="flex flex-col space-y-3 md:flex-row md:items-center md:justify-between md:space-y-0 p-3 md:p-4 bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center space-x-3 md:space-x-4">
                          <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm md:text-base ${
                            customer.status === 'left' 
                              ? 'bg-orange-500' 
                              : 'bg-red-500'
                          }`}>
                            {customer.status === 'left' ? '👋' : '❌'}
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold text-gray-800 text-sm md:text-base">
                              {customer.firstName} {customer.lastName}
                            </h3>
                            <div className="flex flex-col space-y-1 md:flex-row md:items-center md:space-y-0 md:space-x-4 text-xs md:text-sm text-gray-600">
                              <span>
                                {customer.status === 'left' ? 'Left' : 'Removed'}: {formatTimeSince(customer.leftAt || customer.removedAt)}
                              </span>
                              <span className="hidden md:inline">•</span>
                              <span>
                                {customer.numGuests}{" "}
                                {customer.numGuests === 1 ? "guest" : "guests"}
                              </span>
                              <span className="hidden md:inline">•</span>
                              <span>
                                {customer.waitingPreference === "on_premises"
                                  ? "Stay on Premises"
                                  : "Wait Anywhere"}
                              </span>
                            </div>
                            {customer.phoneNumber && (
                              <p className="text-xs md:text-sm text-gray-500 mt-1">
                                Phone: {customer.phoneNumber}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="ml-11 md:ml-0">
                          <Badge
                            variant={customer.status === 'left' ? 'secondary' : 'destructive'}
                            className="text-xs"
                          >
                            {customer.status === 'left' ? 'Left Queue' : 'Removed by Business'}
                          </Badge>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      <Footer />
    </>
  );
};

export default BusinessDashboard;
