import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/buttonVariants";

export const BUTTON_PRESS_CLASS = "active:scale-[0.96] motion-reduce:active:scale-100";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  static?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, static: isStatic = false, ...props }, ref) => {
    let Comp: React.ElementType;
    if (asChild) {
      Comp = Slot;
    } else {
      Comp = "button";
    }
    let pressClass = BUTTON_PRESS_CLASS;
    if (isStatic || variant === "link") {
      pressClass = "";
    }
    return (
      <Comp
        className={cn(buttonVariants({ variant, size }), pressClass, className)}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button };
