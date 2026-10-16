import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useParams,
  useLocation,
  Outlet,
} from "react-router-dom";
import { Suspense, type ReactNode } from "react";
import { queryClient } from "@/lib/queryClient";
import { useSession } from "@/hooks/useSession";
import AnalyticsRouteTracker from "@/components/AnalyticsRouteTracker";

import { lazyRoute } from "@/lib/lazyRoute";
import RouteLoading from "@/components/RouteLoading";
import RouteErrorBoundary from "@/components/RouteErrorBoundary";

const Index = lazyRoute(() => import("./pages/Index"));
const LandingPage = lazyRoute(() => import("./pages/LandingPage"));
const Login = lazyRoute(() => import("./pages/Login"));
const Signup = lazyRoute(() => import("./pages/Signup"));
const BusinessLogin = lazyRoute(() => import("./pages/BusinessLogin"));
const BusinessSignup = lazyRoute(() => import("./pages/BusinessSignup"));
const Profile = lazyRoute(() => import("./pages/Profile"));
const ForgotPassword = lazyRoute(() => import("./pages/ForgotPassword"));
const ResetPassword = lazyRoute(() => import("./pages/ResetPassword"));
const BusinessOverview = lazyRoute(() => import("./pages/BusinessOverview"));
const BusinessQueue = lazyRoute(() => import("./pages/BusinessQueue"));
const BusinessReservations = lazyRoute(() => import("./pages/BusinessReservations"));
const BusinessFloor = lazyRoute(() => import("./pages/BusinessFloor"));
const BusinessGuests = lazyRoute(() => import("./pages/BusinessGuests"));
const BusinessReviews = lazyRoute(() => import("./pages/BusinessReviews"));
const BusinessCampaigns = lazyRoute(() => import("./pages/BusinessCampaigns"));
const BusinessPerformance = lazyRoute(() => import("./pages/BusinessPerformance"));
const BusinessSettings = lazyRoute(() => import("./pages/BusinessSettings"));
const BusinessLayout = lazyRoute(() => import("@/components/BusinessLayout"));
const BusinessBootstrap = lazyRoute(() => import("@/components/BusinessBootstrap"));
const NotFound = lazyRoute(() => import("./pages/NotFound"));
const Policy = lazyRoute(() => import("./pages/Policy"));
const Terms = lazyRoute(() => import("./pages/Terms"));
const Feedback = lazyRoute(() => import("./pages/Feedback"));
const Sales = lazyRoute(() => import("./pages/Sales"));
const Help = lazyRoute(() => import("./pages/Help"));
const QueueBusiness = lazyRoute(() => import("./pages/QueueBusiness"));
const Restaurant = lazyRoute(() => import("./pages/Restaurant"));
const ManageReservation = lazyRoute(() => import("./pages/ManageReservation"));
const SearchResults = lazyRoute(() => import("./pages/SearchResults"));
const Admin = lazyRoute(() => import("./pages/Admin"));

function LegacyRestaurantRedirect() {
  const { businessUsername = "", locationId = "" } = useParams();
  const { search } = useLocation();
  return <Navigate to={`/${businessUsername}/${locationId}${search}`} replace />;
}

function RouteContent({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <RouteErrorBoundary resetKey={pathname}>
      <Suspense fallback={<RouteLoading />}>{children}</Suspense>
    </RouteErrorBoundary>
  );
}

function BusinessPageOutlet() {
  return (
    <RouteContent>
      <Outlet />
    </RouteContent>
  );
}
const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AnalyticsRouteTracker />
        <RouteContent>
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
                <BusinessBootstrap>
                  <BusinessLayout />
                </BusinessBootstrap>
              }
            >
              <Route element={<BusinessPageOutlet />}>
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
            </Route>
            <Route path="/admin" element={<Admin />} />

            <Route path="/:businessUsername/:locationId" element={<Restaurant />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </RouteContent>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

function BusinessGuestRoute({ children }: { children: React.ReactNode }) {
  const session = useSession();
  if (session === undefined) {
    return <RouteLoading />;
  }
  if (session.business) {
    return <Navigate to="/business/overview" replace />;
  }
  return <>{children}</>;
}

function RequireCustomer({ children }: { children: React.ReactNode }) {
  const session = useSession();
  if (session === undefined) {
    return <RouteLoading />;
  }
  if (!session.customer) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export default App;
