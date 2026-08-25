import { Card, CardContent } from "@/components/ui/card";
import { useLang } from "@/lib/i18n";
import type { TKey } from "@/lib/i18n";

const BusinessComingSoon = ({ titleKey }: { titleKey: TKey }) => {
  const { t } = useLang();

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-slate-800 md:text-3xl">{t(titleKey)}</h1>
      <Card className="border border-slate-200 bg-white shadow-sm">
        <CardContent className="p-6">
          <p className="text-lg font-semibold text-slate-800">{t("page.comingSoon.title")}</p>
          <p className="mt-2 text-sm text-slate-600">{t("page.comingSoon.body")}</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default BusinessComingSoon;
