import { buttonVariants } from "@/components/ui/buttonVariants";

export const SLOT_BUTTON_BASE_CLASS = buttonVariants({
  variant: "outline",
  size: "sm",
  className: "w-full content-center px-0 [text-box:trim-both_cap_alphabetic]",
});

export const SLOT_BUTTON_COMPACT_CLASS = "max-[320px]:text-micro";

export const SLOT_BUTTON_SELECTED_CLASS = buttonVariants({ variant: "default", size: "sm" });
