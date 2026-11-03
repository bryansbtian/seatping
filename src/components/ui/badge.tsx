import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { PILL_BASE_CLASS } from "@/lib/statusStyles";

const badgeVariants = cva(
  `${PILL_BASE_CLASS} gap-1 border focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2`,
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        destructive: "bg-destructive text-destructive-foreground",
        success: "bg-emerald-100 text-emerald-700",
        warning: "bg-amber-100 text-amber-800",
        info: "bg-indigo-100 text-indigo-700",
        danger: "bg-red-100 text-red-700",
        neutral: "bg-slate-100 text-slate-700",
        outline: "border-slate-200 bg-white text-slate-700",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, children, ...props }: BadgeProps) {
  let content = React.Children.toArray(children);
  if (content.every((child) => typeof child === "string" || typeof child === "number")) {
    content = [content.join("")];
  }
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props}>
      {React.Children.map(content, (child) => {
        if (typeof child === "string" || typeof child === "number") {
          return <span className="[text-box:trim-both_cap_alphabetic]">{child}</span>;
        }
        return child;
      })}
    </div>
  );
}

export { Badge };
