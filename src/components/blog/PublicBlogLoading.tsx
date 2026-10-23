import { useLayoutEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export default function PublicBlogLoading({ article = false }: { article?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) {
      return;
    }
    const measure = () => {
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      setHeight(Math.max(120, viewportHeight - element.getBoundingClientRect().top - 24));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (element.previousElementSibling) {
      observer.observe(element.previousElementSibling);
    }
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  const style = { height: height || undefined };
  if (article) {
    return (
      <div
        ref={root}
        style={style}
        role="status"
        aria-label="Loading Article"
        className="mx-auto flex max-w-4xl shrink-0 flex-col gap-6 pt-8 sm:pt-12"
      >
        <span className="sr-only">Loading Article</span>
        {height > 240 && <Skeleton aria-hidden="true" className="control-sm w-28 shrink-0" />}
        <div aria-hidden="true" className="flex shrink-0 items-center gap-3">
          <Skeleton className="h-badge w-24" />
          <Skeleton className="h-3 w-20" />
        </div>
        <div aria-hidden="true" className="shrink-0 space-y-3">
          <Skeleton className="h-9 w-full sm:h-12" />
          {height > 300 && <Skeleton className="h-9 w-3/4 sm:h-12" />}
        </div>
        {height > 460 && (
          <div aria-hidden="true" className="shrink-0 space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        )}
        {height > 340 && (
          <div aria-hidden="true" className="flex shrink-0 items-center gap-4">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
        )}
        <Skeleton aria-hidden="true" className="min-h-0 flex-1 rounded-2xl" />
        {height > 600 && (
          <div aria-hidden="true" className="shrink-0 space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        )}
      </div>
    );
  }
  return (
    <div
      ref={root}
      style={style}
      role="status"
      aria-label="Loading Blog Posts"
      className="flex shrink-0 flex-col gap-6"
    >
      <span className="sr-only">Loading Blog Posts</span>
      <div aria-hidden="true" className="flex shrink-0 gap-5 border-b pb-4">
        <Skeleton className="h-4 w-10" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-20" />
      </div>
      <div
        aria-hidden="true"
        className="grid min-h-0 flex-1 grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
      >
        {["", "hidden sm:flex", "hidden lg:flex"].map((visibility, index) => (
          <div
            key={index}
            className={`min-h-0 min-w-0 flex-col rounded-2xl border bg-white ${visibility || "flex"}`}
          >
            <Skeleton className="min-h-0 flex-1 rounded-t-2xl rounded-b-none" />
            <div className="shrink-0 space-y-4 p-4 sm:p-6">
              {height > 240 && <Skeleton className="h-badge w-20" />}
              <Skeleton className="h-5 w-4/5" />
              {height > 330 && (
                <div className="space-y-3">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-4/5" />
                </div>
              )}
              {height > 400 && <Skeleton className="h-3 w-32" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
