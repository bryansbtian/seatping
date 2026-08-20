import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { GuestStatusBadge } from "@/components/GuestBadge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { useCallback, useEffect, useState, useRef, useMemo } from "react";
import { api } from "@/lib/api";
import { formatPhone as formatPhoneIntl } from "@/lib/phone";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import BusinessHeader from "@/components/BusinessHeader";
import ReservationsManager from "@/components/ReservationsManager";
import { useLang } from "@/lib/i18n";
import { analytics } from "@/lib/analytics";
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
import SEO, { BUSINESS_DESCRIPTION, BUSINESS_IMAGE } from "@/components/SEO";
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
import {
  DEFAULT_TIMEZONE,
  getDateKeyInTimezone,
  getTodayKeyInTimezone,
  getHourInTimezone,
  formatDateLabelInTimezone,
  addDaysToDateKey,
  startOfWeekDateKey,
} from "@/lib/timezones";

function getLocationTimezone(location: any): string {
  const tz = location?.restaurantProfile?.openingHours?.timezone;
  if (typeof tz === "string" && tz) {
    return tz;
  }
  return DEFAULT_TIMEZONE;
}

const TOOLTIP_CONTENT_STYLE = {
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  boxShadow: "0 10px 25px -5px rgba(15, 23, 42, 0.1)",
  padding: "8px 12px",
};

