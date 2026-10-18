import { Suspense } from "react";
import { useParams } from "react-router-dom";
import { useRestaurantProfile } from "@/hooks/useRestaurantProfile";
import { useLang } from "@/lib/i18n";
import { lazyRoute } from "@/lib/lazyRoute";
import NotFound from "@/pages/NotFound";

const Restaurant = lazyRoute(() => import("@/pages/Restaurant"));

function CheckingRestaurant() {
  const { t } = useLang();
  return (
    <div role="status" className="flex min-h-dvh items-center justify-center text-ink-subtle">
      <span className="text-body">{t("common.loadingPage")}</span>
    </div>
  );
}

export default function RestaurantRoute() {
  const { businessUsername = "", locationId = "" } = useParams();
  const profile = useRestaurantProfile(businessUsername, locationId);

  if (profile.isPending) {
    return <CheckingRestaurant />;
  }
  if (profile.error || !profile.data) {
    return <NotFound />;
  }
  return (
    <Suspense fallback={<CheckingRestaurant />}>
      <Restaurant />
    </Suspense>
  );
}
