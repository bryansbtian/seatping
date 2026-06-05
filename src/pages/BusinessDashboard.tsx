import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { useEffect, useState, useRef, useMemo } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import BusinessHeader from "@/components/BusinessHeader";
import ReservationsManager from "@/components/ReservationsManager";
import {
  Users,
  Clock,
  TrendingUp,
  RefreshCw,
  Calendar,
  ListOrdered,
  ChevronDown,
  BarChart3,
  LogOut,
} from "lucide-react";
import Footer from "@/components/Footer";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Message } from "@mynaui/icons-react";
import {
  DEFAULT_TIMEZONE,
  getDateKeyInTimezone,
  getTodayKeyInTimezone,
  getHourInTimezone,
  formatDateLabelInTimezone,
  addDaysToDateKey,
  startOfWeekDateKey,
} from "@/lib/timezones";

/**
 * The selected location's IANA timezone (e.g. "Asia/Jakarta"), read from its
 * opening-hours config. All dashboard analytics bucket activity by this zone's
 * calendar day so the numbers reflect the restaurant's business day regardless
 * of where the owner opens the dashboard. Falls back to the platform default.
 */
function getLocationTimezone(location: any): string {
  const tz = location?.restaurantProfile?.openingHours?.timezone;
  return typeof tz === "string" && tz ? tz : DEFAULT_TIMEZONE;
}

// Rounded-rectangle styling shared by every chart tooltip popup.
const TOOLTIP_CONTENT_STYLE = {
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  boxShadow: "0 10px 25px -5px rgba(15, 23, 42, 0.1)",
  padding: "8px 12px",
};

