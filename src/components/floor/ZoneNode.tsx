import type { PointerEvent as ReactPointerEvent } from "react";
import type { FloorZone } from "@/lib/floorApi";
import type { Rect } from "@/lib/floorGeometry";
import { cn } from "@/lib/utils";

export type ZoneDragKind = "move" | "resize";

type ZoneNodeProps = {
  zone: FloorZone;
  scale: number;
  selected: boolean;
  onSelect: (zoneId: string) => void;
  onDragStart: (
    zoneId: string,
    kind: ZoneDragKind,
    origin: Rect,
    pointer: { x: number; y: number },
  ) => void;
};

const ZoneNode = ({ zone, scale, selected, onSelect, onDragStart }: ZoneNodeProps) => {
  const beginDrag = (event: ReactPointerEvent, kind: ZoneDragKind) => {
    event.preventDefault();
    event.stopPropagation();
    onSelect(zone.id);
    onDragStart(
      zone.id,
      kind,
      { x: zone.x, y: zone.y, width: zone.width, height: zone.height },
      { x: event.clientX, y: event.clientY },
    );
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={zone.name}
      aria-pressed={selected}
      data-testid={`zone-node-${zone.name}`}
      onPointerDown={(event) => beginDrag(event, "move")}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(zone.id);
        }
      }}
      className={cn(
        "absolute cursor-move rounded-xl border-2 border-dashed transition-colors",
        selected && "border-indigo-500 bg-indigo-50/50",
        !selected && "border-slate-300 bg-slate-100/40",
      )}
      style={{
        left: zone.x * scale,
        top: zone.y * scale,
        width: zone.width * scale,
        height: zone.height * scale,
      }}
    >
      <span className="pointer-events-none absolute left-2 top-1.5 text-[11px] font-medium text-slate-500">
        {zone.name}
      </span>

      {selected && (
        <span
          role="button"
          tabIndex={-1}
          aria-label={`Resize ${zone.name}`}
          data-testid={`zone-resize-${zone.name}`}
          onPointerDown={(event) => beginDrag(event, "resize")}
          className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-se-resize rounded-sm border-2 border-indigo-500 bg-white"
        />
      )}
    </div>
  );
};

export default ZoneNode;
