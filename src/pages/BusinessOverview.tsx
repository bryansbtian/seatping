import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { GuestStatusBadge } from "@/components/GuestBadge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { useCallback, useEffect, useState, useRef, useMemo } from "react";
import { api } from "@/lib/api";
import { formatPhoneParts } from "@shared/phone";
import { useToast } from "@/hooks/use-toast";
import { useLang } from "@/lib/i18n";
import { useBusinessSession, locationLabel } from "@/lib/businessSession";
import { analytics } from "@/lib/analytics";
import BarSeries from "@/components/charts/BarSeries";
import BusinessEmptyState from "@/components/BusinessEmptyState";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ChartAnalysisIcon,
  Calendar01Icon,
  Clock01Icon,
  TrendingDownIcon,
  UsersRoundIcon,
} from "@hugeicons/core-free-icons";
import SEO, { BUSINESS_DESCRIPTION, BUSINESS_IMAGE } from "@/components/SEO";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import {
  DEFAULT_TIMEZONE,
  getDateKeyInTimezone,
  getTodayKeyInTimezone,
  getHourInTimezone,
  formatDateLabelInTimezone,
  addDaysToDateKey,
  startOfWeekDateKey,
  getLocationTimezone,
} from "@/lib/timezones";

const TOOLTIP_CONTENT_STYLE = {
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  boxShadow: "0 10px 25px -5px rgba(15, 23, 42, 0.1)",
  padding: "8px 12px",
};

