// BusinessSettings.tsx
// The single business "Settings" page. Combines account-level Business
// Information with Location Management (each location's public restaurant
// profile + its queue QR code live in the location cards). This replaced the
// separate /business/profile page; that route now redirects here.
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import BusinessHeader from "@/components/BusinessHeader";
import BusinessTrialBanner from "@/components/BusinessTrialBanner";
import LocationManagement from "@/components/LocationManagement";
import LanguageSelector from "@/components/LanguageSelector";
import Footer from "@/components/Footer";
import SEO, { BUSINESS_DESCRIPTION, BUSINESS_IMAGE } from "@/components/SEO";
import { useLang } from "@/lib/i18n";

interface BusinessMe {
  name: string;
  username: string;
  email: string;
  phone: string;
  locations: any[];
  maxLocations?: number;
  trial?: boolean;
  trialDurationDays?: number;
  createdAt?: string;
}

const BusinessSettings = () => {
  const { t } = useLang();
  const [me, setMe] = useState<BusinessMe | null>(null);

  const locations = me?.locations || [];

  useEffect(() => {
    (async () => {
      try {
        const res = await api("/auth/business/me");
        setMe(res.user);
      } catch {
        // ignore — RequireBusiness gate handles auth redirects
      }
    })();
  }, []);

  return (
    <>
      <SEO
        title="Business Settings | SeatPing"
        description={BUSINESS_DESCRIPTION}
        image={BUSINESS_IMAGE}
      />
      {/* SEO title stays in English (brand metadata, not operator UI). */}
      <BusinessHeader />
      <div className="min-h-screen pt-20 bg-gradient-to-br from-slate-50 to-indigo-100">
        <div className="container mx-auto px-4 py-8">
          {/* Trial banners (active / expired) */}
          <BusinessTrialBanner me={me} />

          {/* No credits banner */}
          {me &&
            !me.trial &&
            locations.length > 0 &&
            locations.some((location: any) => location.credits === 0) && (
              <div className="mb-6">
                <div className="bg-gradient-to-r from-teal-500 to-teal-600 rounded-xl shadow-lg p-4 md:p-6 text-white">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-3 md:space-y-0">
                    <div>
                      <h3 className="text-lg md:text-xl font-semibold">
                        {t("banner.noCredits.title")}
                      </h3>
                      <p className="text-sm md:text-base opacity-90">
                        {t("banner.noCredits.body")}
                      </p>
                    </div>
                    <div className="flex justify-end">
                      <Button
                        variant="inverseOutline"
                        onClick={() => (window.location.href = "/sales")}
                      >
                        {t("common.contactSeatPing")}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

          {/* Settings header */}
          <div className="mb-6">
            <h1 className="text-xl md:text-2xl font-semibold text-gray-800">
              {t("settings.title")}
            </h1>
            <p className="text-gray-600 text-sm md:text-base">
              {t("settings.subtitle")}
            </p>
          </div>

          <div className="space-y-4 md:space-y-6">
            {/* Business Information */}
            <Card className="bg-white rounded-xl shadow-sm border border-slate-200">
              <CardHeader className="p-4 md:p-6">
                <CardTitle className="text-lg md:text-xl text-gray-800">
                  {t("settings.businessInfo.title")}
                </CardTitle>
                <CardDescription className="text-gray-600 text-sm md:text-base">
                  {t("settings.businessInfo.desc")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 p-4 md:p-6 pt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label
                      htmlFor="businessName"
                      className="text-sm md:text-base"
                    >
                      {t("settings.field.businessName")}
                    </Label>
                    <Input
                      id="businessName"
                      value={me?.name || ""}
                      disabled
                      className="bg-gray-100 text-sm md:text-base"
                    />
                  </div>
                  <div>
                    <Label htmlFor="username" className="text-sm md:text-base">
                      {t("settings.field.username")}
                    </Label>
                    <Input
                      id="username"
                      value={me?.username || ""}
                      disabled
                      className="bg-gray-100 text-sm md:text-base"
                    />
                  </div>
                  <div>
                    <Label htmlFor="email" className="text-sm md:text-base">
                      {t("settings.field.email")}
                    </Label>
                    <Input
                      id="email"
                      value={me?.email || ""}
                      disabled
                      className="bg-gray-100 text-sm md:text-base"
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone" className="text-sm md:text-base">
                      {t("settings.field.phone")}
                    </Label>
                    <Input
                      id="phone"
                      value={me?.phone || ""}
                      disabled
                      className="bg-gray-100 text-sm md:text-base"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Preferences — operator UI language lives here. */}
            <Card className="bg-white rounded-xl shadow-sm border border-slate-200">
              <CardHeader className="p-4 md:p-6">
                <CardTitle className="text-lg md:text-xl text-gray-800">
                  {t("settings.prefs.title")}
                </CardTitle>
                <CardDescription className="text-gray-600 text-sm md:text-base">
                  {t("settings.prefs.desc")}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 md:p-6 pt-0">
                <LanguageSelector />
              </CardContent>
            </Card>

            {/* Location Management (each card has Edit Profile / Reviews / QR / Delete) */}
            <LocationManagement me={me} onChanged={(u) => setMe(u)} />
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
};

export default BusinessSettings;
