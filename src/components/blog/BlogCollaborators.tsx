import {
  Coffee01Icon,
  Coffee02Icon,
  Coffee03Icon,
  Coffee04Icon,
  CoffeeBeansIcon,
} from "@hugeicons/core-free-icons";
import { memo } from "react";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from "@/components/ui/tooltip";
import type { BlogUser } from "@shared/blogCollaboration";
import type { BlogCollaborationSnapshot } from "@/lib/blogCollaboration";

const coffeeIcons: Record<BlogUser["coffee"], IconSvgElement> = {
  Latte: Coffee02Icon,
  Cappuccino: Coffee03Icon,
  Espresso: Coffee01Icon,
  Americano: Coffee04Icon,
  Mocha: CoffeeBeansIcon,
  "Flat White": Coffee02Icon,
};

export default function BlogCollaborators({
  user,
  peers,
}: Pick<BlogCollaborationSnapshot, "user" | "peers">) {
  if (peers.length === 0) {
    return null;
  }
  return (
    <div className="flex -space-x-1.5" role="group" aria-label="Editors In This Article">
      <Avatar user={user} self />
      {peers.slice(0, 4).map((peer) => (
        <Avatar key={peer.clientId} user={peer} />
      ))}
      {peers.length > 4 && (
        <span
          className="inline-flex size-8 items-center justify-center rounded-full border-2 border-white bg-slate-100 text-caption text-ink-subtle"
          aria-label={`${peers.length - 4} More Editors`}
        >
          +{peers.length - 4}
        </span>
      )}
    </div>
  );
}

const Avatar = memo(function Avatar({ user, self = false }: { user: BlogUser; self?: boolean }) {
  const icon = coffeeIcons[user.coffee] ?? Coffee02Icon;
  let label = user.name;
  if (self) {
    label += " (You)";
  }
  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <span
          role="img"
          tabIndex={0}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-white text-white outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          style={{ backgroundColor: user.color }}
          aria-label={label}
          data-editor-name={user.name}
        >
          <HugeiconsIcon icon={icon} className="size-4" aria-hidden="true" />
        </span>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent side="top" align="center" sideOffset={6}>
          {label}
        </TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
});
