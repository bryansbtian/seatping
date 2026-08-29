import SEO, { BUSINESS_DESCRIPTION, BUSINESS_IMAGE } from "@/components/SEO";
import ReservationsManager from "@/components/ReservationsManager";
import { useBusinessSession } from "@/lib/businessSession";
import { useLang } from "@/lib/i18n";
import { getLocationTimezone } from "@/lib/timezones";

const BusinessReservations = () => {
  const { t } = useLang();
  const { me, setMe, currentLocation } = useBusinessSession();

  let body = <p className="text-sm text-slate-600">{t("res.noLocation")}</p>;
  if (currentLocation) {
    body = (
      <ReservationsManager
        key={currentLocation.id}
        reservations={currentLocation.reservations || []}
        businessUsername={me?.username || ""}
        locationId={currentLocation.id}
        reservationsEnabled={currentLocation.reservationsEnabled ?? true}
        timeZone={getLocationTimezone(currentLocation)}
        onUpdated={(user) => setMe(user)}
      />
    );
  }

  return (
    <>
      <SEO
        title="Business Reservations | SeatPing"
        description={BUSINESS_DESCRIPTION}
        image={BUSINESS_IMAGE}
      />
      <div className="flex min-h-full flex-col">
        <div className="container mx-auto flex w-full flex-1 flex-col px-4 py-8">
          <div className="mb-6">
            <h1 className="text-xl font-semibold text-gray-800 md:text-2xl">
              {t("nav.reservations")}
            </h1>
            <p className="text-sm text-gray-600 md:text-base">{t("res.page.subtitle")}</p>
          </div>
          {body}
        </div>
      </div>
    </>
  );
};

export default BusinessReservations;
