import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DiningTable, FloorZone, Room } from "@/lib/floorApi";
import {
  GRID_SIZE,
  moveRect,
  rectsAreEqual,
  resizeRect,
  scaleToFit,
  screenDeltaToFloor,
  type Rect,
} from "@/lib/floorGeometry";
import TableNode, { type DragKind } from "@/components/floor/TableNode";
import ZoneNode from "@/components/floor/ZoneNode";

export type CanvasSelection = { kind: "table" | "zone"; id: string } | null;

type DragState = {
  kind: DragKind;
  target: "table" | "zone";
  id: string;
  origin: Rect;
  pointer: { x: number; y: number };
};

type FloorCanvasProps = {
  room: Room;
  tables: DiningTable[];
  zones: FloorZone[];
  selection: CanvasSelection;
  onSelect: (selection: CanvasSelection) => void;
  onPreview: (target: "table" | "zone", id: string, rect: Rect) => void;
  onCommit: (target: "table" | "zone", id: string, rect: Rect) => void;
};

const MIN_ZONE_SIZE = 40;

const FloorCanvas = ({
  room,
  tables,
  zones,
  selection,
  onSelect,
  onPreview,
  onCommit,
}: FloorCanvasProps) => {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const latestRectRef = useRef<Rect | null>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) {
      return;
    }
    const measure = () => {
      setScale(scaleToFit(frame.clientWidth, frame.clientHeight, room.width, room.height));
    };
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [room.width, room.height]);

  const startTableDrag = useCallback(
    (tableId: string, kind: DragKind, origin: Rect, pointer: { x: number; y: number }) => {
      dragRef.current = { kind, target: "table", id: tableId, origin, pointer };
      latestRectRef.current = origin;
    },
    [],
  );

  const startZoneDrag = useCallback(
    (zoneId: string, kind: DragKind, origin: Rect, pointer: { x: number; y: number }) => {
      dragRef.current = { kind, target: "zone", id: zoneId, origin, pointer };
      latestRectRef.current = origin;
    },
    [],
  );

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) {
        return;
      }
      const deltaX = screenDeltaToFloor(event.clientX - drag.pointer.x, scale);
      const deltaY = screenDeltaToFloor(event.clientY - drag.pointer.y, scale);

      let minSize = 0;
      if (drag.target === "zone") {
        minSize = MIN_ZONE_SIZE;
      }

      let next: Rect;
      if (drag.kind === "resize") {
        next = resizeRect(drag.origin, deltaX, deltaY, room, GRID_SIZE);
        if (next.width < minSize) {
          next = { ...next, width: minSize };
        }
        if (next.height < minSize) {
          next = { ...next, height: minSize };
        }
      } else {
        next = moveRect(drag.origin, deltaX, deltaY, room, GRID_SIZE);
      }

      latestRectRef.current = next;
      onPreview(drag.target, drag.id, next);
    };

    const handleUp = () => {
      const drag = dragRef.current;
      const rect = latestRectRef.current;
      dragRef.current = null;
      latestRectRef.current = null;
      if (!drag || !rect) {
        return;
      }
      if (rectsAreEqual(drag.origin, rect)) {
        return;
      }
      onCommit(drag.target, drag.id, rect);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [room, onCommit, onPreview, scale]);

  let selectedTableId: string | null = null;
  let selectedZoneId: string | null = null;
  if (selection?.kind === "table") {
    selectedTableId = selection.id;
  }
  if (selection?.kind === "zone") {
    selectedZoneId = selection.id;
  }

  return (
    <div
      ref={frameRef}
      className="flex w-full items-center justify-center overflow-hidden"
      style={{ aspectRatio: `${room.width} / ${room.height}` }}
    >
      <div
        data-testid="floor-canvas"
        onPointerDown={() => onSelect(null)}
        className="relative shrink-0 rounded-xl border border-slate-200 bg-slate-50"
        style={{
          width: room.width * scale,
          height: room.height * scale,
          backgroundImage:
            "linear-gradient(to right, rgba(148,163,184,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.18) 1px, transparent 1px)",
          backgroundSize: `${GRID_SIZE * scale}px ${GRID_SIZE * scale}px`,
        }}
      >
        {zones.map((zone) => (
          <ZoneNode
            key={zone.id}
            zone={zone}
            scale={scale}
            selected={zone.id === selectedZoneId}
            onSelect={(zoneId) => onSelect({ kind: "zone", id: zoneId })}
            onDragStart={startZoneDrag}
          />
        ))}

        {tables.map((table) => (
          <TableNode
            key={table.id}
            table={table}
            scale={scale}
            selected={table.id === selectedTableId}
            onSelect={(tableId) => onSelect({ kind: "table", id: tableId })}
            onDragStart={startTableDrag}
          />
        ))}
      </div>
    </div>
  );
};

export default FloorCanvas;
