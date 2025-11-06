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
  BarChart3,
  LogOut,
  X,
} from "lucide-react";
import Footer from "@/components/Footer";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const BusinessDashboard = () => {
  const [me, setMe] = useState<any | null>(null);
  const [selectedLocationIndex, setSelectedLocationIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [analyticsTimeframe, setAnalyticsTimeframe] = useState<
    "daily" | "weekly"
  >("daily");
  const [trialTimeLeft, setTrialTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
  } | null>(null);
  const trialCountdownRef = useRef<NodeJS.Timeout | null>(null);
  const [timerTick, setTimerTick] = useState(0); // For updating countdown timers
  const locations = (me?.locations as any[]) || [];
  const maxLocations = me?.maxLocations ?? 1;
  // Check if account is still in trial period (≤ 7 days old)
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

    // Filter out no-shows from served count
    const todayServed = todayAdmitted.filter((customer: any) => {
      return customer.finalStatus !== "no_show";
    });

    // Count no-shows from admitted customers
    const todayNoShows = todayAdmitted.filter((customer: any) => {
      return customer.finalStatus === "no_show";
    }).length;

    const todayRemoved = removedCustomers.filter((customer: any) => {
      const removedDate = new Date(customer.removedAt || customer.leftAt);
      return removedDate.toDateString() === today;
    });

    // Count customers who left today (not removed by business)
    const leftToday = removedCustomers.filter((customer: any) => {
      const leftDate = new Date(customer.leftAt);
      return leftDate.toDateString() === today;
    }).length;

    // Calculate average wait time (served customers only, excluding no-shows)
    let totalWaitTime = 0;
    let waitTimeCount = 0;

    todayServed.forEach((customer: any) => {
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

    // Calculate success rate (served / (served + no-shows + removed))
    const totalProcessed =
      todayServed.length + todayNoShows + todayRemoved.length;
    const successRate =
      totalProcessed > 0
        ? Math.round((todayServed.length / totalProcessed) * 100)
        : 100;

    return {
      totalServed: todayServed.length,
      currentQueue,
      avgWaitTime,
      successRate,
      leftToday: leftToday + todayNoShows, // Include no-shows in the left count
    };
  };

  const todayStats = calculateStats();

  // Calculate trial time remaining
  const calculateTrialTimeLeft = () => {
    if (!me || !me.trial || !me.createdAt) {
      return null;
    }

    const createdAt = new Date(me.createdAt);
    const trialDurationDays =
      typeof me.trialDurationDays === "number" ? me.trialDurationDays : 7;
    const trialEndDate = new Date(
      createdAt.getTime() + trialDurationDays * 24 * 60 * 60 * 1000
    );
    const now = new Date();
    const timeLeft = trialEndDate.getTime() - now.getTime();

    if (timeLeft <= 0) {
      return null; // Trial has expired
    }

    const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
    const hours = Math.floor(
      (timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
    );
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
      const trialEndDate = new Date(
        createdAt.getTime() + trialDurationDays * 24 * 60 * 60 * 1000
      );
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

  // Update timer every second for admitted customers countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setTimerTick((prev) => prev + 1);
    }, 1000);

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

  // Function to confirm customer arrival
  const confirmArrival = async (customer: any) => {
    if (!me) return;

    setLoading(true);
    try {
      const customerId = `${customer.firstName}${customer.lastName}${customer.joinedAt}`;

      await api(
        `/auth/business/${me.username}/admitted/${customerId}/confirm-arrival`,
        {
          method: "POST",
        }
      );

      // Refresh the business data
      const updated = await api("/auth/me");
      setMe(updated.user);

      toast({
        title: "Arrival confirmed",
        description: `${customer.firstName} ${customer.lastName} has been marked as arrived.`,
      });
    } catch (error: any) {
      toast({
        title: "Failed to confirm arrival",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Function to mark customer as no-show
  const markNoShow = async (customer: any) => {
    if (!me) return;

    setLoading(true);
    try {
      const customerId = `${customer.firstName}${customer.lastName}${customer.joinedAt}`;

      await api(
        `/auth/business/${me.username}/admitted/${customerId}/mark-no-show`,
        {
          method: "POST",
        }
      );

      // Refresh the business data
      const updated = await api("/auth/me");
      setMe(updated.user);

      toast({
        title: "Marked as no-show",
        description: `${customer.firstName} ${customer.lastName} has been marked as a no-show.`,
      });
    } catch (error: any) {
      toast({
        title: "Failed to mark no-show",
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

  // Calculate time remaining for admitted customer
  const getTimeRemaining = (admittedAt: string) => {
    const admitted = new Date(admittedAt);
    const now = new Date();
    const elapsed = now.getTime() - admitted.getTime();
    const fiveMinutes = 5 * 60 * 1000; // 5 minutes in milliseconds
    const remaining = Math.max(0, fiveMinutes - elapsed);

    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);

    return { minutes, seconds, expired: remaining === 0 };
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

  // Analytics utility functions
  // --- replace the whole getDailyWeeklySummaryData with this ---
  // Returns chart rows for either "daily" (last 7 days) or "weekly" (last 5 weeks),
  // with weekly labels like "Week of Oct 6".
  const getDailyWeeklySummaryData = (): {
    date: string;
    served: number;
    avgWait: number;
    noShows: number;
  }[] => {
    if (!currentLocation) return [];

    const admittedCustomers = currentLocation.admittedCustomers || [];
    const removedCustomers = currentLocation.removedCustomers || [];

    // ---- helpers
    const startOfWeek = (d: Date) => {
      const x = new Date(d);
      x.setHours(0, 0, 0, 0);
      // Sunday-start weeks. For Monday-start use: x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
      x.setDate(x.getDate() - x.getDay());
      return x;
    };

    const fmtWeekLabel = (start: Date) =>
      `Week of ${start.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })}`;

    // ---- DAILY: last 7 calendar days
    if (analyticsTimeframe === "daily") {
      const now = new Date();
      const days = 7;

      const dataMap = new Map<
        string,
        { date: string; served: number; avgWait: number; noShows: number }
      >();
      const waitTimes = new Map<string, number[]>();

      // seed 7 days
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        const label = d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
        dataMap.set(key, { date: label, served: 0, avgWait: 0, noShows: 0 });
        waitTimes.set(key, []);
      }

      // served + wait (exclude no-shows from served count)
      for (const c of admittedCustomers) {
        if (!c.admittedAt) continue;
        const admit = new Date(c.admittedAt);
        const key = admit.toISOString().slice(0, 10);
        if (!dataMap.has(key)) continue;

        // Only count as served if not a no-show
        if (c.finalStatus !== "no_show") {
          dataMap.get(key)!.served += 1;

          if (c.joinedAt) {
            const wt =
              (new Date(c.admittedAt).getTime() -
                new Date(c.joinedAt).getTime()) /
              60000;
            waitTimes.get(key)!.push(wt);
          }
        }
      }

      // avg wait per day
      for (const [key, times] of waitTimes.entries()) {
        if (times.length) {
          dataMap.get(key)!.avgWait = Math.round(
            times.reduce((a, b) => a + b, 0) / times.length
          );
        }
      }

      // no-shows per day - include both removed customers and admitted no-shows
      for (const c of removedCustomers) {
        if (c.status === "left" && c.leftAt) {
          const key = new Date(c.leftAt).toISOString().slice(0, 10);
          if (dataMap.has(key)) dataMap.get(key)!.noShows += 1;
        }
      }
      // Add admitted customers marked as no-show
      for (const c of admittedCustomers) {
        if (c.finalStatus === "no_show" && c.admittedAt) {
          const key = new Date(c.admittedAt).toISOString().slice(0, 10);
          if (dataMap.has(key)) dataMap.get(key)!.noShows += 1;
        }
      }

      return Array.from(dataMap.values());
    }

    // ---- WEEKLY: last 5 calendar weeks (oldest → newest)
    const weeks = 5;
    const now = new Date();

    type Row = {
      _key: string; // ISO date of week start for stable sorting
      date: string; // label: "Week of Oct 6"
      served: number;
      avgWait: number;
      noShows: number;
    };

    const weekRows = new Map<string, Row>();
    const weekWaitTimes = new Map<string, number[]>();

    // seed 5 weeks using each week's start date as the key
    for (let i = weeks - 1; i >= 0; i--) {
      const start = startOfWeek(
        new Date(now.getFullYear(), now.getMonth(), now.getDate() - i * 7)
      );
      const key = start.toISOString().slice(0, 10);
      weekRows.set(key, {
        _key: key,
        date: fmtWeekLabel(start),
        served: 0,
        avgWait: 0,
        noShows: 0,
      });
      weekWaitTimes.set(key, []);
    }

    const weekKeyFrom = (d: Date) => startOfWeek(d).toISOString().slice(0, 10);

    // served + wait per week (exclude no-shows from served count)
    for (const c of admittedCustomers) {
      if (!c.admittedAt) continue;
      const key = weekKeyFrom(new Date(c.admittedAt));
      if (!weekRows.has(key)) continue;

      // Only count as served if not a no-show
      if (c.finalStatus !== "no_show") {
        weekRows.get(key)!.served += 1;

        if (c.joinedAt) {
          const wt =
            (new Date(c.admittedAt).getTime() -
              new Date(c.joinedAt).getTime()) /
            60000;
          weekWaitTimes.get(key)!.push(wt);
        }
      }
    }

    // avg wait per week
    for (const [key, times] of weekWaitTimes.entries()) {
      if (times.length) {
        weekRows.get(key)!.avgWait = Math.round(
          times.reduce((a, b) => a + b, 0) / times.length
        );
      }
    }

    // no-shows per week - include both removed customers and admitted no-shows
    for (const c of removedCustomers) {
      if (c.status === "left" && c.leftAt) {
        const key = weekKeyFrom(new Date(c.leftAt));
        if (weekRows.has(key)) weekRows.get(key)!.noShows += 1;
      }
    }
    // Add admitted customers marked as no-show
    for (const c of admittedCustomers) {
      if (c.finalStatus === "no_show" && c.admittedAt) {
        const key = weekKeyFrom(new Date(c.admittedAt));
        if (weekRows.has(key)) weekRows.get(key)!.noShows += 1;
      }
    }

    // chronological (oldest → newest) and strip _key
    return Array.from(weekRows.values())
      .sort((a, b) => a._key.localeCompare(b._key))
      .map(({ _key, ...rest }) => rest);
  };

  const getPeakHoursData = () => {
    if (!currentLocation) return [];

    const admittedCustomers = currentLocation.admittedCustomers || [];
    const hourMap = new Map<number, number>();

    // Initialize all hours
    for (let i = 0; i < 24; i++) {
      hourMap.set(i, 0);
    }

    // Count customers per hour (exclude no-shows)
    admittedCustomers.forEach((customer: any) => {
      if (customer.finalStatus !== "no_show") {
        const joinDate = new Date(customer.joinedAt);
        const hour = joinDate.getHours();
        hourMap.set(hour, (hourMap.get(hour) || 0) + 1);
      }
    });

    return Array.from(hourMap.entries())
      .map(([hour, count]) => ({
        hour:
          hour === 0
            ? "12 AM"
            : hour < 12
            ? `${hour} AM`
            : hour === 12
            ? "12 PM"
            : `${hour - 12} PM`,
        customers: count,
      }))
      .filter((entry) => entry.customers > 0); // Only show hours with traffic
  };

  const getWaitTimeDistribution = () => {
    if (!currentLocation) return [];

    const admittedCustomers = currentLocation.admittedCustomers || [];
    const buckets = [
      { range: "0-5 min", min: 0, max: 5, count: 0 },
      { range: "5-10 min", min: 5, max: 10, count: 0 },
      { range: "10-15 min", min: 10, max: 15, count: 0 },
      { range: "15-30 min", min: 15, max: 30, count: 0 },
      { range: "30+ min", min: 30, max: Infinity, count: 0 },
    ];

    admittedCustomers.forEach((customer: any) => {
      // Exclude no-shows from wait time distribution
      if (
        customer.finalStatus !== "no_show" &&
        customer.joinedAt &&
        customer.admittedAt
      ) {
        const joinTime = new Date(customer.joinedAt).getTime();
        const admitTime = new Date(customer.admittedAt).getTime();
        const waitTime = (admitTime - joinTime) / (1000 * 60); // minutes

        const bucket = buckets.find(
          (b) => waitTime >= b.min && waitTime < b.max
        );
        if (bucket) bucket.count++;
      }
    });

    return buckets;
  };

  const dailyWeeklySummary = getDailyWeeklySummaryData();
  const peakHoursData = getPeakHoursData();
  const waitTimeDistribution = getWaitTimeDistribution();

  return (
    <>
      <BusinessHeader />
      <div className="min-h-screen pt-20 bg-gradient-to-br from-slate-50 to-indigo-100">
        <div className="container mx-auto px-4 py-8">
          {/* Trial Banner Logic */}
          {me && me.trial === true && (
            <>
              {/* Trial Expired Banner - Shows when trial has expired (account > 7 days old) */}
              {(() => {
                const createdAt = new Date(me.createdAt);
                const trialDurationDays =
                  typeof me.trialDurationDays === "number"
                    ? me.trialDurationDays
                    : 7;
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
                        <h3 className="text-lg md:text-xl font-semibold">
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
                          className="border-2 border-white text-white bg-white/10 hover:bg-white hover:text-red-600"
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
                  <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-xl shadow-lg p-4 md:p-6 text-white">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-3 md:space-y-0">
                      <div>
                        <h3 className="text-lg md:text-xl font-semibold">
                          You're on a Free Trial!
                        </h3>
                        <p className="text-sm md:text-base opacity-90">
                          Upgrade now to unlock unlimited locations and premium
                          features
                        </p>
                        {trialTimeLeft && (
                          <div className="mt-2 flex items-center space-x-2 text-indigo-100">
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
                          className="border-2 border-white text-white bg-white/10 hover:bg-white hover:text-indigo-600"
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
          {me &&
            me.trial === false &&
            currentLocation &&
            currentLocation.smsCredits === 0 &&
            currentLocation.customerCredits === 0 && (
              <div className="mb-6">
                <div className="bg-gradient-to-r from-teal-500 to-teal-600 rounded-xl shadow-lg p-4 md:p-6 text-white">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-3 md:space-y-0">
                    <div>
                      <h3 className="text-lg md:text-xl font-semibold">
                        ⚠️ No Credits Available
                      </h3>
                      <p className="text-sm md:text-base opacity-90">
                        You have no credits available. Please contact support or
                        upgrade your plan.
                      </p>
                    </div>
                    <div className="flex justify-end">
                      <Button
                        variant="outline"
                        className="border-white text-white hover:bg-white hover:text-teal-600"
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
                <h1 className="text-xl md:text-2xl font-semibold text-gray-800">
                  Hello {me?.name || "Business Owner"}!
                </h1>
                <p className="text-gray-600 text-sm md:text-base">
                  Here is your daily statistic
                </p>
                {currentLocation && (
                  <div className="flex flex-col sm:flex-row gap-2 mt-2">
                    <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded">
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
                    className="appearance-none bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full md:w-auto"
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
                  <p className="text-2xl md:text-3xl font-semibold text-gray-800">
                    {todayStats.currentQueue}
                  </p>
                </div>
                <div className="p-2 md:p-3 bg-indigo-100 rounded-full">
                  <Users className="w-5 h-5 md:w-6 md:h-6 text-indigo-600" />
                </div>
              </div>
            </Card>

            <Card className="p-4 md:p-6 bg-white rounded-xl shadow-sm border-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-xs md:text-sm">
                    Avg Wait Time
                  </p>
                  <p className="text-2xl md:text-3xl font-semibold text-gray-800">
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
                  <p className="text-2xl md:text-3xl font-semibold text-gray-800">
                    {todayStats.totalServed}
                  </p>
                </div>
                <div className="p-2 md:p-3 bg-teal-100 rounded-full">
                  <TrendingUp className="w-5 h-5 md:w-6 md:h-6 text-teal-600" />
                </div>
              </div>
            </Card>

            <Card className="p-4 md:p-6 bg-white rounded-xl shadow-sm border-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-xs md:text-sm">
                    Success Rate
                  </p>
                  <p className="text-2xl md:text-3xl font-semibold text-gray-800">
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
                  <p className="text-gray-600 text-xs md:text-sm">Left Today</p>
                  <p className="text-2xl md:text-3xl font-semibold text-gray-800">
                    {todayStats.leftToday}
                  </p>
                </div>
                <div className="p-2 md:p-3 bg-teal-100 rounded-full">
                  <LogOut className="w-5 h-5 md:w-6 md:h-6 text-teal-600" />
                </div>
              </div>
            </Card>
          </div>

          {/* Queue Management */}
          <Card className="bg-white rounded-xl shadow-sm border-0 mb-6">
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
                    className="bg-indigo-100 text-indigo-700 text-center md:text-left"
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
                        <div className="w-8 h-8 md:w-10 md:h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white font-semibold text-sm md:text-base">
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-800 text-sm md:text-base">
                            {customer.firstName} {customer.lastName}
                          </h3>
                          <div className="flex flex-col md:flex-row md:items-center text-xs md:text-sm text-gray-600 space-y-0.5 md:space-y-0">
                            <span>
                              Joined: {formatTimeSince(customer.joinedAt)}
                            </span>
                            <span className="hidden md:inline mx-1 text-gray-400">
                              •
                            </span>
                            <span className="md:whitespace-nowrap">
                              {customer.numGuests}{" "}
                              {customer.numGuests === 1 ? "guest" : "guests"}
                            </span>
                            <span className="hidden md:inline mx-1 text-gray-400">
                              •
                            </span>
                            <span className="md:whitespace-nowrap">
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

          {/* Awaiting Arrival Confirmation */}
          {(() => {
            // Filter admitted customers with pending status within last 5 minutes
            const now = new Date();
            const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

            const pendingAdmittedCustomers = (
              currentLocation?.admittedCustomers || []
            ).filter((customer: any) => {
              const admittedTime = new Date(customer.admittedAt);
              return (
                customer.finalStatus === "pending" &&
                admittedTime >= fiveMinutesAgo
              );
            });

            return (
              pendingAdmittedCustomers.length > 0 && (
                <Card className="bg-amber-50 border-amber-200 rounded-xl shadow-sm mb-6">
                  <CardHeader className="border-b border-amber-200 p-4 md:p-6">
                    <CardTitle className="text-lg md:text-xl text-amber-800 flex items-center gap-2">
                      <Clock className="w-5 h-5" />
                      Awaiting Arrival Confirmation
                    </CardTitle>
                    <CardDescription className="text-amber-700 text-sm">
                      Customers admitted in the last 5 minutes - confirm their
                      arrival
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 md:p-6">
                    <div className="space-y-3 md:space-y-4">
                      {pendingAdmittedCustomers.map(
                        (customer: any, index: number) => {
                          const timeRemaining = getTimeRemaining(
                            customer.admittedAt
                          );
                          const customerId = `${customer.firstName}${customer.lastName}${customer.joinedAt}`;

                          return (
                            <div
                              key={customerId}
                              className="flex flex-col space-y-3 md:flex-row md:items-center md:justify-between md:space-y-0 p-3 md:p-4 bg-white rounded-lg border border-amber-200"
                            >
                              <div className="flex items-center space-x-3 md:space-x-4 flex-1">
                                <div className="flex-shrink-0">
                                  <div className="w-8 h-8 md:w-10 md:h-10 bg-amber-600 rounded-full flex items-center justify-center">
                                    <span className="text-[10px] sm:text-xs md:text-sm font-semibold text-white leading-none tabular-nums">
                                      {timeRemaining.expired
                                        ? "!"
                                        : `${
                                            timeRemaining.minutes
                                          }:${timeRemaining.seconds
                                            .toString()
                                            .padStart(2, "0")}`}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h3 className="font-semibold text-gray-800 text-sm md:text-base">
                                    {customer.firstName} {customer.lastName}
                                  </h3>
                                  <div className="flex flex-col md:flex-row md:items-center text-xs md:text-sm text-gray-600 space-y-0.5 md:space-y-0">
                                    <span>
                                      Admitted:{" "}
                                      {formatTimeSince(customer.admittedAt)}
                                    </span>
                                    <span className="hidden md:inline mx-1 text-gray-400">
                                      •
                                    </span>
                                    <span className="md:whitespace-nowrap">
                                      {customer.numGuests}{" "}
                                      {customer.numGuests === 1
                                        ? "guest"
                                        : "guests"}
                                    </span>

                                    {timeRemaining.expired && (
                                      <>
                                        <span className="hidden md:inline mx-1 text-gray-400">
                                          •
                                        </span>
                                        <span className="text-red-600 font-semibold md:whitespace-nowrap">
                                          Time expired
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center space-x-2 md:space-x-3 ml-11 md:ml-0">
                                <Button
                                  size="sm"
                                  className="bg-green-600 hover:bg-green-700 text-white flex-1 md:flex-none"
                                  onClick={() => confirmArrival(customer)}
                                  disabled={loading}
                                >
                                  Arrived
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-red-500 text-red-600 hover:bg-red-50 flex-1 md:flex-none"
                                  onClick={() => markNoShow(customer)}
                                  disabled={loading}
                                >
                                  No Show
                                </Button>
                              </div>
                            </div>
                          );
                        }
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            );
          })()}

          {/* Recently Left Customers */}
          {(() => {
            // Filter customers who left in the past 24 hours
            const now = new Date();
            const twentyFourHoursAgo = new Date(
              now.getTime() - 24 * 60 * 60 * 1000
            );

            const recentlyLeftCustomers = (
              currentLocation?.removedCustomers || []
            )
              .filter((customer: any) => {
                const leftTime = new Date(
                  customer.leftAt || customer.removedAt
                );
                return leftTime >= twentyFourHoursAgo;
              })
              .slice(-5); // Show only the last 5 most recent

            return (
              recentlyLeftCustomers.length > 0 && (
                <Card className="mb-6">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Users className="w-5 h-5" />
                      <span>Recently Left Customers</span>
                    </CardTitle>
                    <CardDescription>
                      {" "}
                      Customers who have left the queue recently
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 md:p-6">
                    <div className="space-y-3 md:space-y-4">
                      {recentlyLeftCustomers.map(
                        (customer: any, index: number) => (
                          <div
                            key={index}
                            className="flex flex-col space-y-3 md:flex-row md:items-center md:justify-between md:space-y-0 p-3 md:p-4 bg-gray-50 rounded-lg"
                          >
                            <div className="flex items-center space-x-3 md:space-x-4">
                              <div
                                className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm md:text-base ${
                                  customer.status === "left"
                                    ? "bg-teal-500"
                                    : "bg-red-500"
                                }`}
                              >
                                {customer.status === "left" ? (
                                  <LogOut className="w-4 h-4 md:w-5 md:h-5 text-white" />
                                ) : (
                                  <X className="w-4 h-4 md:w-5 md:h-5 text-white" />
                                )}
                              </div>
                              <div className="flex-1">
                                <h3 className="font-semibold text-gray-800 text-sm md:text-base">
                                  {customer.firstName} {customer.lastName}
                                </h3>
                                <div className="flex flex-col md:flex-row md:items-center text-xs md:text-sm text-gray-600 space-y-0.5 md:space-y-0">
                                  <span className="md:whitespace-nowrap">
                                    {customer.status === "left"
                                      ? "Left"
                                      : "Removed"}
                                    :{" "}
                                    {formatTimeSince(
                                      customer.leftAt || customer.removedAt
                                    )}
                                  </span>
                                  <span className="hidden md:inline mx-1 text-gray-400">
                                    •
                                  </span>
                                  <span className="md:whitespace-nowrap">
                                    {customer.numGuests}{" "}
                                    {customer.numGuests === 1
                                      ? "guest"
                                      : "guests"}
                                  </span>
                                  <span className="hidden md:inline mx-1 text-gray-400">
                                    •
                                  </span>
                                  <span className="md:whitespace-nowrap">
                                    {customer.waitingPreference ===
                                    "on_premises"
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
                                variant={
                                  customer.status === "left"
                                    ? "secondary"
                                    : "destructive"
                                }
                                className="text-xs"
                              >
                                {customer.status === "left"
                                  ? "Left Queue"
                                  : "Removed by Business"}
                              </Badge>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            );
          })()}

          {/* Analytics Section */}
          <div className="mb-6 space-y-6">
            {/* Daily/Weekly Summary Graph */}
            <Card className="bg-white rounded-xl shadow-sm border-0">
              <CardHeader className="border-b border-gray-100 p-4 md:p-6">
                <div className="flex flex-col space-y-3 md:flex-row md:items-center md:justify-between md:space-y-0">
                  <div>
                    <CardTitle className="text-lg md:text-xl text-gray-800 flex items-center space-x-2">
                      <TrendingUp className="w-5 h-5" />
                      <span>Performance Summary</span>
                    </CardTitle>
                    <CardDescription className="text-gray-600 text-sm">
                      Track customers served, wait times, and no-shows
                    </CardDescription>
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      size="sm"
                      variant={
                        analyticsTimeframe === "daily" ? "default" : "outline"
                      }
                      onClick={() => setAnalyticsTimeframe("daily")}
                    >
                      Daily
                    </Button>
                    <Button
                      size="sm"
                      variant={
                        analyticsTimeframe === "weekly" ? "default" : "outline"
                      }
                      onClick={() => setAnalyticsTimeframe("weekly")}
                    >
                      Weekly
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 md:p-6">
                {dailyWeeklySummary.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart
                      data={dailyWeeklySummary}
                      margin={{ top: 8, right: 16, left: 16, bottom: 44 }} // a bit more room
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tickMargin={14} height={32} />
                      <YAxis />
                      <Tooltip />

                      {/* Add gap above legend */}
                      <Legend
                        verticalAlign="bottom"
                        align="center"
                        wrapperStyle={{ bottom: 4 }} // try -8 to -14 to taste
                      />

                      <Line
                        type="monotone"
                        dataKey="served"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        name="Customers Served"
                      />
                      <Line
                        type="monotone"
                        dataKey="avgWait"
                        stroke="#10b981"
                        strokeWidth={2}
                        name="Avg Wait Time (min)"
                      />
                      <Line
                        type="monotone"
                        dataKey="noShows"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        name="No-Shows"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center py-12">
                    <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">
                      No data available yet. Start serving customers to see
                      analytics!
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Peak Hours and Wait Time Distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Peak Hours Heatmap */}
              <Card className="bg-white rounded-xl shadow-sm border-0">
                <CardHeader className="border-b border-gray-100 p-4 md:p-6">
                  <CardTitle className="text-lg md:text-xl text-gray-800 flex items-center space-x-2">
                    <Clock className="w-5 h-5" />
                    <span>Peak Hours</span>
                  </CardTitle>
                  <CardDescription className="text-gray-600 text-sm">
                    When does your business get the most traffic?
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 md:p-6">
                  {peakHoursData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={peakHoursData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="hour"
                          angle={-45}
                          textAnchor="end"
                          height={80}
                        />
                        <YAxis />
                        <Tooltip />
                        <Bar
                          dataKey="customers"
                          fill="#3b82f6"
                          name="Customers"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="text-center py-12">
                      <Clock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500">
                        No peak hour data available yet
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Wait Time Distribution */}
              <Card className="bg-white rounded-xl shadow-sm border-0">
                <CardHeader className="border-b border-gray-100 p-4 md:p-6">
                  <CardTitle className="text-lg md:text-xl text-gray-800 flex items-center space-x-2">
                    <BarChart3 className="w-5 h-5" />
                    <span>Wait Time Distribution</span>
                  </CardTitle>
                  <CardDescription className="text-gray-600 text-sm">
                    How efficient is your service?
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 md:p-6">
                  {waitTimeDistribution.some((b) => b.count > 0) ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={waitTimeDistribution}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="range" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="count" fill="#10b981" name="Customers" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="text-center py-12">
                      <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500">
                        No wait time data available yet
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
};

export default BusinessDashboard;
