import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { DiningTable } from "@/lib/floorApi";
import { fitsTableName, type Rect } from "@/lib/floorGeometry";
import { cn } from "@/lib/utils";

export type DragKind = "move" | "resize";

type TableNodeProps = {
  table: DiningTable;
  scale: number;
  selected: boolean;
  onSelect: (tableId: string) => void;
  onDragStart: (
    tableId: string,
    kind: DragKind,
    origin: Rect,
    pointer: { x: number; y: number },
  ) => void;
};

function shapeClasses(table: DiningTable): string {
  if (table.shape === "ROUND") {
    return "rounded-full";
  }
  return "rounded-xl";
}

function surfaceClasses(table: DiningTable, selected: boolean): string {
  if (table.isBlocked) {
    return "border-slate-400 bg-slate-300 text-slate-700";
  }
  if (selected) {
    return "border-indigo-500 bg-indigo-50 text-slate-900";
  }
  return "border-slate-300 bg-white text-slate-700";
}

const TableNode = ({ table, scale, selected, onSelect, onDragStart }: TableNodeProps) => {
  const nodeRef = useRef<HTMLDivElement | null>(null);

  const beginDrag = (event: ReactPointerEvent, kind: DragKind) => {
    event.preventDefault();
    event.stopPropagation();
    onSelect(table.id);
    onDragStart(
      table.id,
      kind,
      { x: table.x, y: table.y, width: table.width, height: table.height },
      { x: event.clientX, y: event.clientY },
    );
  };

  const showName = fitsTableName(table.width * scale, table.height * scale);

  let ringClass = "";
  if (selected) {
    ringClass = "ring-2 ring-indigo-500 ring-offset-1";
  }

  return (
    <div
      ref={nodeRef}
      role="button"
      tabIndex={0}
      aria-label={table.name}
      aria-pressed={selected}
      data-testid={`table-node-${table.name}`}
      onPointerDown={(event) => beginDrag(event, "move")}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(table.id);
        }
      }}
      className={cn(
        "absolute flex cursor-move select-none flex-col items-center justify-center border-2 shadow-sm transition-colors",
        shapeClasses(table),
        surfaceClasses(table, selected),
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
        <span className="pointer-events-none max-w-full truncate px-1 text-caption font-semibold leading-none md:text-xs">
          {table.name}
        </span>
      )}
      <span className={cn("pointer-events-none text-caption leading-none", showName && "mt-1")}>
        {table.capacity}
      </span>
      {selected && (
        <span
          role="button"
          tabIndex={-1}
          aria-label={`Resize ${table.name}`}
          data-testid={`table-resize-${table.name}`}
          onPointerDown={(event) => beginDrag(event, "resize")}
          className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-se-resize rounded-sm border-2 border-indigo-500 bg-white"
        />
      )}
    </div>
  );
};

export default TableNode;