const BusinessDashboard = () => {
  const [me, setMe] = useState<any | null>(null);
  const [selectedLocationIndex, setSelectedLocationIndex] = useState(0);
  // Per-customer queue ETAs (keyed by queueToken), from the shared backend helper.
  const [queueEtas, setQueueEtas] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [analyticsTimeframe, setAnalyticsTimeframe] = useState<
    "daily" | "weekly"
  >("daily");
  // Switching Daily/Weekly just swaps the dataset and lets Recharts morph the
  // lines (same smooth transition as the marketing landing chart). No opacity
  // fade — that competed with the line animation and looked choppy.
  const changeAnalyticsTimeframe = (tf: "daily" | "weekly") => {
    setAnalyticsTimeframe(tf);
  };
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
        createdAt.getTime() + trialDurationDays * 24 * 60 * 60 * 1000,
      );
      const now = new Date();
      return now <= trialEndDate;
    })();
  const { toast } = useToast();

  // Get current location and queue
  const currentLocation = locations[selectedLocationIndex];
  const queueData = currentLocation?.queue || [];
  // Customer-facing location label (display name) with safe fallbacks. Display
  // only — queue operations still key off the underlying address.
  const locLabel = (loc: any, idx: number) =>
    loc?.displayName || loc?.name || loc?.address || `Location ${idx + 1}`;

  // Calculate real-time statistics
  const calculateStats = () => {
    if (!currentLocation) {
      return {
        totalServed: 0,
        currentQueue: 0,
        avgWaitTime: 0,
        successRate: 0,
        leftToday: 0,
        reservationsToday: 0,
      };
    }

    const admittedCustomers = currentLocation.admittedCustomers || [];
    const removedCustomers = currentLocation.removedCustomers || [];
    const currentQueue = queueData.length;

    // All "today" comparisons use the location's local calendar day so the
    // dashboard reflects the restaurant's business day, not the viewer's browser
    // timezone or UTC.
    const tz = getLocationTimezone(currentLocation);
    const todayKey = getTodayKeyInTimezone(tz);

    // Reservations for this location dated today that still occupy a table
    // (pending / confirmed / arrived) — matches the "Today" reservations tab.
    // reservationDateTime is a naive wall-clock string already in the
    // restaurant's local timezone, so its date part is the local date.
    const reservationsToday = (currentLocation.reservations || []).filter(
      (r: any) => {
        const d = String(r?.reservationDateTime || "").split("T")[0];
        return (
          d === todayKey &&
          ["pending", "confirmed", "arrived"].includes(r?.status)
        );
      },
    ).length;

    // Filter for today's customers (admittedAt/leftAt are real instants).
    const todayAdmitted = admittedCustomers.filter(
      (customer: any) =>
        getDateKeyInTimezone(customer.admittedAt, tz) === todayKey,
    );

    // Filter out no-shows from served count
    const todayServed = todayAdmitted.filter((customer: any) => {
      return customer.finalStatus !== "no_show";
    });

    // Count no-shows from admitted customers
    const todayNoShows = todayAdmitted.filter((customer: any) => {
      return customer.finalStatus === "no_show";
    }).length;

    const todayRemoved = removedCustomers.filter(
      (customer: any) =>
        getDateKeyInTimezone(customer.removedAt || customer.leftAt, tz) ===
        todayKey,
    );

    // Count customers who left today (not removed by business)
    const leftToday = removedCustomers.filter(
      (customer: any) => getDateKeyInTimezone(customer.leftAt, tz) === todayKey,
    ).length;

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

    // Fold reservation outcomes into today's totals: a reservation marked
    // arrived/completed counts as served; a no-show counts toward "left".
    const reservations = currentLocation.reservations || [];
    const isToday = (iso: any) =>
      !!iso && getDateKeyInTimezone(iso, tz) === todayKey;
    let reservationsServedToday = 0;
    let reservationNoShowsToday = 0;
    for (const r of reservations) {
      if (r?.status === "arrived" || r?.status === "completed") {
        if (isToday(r.arrivedAt || r.completedAt)) reservationsServedToday++;
      } else if (r?.status === "no_show" && isToday(r.noShowAt)) {
        reservationNoShowsToday++;
      }
    }

    return {
      totalServed: todayServed.length + reservationsServedToday,
      currentQueue,
      avgWaitTime,
      successRate,
      // Include queue no-shows + reservation no-shows in the left count.
      leftToday: leftToday + todayNoShows + reservationNoShowsToday,
      reservationsToday,
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
      createdAt.getTime() + trialDurationDays * 24 * 60 * 60 * 1000,
    );
    const now = new Date();
    const timeLeft = trialEndDate.getTime() - now.getTime();

    if (timeLeft <= 0) {
      return null; // Trial has expired
    }

    const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
    const hours = Math.floor(
      (timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
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
        createdAt.getTime() + trialDurationDays * 24 * 60 * 60 * 1000,
      );
      const now = new Date();
      const isExpired = now > trialEndDate;

      if (isExpired) {
        const updatedLocations = me.locations.map((location: any) => ({
          ...location,
          credits: 0,
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
        const res = await api("/auth/business/me");
        setMe(res.user);
      } catch {}
    })();
  }, []);

  // Auto-refresh queue data every 10 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await api("/auth/business/me");
        setMe(res.user);
      } catch {}
    }, 10000); // Refresh every 10 seconds

    return () => clearInterval(interval);
  }, []);

  // Per-customer ETAs for the current location's live waitlist. Refreshes when
  // the queue changes and every 30s (same backend helper as the customer page).
  useEffect(() => {
    if (!me?.username || !currentLocation?.id) {
      setQueueEtas({});
      return;
    }
    let cancelled = false;
    const fetchEtas = async () => {
      try {
        const res = await api(
          `/auth/business/${me.username}/locations/${currentLocation.id}/queue-etas`,
        );
        if (cancelled) return;
        const map: Record<string, any> = {};
        for (const e of res.etas || []) {
          if (e?.queueToken) map[e.queueToken] = e;
        }
        setQueueEtas(map);
      } catch {
        /* non-fatal: labels just won't show */
      }
    };
    fetchEtas();
    const id = setInterval(fetchEtas, 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.username, currentLocation?.id, queueData.length]);

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
      const updated = await api("/auth/business/me");
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
      const updated = await api("/auth/business/me");
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
        },
      );

      // Refresh the business data
      const updated = await api("/auth/business/me");
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
        },
      );

      // Refresh the business data
      const updated = await api("/auth/business/me");
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

    if (diffMins < 1) return "Just Now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    return `${diffHours}h ${diffMins % 60}m ago`;
  };

  // Display label for a notification channel (SMS / WhatsApp / Email).
  const formatNotificationMethod = (method?: string) => {
    switch (method) {
      case "sms":
        return "SMS";
      case "whatsapp":
        return "WhatsApp";
      case "email":
        return "Email";
      default:
        return method || "";
    }
  };

  // Format a phone number with its country code. The country code (defaulting
  // to +1) is normalized to a leading "+" and leading zeros are stripped from
  // the national number. US/Canada (+1) numbers get locale-aware NANP grouping,
  // e.g. ("+1", "2069313369") -> "+1 (206) 931-3369"; other countries are shown
  // as clean international digits since correct grouping is country-specific.
  const formatPhone = (countryCode?: string, phoneNumber?: string) => {
    const national = String(phoneNumber || "")
      .replace(/\D/g, "")
      .replace(/^0+/, "");
    if (!national) return "";
    const rawCode = String(countryCode || "")
      .trim()
      .replace(/[^\d+]/g, "");
    const digits = rawCode.replace(/^\+/, "");
    const code = digits ? `+${digits}` : "+1";
    if (code === "+1" && national.length === 10) {
      const formatted = `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
      return `${code} ${formatted}`;
    }
    return `${code} ${national}`;
  };

  // One clean "Channel: contact" line based on the contact the customer actually
  // chose for this queue entry. Crucially, when the method is SMS/WhatsApp we show
  // the phone only — never the account email of a logged-in customer (and vice
  // versa). Returns null only when there's no method/contact to show at all.
  const notificationContact = (c: any): string | null => {
    const method = c?.notificationMethod;
    const phone = formatPhone(c?.countryCode, c?.phoneNumber);
    if (method === "email") {
      return c?.email ? `Email: ${c.email}` : "Email";
    }
    if (method === "sms" || method === "whatsapp") {
      const label = formatNotificationMethod(method);
      return phone ? `${label}: ${phone}` : label;
    }
    // Legacy/unknown method: show a single best-effort contact, phone first.
    if (phone) return `Phone: ${phone}`;
    if (c?.email) return `Email: ${c.email}`;
    return null;
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
    // Show the restaurant's local "today", not the viewer's browser date.
    const tz = getLocationTimezone(currentLocation);
    try {
      return new Date().toLocaleDateString("en-US", {
        timeZone: tz,
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return new Date().toLocaleDateString("en-US", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    }
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

    // Every bucket key is the location's local calendar date, so the chart is
    // identical no matter where the owner opens the dashboard.
    const tz = getLocationTimezone(currentLocation);

    // ---- DAILY: last 7 calendar days
    if (analyticsTimeframe === "daily") {
      const days = 7;
      const todayKey = getTodayKeyInTimezone(tz);

      const dataMap = new Map<
        string,
        { date: string; served: number; avgWait: number; noShows: number }
      >();
      const waitTimes = new Map<string, number[]>();

      // seed 7 days (oldest → today), keyed/labelled in the location timezone
      for (let i = days - 1; i >= 0; i--) {
        const key = addDaysToDateKey(todayKey, -i);
        dataMap.set(key, {
          date: formatDateLabelInTimezone(key),
          served: 0,
          avgWait: 0,
          noShows: 0,
        });
        waitTimes.set(key, []);
      }

      // served + wait (exclude no-shows from served count)
      for (const c of admittedCustomers) {
        if (!c.admittedAt) continue;
        const key = getDateKeyInTimezone(c.admittedAt, tz);
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
            times.reduce((a, b) => a + b, 0) / times.length,
          );
        }
      }

      // no-shows per day - include both removed customers and admitted no-shows
      for (const c of removedCustomers) {
        if (c.status === "left" && c.leftAt) {
          const key = getDateKeyInTimezone(c.leftAt, tz);
          if (dataMap.has(key)) dataMap.get(key)!.noShows += 1;
        }
      }
      // Add admitted customers marked as no-show
      for (const c of admittedCustomers) {
        if (c.finalStatus === "no_show" && c.admittedAt) {
          const key = getDateKeyInTimezone(c.admittedAt, tz);
          if (dataMap.has(key)) dataMap.get(key)!.noShows += 1;
        }
      }
      // Reservation outcomes: arrived/completed → served, no_show → no-shows.
      for (const r of currentLocation.reservations || []) {
        if (r?.status === "arrived" || r?.status === "completed") {
          const ts = r.arrivedAt || r.completedAt;
          if (ts) {
            const key = getDateKeyInTimezone(ts, tz);
            if (dataMap.has(key)) dataMap.get(key)!.served += 1;
          }
        } else if (r?.status === "no_show" && r.noShowAt) {
          const key = getDateKeyInTimezone(r.noShowAt, tz);
          if (dataMap.has(key)) dataMap.get(key)!.noShows += 1;
        }
      }

      return Array.from(dataMap.values());
    }

    // ---- WEEKLY: last 5 calendar weeks (oldest → newest)
    const weeks = 5;
    // Week math runs on location-local date keys (Sunday-start), so weeks line
    // up with the restaurant's calendar rather than the browser's.
    const thisWeekStartKey = startOfWeekDateKey(getTodayKeyInTimezone(tz));

    type Row = {
      _key: string; // ISO date of week start for stable sorting
      date: string; // label: "Week of Oct 6"
      served: number;
      avgWait: number;
      noShows: number;
    };

    const weekRows = new Map<string, Row>();
    const weekWaitTimes = new Map<string, number[]>();

    // seed 5 weeks using each week's start date (key) as the map key
    for (let i = weeks - 1; i >= 0; i--) {
      const key = addDaysToDateKey(thisWeekStartKey, -i * 7);
      weekRows.set(key, {
        _key: key,
        date: `Week of ${formatDateLabelInTimezone(key)}`,
        served: 0,
        avgWait: 0,
        noShows: 0,
      });
      weekWaitTimes.set(key, []);
    }

    const weekKeyFrom = (iso: any) =>
      startOfWeekDateKey(getDateKeyInTimezone(iso, tz));

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
          times.reduce((a, b) => a + b, 0) / times.length,
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
    // Reservation outcomes: arrived/completed → served, no_show → no-shows.
    for (const r of currentLocation.reservations || []) {
      if (r?.status === "arrived" || r?.status === "completed") {
        const ts = r.arrivedAt || r.completedAt;
        if (ts) {
          const key = weekKeyFrom(new Date(ts));
          if (weekRows.has(key)) weekRows.get(key)!.served += 1;
        }
      } else if (r?.status === "no_show" && r.noShowAt) {
        const key = weekKeyFrom(new Date(r.noShowAt));
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
    const tz = getLocationTimezone(currentLocation);
    const hourMap = new Map<number, number>();

    // Initialize all hours
    for (let i = 0; i < 24; i++) {
      hourMap.set(i, 0);
    }

    // Count customers per hour of the restaurant's local day (exclude no-shows)
    admittedCustomers.forEach((customer: any) => {
      if (customer.finalStatus !== "no_show") {
        const hour = getHourInTimezone(customer.joinedAt, tz);
        if (Number.isNaN(hour)) return;
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
          (b) => waitTime >= b.min && waitTime < b.max,
        );
        if (bucket) bucket.count++;
      }
    });

    return buckets;
  };

  // Memoized so the chart's data array keeps a stable reference across the
  // dashboard's per-second timer re-renders. Without this, every tick produced
  // a new array and Recharts restarted the line animation — the choppy/laggy
  // toggle. Only recomputes when the location or the daily/weekly range changes.
  const dailyWeeklySummary = useMemo(
    () => getDailyWeeklySummaryData(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentLocation, analyticsTimeframe],
  );
  const peakHoursData = getPeakHoursData();
  const waitTimeDistribution = getWaitTimeDistribution();

  return (
    <>
      <BusinessHeader />
      <div className="min-h-screen pt-20 bg-gradient-to-br from-slate-50 to-indigo-100">
        <div className="container mx-auto px-4 py-8 [&_.text-3xl]:max-[374px]:text-2xl [&_.text-2xl]:max-[374px]:text-xl [&_.text-xl]:max-[374px]:text-lg [&_.text-lg]:max-[374px]:text-base [&_.text-base]:max-[374px]:text-sm [&_.text-sm]:max-[374px]:text-xs [&_.text-xs]:max-[374px]:text-[11px]">
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
                  createdAt.getTime() + trialDurationDays * 24 * 60 * 60 * 1000,
                );
                const now = new Date();
                return now > trialEndDate;
              })() ? (
                <div className="mb-6">
                  <div className="bg-gradient-to-r from-red-500 to-red-600 rounded-xl shadow-lg p-4 md:p-6 text-white">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-3 md:space-y-0">
                      <div>
                        <h3 className="text-lg md:text-xl font-semibold">
                          Trial Expired
                        </h3>
                        <p className="text-sm md:text-base opacity-90">
                          Your free trial has ended. Please contact SeatPing to
                          continue using your business dashboard.
                        </p>
                      </div>
                      <div className="flex justify-end">
                        <Button
                          variant="outline"
                          className="border-2 border-white text-white bg-white/10 hover:bg-white hover:text-red-600"
                          onClick={() => (window.location.href = "/sales")}
                        >
                          Contact SeatPing
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
                          Contact SeatPing when you're ready to activate your
                          account.
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
                          onClick={() => (window.location.href = "/sales")}
                        >
                          Contact SeatPing
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* No-credits notice for activated (non-trial) businesses with 0 credits */}
          {me &&
            me.trial === false &&
            currentLocation &&
            currentLocation.credits === 0 && (
              <div className="mb-6">
                <div className="bg-gradient-to-r from-teal-500 to-teal-600 rounded-xl shadow-lg p-4 md:p-6 text-white">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-3 md:space-y-0">
                    <div>
                      <h3 className="text-lg md:text-xl font-semibold">
                        ⚠️ No Credits Available
                      </h3>
                      <p className="text-sm md:text-base opacity-90">
                        You have no credits available. Please contact SeatPing
                        to top up credits or adjust your account.
                      </p>
                    </div>
                    <div className="flex justify-end">
                      <Button
                        variant="outline"
                        className="border-white text-white hover:bg-white hover:text-teal-600"
                        onClick={() => (window.location.href = "/sales")}
                      >
                        Contact SeatPing
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

          {/* Dashboard Header - Mobile Version */}
          <div className="bg-white rounded-xl shadow-sm p-4 md:p-6 mb-4 lg:hidden">
            {/* Header (no date here) */}
            <div className="mb-4">
              <h2 className="text-xl md:text-2xl font-semibold text-slate-800 leading-tight">
                Hello {me?.name || "Business Owner"}!
              </h2>
              <p className="text-slate-600 text-sm md:text-base">
                Here is your daily statistic
              </p>
            </div>

            {/* Credits Card */}
            {currentLocation && (
              <div className="mb-3">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-slate-600 mb-1">Credits</p>
                      <p className="text-xl md:text-2xl font-semibold text-slate-800">
                        {currentLocation?.credits || 0}
                      </p>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 leading-none">
                      <Users className="w-4 h-4 text-indigo-600" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Location Selector */}
            <div className="relative">
              <select
                className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={selectedLocationIndex}
                onChange={(e) =>
                  setSelectedLocationIndex(Number(e.target.value))
                }
              >
                {locations.length > 0 ? (
                  locations.map((loc, idx) => (
                    <option key={idx} value={idx}>
                      {locLabel(loc, idx)}
                    </option>
                  ))
                ) : (
                  <option value={0}>No locations</option>
                )}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Dashboard Header - Desktop Version */}
          <div className="bg-white rounded-xl shadow-sm p-4 md:p-6 mb-6 hidden lg:block">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h2 className="text-xl md:text-2xl font-semibold text-slate-800">
                  Hello {me?.name || "Business Owner"}!
                </h2>
                <p className="text-slate-600 text-sm md:text-base">
                  Here is your daily statistic
                </p>
                {currentLocation && (
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded">
                      Credits: {currentLocation?.credits || 0}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-col md:flex-row items-start md:items-center gap-3">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Calendar className="w-4 h-4" />
                  <span>{getCurrentDate()}</span>
                </div>
                <div className="relative">
                  <select
                    className="appearance-none bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={selectedLocationIndex}
                    onChange={(e) =>
                      setSelectedLocationIndex(Number(e.target.value))
                    }
                  >
                    {locations.length > 0 ? (
                      locations.map((loc, idx) => (
                        <option key={idx} value={idx}>
                          {locLabel(loc, idx)}
                        </option>
                      ))
                    ) : (
                      <option value={0}>No locations</option>
                    )}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
            </div>
          </div>

          {/* Stats Cards - Mobile Version: a single compact "Today's Summary"
              card so the page stays short and scannable instead of a long
              stack of individual stat cards. */}
          <Card className="mb-6 bg-white rounded-xl shadow-sm border border-slate-200 lg:hidden">
            <div className="p-4">
              <p className="text-sm font-semibold text-slate-800 mb-3">
                Today's Summary
              </p>
              <div className="divide-y divide-slate-100">
                {[
                  {
                    label: "Current Queue",
                    value: todayStats.currentQueue,
                    icon: Users,
                    tint: "bg-indigo-100 text-indigo-600",
                  },
                  {
                    label: "Reservations Today",
                    value: todayStats.reservationsToday,
                    icon: Calendar,
                    tint: "bg-blue-100 text-blue-600",
                  },
                  {
                    label: "Avg Queue Wait",
                    value: `${todayStats.avgWaitTime}m`,
                    icon: Clock,
                    tint: "bg-teal-100 text-teal-600",
                  },
                  {
                    label: "Served Today",
                    value: todayStats.totalServed,
                    icon: TrendingUp,
                    tint: "bg-emerald-100 text-emerald-600",
                  },
                  {
                    label: "Left Today",
                    value: todayStats.leftToday,
                    icon: LogOut,
                    tint: "bg-teal-100 text-teal-600",
                  },
                ].map(({ label, value, icon: Icon, tint }) => (
                  <div
                    key={label}
                    className="flex items-center justify-between py-2.5"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-full grid place-items-center shrink-0 max-[325px]:hidden ${tint}`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className="text-sm text-slate-600 truncate">
                        {label}
                      </span>
                    </div>
                    <span className="text-lg font-semibold text-slate-800 leading-none shrink-0">
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Stats Cards - Desktop Version */}
          <div className="hidden lg:grid grid-cols-5 gap-4 mb-6">
            <Card className="p-3 md:p-4 bg-white rounded-xl shadow-sm border-0">
              <div className="flex flex-col gap-2">
                <p className="text-slate-600 text-xs md:text-sm">
                  Current Queue
                </p>
                <div className="flex items-center justify-between">
                  <p className="text-2xl md:text-3xl font-semibold text-slate-800">
                    {todayStats.currentQueue}
                  </p>
                  <div className="p-2 bg-indigo-100 rounded-full">
                    <Users className="w-5 h-5 md:w-6 md:h-6 text-indigo-600" />
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-3 md:p-4 bg-white rounded-xl shadow-sm border-0">
              <div className="flex flex-col gap-2">
                <p className="text-slate-600 text-xs md:text-sm">
                  Reservations Today
                </p>
                <div className="flex items-center justify-between">
                  <p className="text-2xl md:text-3xl font-semibold text-slate-800">
                    {todayStats.reservationsToday}
                  </p>
                  <div className="p-2 bg-blue-100 rounded-full">
                    <Calendar className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-3 md:p-4 bg-white rounded-xl shadow-sm border-0">
              <div className="flex flex-col gap-2">
                <p className="text-slate-600 text-xs md:text-sm">
                  Avg Queue Wait Time
                </p>
                <div className="flex items-center justify-between">
                  <p className="text-2xl md:text-3xl font-semibold text-slate-800">
                    {todayStats.avgWaitTime}m
                  </p>
                  <div className="p-2 bg-teal-100 rounded-full">
                    <Clock className="w-5 h-5 md:w-6 md:h-6 text-teal-600" />
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-3 md:p-4 bg-white rounded-xl shadow-sm border-0">
              <div className="flex flex-col gap-2">
                <p className="text-slate-600 text-xs md:text-sm">
                  Served Today
                </p>
                <div className="flex items-center justify-between">
                  <p className="text-2xl md:text-3xl font-semibold text-slate-800">
                    {todayStats.totalServed}
                  </p>
                  <div className="p-2 bg-emerald-100 rounded-full">
                    <TrendingUp className="w-5 h-5 md:w-6 md:h-6 text-emerald-600" />
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-3 md:p-4 bg-white rounded-xl shadow-sm border-0">
              <div className="flex flex-col gap-2">
                <p className="text-slate-600 text-xs md:text-sm">Left Today</p>
                <div className="flex items-center justify-between">
                  <p className="text-2xl md:text-3xl font-semibold text-slate-800">
                    {todayStats.leftToday}
                  </p>
                  <div className="p-2 bg-teal-100 rounded-full">
                    <LogOut className="w-5 h-5 md:w-6 md:h-6 text-teal-600" />
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Queue Management */}
          <Card className="bg-white rounded-xl shadow-sm border-0 mb-6">
            <CardHeader className="border-b border-gray-100 p-4 md:p-6">
              {/* Mobile Layout */}
              <div className="md:hidden">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-lg text-gray-800">
                    <ListOrdered className="w-5 h-5" />
                    Queue Management
                  </CardTitle>
                  <Badge
                    variant="secondary"
                    className="bg-indigo-100 text-indigo-700 text-[10px] sm:text-xs px-2 py-1 sm:px-3 whitespace-nowrap max-[374px]:hidden"
                  >
                    {queueData.length}{" "}
                    {queueData.length === 1 ? "customer" : "customers"}
                  </Badge>
                </div>
                <CardDescription className="text-gray-600 text-sm mb-3 mt-0.5">
                  {currentLocation
                    ? `Managing queue for: ${locLabel(currentLocation, selectedLocationIndex)}`
                    : "No Location Selected"}
                </CardDescription>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      const res = await api("/auth/business/me");
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
                  className="flex items-center space-x-2 w-full"
                >
                  <RefreshCw size={16} />
                  <span>Refresh</span>
                </Button>
              </div>

              {/* Desktop Layout */}
              <div className="hidden md:flex md:items-center md:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg md:text-xl text-gray-800">
                    <ListOrdered className="w-5 h-5" />
                    Queue Management
                  </CardTitle>
                  <CardDescription className="text-gray-600 text-sm">
                    {currentLocation
                      ? `Managing queue for: ${locLabel(currentLocation, selectedLocationIndex)}`
                      : "No Location Selected"}
                  </CardDescription>
                </div>
                <div className="flex items-center space-x-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        const res = await api("/auth/business/me");
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
                    className="flex items-center space-x-2"
                  >
                    <RefreshCw size={16} />
                    <span>Refresh</span>
                  </Button>
                  <Badge
                    variant="secondary"
                    className="bg-indigo-100 text-indigo-700"
                  >
                    {queueData.length}{" "}
                    {queueData.length === 1 ? "customer" : "customers"}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 md:p-6">
              {queueData.length === 0 ? (
                <div className="flex flex-col items-center py-10 text-center text-slate-400">
                  <Users className="h-8 w-8" />
                  <p className="mt-2 text-sm">
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
                      <div className="flex items-start space-x-3 md:space-x-4">
                        <span className="mt-0.5 inline-flex shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white px-2 py-1 text-xs md:text-sm font-semibold leading-none text-gray-700 shadow-sm tabular-nums">
                          #{index + 1}
                        </span>
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-800 text-sm md:text-base">
                            {customer.firstName} {customer.lastName}
                          </h3>
                          <div className="flex flex-wrap items-center gap-x-1.5 text-xs md:text-sm text-gray-600">
                            <span className="whitespace-nowrap">
                              Joined: {formatTimeSince(customer.joinedAt)}
                            </span>
                            <span className="text-gray-400">•</span>
                            <span className="whitespace-nowrap">
                              {customer.numGuests}{" "}
                              {customer.numGuests === 1 ? "Guest" : "Guests"}
                            </span>
                          </div>

                          {/* Single row for the chosen notification channel +
                              its contact (no account-email leak for SMS/WhatsApp). */}
                          {notificationContact(customer) && (
                            <p className="text-xs md:text-sm text-gray-500 mt-1 break-all">
                              {notificationContact(customer)}
                            </p>
                          )}
                          {customer.queueToken &&
                            queueEtas[customer.queueToken] && (
                              <p className="text-xs md:text-sm font-medium text-indigo-600 mt-1">
                                Estimated Wait:{" "}
                                {queueEtas[customer.queueToken].displayText}
                              </p>
                            )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 md:space-x-3">
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
            // Show every admitted customer still awaiting a decision. The 5-minute
            // timer is informational only — once it hits 0 the card stays put
            // (shown as "Time expired") so the business can remove it manually via
            // Arrived / No Show. We do NOT auto-drop the card when the timer runs
            // out; the only way a customer leaves this list is a manual action
            // that sets finalStatus to "arrived" or "no_show".
            const pendingAdmittedCustomers = (
              currentLocation?.admittedCustomers || []
            ).filter((customer: any) => customer.finalStatus === "pending");

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
                            customer.admittedAt,
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
                                  <div className="flex flex-wrap items-center gap-x-1.5 text-xs md:text-sm text-gray-600">
                                    <span className="whitespace-nowrap">
                                      Admitted:{" "}
                                      {formatTimeSince(customer.admittedAt)}
                                    </span>
                                    <span className="text-gray-400">•</span>
                                    <span className="whitespace-nowrap">
                                      {customer.numGuests}{" "}
                                      {customer.numGuests === 1
                                        ? "Guest"
                                        : "Guests"}
                                    </span>

                                    {timeRemaining.expired && (
                                      <>
                                        <span className="text-gray-400">•</span>
                                        <span className="text-red-600 font-semibold whitespace-nowrap">
                                          Time Expired
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 md:gap-3">
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
                        },
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            );
          })()}

          {/* Today's Reservations — sits between the live waitlist and the
              recently-left list so staff manage walk-ins + bookings together.
              Always rendered (even with no location) so it mirrors the Queue
              Management card; the empty state shows "No location selected". */}
          <ReservationsManager
            reservations={currentLocation?.reservations || []}
            businessUsername={me?.username || ""}
            locationId={currentLocation?.id || ""}
            timeZone={getLocationTimezone(currentLocation)}
            locationLabel={
              currentLocation
                ? locLabel(currentLocation, selectedLocationIndex)
                : ""
            }
            reservationsEnabled={
              currentLocation
                ? currentLocation.reservationsEnabled !== false
                : true
            }
            onUpdated={(user) => setMe(user)}
          />

          {/* Recently Left Customers */}
          {(() => {
            // Filter customers who left in the past 24 hours
            const now = new Date();
            const twentyFourHoursAgo = new Date(
              now.getTime() - 24 * 60 * 60 * 1000,
            );

            const recentlyLeftCustomers = (
              currentLocation?.removedCustomers || []
            )
              .filter((customer: any) => {
                const leftTime = new Date(
                  customer.leftAt || customer.removedAt,
                );
                return leftTime >= twentyFourHoursAgo;
              })
              .slice(-5); // Show only the last 5 most recent

            return (
              <Card className="bg-white rounded-xl shadow-sm border-0 mb-6">
                <CardHeader className="border-b border-gray-100 p-4 md:p-6">
                  <CardTitle className="flex items-center gap-2 text-lg md:text-xl text-gray-800">
                    <Users className="w-5 h-5" />
                    <span>Recently Left Customers</span>
                  </CardTitle>
                  <CardDescription className="text-gray-600 text-sm">
                    Customers who have left the queue recently
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 md:p-6">
                  {recentlyLeftCustomers.length === 0 ? (
                    <div className="flex flex-col items-center py-10 text-center text-slate-400">
                      <Users className="h-8 w-8" />
                      <p className="mt-2 text-sm">
                        No customers have left recently.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3 md:space-y-4">
                      {recentlyLeftCustomers.map(
                        (customer: any, index: number) => {
                          const statusBadge = (
                            <Badge
                              variant={
                                customer.status === "left"
                                  ? "secondary"
                                  : "destructive"
                              }
                              className="inline-flex h-6 items-center justify-center px-3 text-xs leading-none md:h-7"
                            >
                              {customer.status === "left"
                                ? "Left Queue"
                                : "Removed by Business"}
                            </Badge>
                          );
                          return (
                            <div
                              key={index}
                              className="flex flex-col space-y-1.5 md:flex-row md:items-center md:justify-between md:space-y-0 p-3 md:p-4 bg-gray-50 rounded-lg"
                            >
                              <div className="flex items-start md:items-center">
                                <div className="flex-1">
                                  <h3 className="font-semibold text-gray-800 text-sm md:text-base">
                                    {customer.firstName} {customer.lastName}
                                  </h3>
                                  <div className="flex flex-wrap items-center gap-x-1.5 text-xs md:text-sm text-gray-600">
                                    <span className="whitespace-nowrap">
                                      {customer.status === "left"
                                        ? "Left"
                                        : "Removed"}
                                      :{" "}
                                      {formatTimeSince(
                                        customer.leftAt || customer.removedAt,
                                      )}
                                    </span>
                                    <span className="text-gray-400">•</span>
                                    <span className="whitespace-nowrap">
                                      {customer.numGuests}{" "}
                                      {customer.numGuests === 1
                                        ? "Guest"
                                        : "Guests"}
                                    </span>
                                  </div>

                                  {/* Chosen notification channel + its contact only. */}
                                  {notificationContact(customer) && (
                                    <p className="text-xs md:text-sm text-gray-500 mt-1 break-all">
                                      {notificationContact(customer)}
                                    </p>
                                  )}
                                  {/* Mobile: pill sits directly below the metadata,
                                    aligned with the customer text (not the icon). */}
                                  <div className="mt-1.5 md:hidden">
                                    {statusBadge}
                                  </div>
                                </div>
                              </div>
                              {/* Desktop: pill stays on the right of the row. */}
                              <div className="hidden md:block">
                                {statusBadge}
                              </div>
                            </div>
                          );
                        },
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          {/* Analytics Section */}
          <div className="mb-6 space-y-6">
            {/* Daily/Weekly Summary Graph */}
            <Card className="bg-white rounded-xl shadow-sm border-0">
              <CardHeader className="border-b border-slate-100 p-4 md:p-6">
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
                      onClick={() => changeAnalyticsTimeframe("daily")}
                    >
                      Daily
                    </Button>
                    <Button
                      size="sm"
                      variant={
                        analyticsTimeframe === "weekly" ? "default" : "outline"
                      }
                      onClick={() => changeAnalyticsTimeframe("weekly")}
                    >
                      Weekly
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 md:p-6">
                {/* Fixed-height wrapper so switching ranges (or hitting the
                    empty state) never resizes the card. */}
                <div className="h-[300px] w-full">
                  {dailyWeeklySummary.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={dailyWeeklySummary}
                        margin={{ top: 8, right: 16, left: 28, bottom: 44 }}
                      >
                        <XAxis dataKey="date" tickMargin={14} height={32} />

                        {/* Left axis (visible) */}
                        <YAxis
                          yAxisId="left"
                          width={40}
                          allowDecimals={false}
                        />

                        {/* Right axis (invisible) to balance spacing and center the chart */}
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          width={40}
                          tick={false}
                          axisLine={false}
                          tickLine={false}
                        />

                        <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} />
                        <Legend
                          verticalAlign="bottom"
                          align="center"
                          wrapperStyle={{ bottom: 4 }}
                        />

                        {/* Stable dataKeys + colors across Daily/Weekly so
                            Recharts morphs each line instead of remounting.
                            `dot={false}` + recharts' default animation mirror
                            the marketing landing chart's smooth toggle. */}
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="served"
                          stroke="#3b82f6"
                          strokeWidth={2}
                          dot={false}
                          name="Customers Served"
                        />
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="avgWait"
                          stroke="#10b981"
                          strokeWidth={2}
                          dot={false}
                          name="Avg Wait Time (min)"
                        />
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="noShows"
                          stroke="#f59e0b"
                          strokeWidth={2}
                          dot={false}
                          name="No-Shows"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center text-center">
                      <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500">
                        No data available yet. Start serving customers to see
                        analytics!
                      </p>
                    </div>
                  )}
                </div>
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
                    <ResponsiveContainer width="100%" height={400}>
                      <BarChart
                        data={peakHoursData}
                        margin={{ top: 8, right: 16, left: 28, bottom: 8 }}
                      >
                        <XAxis
                          dataKey="hour"
                          angle={-45}
                          textAnchor="end"
                          height={80}
                        />

                        {/* Left axis (visible) */}
                        <YAxis yAxisId="left" width={40} />

                        {/* Right axis (invisible) to balance spacing and center the chart */}
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          width={40}
                          tick={false}
                          axisLine={false}
                          tickLine={false}
                        />

                        <Tooltip
                          cursor={false}
                          contentStyle={TOOLTIP_CONTENT_STYLE}
                        />
                        <Bar
                          yAxisId="left"
                          dataKey="customers"
                          fill="#3b82f6"
                          name="Customers"
                          radius={[8, 8, 0, 0]}
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
                    <ResponsiveContainer width="100%" height={400}>
                      <BarChart
                        data={waitTimeDistribution}
                        margin={{ top: 8, right: 16, left: 28, bottom: 8 }}
                      >
                        <XAxis dataKey="range" height={80} />

                        {/* Left axis (visible) */}
                        <YAxis yAxisId="left" width={40} />

                        {/* Right axis (invisible) to balance spacing and center the chart */}
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          width={40}
                          tick={false}
                          axisLine={false}
                          tickLine={false}
                        />

                        <Tooltip
                          cursor={false}
                          contentStyle={TOOLTIP_CONTENT_STYLE}
                        />
                        <Bar
                          yAxisId="left"
                          dataKey="count"
                          fill="#10b981"
                          name="Customers"
                          radius={[8, 8, 0, 0]}
                        />
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
