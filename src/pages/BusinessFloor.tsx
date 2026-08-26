import { useState } from "react";
import SEO, { BUSINESS_DESCRIPTION, BUSINESS_IMAGE } from "@/components/SEO";
import FloorEditor from "@/components/floor/FloorEditor";
import LiveFloor from "@/components/floor/LiveFloor";
import { persistFloorMode, readFloorMode, type FloorMode } from "@/lib/floorLive";
import { useBusinessSession } from "@/lib/businessSession";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const BusinessFloor = () => {
  const { t } = useLang();
  const { currentLocation } = useBusinessSession();
  const [mode, setMode] = useState<FloorMode>(() => readFloorMode());

  const modes: [FloorMode, string][] = [
    ["live", t("floor.mode.live")],
    ["edit", t("floor.mode.edit")],
  ];

  let body = <p className="text-sm text-slate-600">{t("floor.noLocation")}</p>;
  if (currentLocation) {
    if (mode === "edit") {
      body = <FloorEditor key={currentLocation.id} locationId={currentLocation.id} />;
    } else {
      body = <LiveFloor key={currentLocation.id} locationId={currentLocation.id} />;
    }
  }

  return (
    <>
      <SEO
        title="Business Floor | SeatPing"
        description={BUSINESS_DESCRIPTION}
        image={BUSINESS_IMAGE}
      />
      <div className="container mx-auto px-4 py-8 md:flex md:min-h-full md:flex-col">
        <div className="mb-6">
          <h1 className="text-xl md:text-2xl font-semibold text-gray-800">{t("floor.title")}</h1>
          <p className="text-gray-600 text-sm md:text-base">{t("floor.subtitle")}</p>
        </div>

        <div className="mb-6 flex w-full max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 min-[426px]:inline-flex min-[426px]:w-auto min-[426px]:self-start">
          {modes.map(([key, label]) => {
            const active = mode === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setMode(key);
                  persistFloorMode(key);
                }}
                className={cn(
                  "min-w-[110px] flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors min-[426px]:flex-none min-[426px]:shrink-0",
                  active && "bg-slate-900 text-white",
                  !active && "text-slate-600 hover:bg-slate-50",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="md:flex md:flex-1 md:flex-col">{body}</div>
      </div>
    </>
  );
};

export default BusinessFloor;
