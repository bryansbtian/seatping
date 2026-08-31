import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "preview-xs",
            "preview-sm",
            "micro",
            "caption",
            "calendar",
            "hand-accent",
            "display-compact",
            "label",
            "body",
            "title",
          ],
        },
      ],
      rounded: [{ rounded: ["control", "badge"] }],
      h: [{ h: ["row", "row-lg", "badge", "switch-h", "switch-thumb"] }],
      "min-h": [{ "min-h": ["row", "row-lg"] }],
      w: [{ w: ["switch-w", "switch-thumb"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
