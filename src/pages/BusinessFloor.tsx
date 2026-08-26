import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import SEO, { BUSINESS_DESCRIPTION, BUSINESS_IMAGE } from "@/components/SEO";
import FloorEditor from "@/components/floor/FloorEditor";
import { useBusinessSession } from "@/lib/businessSession";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type FloorMode = "live" | "edit";

const BusinessFloor = () => {
  const { t } = useLang();
  const { currentLocation } = useBusinessSession();
  const [mode, setMode] = useState<FloorMode>("edit");

  const modes: [FloorMode, string][] = [
    ["live", t("floor.mode.live")],
    ["edit", t("floor.mode.edit")],
  ];

  let body = <p className="text-sm text-slate-600">{t("floor.noLocation")}</p>;
  if (currentLocation) {
    if (mode === "edit") {
      body = <FloorEditor key={currentLocation.id} locationId={currentLocation.id} />;
    } else {
      body = (
        <Card className="border border-slate-200 bg-white shadow-sm">
          <CardContent className="p-6">
            <p className="text-lg font-semibold text-slate-800">{t("page.comingSoon.title")}</p>
            <p className="mt-2 text-sm text-slate-600">{t("page.comingSoon.body")}</p>
          </CardContent>
        </Card>
      );
    }
  }

  return (
    <>
      <SEO
        title="Business Floor | SeatPing"
        description={BUSINESS_DESCRIPTION}
        image={BUSINESS_IMAGE}
      />
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-xl md:text-2xl font-semibold text-gray-800">{t("floor.title")}</h1>
          <p className="text-gray-600 text-sm md:text-base">{t("floor.subtitle")}</p>
        </div>

        <div className="mb-6 flex w-full items-center gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 md:inline-flex md:w-auto">
          {modes.map(([key, label]) => {
            const active = mode === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => setMode(key)}
                className={cn(
                  "flex-1 min-w-[110px] rounded-lg px-4 py-2 text-sm font-medium transition-colors md:flex-none",
                  active && "bg-slate-900 text-white",
                  !active && "text-slate-600 hover:bg-slate-50",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>

        {body}
      </div>
    </>
  );
};

export default BusinessFloor;
