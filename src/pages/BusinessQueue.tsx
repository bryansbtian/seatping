import SEO, { BUSINESS_DESCRIPTION, BUSINESS_IMAGE } from "@/components/SEO";
import QueueManager from "@/components/queue/QueueManager";
import { useBusinessSession } from "@/lib/businessSession";
import { useLang } from "@/lib/i18n";

const BusinessQueue = () => {
  const { t } = useLang();
  const { me, setMe, currentLocation } = useBusinessSession();

  let body = <p className="text-sm text-slate-600">{t("queue.noLocation")}</p>;
  if (currentLocation) {
    body = (
      <QueueManager
        key={currentLocation.id}
        me={me}
        setMe={setMe}
        locationId={currentLocation.id}
      />
    );
  }

  return (
    <>
      <SEO
        title="Business Queue | SeatPing"
        description={BUSINESS_DESCRIPTION}
        image={BUSINESS_IMAGE}
      />
      <div className="flex min-h-full flex-col">
        <div className="container mx-auto flex w-full flex-1 flex-col px-4 py-8">
          <div className="mb-6">
            <h1 className="text-xl font-semibold text-gray-800 md:text-2xl">{t("nav.queue")}</h1>
            <p className="text-sm text-gray-600 md:text-base">{t("queue.page.subtitle")}</p>
          </div>
          {body}
        </div>
      </div>
    </>
  );
};

export default BusinessQueue;
