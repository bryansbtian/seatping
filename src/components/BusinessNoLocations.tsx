import { InboxIcon } from "@hugeicons/core-free-icons";
import SEO, { BUSINESS_DESCRIPTION, BUSINESS_IMAGE } from "@/components/SEO";
import BusinessEmptyState from "@/components/BusinessEmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { useLang, type TKey } from "@/lib/i18n";

export default function BusinessNoLocations({
  titleKey,
  subtitleKey,
}: {
  titleKey: TKey;
  subtitleKey: TKey;
}) {
  const { t } = useLang();

  return (
    <>
      <SEO
        title={`${t(titleKey)} | SeatPing`}
        description={BUSINESS_DESCRIPTION}
        image={BUSINESS_IMAGE}
      />
      <div className="container mx-auto flex min-h-full flex-col px-4 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-800 md:text-2xl">{t(titleKey)}</h1>
          <p className="text-sm text-gray-600 md:text-base">{t(subtitleKey)}</p>
        </div>
        <Card className="flex min-h-64 flex-1 flex-col" data-testid="business-no-locations">
          <CardContent className="flex flex-1 flex-col p-0">
            <BusinessEmptyState
              icon={InboxIcon}
              title={t("guests.empty.noLocations.title")}
              body={t("guests.empty.noLocations.body")}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
