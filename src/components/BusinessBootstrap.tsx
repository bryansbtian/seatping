import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import BusinessSessionProvider from "@/components/BusinessSessionProvider";
import { LanguageProvider } from "@/components/LanguageProvider";
import RouteLoading from "@/components/RouteLoading";
import { useSession } from "@/hooks/useSession";

function BusinessGuard({ children }: { children: ReactNode }) {
  const session = useSession();
  if (session === undefined) {
    return <RouteLoading />;
  }
  if (!session.business) {
    return <Navigate to="/business/login" replace />;
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
