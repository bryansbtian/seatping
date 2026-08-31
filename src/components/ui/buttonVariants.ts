import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control border border-transparent text-label font-medium ring-offset-background transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border-slate-900 bg-slate-900 text-white hover:border-slate-800 hover:bg-slate-800 hover:text-white",
        success:
          "border-emerald-600 bg-emerald-600 text-white hover:border-emerald-700 hover:bg-emerald-700 hover:text-white",
        outline:
          "border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900",
        inverseOutline:
          "border-white/70 bg-white/10 text-white hover:border-white hover:bg-white hover:text-slate-900",
        destructiveOutline:
          "border-red-200 bg-white text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700",
        ghost:
          "border-transparent bg-transparent text-slate-700 hover:bg-slate-100 hover:text-slate-900",
        destructive:
          "border-red-600 bg-red-600 text-white hover:border-red-700 hover:bg-red-700 hover:text-white",
        secondary:
          "border-slate-200 bg-slate-100 text-slate-900 hover:border-slate-300 hover:bg-slate-200 hover:text-slate-900",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "control-md px-3.5",
        sm: "control-sm px-3",
        lg: "control-lg px-8 text-body",
        icon: "control-md control-icon",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);
