import { Suspense } from "react";
import { useParams } from "react-router-dom";
import { useRestaurantProfile } from "@/hooks/useRestaurantProfile";
import { lazyRoute } from "@/lib/lazyRoute";
import NotFound from "@/pages/NotFound";
import RestaurantLoading from "@/components/RestaurantLoading";

const Restaurant = lazyRoute(() => import("@/pages/Restaurant"));

export default function RestaurantRoute() {
  const { businessUsername = "", locationId = "" } = useParams();
  const profile = useRestaurantProfile(businessUsername, locationId);

  if (profile.isPending) {
    return <RestaurantLoading />;
  }
  if (profile.error || !profile.data) {
    return <NotFound />;
  }
  return (
    <Suspense fallback={<RestaurantLoading />}>
      <Restaurant />
    </Suspense>
  );
}
