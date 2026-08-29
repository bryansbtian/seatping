import { useState } from "react";
import SEO, { BUSINESS_DESCRIPTION, BUSINESS_IMAGE } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DateField } from "@/components/DateField";
import LocationReviews from "@/components/reviews/LocationReviews";
import { localDateStr } from "@/lib/localDate";
import { useBusinessSession } from "@/lib/businessSession";
import { useLang } from "@/lib/i18n";
import type { TKey } from "@/lib/i18n";
import type { ReviewRange } from "@/lib/reviews";
import { cn } from "@/lib/utils";

const EARLIEST_DATE = "2020-01-01";

const RANGE_KEYS: [ReviewRange, TKey][] = [
  ["30d", "rev.range.30d"],
  ["90d", "rev.range.90d"],
  ["all", "rev.range.all"],
  ["custom", "rev.range.custom"],
];

const BusinessReviews = () => {
  const { t } = useLang();
  const { currentLocation } = useBusinessSession();

  const todayStr = localDateStr(new Date());
  const [range, setRange] = useState<ReviewRange>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");

  const openCustom = () => {
    setDraftFrom(from);
    setDraftTo(to);
    setCustomOpen(true);
  };

  const draftValid = Boolean(draftFrom) && Boolean(draftTo) && draftFrom <= draftTo;

  const applyCustom = () => {
    if (!draftValid) {
      return;
    }
    setFrom(draftFrom);
    setTo(draftTo);
    setRange("custom");
    setCustomOpen(false);
  };

  const chooseRange = (key: ReviewRange) => {
    if (key === "custom") {
      openCustom();
      return;
    }
    setRange(key);
  };

  let body: React.ReactNode;
  if (!currentLocation) {
    body = (
      <p className="text-sm text-slate-600" data-testid="reviews-no-location">
        {t("rev.noLocation")}
      </p>
    );
  } else {
    body = <LocationReviews location={currentLocation} range={range} from={from} to={to} />;
  }

  return (
    <>
      <SEO
        title="Customer Reviews | SeatPing"
        description={BUSINESS_DESCRIPTION}
        image={BUSINESS_IMAGE}
      />
      <div className="container mx-auto flex min-h-full flex-col px-4 py-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-gray-800 md:text-2xl">{t("rev.title")}</h1>
            <p className="text-sm text-gray-600 md:text-base">{t("rev.page.subtitle")}</p>
          </div>
          <div className="flex shrink-0 gap-1 rounded-xl border border-slate-200 bg-white p-1 max-sm:w-full max-sm:shrink">
            {RANGE_KEYS.map(([key, labelKey]) => (
              <button
                key={key}
                type="button"
                data-testid={`reviews-range-${key}`}
                onClick={() => chooseRange(key)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors max-sm:flex-1 max-sm:px-2 max-[425px]:text-xs max-[325px]:px-1.5 max-[325px]:text-micro",
                  range === key && "bg-slate-900 text-white",
                  range !== key && "text-slate-600 hover:bg-slate-50",
                )}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>
        </div>

        <Dialog open={customOpen} onOpenChange={setCustomOpen}>
          <DialogContent className="max-w-sm" data-testid="reviews-custom-dialog">
            <DialogHeader>
              <DialogTitle>{t("perf.custom.title")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">{t("perf.range.from")}</label>
                <DateField
                  value={draftFrom}
                  onChange={setDraftFrom}
                  todayStr={EARLIEST_DATE}
                  maxDateStr={todayStr}
                  ariaLabel={t("perf.range.from")}
                  placeholder={t("perf.range.from")}
                  className="w-full"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">{t("perf.range.to")}</label>
                <DateField
                  value={draftTo}
                  onChange={setDraftTo}
                  todayStr={EARLIEST_DATE}
                  maxDateStr={todayStr}
                  ariaLabel={t("perf.range.to")}
                  placeholder={t("perf.range.to")}
                  className="w-full"
                />
              </div>
              {Boolean(draftFrom) && Boolean(draftTo) && !draftValid && (
                <p className="text-xs text-rose-600" data-testid="reviews-custom-error">
                  {t("perf.custom.invalid")}
                </p>
              )}
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" onClick={() => setCustomOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                disabled={!draftValid}
                data-testid="reviews-custom-apply"
                onClick={applyCustom}
              >
                {t("perf.custom.apply")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {body}
      </div>
    </>
  );
};

export default BusinessReviews;
