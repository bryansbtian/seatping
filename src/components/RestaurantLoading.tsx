import { useLayoutEffect } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Skeleton } from "@/components/ui/skeleton";

export default function RestaurantLoading() {
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, []);

  return (
    <div className="min-h-screen bg-background pt-14 sm:pt-16">
      <Header showSearch />
      <div role="status" aria-label="Loading Restaurant" aria-live="polite" aria-busy="true">
        <div aria-hidden="true">
          <Skeleton className="h-56 w-full rounded-none sm:h-72 md:h-96" />
          <div className="container mx-auto grid max-w-7xl gap-8 px-4 pt-8 md:pt-10 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <Skeleton className="h-9 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
              <div className="flex gap-4 border-y border-border py-5">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 w-20" />
              </div>
              <Skeleton className="h-5 w-24" />
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
            <div className="space-y-5 rounded-xl border border-border bg-card p-6">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-10 w-full rounded-control" />
              <Skeleton className="h-10 w-full rounded-control" />
              <Skeleton className="h-10 w-full rounded-control" />
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 6 }, (_, index) => (
                  <Skeleton key={index} className="h-8 rounded-control" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
