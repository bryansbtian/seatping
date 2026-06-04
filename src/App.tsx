import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useParams,
  useLocation,
} from "react-router-dom";
import Index from "./pages/Index";
import LandingPage from "./pages/LandingPage";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import BusinessLogin from "./pages/BusinessLogin";
import BusinessSignup from "./pages/BusinessSignup";
import Profile from "./pages/Profile";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import BusinessDashboard from "./pages/BusinessDashboard";
import BusinessSettings from "./pages/BusinessSettings";
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

const queryClient = new QueryClient();

type SessionState = {
  customer: { name?: string | null } | null;
  business: { name?: string | null } | null;
};

/**
 * Returns the current session once known, or `undefined` while loading.
 * Customer and business sessions live in separate cookies and can both be
 * active at once, so they're reported independently by /auth/session.
 */
function useSession() {
  const [session, setSession] = useState<SessionState | undefined>(undefined);
  useEffect(() => {
    fetch("/auth/session", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { customer: null, business: null }))
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

/**
 * Backward-compat redirect for the old `/restaurants/:businessUsername/:locationId`
 * URL to the new top-level `/:businessUsername/:locationId`. Preserves the query
 * string (search context: date/time/party/query, and `book=1`) so old links keep
 * prefilling the restaurant page.
 */
function LegacyRestaurantRedirect() {
  const { businessUsername = "", locationId = "" } = useParams();
  const { search } = useLocation();
  return (
    <Navigate
      to={`/${businessUsername}/${locationId}${search}`}
      replace
    />
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Customer-facing homepage — never redirects business sessions away. */}
          <Route path="/" element={<Index />} />

          {/* Customer auth */}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          {/* Customer profile — customer accounts only. Anonymous visitors and
              business sessions are redirected to the customer login. */}
          <Route
            path="/profile"
            element={
              <RequireCustomer>
                <Profile />
              </RequireCustomer>
            }
          />

          {/* Business marketing + auth */}
          <Route path="/business" element={<LandingPage />} />
          <Route path="/business/login" element={<BusinessLogin />} />
          <Route path="/business/signup" element={<BusinessSignup />} />

          <Route path="/forgot" element={<ForgotPassword />} />
          <Route path="/reset" element={<ResetPassword />} />
          <Route
            path="/queue/:businessUsername/:locationId"
            element={<QueueBusiness />}
          />
          {/* Legacy restaurant URL — redirect to the new top-level path,
              preserving any query string (date/time/party/book/etc.). */}
          <Route
            path="/restaurants/:businessUsername/:locationId"
            element={<LegacyRestaurantRedirect />}
          />
          <Route
            path="/reservations/manage/:token"
            element={<ManageReservation />}
          />
          <Route path="/search" element={<SearchResults />} />
          <Route path="/search/:query" element={<SearchResults />} />
          <Route path="/policy" element={<Policy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/feedback" element={<Feedback />} />
          <Route path="/help" element={<Help />} />
          <Route path="/sales" element={<Sales />} />

          {/* Business dashboard area — business accounts only. A customer token
              is rejected here and sent to the business login. */}
          <Route
            path="/business/dashboard"
            element={
              <RequireBusiness>
                <BusinessDashboard />
              </RequireBusiness>
            }
          />
          {/* Profile + Settings were merged into a single Settings page. */}
          <Route
            path="/business/settings"
            element={
              <RequireBusiness>
                <BusinessSettings />
              </RequireBusiness>
            }
          />
          <Route path="/admin" element={<Admin />} />

          {/* Public restaurant details page. This is a very broad two-segment
              dynamic route, so it MUST stay last (before the catch-all). React
              Router v6 ranks static segments above dynamic ones, so fixed routes
              like /business/dashboard or /search/:query still win, but keeping
              it last makes the precedence explicit and conflict-free. */}
          <Route
            path="/:businessUsername/:locationId"
            element={<Restaurant />}
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

/**
 * Gate for business-only routes. Only an authenticated business account may
 * pass; customer sessions and anonymous visitors are redirected to the business
 * login (customer JWTs are never accepted as business dashboard auth).
 */
function RequireBusiness({ children }: { children: React.ReactNode }) {
  const session = useSession();
  if (session === undefined) return null; // still loading
  if (!session.business) return <Navigate to="/business/login" replace />;
  return <>{children}</>;
}

/**
 * Gate for customer-only routes (e.g. /profile). Only an authenticated customer
 * account may pass; anonymous visitors and business sessions are redirected to
 * the customer login (business JWTs are never accepted as customer auth).
 */
function RequireCustomer({ children }: { children: React.ReactNode }) {
  const session = useSession();
  if (session === undefined) return null; // still loading
  if (!session.customer) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default App;
