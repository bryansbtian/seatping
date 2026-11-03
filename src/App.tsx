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
import DemoBookingProvider from "@/components/DemoBookingProvider";
import PublicLanguageProvider from "@/components/PublicLanguageProvider";
import {
  explicitPublicLanguage,
  localizedPublicPath,
  publicLanguageForPath,
} from "@shared/publicLanguage";

import { lazyRoute } from "@/lib/lazyRoute";
import RouteLoading from "@/components/RouteLoading";
import RouteErrorBoundary from "@/components/RouteErrorBoundary";
import RestaurantRoute from "@/components/RestaurantRoute";
import NotFound from "@/pages/NotFound";
import ScrollToTop from "@/components/ScrollToTop";

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
const Policy = lazyRoute(() => import("./pages/Policy"));
const Terms = lazyRoute(() => import("./pages/Terms"));
const Feedback = lazyRoute(() => import("./pages/Feedback"));
const Help = lazyRoute(() => import("./pages/Help"));
const Blog = lazyRoute(() => import("./pages/Blog"));
const BlogArticle = lazyRoute(() => import("./pages/BlogArticle"));
const QueueBusiness = lazyRoute(() => import("./pages/QueueBusiness"));
const ManageReservation = lazyRoute(() => import("./pages/ManageReservation"));
const SearchResults = lazyRoute(() => import("./pages/SearchResults"));
const Admin = lazyRoute(() => import("./pages/Admin"));

const reservedRoutePrefixes = [
  "id",
  "en",
  "login",
  "signup",
  "profile",
  "business",
  "forgot",
  "reset",
  "queue",
  "restaurants",
  "reservations",
  "search",
  "policy",
  "terms",
  "feedback",
  "help",
  "blog",
  "admin",
  "api",
  "auth",
  "tickets",
];

function LegacyRestaurantRedirect() {
  const { businessUsername = "", locationId = "" } = useParams();
  const { pathname, search } = useLocation();
  return (
    <Navigate
      to={localizedPublicPath(
        `/${businessUsername}/${locationId}${search}`,
        publicLanguageForPath(pathname),
        explicitPublicLanguage(pathname) === "en",
      )}
      replace
    />
  );
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
        <PublicLanguageProvider>
          <ScrollToTop />
          <DemoBookingProvider>
            <AnalyticsRouteTracker />
            <RouteContent>
              <Routes>
                {["", "/id", "/en"].map((prefix) => (
                  <Route key={prefix}>
                    <Route path={`${prefix}/`} element={<Index />} />

                    <Route path={`${prefix}/login`} element={<Login />} />
                    <Route path={`${prefix}/signup`} element={<Signup />} />

                    <Route
                      path={`${prefix}/profile`}
                      element={
                        <RequireCustomer>
                          <Profile />
                        </RequireCustomer>
                      }
                    />

                    <Route
                      path={`${prefix}/business`}
                      element={
                        <BusinessGuestRoute>
                          <LandingPage />
                        </BusinessGuestRoute>
                      }
                    />
                    <Route
                      path={`${prefix}/business/login`}
                      element={
                        <BusinessGuestRoute>
                          <BusinessLogin />
                        </BusinessGuestRoute>
                      }
                    />
                    <Route
                      path={`${prefix}/business/signup`}
                      element={
                        <BusinessGuestRoute>
                          <BusinessSignup />
                        </BusinessGuestRoute>
                      }
                    />

                    <Route path={`${prefix}/forgot`} element={<ForgotPassword />} />
                    <Route path={`${prefix}/reset`} element={<ResetPassword />} />
                    <Route
                      path={`${prefix}/queue/:businessUsername/:locationId`}
                      element={<QueueBusiness />}
                    />
                    <Route
                      path={`${prefix}/restaurants/:businessUsername/:locationId`}
                      element={<LegacyRestaurantRedirect />}
                    />
                    <Route
                      path={`${prefix}/reservations/manage/:token`}
                      element={<ManageReservation />}
                    />
                    <Route path={`${prefix}/search`} element={<SearchResults />} />
                    <Route path={`${prefix}/search/:query`} element={<SearchResults />} />
                    <Route path={`${prefix}/policy`} element={<Policy />} />
                    <Route path={`${prefix}/terms`} element={<Terms />} />
                    <Route path={`${prefix}/feedback`} element={<Feedback />} />
                    <Route path={`${prefix}/help`} element={<Help />} />
                    <Route
                      path={`${prefix}/:businessUsername/:locationId`}
                      element={<RestaurantRoute />}
                    />
                    {reservedRoutePrefixes.map((reserved) => (
                      <Route
                        key={reserved}
                        path={`${prefix}/${reserved}/*`}
                        element={<NotFound />}
                      />
                    ))}
                  </Route>
                ))}
                <Route path="/blog" element={<Blog />} />
                <Route path="/blog/:slug" element={<BlogArticle />} />

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
                <Route path="/admin" element={<Admin />}>
                  <Route path="dashboard" element={<></>} />
                  <Route path="customers" element={<></>} />
                  <Route path="featured" element={<></>} />
                  <Route path="templates" element={<></>} />
                  <Route path="blog" element={<></>} />
                  <Route path="blog/new" element={<></>} />
                  <Route path="blog/:id/edit" element={<></>} />
                </Route>

                <Route path="*" element={<NotFound />} />
              </Routes>
            </RouteContent>
          </DemoBookingProvider>
        </PublicLanguageProvider>
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
  const { pathname } = useLocation();
  const session = useSession();
  if (session === undefined) {
    return <RouteLoading />;
  }
  if (!session.customer) {
    return (
      <Navigate
        to={localizedPublicPath(
          "/login",
          publicLanguageForPath(pathname),
          explicitPublicLanguage(pathname) === "en",
        )}
        replace
      />
    );
  }
  return <>{children}</>;
}

export default App;
