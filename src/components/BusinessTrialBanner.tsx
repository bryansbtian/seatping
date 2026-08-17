import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/i18n";

type MeLike = {
  trial?: boolean;
  trialDurationDays?: number;
  createdAt?: string;
} | null;

export default function BusinessTrialBanner({ me }: { me: MeLike }) {
  const { t } = useLang();
  const [trialTimeLeft, setTrialTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
  } | null>(null);
  const trialCountdownRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const calculateTrialTimeLeft = () => {
      if (!me || !me.trial || !me.createdAt || !me.trialDurationDays)
        {
          return null;
        }
      const createdAt = new Date(me.createdAt);
      const trialDurationDays = me.trialDurationDays || 7;
      const trialEndDate = new Date(
        createdAt.getTime() + trialDurationDays * 24 * 60 * 60 * 1000,
      );
      const timeLeft = trialEndDate.getTime() - Date.now();
      if (timeLeft <= 0) {
        return null;
      }
      return {
        days: Math.floor(timeLeft / (1000 * 60 * 60 * 24)),
        hours: Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60)),
      };
    };

    if (trialCountdownRef.current) {
      clearInterval(trialCountdownRef.current);
    }
    if (me && me.trial) {
      setTrialTimeLeft(calculateTrialTimeLeft());
      trialCountdownRef.current = setInterval(() => {
        const timeLeft = calculateTrialTimeLeft();
        setTrialTimeLeft(timeLeft);
        if (!timeLeft && trialCountdownRef.current)
          {
            clearInterval(trialCountdownRef.current);
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
  }, [me]);

  if (!me) {
    return null;
  }

  if (me.trial === true && (me.trialDurationDays ?? 0) > 0) {
    const createdAt = new Date(me.createdAt!);
    const trialEndDate = new Date(
      createdAt.getTime() + (me.trialDurationDays || 7) * 24 * 60 * 60 * 1000,
    );
    const expired = new Date() > trialEndDate;

    if (expired) {
      return (
        <div className="mb-6">
          <div className="bg-gradient-to-r from-red-500 to-red-600 rounded-xl shadow-lg p-4 md:p-6 text-white">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-3 md:space-y-0">
              <div>
                <h3 className="text-lg md:text-xl font-semibold">
                  {t("banner.trialExpired.title")}
                </h3>
                <p className="text-sm md:text-base opacity-90">
                  {t("banner.trialExpired.body")}
                </p>
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

    return (
      <div className="mb-6">
        <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-xl shadow-lg p-4 md:p-6 text-white">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-3 md:space-y-0">
            <div>
              <h3 className="text-lg md:text-xl font-semibold">
                {t("banner.trialActive.title")}
              </h3>
              <p className="text-sm md:text-base opacity-90">
                {t("banner.trialActive.body")}
              </p>
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

  if (me.trial === true && (me.trialDurationDays ?? 0) === 0) {
    return (
      <div className="mb-6">
        <div className="bg-gradient-to-r from-red-500 to-red-600 rounded-xl shadow-lg p-3 md:p-4 text-white">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
            <div>
              <h4 className="text-sm md:text-base font-semibold">
                {t("banner.trialExpiredShort.title")}
              </h4>
              <p className="text-xs md:text-sm opacity-80">
                {t("banner.trialExpiredShort.body")}
              </p>
            </div>
            <div className="flex justify-end">
              <Button
                variant="inverseOutline"
                size="sm"
                className="text-xs md:text-sm"
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

  return null;
}
