import { useLayoutEffect, useRef } from "react";
import { Textarea, type TextareaProps } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export default function CanvasTextarea({ value, className, ...props }: TextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    let width = element.clientWidth;
    const fit = () => {
      element.style.height = "0px";
      element.style.height = `${element.scrollHeight}px`;
    };
    fit();
    const observer = new ResizeObserver(() => {
      if (width !== element.clientWidth) {
        width = element.clientWidth;
        fit();
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [value]);

  return (
    <Textarea
      {...props}
      ref={ref}
      rows={1}
      value={value}
      className={cn("resize-none overflow-hidden", className)}
    />
  );
}
