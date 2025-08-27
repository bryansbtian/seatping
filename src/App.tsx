import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Queue from "./pages/Queue";
import BusinessDashboard from "./pages/BusinessDashboard";
import BusinessSettings from "./pages/BusinessSettings";
import { useEffect, useState } from "react";
import NotFound from "./pages/NotFound";
import Policy from "./pages/Policy";
import Terms from "./pages/Terms";
import Feedback from "./pages/Feedback";
import Sales from "./pages/Sales";
import Demo from "./pages/Demo";
import Help from "./pages/Help";
import QueueBusiness from "./pages/QueueBusiness";

const queryClient = new QueryClient();

function useAuth() {
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);
  useEffect(() => {
    // Ping /auth/me to see if we're logged in
    fetch("/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(() => setIsAuthed(true))
      .catch(() => setIsAuthed(false));
  }, []);
  return isAuthed;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/queue" element={<Queue />} />
          <Route path="/queue/:businessUsername" element={<QueueBusiness />} />
          <Route path="/policy" element={<Policy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/feedback" element={<Feedback />} />
          <Route path="/help" element={<Help />} />
          <Route path="/sales" element={<Sales />} />
          <Route path="/demo" element={<Demo />} />
          <Route
            path="/business/dashboard"
            element={
              <RequireAuth>
                <BusinessDashboard />
              </RequireAuth>
            }
          />
          <Route
            path="/business/settings"
            element={
              <RequireAuth>
                <BusinessSettings />
              </RequireAuth>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

function RootRedirect() {
  const authed = useAuth();
  if (authed === null) return null;
  return authed ? <Navigate to="/business/dashboard" replace /> : <Index />;
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const authed = useAuth();
  if (authed === null) return null;
  if (!authed) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default App;
