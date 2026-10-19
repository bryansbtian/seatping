import type { CSSProperties, ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type Modifier,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DragDropVerticalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { featuredRestaurantName, type FeaturedRestaurant } from "./types";

type FeaturedSortableListProps = {
  items: FeaturedRestaurant[];
  disabled: boolean;
  onReorder: (items: FeaturedRestaurant[]) => void;
  renderItem: (item: FeaturedRestaurant, handle: ReactNode) => ReactNode;
};

const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

function SortableRestaurant({
  item,
  disabled,
  renderItem,
}: {
  item: FeaturedRestaurant;
  disabled: boolean;
  renderItem: FeaturedSortableListProps["renderItem"];
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    disabled,
    transition: { duration: 150, easing: "cubic-bezier(0.2, 0, 0, 1)" },
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const handle = (
    <Button
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      type="button"
      variant="ghost"
      size="icon"
      static
      disabled={disabled}
      aria-label={`Reorder ${featuredRestaurantName(item)}`}
      aria-roledescription="Sortable Restaurant"
      className="touch-none shrink-0 cursor-grab text-slate-400 hover:text-slate-700 active:cursor-grabbing"
    >
      <HugeiconsIcon icon={DragDropVerticalIcon} className="size-4" aria-hidden="true" />
    </Button>
  );

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative border-b border-border bg-white motion-reduce:!transition-none",
        isDragging && "z-10 bg-slate-50 shadow-sm ring-1 ring-inset ring-slate-300",
      )}
      data-testid={`featured-row-${item.id}`}
      data-dragging={isDragging}
    >
      {renderItem(item, handle)}
    </li>
  );
}

export default function FeaturedSortableList({
  items,
  disabled,
  onReorder,
  renderItem,
}: FeaturedSortableListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function describe(id: UniqueIdentifier): string {
    const restaurant = items.find((item) => item.id === id);
    if (restaurant) {
      return featuredRestaurantName(restaurant);
    }
    return "Restaurant";
  }

  const announcements: Announcements = {
    onDragStart({ active }) {
      return `Picked up ${describe(active.id)}. Use the up and down arrow keys to move it.`;
    },
    onDragOver({ active, over }) {
      if (over) {
        const position = items.findIndex((item) => item.id === over.id) + 1;
        return `${describe(active.id)} is at position ${position} of ${items.length}.`;
      }
      return `${describe(active.id)} is outside the restaurant list.`;
    },
    onDragEnd({ active, over }) {
      if (over) {
        const position = items.findIndex((item) => item.id === over.id) + 1;
        return `Placed ${describe(active.id)} at position ${position} of ${items.length}.`;
      }
      return `Sorting canceled. ${describe(active.id)} was not moved.`;
    },
    onDragCancel({ active }) {
      return `Sorting canceled. ${describe(active.id)} was not moved.`;
    },
  };

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (disabled || !over || active.id === over.id) {
      return;
    }
    const fromIndex = items.findIndex((item) => item.id === active.id);
    const toIndex = items.findIndex((item) => item.id === over.id);
    if (fromIndex < 0 || toIndex < 0) {
      return;
    }
    onReorder(arrayMove(items, fromIndex, toIndex));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[verticalOnly]}
      onDragEnd={handleDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            "To reorder a restaurant, press Space or Enter. Use the up and down arrow keys to move it, then press Space or Enter to drop it. Press Escape to cancel.",
        },
      }}
    >
      <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <ul aria-label="Featured Restaurants">
          {items.map((item) => (
            <SortableRestaurant
              key={item.id}
              item={item}
              disabled={disabled}
              renderItem={renderItem}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
