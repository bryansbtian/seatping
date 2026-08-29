import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useParams, useLocation } from "react-router-dom";
import Index from "./pages/Index";
import LandingPage from "./pages/LandingPage";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import BusinessLogin from "./pages/BusinessLogin";
import BusinessSignup from "./pages/BusinessSignup";
import Profile from "./pages/Profile";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import BusinessOverview from "./pages/BusinessOverview";
import BusinessQueue from "./pages/BusinessQueue";
import BusinessReservations from "./pages/BusinessReservations";
import BusinessFloor from "./pages/BusinessFloor";
import BusinessGuests from "./pages/BusinessGuests";
import BusinessReviews from "./pages/BusinessReviews";
import BusinessCampaigns from "./pages/BusinessCampaigns";
import BusinessPerformance from "./pages/BusinessPerformance";
import BusinessSettings from "./pages/BusinessSettings";
import BusinessLayout from "@/components/BusinessLayout";
import { useEffect, useState } from "react";
import NotFound from "./pages/NotFound";
import Policy from "./pages/Policy";
import Terms from "./pages/Terms";
import Feedback from "./pages/Feedback";
import Sales from "./pages/Sales";
import Help from "./pages/Help";
import QueueBusiness from "./pages/QueueBusiness";
import Restaurant from "./pages/Restaurant";
import ManageReservation from "./pages/ManageReservation";
import SearchResults from "./pages/SearchResults";
import Admin from "./pages/Admin";
import { LanguageProvider } from "@/components/LanguageProvider";
import AnalyticsRouteTracker from "@/components/AnalyticsRouteTracker";

const queryClient = new QueryClient();

type SessionState = {
  customer: { name?: string | null } | null;
  business: { name?: string | null } | null;
};

function useSession() {
  const [session, setSession] = useState<SessionState | undefined>(undefined);
  useEffect(() => {
    fetch("/auth/session", { credentials: "include" })
      .then((r) => {
        if (r.ok) {
          return r.json();
        }
        return { customer: null, business: null };
      })
      .then((d) =>
        setSession({
          customer: d?.customer ?? null,
          business: d?.business ?? null,
        }),
      )
      .catch(() => setSession({ customer: null, business: null }));
  }, []);
  return session;
}

function LegacyRestaurantRedirect() {
  const { businessUsername = "", locationId = "" } = useParams();
  const { search } = useLocation();
  return <Navigate to={`/${businessUsername}/${locationId}${search}`} replace />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AnalyticsRouteTracker />
        <Routes>
          <Route path="/" element={<Index />} />

          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          <Route
            path="/profile"
            element={
              <RequireCustomer>
                <Profile />
              </RequireCustomer>
            }
          />

          <Route
            path="/business"
            element={
              <BusinessGuestRoute>
                <LandingPage />
              </BusinessGuestRoute>
            }
          />
          <Route
            path="/business/login"
            element={
              <BusinessGuestRoute>
                <BusinessLogin />
              </BusinessGuestRoute>
            }
          />
          <Route
            path="/business/signup"
            element={
              <BusinessGuestRoute>
                <BusinessSignup />
              </BusinessGuestRoute>
            }
          />

          <Route path="/forgot" element={<ForgotPassword />} />
          <Route path="/reset" element={<ResetPassword />} />
          <Route path="/queue/:businessUsername/:locationId" element={<QueueBusiness />} />
          <Route
            path="/restaurants/:businessUsername/:locationId"
            element={<LegacyRestaurantRedirect />}
          />
          <Route path="/reservations/manage/:token" element={<ManageReservation />} />
          <Route path="/search" element={<SearchResults />} />
          <Route path="/search/:query" element={<SearchResults />} />
          <Route path="/policy" element={<Policy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/feedback" element={<Feedback />} />
          <Route path="/help" element={<Help />} />
          <Route path="/sales" element={<Sales />} />

          <Route
            element={
              <RequireBusiness>
                <LanguageProvider>
                  <BusinessLayout />
                </LanguageProvider>
              </RequireBusiness>
            }
          >
            <Route path="/business/overview" element={<BusinessOverview />} />
            <Route path="/business/queue" element={<BusinessQueue />} />
            <Route path="/business/reservations" element={<BusinessReservations />} />
            <Route path="/business/floor" element={<BusinessFloor />} />
            <Route path="/business/guests" element={<BusinessGuests />} />
            <Route path="/business/reviews" element={<BusinessReviews />} />
            <Route path="/business/campaigns" element={<BusinessCampaigns />} />
            <Route path="/business/performance" element={<BusinessPerformance />} />
            <Route path="/business/settings" element={<BusinessSettings />} />
          </Route>
          <Route path="/admin" element={<Admin />} />

          <Route path="/:businessUsername/:locationId" element={<Restaurant />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

function RequireBusiness({ children }: { children: React.ReactNode }) {
  const session = useSession();
  if (session === undefined) {
    return null;
  }
  if (!session.business) {
    return <Navigate to="/business/login" replace />;
  }
  return <>{children}</>;
}

function BusinessGuestRoute({ children }: { children: React.ReactNode }) {
  const session = useSession();
  if (session === undefined) {
    return null;
  }
  if (session.business) {
    return <Navigate to="/business/overview" replace />;
  }
  return <>{children}</>;
}

function RequireCustomer({ children }: { children: React.ReactNode }) {
  const session = useSession();
  if (session === undefined) {
    return null;
  }
  if (!session.customer) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export default App;
