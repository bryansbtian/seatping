import { useLayoutEffect, useRef, useState } from "react";
import { GRID_SIZE, scaleToFit } from "@/lib/floorGeometry";
import type { LiveRoom } from "@/lib/floorLive";
import LiveTableNode from "@/components/floor/LiveTableNode";

type LiveFloorCanvasProps = {
  room: LiveRoom;
  selectedTableId: string | null;
  onSelect: (tableId: string | null) => void;
};

const LiveFloorCanvas = ({ room, selectedTableId, onSelect }: LiveFloorCanvasProps) => {
  const frameRef = useRef<HTMLDivElement | null>(null);
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

  return (
    <div
      ref={frameRef}
      className="flex w-full items-center justify-center overflow-hidden"
      style={{ aspectRatio: `${room.width} / ${room.height}` }}
    >
      <div
        data-testid="live-floor-canvas"
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
        {room.zones.map((zone) => (
          <div
            key={zone.id}
            data-testid={`live-zone-${zone.name}`}
            className="pointer-events-none absolute rounded-xl border-2 border-dashed border-slate-300 bg-slate-100/40"
            style={{
              left: zone.x * scale,
              top: zone.y * scale,
              width: zone.width * scale,
              height: zone.height * scale,
            }}
          >
            <span className="absolute left-2 top-1.5 text-caption font-medium text-slate-500">
              {zone.name}
            </span>
          </div>
        ))}

        {room.tables.map((table) => (
          <LiveTableNode
            key={table.id}
            table={table}
            scale={scale}
            selected={table.id === selectedTableId}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
};

export default LiveFloorCanvas;