const BusinessOverview = () => {
  const { t, lang } = useLang();

  useEffect(() => {
    analytics.businessDashboardOpened();
  }, []);
  const {
    me,
    setMe,
    locations,
    currentLocation,
    currentLocationIndex: selectedLocationIndex,
  } = useBusinessSession();
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
  const { toast } = useToast();

  const queueData = currentLocation?.queue || [];
  const locLabel = locationLabel;

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
  }, [me, setMe]);

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

  const notificationContact = (c: any): string | null => {
    const method = c?.notificationMethod;
    const phone = formatPhoneParts(c?.countryCode, c?.phoneNumber) ?? "";
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

  let reservationsEnabled: boolean;
  if (currentLocation) {
    reservationsEnabled = currentLocation.reservationsEnabled !== false;
  } else {
    reservationsEnabled = true;
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
      <BusinessEmptyState
        icon={ChartAnalysisIcon}
        title={t("dash.empty.performance.title")}
        body={t("dash.empty.performance.body")}
        className="h-full px-4 py-8"
      />
    );
  }

  let waitDistributionContent: JSX.Element;
  if (waitTimeDistribution.some((b) => b.count > 0)) {
    waitDistributionContent = (
      <BarSeries
        testId="overview-wait-distribution"
        height={180}
        barClass="bg-slate-500"
        data={waitTimeDistribution.map((bucket: any) => ({
          key: bucket.range,
          label: bucket.range,
          value: bucket.count,
        }))}
      />
    );
  } else {
    waitDistributionContent = (
      <BusinessEmptyState
        icon={ChartAnalysisIcon}
        title={t("dash.empty.waitTime.title")}
        body={t("dash.empty.waitTime.body")}
        className="h-[180px] px-4 py-8"
      />
    );
  }

  let peakHoursContent: JSX.Element;
  if (peakHoursData.length > 0) {
    peakHoursContent = (
      <BarSeries
        testId="overview-peak-hours"
        height={180}
        barClass="bg-indigo-600"
        data={peakHoursData.map((slot: any) => ({
          key: slot.hour,
          label: slot.hour,
          value: slot.customers,
        }))}
      />
    );
  } else {
    peakHoursContent = (
      <BusinessEmptyState
        icon={Clock01Icon}
        title={t("dash.empty.peakHours.title")}
        body={t("dash.empty.peakHours.body")}
        className="h-[180px] px-4 py-8"
      />
    );
  }

  return (
    <>
      <SEO
        title="Business Overview | SeatPing"
        description={BUSINESS_DESCRIPTION}
        image={BUSINESS_IMAGE}
      />
      <div>
        <div className="container mx-auto px-4 py-8">
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

          <div className="overview-mobile-header bg-white border border-slate-200 rounded-xl shadow-sm p-4 md:p-6 mb-4 lg:hidden">
            <div>
              <h2 className="text-xl md:text-2xl font-semibold text-slate-800 leading-tight">
                {t("dash.hello", { name: me?.name || t("dash.ownerFallback") })}
              </h2>
              <p className="text-slate-600 text-sm md:text-base">{t("dash.dailyStat")}</p>
              {currentLocation && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">
                    {locLabel(currentLocation, selectedLocationIndex)}
                  </span>
                  <span className="rounded bg-indigo-100 px-2 py-1 text-xs text-indigo-700">
                    {t("dash.creditsPill", {
                      n: currentLocation.credits || 0,
                    })}
                  </span>
                </div>
              )}
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
                    <span className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded">
                      {locLabel(currentLocation, selectedLocationIndex)}
                    </span>
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
                  <HugeiconsIcon icon={Calendar01Icon} className="w-4 h-4" />
                  <span>{getCurrentDate()}</span>
                </div>{" "}
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
                  },
                  {
                    label: t("dash.stat.reservationsToday"),
                    value: todayStats.reservationsToday,
                  },
                  {
                    label: t("dash.stat.avgQueueWait"),
                    value: `${todayStats.avgWaitTime}m`,
                  },
                  {
                    label: t("dash.stat.servedToday"),
                    value: todayStats.totalServed,
                  },
                  {
                    label: t("dash.stat.leftToday"),
                    value: todayStats.leftToday,
                  },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between py-2.5">
                    <span className="min-w-0 truncate text-caption font-medium uppercase tracking-[0.12em] text-slate-500">
                      {label}
                    </span>
                    <span className="text-lg font-semibold text-slate-800 leading-none shrink-0">
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <div className="hidden lg:grid grid-cols-5 gap-4 mb-6">
            <Card className="h-full p-3 md:p-4 bg-white rounded-xl shadow-sm border border-slate-200">
              <div className="flex h-full flex-col">
                <p className="text-caption font-medium uppercase tracking-[0.12em] text-slate-500">
                  {t("dash.stat.currentQueue")}
                </p>
                <p className="mt-auto whitespace-nowrap pt-2 text-2xl font-semibold leading-none text-slate-800 md:text-3xl">
                  {todayStats.currentQueue}
                </p>
              </div>
            </Card>

            <Card className="h-full p-3 md:p-4 bg-white rounded-xl shadow-sm border border-slate-200">
              <div className="flex h-full flex-col">
                <p className="text-caption font-medium uppercase tracking-[0.12em] text-slate-500">
                  {t("dash.stat.reservationsToday")}
                </p>
                <p className="mt-auto whitespace-nowrap pt-2 text-2xl font-semibold leading-none text-slate-800 md:text-3xl">
                  {todayStats.reservationsToday}
                </p>
              </div>
            </Card>

            <Card className="h-full p-3 md:p-4 bg-white rounded-xl shadow-sm border border-slate-200">
              <div className="flex h-full flex-col">
                <p className="text-caption font-medium uppercase tracking-[0.12em] text-slate-500">
                  {t("dash.stat.avgQueueWaitTime")}
                </p>
                <p className="mt-auto whitespace-nowrap pt-2 text-2xl font-semibold leading-none text-slate-800 md:text-3xl">
                  {todayStats.avgWaitTime}m
                </p>
              </div>
            </Card>

            <Card className="h-full p-3 md:p-4 bg-white rounded-xl shadow-sm border border-slate-200">
              <div className="flex h-full flex-col">
                <p className="text-caption font-medium uppercase tracking-[0.12em] text-slate-500">
                  {t("dash.stat.servedToday")}
                </p>
                <p className="mt-auto whitespace-nowrap pt-2 text-2xl font-semibold leading-none text-slate-800 md:text-3xl">
                  {todayStats.totalServed}
                </p>
              </div>
            </Card>

            <Card className="h-full p-3 md:p-4 bg-white rounded-xl shadow-sm border border-slate-200">
              <div className="flex h-full flex-col">
                <p className="text-caption font-medium uppercase tracking-[0.12em] text-slate-500">
                  {t("dash.stat.leftToday")}
                </p>
                <p className="mt-auto whitespace-nowrap pt-2 text-2xl font-semibold leading-none text-slate-800 md:text-3xl">
                  {todayStats.leftToday}
                </p>
              </div>
            </Card>
          </div>

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
                <BusinessEmptyState
                  icon={UsersRoundIcon}
                  title={t("dash.empty.departures.title")}
                  body={t("dash.empty.departures.body")}
                  className="min-h-40 px-4 py-8"
                />
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
                    <HugeiconsIcon icon={UsersRoundIcon} className="w-5 h-5" />
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

          <div className="space-y-6">
            <Card className="bg-white rounded-xl shadow-sm border border-slate-200">
              <CardHeader className="border-b border-slate-100 p-4 md:p-6">
                <div className="flex flex-col space-y-3 md:flex-row md:items-center md:justify-between md:space-y-0">
                  <div>
                    <CardTitle className="text-lg md:text-xl text-gray-800 flex items-center space-x-2">
                      <HugeiconsIcon icon={TrendingDownIcon} className="w-5 h-5" />
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
                    <HugeiconsIcon icon={Clock01Icon} className="w-5 h-5" />
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
                    <HugeiconsIcon icon={ChartAnalysisIcon} className="w-5 h-5" />
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
    </>
  );
};

export default BusinessOverview;
