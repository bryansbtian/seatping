import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import BusinessSessionProvider from "@/components/BusinessSessionProvider";
import { LanguageProvider } from "@/components/LanguageProvider";
import RouteLoading from "@/components/RouteLoading";
import BusinessOverviewLoading from "@/components/BusinessOverviewLoading";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useSession } from "@/hooks/useSession";
import { useBusinessSession } from "@/lib/businessSession";
import { useLang } from "@/lib/i18n";

function BusinessGuard({ children }: { children: ReactNode }) {
  const session = useSession();
  const { pathname } = useLocation();
  const { me, loadingMe, meError, refreshMe } = useBusinessSession();
  const { t } = useLang();
  let loadingContent = <RouteLoading />;
  if (pathname === "/business/overview") {
    loadingContent = <BusinessOverviewLoading />;
  }
  if (session === undefined) {
    return loadingContent;
  }
  if (!session.business) {
    return <Navigate to="/business/login" replace />;
  }
  if (!me && loadingMe) {
    return loadingContent;
  }
  if (!me && meError) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 p-6"
          >
            <p className="text-body text-ink-subtle">
              {t("common.somethingWrong")} {t("common.pleaseTryAgain")}
            </p>
            <Button variant="outline" onClick={() => void refreshMe()}>
              {t("common.tryAgain")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  return children;
}

export default function BusinessBootstrap({ children }: { children: ReactNode }) {
  return (
    <BusinessSessionProvider>
      <LanguageProvider>
        <BusinessGuard>{children}</BusinessGuard>
      </LanguageProvider>
    </BusinessSessionProvider>
  );
}
