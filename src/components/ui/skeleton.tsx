import { cn } from "@/lib/utils";

function Skeleton({
  as: Component = "div",
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { as?: "div" | "span" }) {
  return (
    <Component
      className={cn("animate-pulse rounded-md bg-muted motion-reduce:animate-none", className)}
      {...props}
    />
  );
}

export { Skeleton };