const BusinessDashboard = () => {
  const isMobile = useIsMobile();
  const { t, lang } = useLang();

  useEffect(() => {
    analytics.businessDashboardOpened();
  }, []);
  const [me, setMe] = useState<any | null>(null);
  const [selectedLocationIndex, setSelectedLocationIndex] = useState(0);
  const [queueEtas, setQueueEtas] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [analyticsTimeframe, setAnalyticsTimeframe] = useState<"daily" | "weekly">("daily");
  const changeAnalyticsTimeframe = (tf: "daily" | "weekly") => {
    setAnalyticsTimeframe(tf);
  };
  const [trialTimeLeft, setTrialTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
  } | null>(null);
  const trialCountdownRef = useRef<NodeJS.Timeout | null>(null);
  const [, forceCountdownTick] = useState(0);
  const locations = (me?.locations as any[]) || [];
  const { toast } = useToast();

  const currentLocation = locations[selectedLocationIndex];
  const queueData = currentLocation?.queue || [];
  const locLabel = (loc: any, idx: number) =>
    loc?.displayName || loc?.name || loc?.address || `Location ${idx + 1}`;

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

    const tz = getLocationTimezone(currentLocation);
    const todayKey = getTodayKeyInTimezone(tz);

    const reservationsToday = (currentLocation.reservations || []).filter((r: any) => {
      const d = String(r?.reservationDateTime || "").split("T")[0];
      return d === todayKey && ["confirmed", "arrived"].includes(r?.status);
    }).length;

    const todayAdmitted = admittedCustomers.filter(
      (customer: any) => getDateKeyInTimezone(customer.admittedAt, tz) === todayKey,
    );

    const todayServed = todayAdmitted.filter((customer: any) => {
      return customer.finalStatus !== "no_show";
    });

    const todayNoShows = todayAdmitted.filter((customer: any) => {
      return customer.finalStatus === "no_show";
    }).length;

    const todayRemoved = removedCustomers.filter(
      (customer: any) =>
        getDateKeyInTimezone(customer.removedAt || customer.leftAt, tz) === todayKey,
    );

    const leftToday = removedCustomers.filter(
      (customer: any) => getDateKeyInTimezone(customer.leftAt, tz) === todayKey,
    ).length;

    let totalWaitTime = 0;
    let waitTimeCount = 0;

    todayServed.forEach((customer: any) => {
      if (customer.joinedAt && customer.admittedAt) {
        const joinTime = new Date(customer.joinedAt).getTime();
        const admitTime = new Date(customer.admittedAt).getTime();
        const waitTime = (admitTime - joinTime) / (1000 * 60);
        totalWaitTime += waitTime;
        waitTimeCount++;
      }
    });

    let avgWaitTime = 0;
    if (waitTimeCount > 0) {
      avgWaitTime = Math.round(totalWaitTime / waitTimeCount);
    }

    const totalProcessed = todayServed.length + todayNoShows + todayRemoved.length;
    let successRate = 100;
    if (totalProcessed > 0) {
      successRate = Math.round((todayServed.length / totalProcessed) * 100);
    }

    const reservations = currentLocation.reservations || [];
    const isToday = (iso: any) => !!iso && getDateKeyInTimezone(iso, tz) === todayKey;
    let reservationsServedToday = 0;
    let reservationNoShowsToday = 0;
    for (const r of reservations) {
      if (r?.status === "arrived" || r?.status === "completed") {
        if (isToday(r.arrivedAt || r.completedAt)) {
          reservationsServedToday++;
        }
      } else if (r?.status === "no_show" && isToday(r.noShowAt)) {
        reservationNoShowsToday++;
      }
    }

    return {
      totalServed: todayServed.length + reservationsServedToday,
      currentQueue,
      avgWaitTime,
      successRate,
      leftToday: leftToday + todayNoShows + reservationNoShowsToday,
      reservationsToday,
    };
  };

  const todayStats = calculateStats();

  const calculateTrialTimeLeft = useCallback(() => {
    if (!me || !me.trial || !me.createdAt) {
      return null;
    }

    const createdAt = new Date(me.createdAt);
    let trialDurationDays = 7;
    if (typeof me.trialDurationDays === "number") {
      trialDurationDays = me.trialDurationDays;
    }
    const trialEndDate = new Date(createdAt.getTime() + trialDurationDays * 24 * 60 * 60 * 1000);
    const now = new Date();
    const timeLeft = trialEndDate.getTime() - now.getTime();

    if (timeLeft <= 0) {
      return null;
    }

    const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));

    return { days, hours, minutes };
  }, [me]);

  useEffect(() => {
    if (trialCountdownRef.current) {
      clearInterval(trialCountdownRef.current);
    }

    if (me && me.trial) {
      setTrialTimeLeft(calculateTrialTimeLeft());

      trialCountdownRef.current = setInterval(() => {
        const timeLeft = calculateTrialTimeLeft();
        setTrialTimeLeft(timeLeft);

        if (!timeLeft) {
          if (trialCountdownRef.current) {
            clearInterval(trialCountdownRef.current);
          }
        }
      }, 60000);
    } else {
      setTrialTimeLeft(null);
    }

    return () => {
      if (trialCountdownRef.current) {
        clearInterval(trialCountdownRef.current);
      }
    };
  }, [me, calculateTrialTimeLeft]);

  useEffect(() => {
    if (me && me.trial) {
      const createdAt = new Date(me.createdAt);
      const trialDurationDays = me.trialDurationDays || 0;
      const trialEndDate = new Date(createdAt.getTime() + trialDurationDays * 24 * 60 * 60 * 1000);
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

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await api("/auth/business/me");
        setMe(res.user);
      } catch {}
    }, 10000);

    return () => clearInterval(interval);
  }, []);

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
        if (cancelled) {
          return;
        }
        const map: Record<string, any> = {};
        for (const e of res.etas || []) {
          if (e?.queueToken) {
            map[e.queueToken] = e;
          }
        }
        setQueueEtas(map);
      } catch {}
    };
    fetchEtas();
    const id = setInterval(fetchEtas, 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [me?.username, currentLocation?.id, queueData.length]);

  useEffect(() => {
    const interval = setInterval(() => {
      forceCountdownTick((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const admitCustomer = async (customerIndex: number) => {
    if (!currentLocation) {
      return;
    }

    setLoading(true);
    try {
      const customer = queueData[customerIndex];
      const customerId = `${customer.firstName}${customer.lastName}${customer.joinedAt}`;

      await api(`/auth/business/${me?.username}/queue/${customerId}/admit`, {
        method: "POST",
      });

      const updated = await api("/auth/business/me");
      setMe(updated.user);

      toast({
        title: t("dash.toast.admitted.title"),
        description: t("dash.toast.admitted.desc", {
          name: `${customer.firstName} ${customer.lastName}`,
        }),
      });
    } catch (error: any) {
      toast({
        title: t("dash.toast.admitFailed.title"),
        description: error.message || t("common.pleaseTryAgain"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const removeCustomer = async (customerIndex: number) => {
    if (!currentLocation) {
      return;
    }

    setLoading(true);
    try {
      const customer = queueData[customerIndex];
      const customerId = `${customer.firstName}${customer.lastName}${customer.joinedAt}`;

      await api(`/auth/business/${me?.username}/queue/${customerId}`, {
        method: "DELETE",
      });

      const updated = await api("/auth/business/me");
      setMe(updated.user);

      toast({
        title: t("dash.toast.removed.title"),
        description: t("dash.toast.removed.desc", {
          name: `${customer.firstName} ${customer.lastName}`,
        }),
      });
    } catch (error: any) {
      toast({
        title: t("dash.toast.removeFailed.title"),
        description: error.message || t("common.pleaseTryAgain"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const confirmArrival = async (customer: any) => {
    if (!me) {
      return;
    }

    setLoading(true);
    try {
      const customerId = `${customer.firstName}${customer.lastName}${customer.joinedAt}`;

      await api(`/auth/business/${me.username}/admitted/${customerId}/confirm-arrival`, {
        method: "POST",
      });

      const updated = await api("/auth/business/me");
      setMe(updated.user);

      toast({
        title: t("dash.toast.arrivalConfirmed.title"),
        description: t("dash.toast.arrivalConfirmed.desc", {
          name: `${customer.firstName} ${customer.lastName}`,
        }),
      });
    } catch (error: any) {
      toast({
        title: t("dash.toast.confirmFailed.title"),
        description: error.message || t("common.pleaseTryAgain"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const markNoShow = async (customer: any) => {
    if (!me) {
      return;
    }

    setLoading(true);
    try {
      const customerId = `${customer.firstName}${customer.lastName}${customer.joinedAt}`;

      await api(`/auth/business/${me.username}/admitted/${customerId}/mark-no-show`, {
        method: "POST",
      });

      const updated = await api("/auth/business/me");
      setMe(updated.user);

      toast({
        title: t("dash.toast.noShow.title"),
        description: t("dash.toast.noShow.desc", {
          name: `${customer.firstName} ${customer.lastName}`,
        }),
      });
    } catch (error: any) {
      toast({
        title: t("dash.toast.noShowFailed.title"),
        description: error.message || t("common.pleaseTryAgain"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const formatTimeSince = (joinedAt: string) => {
    const joined = new Date(joinedAt);
    const now = new Date();
    const diffMs = now.getTime() - joined.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) {
      return t("dash.justNow");
    }
    if (diffMins < 60) {
      return t("dash.minAgo", { n: diffMins });
    }
    const diffHours = Math.floor(diffMins / 60);
    return t("dash.hourMinAgo", { h: diffHours, m: diffMins % 60 });
  };

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

  const formatPhone = (countryCode?: string, phoneNumber?: string) => {
    const national = String(phoneNumber || "").replace(/\D/g, "");
    if (!national) {
      return "";
    }
    const codeDigits = String(countryCode || "").replace(/\D/g, "");
    let result: string | null;
    if (codeDigits) {
      result = formatPhoneIntl(`${codeDigits}${national}`, null);
    } else {
      result = formatPhoneIntl(null, national);
    }
    return result ?? "";
  };

  const notificationContact = (c: any): string | null => {
    const method = c?.notificationMethod;
    const phone = formatPhone(c?.countryCode, c?.phoneNumber);
    if (method === "email") {
      if (c?.email) {
        return `Email: ${c.email}`;
      }
      return "Email";
    }
    if (method === "sms" || method === "whatsapp") {
      const label = formatNotificationMethod(method);
      if (phone) {
        return `${label}: ${phone}`;
      }
      return label;
    }
    if (phone) {
      return `Phone: ${phone}`;
    }
    if (c?.email) {
      return `Email: ${c.email}`;
    }
    return null;
  };

  const getTimeRemaining = (admittedAt: string) => {
    const admitted = new Date(admittedAt);
    const now = new Date();
    const elapsed = now.getTime() - admitted.getTime();
    const fiveMinutes = 5 * 60 * 1000;
    const remaining = Math.max(0, fiveMinutes - elapsed);

    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);

    return { minutes, seconds, expired: remaining === 0 };
  };

  const getCurrentDate = () => {
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

  const getDailyWeeklySummaryData = useCallback((): {
    date: string;
    served: number;
    avgWait: number;
    noShows: number;
  }[] => {
    if (!currentLocation) {
      return [];
    }

    const admittedCustomers = currentLocation.admittedCustomers || [];
    const removedCustomers = currentLocation.removedCustomers || [];

    const tz = getLocationTimezone(currentLocation);

    if (analyticsTimeframe === "daily") {
      const days = 7;
      const todayKey = getTodayKeyInTimezone(tz);

      const dataMap = new Map<
        string,
        { date: string; served: number; avgWait: number; noShows: number }
      >();
      const waitTimes = new Map<string, number[]>();

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

      for (const c of admittedCustomers) {
        if (!c.admittedAt) {
          continue;
        }
        const key = getDateKeyInTimezone(c.admittedAt, tz);
        if (!dataMap.has(key)) {
          continue;
        }

        if (c.finalStatus !== "no_show") {
          dataMap.get(key)!.served += 1;

          if (c.joinedAt) {
            const wt = (new Date(c.admittedAt).getTime() - new Date(c.joinedAt).getTime()) / 60000;
            waitTimes.get(key)!.push(wt);
          }
        }
      }

      for (const [key, times] of waitTimes.entries()) {
        if (times.length) {
          dataMap.get(key)!.avgWait = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
        }
      }

      for (const c of removedCustomers) {
        if (c.status === "left" && c.leftAt) {
          const key = getDateKeyInTimezone(c.leftAt, tz);
          if (dataMap.has(key)) {
            dataMap.get(key)!.noShows += 1;
          }
        }
      }
      for (const c of admittedCustomers) {
        if (c.finalStatus === "no_show" && c.admittedAt) {
          const key = getDateKeyInTimezone(c.admittedAt, tz);
          if (dataMap.has(key)) {
            dataMap.get(key)!.noShows += 1;
          }
        }
      }
      for (const r of currentLocation.reservations || []) {
        if (r?.status === "arrived" || r?.status === "completed") {
          const ts = r.arrivedAt || r.completedAt;
          if (ts) {
            const key = getDateKeyInTimezone(ts, tz);
            if (dataMap.has(key)) {
              dataMap.get(key)!.served += 1;
            }
          }
        } else if (r?.status === "no_show" && r.noShowAt) {
          const key = getDateKeyInTimezone(r.noShowAt, tz);
          if (dataMap.has(key)) {
            dataMap.get(key)!.noShows += 1;
          }
        }
      }

      return Array.from(dataMap.values());
    }

    const weeks = 5;
    const thisWeekStartKey = startOfWeekDateKey(getTodayKeyInTimezone(tz));

    type Row = {
      _key: string;
      date: string;
      served: number;
      avgWait: number;
      noShows: number;
    };

    const weekRows = new Map<string, Row>();
    const weekWaitTimes = new Map<string, number[]>();

    for (let i = weeks - 1; i >= 0; i--) {
      const key = addDaysToDateKey(thisWeekStartKey, -i * 7);
      weekRows.set(key, {
        _key: key,
        date: t("dash.weekOf", { date: formatDateLabelInTimezone(key) }),
        served: 0,
        avgWait: 0,
        noShows: 0,
      });
      weekWaitTimes.set(key, []);
    }

    const weekKeyFrom = (iso: any) => startOfWeekDateKey(getDateKeyInTimezone(iso, tz));

    for (const c of admittedCustomers) {
      if (!c.admittedAt) {
        continue;
      }
      const key = weekKeyFrom(new Date(c.admittedAt));
      if (!weekRows.has(key)) {
        continue;
      }

      if (c.finalStatus !== "no_show") {
        weekRows.get(key)!.served += 1;

        if (c.joinedAt) {
          const wt = (new Date(c.admittedAt).getTime() - new Date(c.joinedAt).getTime()) / 60000;
          weekWaitTimes.get(key)!.push(wt);
        }
      }
    }

    for (const [key, times] of weekWaitTimes.entries()) {
      if (times.length) {
        weekRows.get(key)!.avgWait = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
      }
    }

    for (const c of removedCustomers) {
      if (c.status === "left" && c.leftAt) {
        const key = weekKeyFrom(new Date(c.leftAt));
        if (weekRows.has(key)) {
          weekRows.get(key)!.noShows += 1;
        }
      }
    }
    for (const c of admittedCustomers) {
      if (c.finalStatus === "no_show" && c.admittedAt) {
        const key = weekKeyFrom(new Date(c.admittedAt));
        if (weekRows.has(key)) {
          weekRows.get(key)!.noShows += 1;
        }
      }
    }
    for (const r of currentLocation.reservations || []) {
      if (r?.status === "arrived" || r?.status === "completed") {
        const ts = r.arrivedAt || r.completedAt;
        if (ts) {
          const key = weekKeyFrom(new Date(ts));
          if (weekRows.has(key)) {
            weekRows.get(key)!.served += 1;
          }
        }
      } else if (r?.status === "no_show" && r.noShowAt) {
        const key = weekKeyFrom(new Date(r.noShowAt));
        if (weekRows.has(key)) {
          weekRows.get(key)!.noShows += 1;
        }
      }
    }

    return Array.from(weekRows.values())
      .sort((a, b) => a._key.localeCompare(b._key))
      .map(({ _key, ...rest }) => rest);
  }, [analyticsTimeframe, currentLocation, t]);

  const getPeakHoursData = () => {
    if (!currentLocation) {
      return [];
    }

    const admittedCustomers = currentLocation.admittedCustomers || [];
    const tz = getLocationTimezone(currentLocation);
    const hourMap = new Map<number, number>();

    for (let i = 0; i < 24; i++) {
      hourMap.set(i, 0);
    }

    admittedCustomers.forEach((customer: any) => {
      if (customer.finalStatus !== "no_show") {
        const hour = getHourInTimezone(customer.joinedAt, tz);
        if (Number.isNaN(hour)) {
          return;
        }
        hourMap.set(hour, (hourMap.get(hour) || 0) + 1);
      }
    });

    return Array.from(hourMap.entries())
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .sort((a, b) => a[0] - b[0])
      .map(([hour, count]) => {
        let hourLabel: string;
        if (hour === 0) {
          hourLabel = "12 AM";
        } else if (hour < 12) {
          hourLabel = `${hour} AM`;
        } else if (hour === 12) {
          hourLabel = "12 PM";
        } else {
          hourLabel = `${hour - 12} PM`;
        }
        return {
          hour: hourLabel,
          customers: count,
        };
      });
  };

  const getWaitTimeDistribution = () => {
    if (!currentLocation) {
      return [];
    }

    const admittedCustomers = currentLocation.admittedCustomers || [];
    const buckets = [
      { range: t("dash.bucket.0to5"), min: 0, max: 5, count: 0 },
      { range: t("dash.bucket.5to10"), min: 5, max: 10, count: 0 },
      { range: t("dash.bucket.10to15"), min: 10, max: 15, count: 0 },
      { range: t("dash.bucket.15to30"), min: 15, max: 30, count: 0 },
      { range: t("dash.bucket.30plus"), min: 30, max: Infinity, count: 0 },
    ];

    admittedCustomers.forEach((customer: any) => {
      if (customer.finalStatus !== "no_show" && customer.joinedAt && customer.admittedAt) {
        const joinTime = new Date(customer.joinedAt).getTime();
        const admitTime = new Date(customer.admittedAt).getTime();
        const waitTime = (admitTime - joinTime) / (1000 * 60);

        const bucket = buckets.find((b) => waitTime >= b.min && waitTime < b.max);
        if (bucket) {
          bucket.count++;
        }
      }
    });

    return buckets;
  };

  const dailyWeeklySummary = useMemo(
    () => getDailyWeeklySummaryData(),
    [getDailyWeeklySummaryData],
  );
  const peakHoursData = getPeakHoursData();
  const waitTimeDistribution = getWaitTimeDistribution();

  let locationOptions: JSX.Element | JSX.Element[];
  if (locations.length > 0) {
    locationOptions = locations.map((loc, idx) => (
      <option key={idx} value={idx}>
        {locLabel(loc, idx)}
      </option>
    ));
  } else {
    locationOptions = <option value={0}>{t("dash.noLocations")}</option>;
  }

  let reservationsLocationLabel: string;
  if (currentLocation) {
    reservationsLocationLabel = locLabel(currentLocation, selectedLocationIndex);
  } else {
    reservationsLocationLabel = "";
  }

  let reservationsEnabled: boolean;
  if (currentLocation) {
    reservationsEnabled = currentLocation.reservationsEnabled !== false;
  } else {
    reservationsEnabled = true;
  }

  let queueCountKey: "dash.queue.customerOne" | "dash.queue.customerMany";
  if (queueData.length === 1) {
    queueCountKey = "dash.queue.customerOne";
  } else {
    queueCountKey = "dash.queue.customerMany";
  }

  let queueManagingText: string;
  if (currentLocation) {
    queueManagingText = t("dash.queue.managingFor", {
      label: locLabel(currentLocation, selectedLocationIndex),
    });
  } else {
    queueManagingText = t("dash.queue.noLocationSelected");
  }

  let queueContent: JSX.Element;
  if (queueData.length === 0) {
    queueContent = (
      <div className="flex flex-col items-center py-10 text-center text-slate-400">
        <Users className="h-8 w-8" />
        <p className="mt-2 text-sm">{t("dash.queue.empty")}</p>
      </div>
    );
  } else {
    queueContent = (
      <div className="space-y-3 md:space-y-4">
        {queueData.map((customer: any, index: number) => {
          let guestCountKey: "dash.guestOne" | "dash.guestMany";
          if (customer.numGuests === 1) {
            guestCountKey = "dash.guestOne";
          } else {
            guestCountKey = "dash.guestMany";
          }
          return (
            <div
              key={index}
              className="flex flex-col space-y-3 md:flex-row md:items-center md:justify-between md:space-y-0 p-3 md:p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-start space-x-3 md:space-x-4">
                <span className="mt-0.5 inline-flex shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white px-2 py-1 text-xs md:text-sm font-semibold leading-none text-gray-700 shadow-sm tabular-nums">
                  #{index + 1}
                </span>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-800 text-sm md:text-base flex items-center gap-2 flex-wrap">
                    {customer.firstName} {customer.lastName}
                    {customer.isReturning && <GuestStatusBadge returning />}
                  </h3>
                  <div className="flex flex-wrap items-center gap-x-1.5 text-xs md:text-sm text-gray-600">
                    <span className="whitespace-nowrap">
                      {t("dash.queue.joined", {
                        time: formatTimeSince(customer.joinedAt),
                      })}
                    </span>
                    <span className="text-gray-400">•</span>
                    <span className="whitespace-nowrap">
                      {t(guestCountKey, { n: customer.numGuests })}
                    </span>
                  </div>

                  {notificationContact(customer) && (
                    <p className="text-xs md:text-sm text-gray-500 mt-1 break-all">
                      {notificationContact(customer)}
                    </p>
                  )}
                  {customer.queueToken && queueEtas[customer.queueToken] && (
                    <p className="text-xs md:text-sm font-medium text-indigo-600 mt-1">
                      {t("dash.queue.estimatedWait", {
                        text: queueEtas[customer.queueToken].displayText,
                      })}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center space-x-2 md:space-x-3">
                <Button
                  size="sm"
                  variant="success"
                  className="flex-1 md:flex-none"
                  onClick={() => admitCustomer(index)}
                  disabled={loading}
                >
                  {t("dash.admit")}
                </Button>
                <Button
                  size="sm"
                  variant="destructiveOutline"
                  onClick={() => removeCustomer(index)}
                  disabled={loading}
                  className="flex-1 md:flex-none"
                >
                  {t("dash.remove")}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  let trialBanner: JSX.Element | null = null;
  if (me && me.trial === true) {
    const createdAt = new Date(me.createdAt);
    let trialDurationDays = 7;
    if (typeof me.trialDurationDays === "number") {
      trialDurationDays = me.trialDurationDays;
    }
    const trialEndDate = new Date(createdAt.getTime() + trialDurationDays * 24 * 60 * 60 * 1000);
    const now = new Date();
    if (now > trialEndDate) {
      trialBanner = (
        <div className="mb-6">
          <div className="bg-gradient-to-r from-red-500 to-red-600 rounded-xl shadow-lg p-4 md:p-6 text-white">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-3 md:space-y-0">
              <div>
                <h3 className="text-lg md:text-xl font-semibold">
                  {t("banner.trialExpired.title")}
                </h3>
                <p className="text-sm md:text-base opacity-90">{t("banner.trialExpired.body")}</p>
              </div>
              <div className="flex justify-end">
                <Button
                  variant="inverseOutline"
                  className="border-2"
                  onClick={() => (window.location.href = "/sales")}
                >
                  {t("common.contactSeatPing")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      );
    } else {
      trialBanner = (
        <div className="mb-6">
          <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-xl shadow-lg p-4 md:p-6 text-white">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-3 md:space-y-0">
              <div>
                <h3 className="text-lg md:text-xl font-semibold">
                  {t("banner.trialActive.title")}
                </h3>
                <p className="text-sm md:text-base opacity-90">{t("banner.trialActive.body")}</p>
                {trialTimeLeft && (
                  <div className="mt-2 flex items-center space-x-2 text-indigo-100">
                    <span className="text-sm font-medium">
                      {t("banner.trialActive.countdown", {
                        days: trialTimeLeft.days,
                        hours: trialTimeLeft.hours,
                        minutes: trialTimeLeft.minutes,
                      })}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex justify-end">
                <Button
                  variant="inverseOutline"
                  className="border-2"
                  onClick={() => (window.location.href = "/sales")}
                >
                  {t("common.contactSeatPing")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      );
    }
  }

  let dailyTimeframeVariant: "default" | "outline";
  if (analyticsTimeframe === "daily") {
    dailyTimeframeVariant = "default";
  } else {
    dailyTimeframeVariant = "outline";
  }

  let weeklyTimeframeVariant: "default" | "outline";
  if (analyticsTimeframe === "weekly") {
    weeklyTimeframeVariant = "default";
  } else {
    weeklyTimeframeVariant = "outline";
  }

  let summaryChartContent: JSX.Element;
  if (dailyWeeklySummary.length > 0) {
    summaryChartContent = (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={dailyWeeklySummary} margin={{ top: 8, right: 16, left: 28, bottom: 44 }}>
          <XAxis dataKey="date" tickMargin={14} height={32} />

          <YAxis yAxisId="left" width={40} allowDecimals={false} />

          <YAxis
            yAxisId="right"
            orientation="right"
            width={40}
            tick={false}
            axisLine={false}
            tickLine={false}
          />

          <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} />
          <Legend verticalAlign="bottom" align="center" wrapperStyle={{ bottom: 4 }} />

          <Line
            yAxisId="left"
            type="monotone"
            dataKey="served"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            name={t("dash.legend.served")}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="avgWait"
            stroke="#10b981"
            strokeWidth={2}
            dot={false}
            name={t("dash.legend.avgWait")}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="noShows"
            stroke="#f59e0b"
            strokeWidth={2}
            dot={false}
            name={t("dash.legend.noShows")}
          />
        </LineChart>
      </ResponsiveContainer>
    );
  } else {
    summaryChartContent = (
      <div className="flex h-full flex-col items-center justify-center text-center">
        <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500">{t("dash.noData")}</p>
      </div>
    );
  }

  let peakHoursXAxisInterval: "preserveStartEnd" | 0;
  if (isMobile) {
    peakHoursXAxisInterval = "preserveStartEnd";
  } else {
    peakHoursXAxisInterval = 0;
  }

  let peakHoursMinTickGap: number;
  if (isMobile) {
    peakHoursMinTickGap = 16;
  } else {
    peakHoursMinTickGap = 0;
  }

  let waitDistributionContent: JSX.Element;
  if (waitTimeDistribution.some((b) => b.count > 0)) {
    waitDistributionContent = (
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={waitTimeDistribution} margin={{ top: 8, right: 16, left: 28, bottom: 0 }}>
          <XAxis dataKey="range" height={40} tick={{ fontSize: 12 }} />

          <YAxis yAxisId="left" width={40} />

          <YAxis
            yAxisId="right"
            orientation="right"
            width={40}
            tick={false}
            axisLine={false}
            tickLine={false}
          />

          <Tooltip cursor={false} contentStyle={TOOLTIP_CONTENT_STYLE} />
          <Bar
            yAxisId="left"
            dataKey="count"
            fill="#64748b"
            name={t("dash.waitDist.legend")}
            radius={[8, 8, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    );
  } else {
    waitDistributionContent = (
      <div className="text-center py-12">
        <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500">{t("dash.waitDist.noData")}</p>
      </div>
    );
  }

  let peakHoursContent: JSX.Element;
  if (peakHoursData.length > 0) {
    peakHoursContent = (
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={peakHoursData} margin={{ top: 8, right: 16, left: 28, bottom: 0 }}>
          <XAxis
            dataKey="hour"
            height={40}
            interval={peakHoursXAxisInterval}
            minTickGap={peakHoursMinTickGap}
            tick={{ fontSize: 12 }}
          />

          <YAxis yAxisId="left" width={40} />

          <YAxis
            yAxisId="right"
            orientation="right"
            width={40}
            tick={false}
            axisLine={false}
            tickLine={false}
          />

          <Tooltip cursor={false} contentStyle={TOOLTIP_CONTENT_STYLE} />
          <Bar
            yAxisId="left"
            dataKey="customers"
            fill="#4f46e5"
            name={t("dash.peak.legend")}
            radius={[8, 8, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    );
  } else {
    peakHoursContent = (
      <div className="text-center py-12">
        <Clock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500">{t("dash.peak.noData")}</p>
      </div>
    );
  }

  return (
    <>
      <SEO
        title="Business Dashboard | SeatPing"
        description={BUSINESS_DESCRIPTION}
        image={BUSINESS_IMAGE}
      />
      <BusinessHeader />
      <div className="min-h-screen pt-20 bg-gradient-to-br from-slate-50 to-indigo-100">
        <div className="container mx-auto px-4 py-8 [&_.text-3xl]:max-[374px]:text-2xl [&_.text-2xl]:max-[374px]:text-xl [&_.text-xl]:max-[374px]:text-lg [&_.text-lg]:max-[374px]:text-base [&_.text-base]:max-[374px]:text-sm [&_.text-sm]:max-[374px]:text-xs [&_.text-xs]:max-[374px]:text-[11px]">
          {me && me.trial === true && <>{trialBanner}</>}

          {me && me.trial === false && currentLocation && currentLocation.credits === 0 && (
            <div className="mb-6">
              <div className="bg-gradient-to-r from-teal-500 to-teal-600 rounded-xl shadow-lg p-4 md:p-6 text-white">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-3 md:space-y-0">
                  <div>
                    <h3 className="text-lg md:text-xl font-semibold">
                      {t("banner.noCredits.title")}
                    </h3>
                    <p className="text-sm md:text-base opacity-90">{t("banner.noCredits.body")}</p>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      variant="inverseOutline"
                      onClick={() => (window.location.href = "/sales")}
                    >
                      {t("common.contactSeatPing")}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 md:p-6 mb-4 lg:hidden">
            <div className="mb-4">
              <h2 className="text-xl md:text-2xl font-semibold text-slate-800 leading-tight">
                {t("dash.hello", { name: me?.name || t("dash.ownerFallback") })}
              </h2>
              <p className="text-slate-600 text-sm md:text-base">{t("dash.dailyStat")}</p>
            </div>

            {currentLocation && (
              <div className="mb-3">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-slate-600 mb-1">{t("dash.credits")}</p>
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

            <div className="relative">
              <select
                className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={selectedLocationIndex}
                onChange={(e) => setSelectedLocationIndex(Number(e.target.value))}
              >
                {locationOptions}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 md:p-6 mb-6 hidden lg:block">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h2 className="text-xl md:text-2xl font-semibold text-slate-800">
                  {t("dash.hello", {
                    name: me?.name || t("dash.ownerFallback"),
                  })}
                </h2>
                <p className="text-slate-600 text-sm md:text-base">{t("dash.dailyStat")}</p>
                {currentLocation && (
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded">
                      {t("dash.creditsPill", {
                        n: currentLocation?.credits || 0,
                      })}
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
                    onChange={(e) => setSelectedLocationIndex(Number(e.target.value))}
                  >
                    {locationOptions}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
            </div>
          </div>

          <Card className="mb-6 bg-white rounded-xl shadow-sm border border-slate-200 lg:hidden">
            <div className="p-4">
              <p className="text-sm font-semibold text-slate-800 mb-3">{t("dash.todaysSummary")}</p>
              <div className="divide-y divide-slate-100">
                {[
                  {
                    label: t("dash.stat.currentQueue"),
                    value: todayStats.currentQueue,
                    icon: Users,
                    tint: "bg-indigo-100 text-indigo-600",
                  },
                  {
                    label: t("dash.stat.reservationsToday"),
                    value: todayStats.reservationsToday,
                    icon: Calendar,
                    tint: "bg-blue-100 text-blue-600",
                  },
                  {
                    label: t("dash.stat.avgQueueWait"),
                    value: `${todayStats.avgWaitTime}m`,
                    icon: Clock,
                    tint: "bg-teal-100 text-teal-600",
                  },
                  {
                    label: t("dash.stat.servedToday"),
                    value: todayStats.totalServed,
                    icon: TrendingUp,
                    tint: "bg-emerald-100 text-emerald-600",
                  },
                  {
                    label: t("dash.stat.leftToday"),
                    value: todayStats.leftToday,
                    icon: LogOut,
                    tint: "bg-teal-100 text-teal-600",
                  },
                ].map(({ label, value, icon: Icon, tint }) => (
                  <div key={label} className="flex items-center justify-between py-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-full grid place-items-center shrink-0 max-[325px]:hidden ${tint}`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className="text-sm text-slate-600 truncate">{label}</span>
                    </div>
                    <span className="text-lg font-semibold text-slate-800 leading-none shrink-0">
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <div className="hidden lg:grid grid-cols-5 gap-4 mb-6">
            <Card className="p-3 md:p-4 bg-white rounded-xl shadow-sm border border-slate-200">
              <div className="flex flex-col gap-2">
                <p className="text-slate-600 text-xs md:text-sm">{t("dash.stat.currentQueue")}</p>
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

            <Card className="p-3 md:p-4 bg-white rounded-xl shadow-sm border border-slate-200">
              <div className="flex flex-col gap-2">
                <p className="text-slate-600 text-xs md:text-sm">
                  {t("dash.stat.reservationsToday")}
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

            <Card className="p-3 md:p-4 bg-white rounded-xl shadow-sm border border-slate-200">
              <div className="flex flex-col gap-2">
                <p className="text-slate-600 text-xs md:text-sm">
                  {t("dash.stat.avgQueueWaitTime")}
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

            <Card className="p-3 md:p-4 bg-white rounded-xl shadow-sm border border-slate-200">
              <div className="flex flex-col gap-2">
                <p className="text-slate-600 text-xs md:text-sm">{t("dash.stat.servedToday")}</p>
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

            <Card className="p-3 md:p-4 bg-white rounded-xl shadow-sm border border-slate-200">
              <div className="flex flex-col gap-2">
                <p className="text-slate-600 text-xs md:text-sm">{t("dash.stat.leftToday")}</p>
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

          <Card className="bg-white rounded-xl shadow-sm border border-slate-200 mb-6">
            <CardHeader className="border-b border-gray-100 p-4 md:p-6">
              <div className="md:hidden">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-lg text-gray-800">
                    <ListOrdered className="w-5 h-5" />
                    {t("dash.queue.title")}
                  </CardTitle>
                  <Badge
                    variant="secondary"
                    className="bg-indigo-100 text-indigo-700 text-[10px] sm:text-xs px-2 py-1 sm:px-3 whitespace-nowrap max-[374px]:hidden"
                  >
                    {t(queueCountKey, { n: queueData.length })}
                  </Badge>
                </div>
                <CardDescription className="text-gray-600 text-sm mb-3 mt-0.5">
                  {queueManagingText}
                </CardDescription>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      const res = await api("/auth/business/me");
                      setMe(res.user);
                      toast({
                        title: t("dash.toast.queueRefreshed.title"),
                        description: t("dash.toast.queueRefreshed.desc"),
                      });
                    } catch (error: any) {
                      toast({
                        title: t("dash.toast.refreshFailed.title"),
                        description: error.message || t("common.pleaseTryAgain"),
                        variant: "destructive",
                      });
                    }
                  }}
                  disabled={loading}
                  className="flex items-center space-x-2 w-full"
                >
                  <RefreshCw size={16} />
                  <span>{t("common.refresh")}</span>
                </Button>
              </div>

              <div className="hidden md:flex md:items-center md:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg md:text-xl text-gray-800">
                    <ListOrdered className="w-5 h-5" />
                    {t("dash.queue.title")}
                  </CardTitle>
                  <CardDescription className="text-gray-600 text-sm">
                    {queueManagingText}
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
                          title: t("dash.toast.queueRefreshed.title"),
                          description: t("dash.toast.queueRefreshed.desc"),
                        });
                      } catch (error: any) {
                        toast({
                          title: t("dash.toast.refreshFailed.title"),
                          description: error.message || t("common.pleaseTryAgain"),
                          variant: "destructive",
                        });
                      }
                    }}
                    disabled={loading}
                    className="flex items-center space-x-2"
                  >
                    <RefreshCw size={16} />
                    <span>{t("common.refresh")}</span>
                  </Button>
                  <Badge variant="secondary" className="bg-indigo-100 text-indigo-700">
                    {t(queueCountKey, { n: queueData.length })}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 md:p-6">{queueContent}</CardContent>
          </Card>

          {(() => {
            const pendingAdmittedCustomers = (currentLocation?.admittedCustomers || []).filter(
              (customer: any) => customer.finalStatus === "pending",
            );

            return (
              pendingAdmittedCustomers.length > 0 && (
                <Card className="bg-amber-50 border-amber-200 rounded-xl shadow-sm mb-6">
                  <CardHeader className="border-b border-amber-200 p-4 md:p-6">
                    <CardTitle className="text-lg md:text-xl text-amber-800 flex items-center gap-2">
                      <Clock className="w-5 h-5" />
                      {t("dash.awaiting.title")}
                    </CardTitle>
                    <CardDescription className="text-amber-700 text-sm">
                      {t("dash.awaiting.desc")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 md:p-6">
                    <div className="space-y-3 md:space-y-4">
                      {pendingAdmittedCustomers.map((customer: any, index: number) => {
                        const timeRemaining = getTimeRemaining(customer.admittedAt);
                        const customerId = `${customer.firstName}${customer.lastName}${customer.joinedAt}`;
                        let countdownLabel: string;
                        if (timeRemaining.expired) {
                          countdownLabel = "!";
                        } else {
                          countdownLabel = `${timeRemaining.minutes}:${timeRemaining.seconds
                            .toString()
                            .padStart(2, "0")}`;
                        }
                        let guestCountKey: "dash.guestOne" | "dash.guestMany";
                        if (customer.numGuests === 1) {
                          guestCountKey = "dash.guestOne";
                        } else {
                          guestCountKey = "dash.guestMany";
                        }

                        return (
                          <div
                            key={customerId}
                            className="flex flex-col space-y-3 md:flex-row md:items-center md:justify-between md:space-y-0 p-3 md:p-4 bg-white rounded-lg border border-amber-200"
                          >
                            <div className="flex items-center space-x-3 md:space-x-4 flex-1">
                              <div className="flex-shrink-0">
                                <div className="w-8 h-8 md:w-10 md:h-10 bg-amber-600 rounded-full flex items-center justify-center">
                                  <span className="text-[10px] sm:text-xs md:text-sm font-semibold text-white leading-none tabular-nums">
                                    {countdownLabel}
                                  </span>
                                </div>
                              </div>
                              <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-gray-800 text-sm md:text-base flex items-center gap-2 flex-wrap">
                                  {customer.firstName} {customer.lastName}
                                  {customer.isReturning && <GuestStatusBadge returning />}
                                </h3>
                                <div className="flex flex-wrap items-center gap-x-1.5 text-xs md:text-sm text-gray-600">
                                  <span className="whitespace-nowrap">
                                    {t("dash.admitted", {
                                      time: formatTimeSince(customer.admittedAt),
                                    })}
                                  </span>
                                  <span className="text-gray-400">•</span>
                                  <span className="whitespace-nowrap">
                                    {t(guestCountKey, {
                                      n: customer.numGuests,
                                    })}
                                  </span>

                                  {timeRemaining.expired && (
                                    <>
                                      <span className="text-gray-400">•</span>
                                      <span className="text-red-600 font-semibold whitespace-nowrap">
                                        {t("dash.timeExpired")}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 md:gap-3">
                              <Button
                                size="sm"
                                variant="success"
                                className="flex-1 md:flex-none"
                                onClick={() => confirmArrival(customer)}
                                disabled={loading}
                              >
                                {t("dash.arrived")}
                              </Button>
                              <Button
                                size="sm"
                                variant="destructiveOutline"
                                className="flex-1 md:flex-none"
                                onClick={() => markNoShow(customer)}
                                disabled={loading}
                              >
                                {t("dash.noShow")}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )
            );
          })()}

          <ReservationsManager
            reservations={currentLocation?.reservations || []}
            businessUsername={me?.username || ""}
            locationId={currentLocation?.id || ""}
            timeZone={getLocationTimezone(currentLocation)}
            locationLabel={reservationsLocationLabel}
            reservationsEnabled={reservationsEnabled}
            onUpdated={(user) => setMe(user)}
          />

          {(() => {
            const now = new Date();
            const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

            const recentlyLeftCustomers = (currentLocation?.removedCustomers || [])
              .filter((customer: any) => {
                const leftTime = new Date(customer.leftAt || customer.removedAt);
                return leftTime >= twentyFourHoursAgo;
              })
              .slice(-5);

            let recentlyLeftContent: JSX.Element;
            if (recentlyLeftCustomers.length === 0) {
              recentlyLeftContent = (
                <div className="flex flex-col items-center py-10 text-center text-slate-400">
                  <Users className="h-8 w-8" />
                  <p className="mt-2 text-sm">{t("dash.left.empty")}</p>
                </div>
              );
            } else {
              recentlyLeftContent = (
                <div className="space-y-3 md:space-y-4">
                  {recentlyLeftCustomers.map((customer: any, index: number) => {
                    let leftStatus: string;
                    let leftStatusLabel: string;
                    let leftTimeLabel: string;
                    if (customer.status === "left") {
                      leftStatus = "left";
                      leftStatusLabel = t("dash.left.leftQueue");
                      leftTimeLabel = t("dash.left.left");
                    } else {
                      leftStatus = "removed";
                      leftStatusLabel = t("dash.left.removedByBusiness");
                      leftTimeLabel = t("dash.left.removed");
                    }
                    let guestCountKey: "dash.guestOne" | "dash.guestMany";
                    if (customer.numGuests === 1) {
                      guestCountKey = "dash.guestOne";
                    } else {
                      guestCountKey = "dash.guestMany";
                    }
                    const statusBadge = <StatusBadge status={leftStatus} label={leftStatusLabel} />;
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
                                {leftTimeLabel}:{" "}
                                {formatTimeSince(customer.leftAt || customer.removedAt)}
                              </span>
                              <span className="text-gray-400">•</span>
                              <span className="whitespace-nowrap">
                                {t(guestCountKey, {
                                  n: customer.numGuests,
                                })}
                              </span>
                            </div>

                            {notificationContact(customer) && (
                              <p className="text-xs md:text-sm text-gray-500 mt-1 break-all">
                                {notificationContact(customer)}
                              </p>
                            )}
                            <div className="mt-1.5 md:hidden">{statusBadge}</div>
                          </div>
                        </div>
                        <div className="hidden md:block">{statusBadge}</div>
                      </div>
                    );
                  })}
                </div>
              );
            }

            return (
              <Card className="bg-white rounded-xl shadow-sm border border-slate-200 mb-6">
                <CardHeader className="border-b border-gray-100 p-4 md:p-6">
                  <CardTitle className="flex items-center gap-2 text-lg md:text-xl text-gray-800">
                    <Users className="w-5 h-5" />
                    <span>{t("dash.left.title")}</span>
                  </CardTitle>
                  <CardDescription className="text-gray-600 text-sm">
                    {t("dash.left.desc")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 md:p-6">{recentlyLeftContent}</CardContent>
              </Card>
            );
          })()}

          <div className="mb-6 space-y-6">
            <Card className="bg-white rounded-xl shadow-sm border border-slate-200">
              <CardHeader className="border-b border-slate-100 p-4 md:p-6">
                <div className="flex flex-col space-y-3 md:flex-row md:items-center md:justify-between md:space-y-0">
                  <div>
                    <CardTitle className="text-lg md:text-xl text-gray-800 flex items-center space-x-2">
                      <TrendingUp className="w-5 h-5" />
                      <span>{t("dash.perf.title")}</span>
                    </CardTitle>
                    <CardDescription className="text-gray-600 text-sm">
                      {t("dash.perf.desc")}
                    </CardDescription>
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      size="sm"
                      variant={dailyTimeframeVariant}
                      onClick={() => changeAnalyticsTimeframe("daily")}
                    >
                      {t("dash.daily")}
                    </Button>
                    <Button
                      size="sm"
                      variant={weeklyTimeframeVariant}
                      onClick={() => changeAnalyticsTimeframe("weekly")}
                    >
                      {t("dash.weekly")}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 md:p-6">
                <div className="h-[300px] w-full">{summaryChartContent}</div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="bg-white rounded-xl shadow-sm border border-slate-200">
                <CardHeader className="border-b border-gray-100 p-4 md:p-6">
                  <CardTitle className="text-lg md:text-xl text-gray-800 flex items-center space-x-2">
                    <Clock className="w-5 h-5" />
                    <span>{t("dash.peak.title")}</span>
                  </CardTitle>
                  <CardDescription className="text-gray-600 text-sm">
                    {t("dash.peak.desc")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 md:p-6">{peakHoursContent}</CardContent>
              </Card>

              <Card className="bg-white rounded-xl shadow-sm border border-slate-200">
                <CardHeader className="border-b border-gray-100 p-4 md:p-6">
                  <CardTitle className="text-lg md:text-xl text-gray-800 flex items-center space-x-2">
                    <BarChart3 className="w-5 h-5" />
                    <span>{t("dash.waitDist.title")}</span>
                  </CardTitle>
                  <CardDescription className="text-gray-600 text-sm">
                    {t("dash.waitDist.desc")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 md:p-6">{waitDistributionContent}</CardContent>
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
