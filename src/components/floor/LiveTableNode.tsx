import { HugeiconsIcon } from "@hugeicons/react";
import { StarIcon } from "@hugeicons/core-free-icons";
import { cornerBadgeOffset, cornerBadgeSize, fitsTableName } from "@/lib/floorGeometry";
import { statusStyle, type LiveTable } from "@/lib/floorLive";
import { useLang } from "@/lib/i18n";
import type { TKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type LiveTableNodeProps = {
  table: LiveTable;
  scale: number;
  selected: boolean;
  onSelect: (tableId: string) => void;
};

const LiveTableNode = ({ table, scale, selected, onSelect }: LiveTableNodeProps) => {
  const { t } = useLang();
  const style = statusStyle(table.status);
  const statusLabel = t(`floor.live.status.${table.status}` as TKey);

  let shapeClass = "rounded-xl";
  if (table.shape === "ROUND") {
    shapeClass = "rounded-full";
  }

  const showName = fitsTableName(table.width * scale, table.height * scale);

  let ringClass = "";
  if (selected) {
    ringClass = "ring-2 ring-slate-900 ring-offset-2";
  }

  let detail = String(table.capacity);
  if (table.currentAssignment) {
    detail = String(table.currentAssignment.partySize);
  }

  let recommendation = null;
  if (table.recommendedPartyId) {
    const renderedWidth = table.width * scale;
    const renderedHeight = table.height * scale;
    const badge = cornerBadgeOffset(table.shape, renderedWidth, renderedHeight);
    const badgeSize = cornerBadgeSize(renderedWidth, renderedHeight);
    recommendation = (
      <span
        data-testid={`table-recommended-${table.name}`}
        style={{
          right: badge.x,
          top: badge.y,
          width: badgeSize,
          height: badgeSize,
          transform: "translate(50%, -50%)",
        }}
        className="pointer-events-none absolute flex items-center justify-center rounded-full border border-white bg-slate-900 text-white shadow-sm"
      >
        <HugeiconsIcon
          icon={StarIcon}
          style={{ width: badgeSize * 0.6, height: badgeSize * 0.6 }}
        />
      </span>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${table.name}, ${statusLabel}`}
      data-testid={`live-table-${table.name}`}
      data-status={table.status}
      onPointerDown={(event) => {
        event.stopPropagation();
        onSelect(table.id);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(table.id);
        }
      }}
      className={cn(
        "absolute flex cursor-pointer select-none flex-col items-center justify-center border-2 shadow-sm transition-colors",
        shapeClass,
        style.node,
        ringClass,
      )}
      style={{
        left: table.x * scale,
        top: table.y * scale,
        width: table.width * scale,
        height: table.height * scale,
        transform: `rotate(${table.rotation}deg)`,
      }}
    >
      {showName && (
        <span className="pointer-events-none relative max-w-full truncate px-1 text-caption font-semibold leading-none md:text-xs">
          {table.name}
        </span>
      )}
      <span
        className={cn("pointer-events-none relative text-caption leading-none", showName && "mt-1")}
      >
        {detail}
      </span>
      {recommendation}
    </div>
  );
};

export default LiveTableNode;
