import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { FilterButton } from "@/components/ui/collection-controls";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import FeaturedRestaurantsManager from "@/components/FeaturedRestaurantsManager";
import CampaignTemplatesAdmin from "@/components/CampaignTemplatesAdmin";
import CustomerManagementAdmin from "@/components/CustomerManagementAdmin";
import AdminLogin from "@/components/AdminLogin";
import AdminLayout from "@/components/AdminLayout";
import RouteLoading from "@/components/RouteLoading";
import ListSkeleton from "@/components/ListSkeleton";
import BusinessEmptyState from "@/components/BusinessEmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { SelectFilter } from "@/components/restaurant-discovery/RestaurantFilters";
import { Cancel01Icon, Search01Icon, Ticket01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import TicketConversation from "@/components/TicketConversation";
import type { TicketChatMessage } from "@shared/tickets";
import SEO from "@/components/SEO";
import { formatEnteredPhone } from "@shared/phone";
import { cn } from "@/lib/utils";

const BlogManagement = lazy(() => import("@/components/blog/BlogManagement"));
const BlogEditor = lazy(() => import("@/components/blog/BlogEditor"));

interface Ticket {
  id: string;
  ticketNumber: string;
  type: string;
  status: string;
  priority?: string;
  subject: string;
  senderName: string;
  senderEmail: string;
  senderPhone?: string;
  businessName?: string;
  data: {
    feedbackType?: string;
    severity?: string;
  } | null;
  messages: TicketChatMessage[];
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
}

function ticketCategory(ticket: Ticket): string {
  if (
    ticket.type === "feedback" &&
    ["support", "bug", "ux", "billing"].includes(ticket.data?.feedbackType || "")
  ) {
    return "support";
  }
  return ticket.type;
}

function formatTicketValue(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const TICKET_CATEGORIES = [
  { value: "all", label: "All" },
  { value: "support", label: "Support" },
  { value: "feedback", label: "Feedback" },
];

interface TicketStats {
  total: number;
  open: number;
  inProgress: number;
  closed: number;
  feedback: number;
}

const Admin = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();

  let section = "tickets";
  let pageTitle = "Ticket Management";
  let pageDescription = "Manage support tickets and customer feedback.";
  if (pathname.toLowerCase().replace(/\/$/, "") === "/admin/customers") {
    section = "customer";
    pageTitle = "Customer Management";
    pageDescription = "Manage business accounts, access, locations, and credits.";
  } else if (pathname.toLowerCase().replace(/\/$/, "") === "/admin/featured") {
    section = "featured";
    pageTitle = "Featured Restaurants";
    pageDescription = "Manage which restaurants appear on the homepage.";
  } else if (pathname.toLowerCase().replace(/\/$/, "") === "/admin/templates") {
    section = "campaigns";
    pageTitle = "Campaign Templates";
    pageDescription = "Review and manage campaign templates across business accounts.";
  }

  if (/^\/admin\/blog(?:\/|$)/i.test(pathname)) {
    section = "blog";
    pageTitle = "Blog Management";
    pageDescription = "Write, organize, and manage your articles.";
  }

  const [searchUsername, setSearchUsername] = useState("");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [ticketsError, setTicketsError] = useState<string | null>(null);
  const [statsError, setStatsError] = useState(false);
  const [stats, setStats] = useState<TicketStats | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [ticketFiltersOpen, setTicketFiltersOpen] = useState(false);
  const [ticketSort, setTicketSort] = useState("newest");
  const [ticketSearch, setTicketSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [ticketTab, setTicketTab] = useState("details");
  const [filter, setFilter] = useState({
    status: "all",
    type: "all",
    priority: "all",
  });

  const { toast } = useToast();

  const fetchStats = async () => {
    setStatsError(false);
    try {
      const response = await fetch("/tickets/stats");
      if (!response.ok) {
        throw new Error("Failed to load ticket statistics");
      }
      const data = await response.json();
      setStats(data.stats);
    } catch {
      setStatsError(true);
    }
  };

  const fetchTickets = useCallback(async () => {
    setTicketsLoading(true);
    setTicketsError(null);
    try {
      const params = new URLSearchParams();
      if (filter.status !== "all") {
        params.append("status", filter.status);
      }
      if (filter.type !== "all") {
        let type = filter.type;
        if (type === "support") {
          type = "feedback";
        }
        params.append("type", type);
      }
      if (filter.priority !== "all") {
        params.append("priority", filter.priority);
      }

      const response = await fetch(`/tickets?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to load tickets");
      }
      const data = await response.json();
      let nextTickets: Ticket[] = data.tickets;
      if (filter.type === "support" || filter.type === "feedback") {
        nextTickets = nextTickets.filter((ticket) => ticketCategory(ticket) === filter.type);
      }
      setTickets(nextTickets);
    } catch {
      setTicketsError("Please try again to load your tickets.");
    } finally {
      setTicketsLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    if (isAuthenticated && section === "tickets") {
      fetchTickets();
    }
  }, [isAuthenticated, fetchTickets, section]);

  useEffect(() => {
    if (isAuthenticated && section === "tickets") {
      fetchStats();
    }
  }, [isAuthenticated, section]);

  useEffect(() => {
    let active = true;
    fetch("/auth/admin/session", { credentials: "include" })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Admin session unavailable");
        }
        return response.json();
      })
      .then((d) => {
        if (active && d?.authenticated) {
          setIsAuthenticated(true);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) {
          setCheckingSession(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const handleLogin = async (credentials: { username: string; password: string }) => {
    setIsLoading(true);
    try {
      const res = await fetch("/auth/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(credentials),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setIsAuthenticated(true);
        toast({ title: "Success", description: "Admin access granted" });
      } else {
        toast({
          title: "Error",
          description: data?.error || "Invalid credentials.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Error",
        description: "Invalid credentials.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/auth/admin/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {}
    setIsAuthenticated(false);
    setSearchUsername("");
    setSelectedTicket(null);
    setTickets([]);
    setStats(null);
    setIsDialogOpen(false);
    navigate("/admin", { replace: true });
  };

  const formatDate = (value: string | null) => {
    if (!value) {
      return "Not started";
    }
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      return "Not started";
    }
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const handleViewTicket = async (ticketNumber: string) => {
    try {
      const response = await fetch(`/tickets/${ticketNumber}`);
      if (response.ok) {
        const data = await response.json();
        setSelectedTicket(data.ticket);
        setTicketTab("details");
        setIsDialogOpen(true);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load ticket details",
        variant: "destructive",
      });
    }
  };

  const handleUpdateStatus = async (ticketNumber: string, status: string) => {
    try {
      const response = await fetch(`/tickets/${ticketNumber}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: "Ticket status updated",
        });
        fetchStats();
        fetchTickets();
        if (selectedTicket?.ticketNumber === ticketNumber) {
          const data = await response.json();
          setSelectedTicket(data.ticket);
        }
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update status",
        variant: "destructive",
      });
    }
  };

  const handleUpdatePriority = async (ticketNumber: string, priority: string) => {
    try {
      const response = await fetch(`/tickets/${ticketNumber}/priority`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority }),
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: "Ticket priority updated",
        });
        fetchTickets();
        if (selectedTicket?.ticketNumber === ticketNumber) {
          const data = await response.json();
          setSelectedTicket(data.ticket);
        }
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update priority",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "warning" | "info" | "success"> = {
      open: "warning",
      in_progress: "info",
      closed: "success",
    };
    const labels: Record<string, string> = {
      open: "Open",
      in_progress: "In Progress",
      closed: "Closed",
    };
    return <Badge variant={variants[status] || "neutral"}>{labels[status] || status}</Badge>;
  };

  const getPriorityBadge = (priority?: string) => {
    if (!priority) {
      return null;
    }
    const variants: Record<string, "danger" | "warning" | "neutral"> = {
      high: "danger",
      medium: "warning",
      low: "neutral",
    };
    return (
      <Badge variant={variants[priority] || "neutral"}>
        {priority.charAt(0).toUpperCase() + priority.slice(1)}
      </Badge>
    );
  };

  if (checkingSession) {
    return <RouteLoading fill label="Checking Admin Session" className="min-h-screen" />;
  }

  if (!isAuthenticated) {
    return <AdminLogin onSubmit={handleLogin} loading={isLoading} />;
  }

  if (pathname.toLowerCase().replace(/\/$/, "") === "/admin") {
    return <Navigate to="/admin/dashboard" replace />;
  }

  const hasTicketFilters =
    filter.type !== "all" || filter.status !== "all" || filter.priority !== "all";
  let ticketEmptyDescription =
    "Support tickets and customer feedback will appear here when they arrive.";
  if (hasTicketFilters) {
    ticketEmptyDescription = "Clear your filters to see all tickets.";
  }

  let clearTicketViewLabel = "Clear Filters";
  if (ticketSearch.trim()) {
    ticketEmptyDescription = "Try another search or clear your search and filters.";
    clearTicketViewLabel = "Clear Search And Filters";
  }

  let activeTicketFilterCount = 0;
  if (filter.status !== "all") {
    activeTicketFilterCount += 1;
  }
  if (filter.priority !== "all") {
    activeTicketFilterCount += 1;
  }

  const normalizedTicketSearch = ticketSearch.trim().toLowerCase();
  const searchedTickets = tickets.filter((ticket) => {
    return [
      ticket.ticketNumber,
      ticket.subject,
      ticket.senderName,
      ticket.senderEmail,
      ticket.businessName,
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedTicketSearch);
  });
  const sortedTickets = [...searchedTickets].sort((first, second) => {
    const createdDifference =
      new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime();
    if (ticketSort === "oldest") {
      return -createdDifference;
    }
    if (ticketSort === "priority") {
      const priorities: Record<string, number> = { high: 3, medium: 2, low: 1 };
      const priorityDifference =
        (priorities[second.priority || "low"] || 0) - (priorities[first.priority || "low"] || 0);
      if (priorityDifference !== 0) {
        return priorityDifference;
      }
    }
    return createdDifference;
  });

  return (
    <AdminLayout onLogout={handleLogout}>
      <SEO title={`${pageTitle} | SeatPing Admin`} description={pageDescription} />
      <div className="flex min-h-full flex-col">
        <div className="container mx-auto flex w-full flex-1 flex-col gap-6 px-4 py-8 text-body text-ink">
          {section !== "featured" && (
            <div className="shrink-0">
              <h1 className="text-xl font-semibold text-ink md:text-2xl">{pageTitle}</h1>
              <p className="mt-1 text-body text-ink-subtle">{pageDescription}</p>
            </div>
          )}

          {section === "blog" && (
            <Suspense
              fallback={
                <RouteLoading
                  fill
                  label="Loading Blog Management"
                  className="max-w-none p-0 sm:px-0"
                />
              }
            >
              {pathname.toLowerCase().replace(/\/$/, "") === "/admin/blog" && <BlogManagement />}
              {pathname.toLowerCase().replace(/\/$/, "") !== "/admin/blog" && (
                <BlogEditor id={pathname.split("/")[3]} />
              )}
            </Suspense>
          )}

          {section === "tickets" && (
            <div className="flex flex-1 flex-col gap-6">
              {!stats && !statsError && (
                <div
                  role="status"
                  aria-label="Loading Ticket Statistics"
                  className="grid grid-cols-2 rounded-lg border border-border bg-card shadow-sm sm:grid-cols-[2fr_1fr_1fr]"
                >
                  <div aria-hidden="true" className="col-span-2 space-y-3 p-4 sm:col-span-1 sm:p-5">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-7 w-12" />
                  </div>
                  {["resolved", "total"].map((key) => (
                    <div
                      key={key}
                      aria-hidden="true"
                      className="space-y-3 border-t border-border p-4 last:border-l sm:border-l sm:border-t-0 sm:p-5"
                    >
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-6 w-10" />
                    </div>
                  ))}
                </div>
              )}
              {statsError && (
                <div
                  role="alert"
                  className="w-full rounded-xl border border-border bg-card p-8 text-center"
                >
                  <h3 className="text-title text-foreground">Unable To Load Ticket Statistics</h3>
                  <p className="mt-2 text-body text-ink-subtle">
                    Please try again to load ticket statistics.
                  </p>
                  <Button variant="outline" onClick={fetchStats} className="mt-4">
                    Try Again
                  </Button>
                </div>
              )}
              {stats && !statsError && (
                <Card
                  role="region"
                  aria-label="Ticket Overview"
                  className="grid grid-cols-2 sm:grid-cols-[2fr_1fr_1fr]"
                >
                  <div className="col-span-2 p-4 sm:col-span-1 sm:p-5">
                    <h2 className="text-label text-ink">Needs Attention</h2>
                    <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-ink">
                      {stats.open + stats.inProgress}
                    </p>
                  </div>
                  <div className="border-t border-border p-4 sm:border-l sm:border-t-0 sm:p-5">
                    <h2 className="text-label text-ink-subtle">Resolved</h2>
                    <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-ink">
                      {stats.closed}
                    </p>
                  </div>
                  <div className="border-l border-t border-border p-4 sm:border-t-0 sm:p-5">
                    <h2 className="text-label text-ink-subtle">Total Tickets</h2>
                    <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-ink">
                      {stats.total}
                    </p>
                  </div>
                </Card>
              )}

              <Card
                data-testid="admin-content-card"
                role="region"
                aria-label="Ticket Results"
                className="flex flex-1 flex-col"
              >
                <CardContent className="flex flex-1 flex-col gap-4 p-4 md:p-6">
                  <Sheet open={ticketFiltersOpen} onOpenChange={setTicketFiltersOpen}>
                    <div className="flex min-w-0 flex-col items-start gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between">
                      <div
                        role="group"
                        aria-label="Ticket Categories"
                        className="flex min-w-0 flex-wrap items-center gap-2"
                      >
                        {TICKET_CATEGORIES.map(({ value, label }) => {
                          let variant: "default" | "outline" = "outline";
                          if (filter.type === value) {
                            variant = "default";
                          }
                          return (
                            <Button
                              key={value}
                              variant={variant}
                              size="sm"
                              className="shrink-0"
                              aria-pressed={filter.type === value}
                              onClick={() => setFilter({ ...filter, type: value })}
                            >
                              {label}
                            </Button>
                          );
                        })}
                      </div>
                      <div
                        role="group"
                        aria-label="Ticket Controls"
                        className="flex max-w-full items-center gap-2 md:ml-auto"
                      >
                        <SheetTrigger asChild>
                          <FilterButton className="shrink-0" aria-label="Filter">
                            Filter
                            {activeTicketFilterCount > 0 && (
                              <Badge
                                variant="neutral"
                                aria-label={`${activeTicketFilterCount} Active Filters`}
                                className="min-w-5 justify-center px-1"
                              >
                                {activeTicketFilterCount}
                              </Badge>
                            )}
                          </FilterButton>
                        </SheetTrigger>
                        <SelectFilter
                          label="Sort By"
                          kind="sort"
                          size="sm"
                          current={ticketSort}
                          clearable={false}
                          options={[
                            { value: "newest", label: "Newest First" },
                            { value: "oldest", label: "Oldest First" },
                            { value: "priority", label: "Highest Priority" },
                          ]}
                          onChange={(value) => {
                            if (value) {
                              setTicketSort(value);
                            }
                          }}
                        />
                      </div>
                    </div>
                    <SheetContent
                      side="bottom"
                      hideClose
                      className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden rounded-t-2xl p-0 data-[state=open]:duration-200 data-[state=closed]:duration-150 motion-reduce:animate-none md:bottom-auto md:left-1/2 md:top-1/2 md:w-[28rem] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl"
                    >
                      <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
                        <SheetTitle>Filter</SheetTitle>
                        <SheetClose asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="control-lg"
                            aria-label="Close Filters"
                          >
                            <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
                          </Button>
                        </SheetClose>
                      </div>
                      <SheetDescription className="sr-only">
                        Filter tickets by status and priority.
                      </SheetDescription>
                      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-5">
                        {[
                          {
                            key: "status",
                            label: "Status",
                            options: [
                              { value: "all", label: "All Statuses" },
                              { value: "open", label: "Open" },
                              { value: "in_progress", label: "In Progress" },
                              { value: "closed", label: "Closed" },
                            ],
                          },
                          {
                            key: "priority",
                            label: "Priority",
                            options: [
                              { value: "all", label: "All Priorities" },
                              { value: "high", label: "High" },
                              { value: "medium", label: "Medium" },
                              { value: "low", label: "Low" },
                            ],
                          },
                        ].map(({ key, label, options }) => {
                          let current = filter.status;
                          if (key === "priority") {
                            current = filter.priority;
                          }
                          return (
                            <fieldset key={key} className="min-w-0">
                              <legend className="mb-3 text-label text-ink">{label}</legend>
                              <div className="flex flex-wrap gap-2">
                                {options.map(({ value, label: optionLabel }) => {
                                  let variant: "default" | "outline" = "outline";
                                  if (current === value) {
                                    variant = "default";
                                  }
                                  return (
                                    <Button
                                      key={value}
                                      variant={variant}
                                      aria-pressed={current === value}
                                      onClick={() =>
                                        setFilter((previous) => ({ ...previous, [key]: value }))
                                      }
                                    >
                                      {optionLabel}
                                    </Button>
                                  );
                                })}
                              </div>
                            </fieldset>
                          );
                        })}
                      </div>
                      <div className="flex shrink-0 items-center gap-3 border-t border-border bg-background p-4">
                        <Button
                          variant="outline"
                          size="lg"
                          className="px-4"
                          disabled={activeTicketFilterCount === 0}
                          onClick={() =>
                            setFilter((previous) => ({
                              ...previous,
                              status: "all",
                              priority: "all",
                            }))
                          }
                        >
                          Clear Filters
                        </Button>
                        <SheetClose asChild>
                          <Button size="lg" className="min-w-0 flex-1 px-4">
                            Show Tickets
                          </Button>
                        </SheetClose>
                      </div>
                    </SheetContent>
                  </Sheet>
                  <div className="relative">
                    <HugeiconsIcon
                      icon={Search01Icon}
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
                    />
                    <Input
                      aria-label="Search Tickets"
                      value={ticketSearch}
                      onChange={(event) => setTicketSearch(event.target.value)}
                      placeholder="Search by ticket, subject, business, or sender"
                      className="pl-9"
                    />
                  </div>
                  <div className="flex flex-1 flex-col">
                    {ticketsLoading && (
                      <ListSkeleton fill label="Loading Tickets" className="min-h-10 p-0 md:p-0" />
                    )}
                    {!ticketsLoading && ticketsError && (
                      <div role="alert" className="flex flex-1 flex-col">
                        <BusinessEmptyState
                          icon={Ticket01Icon}
                          title="Unable To Load Tickets"
                          body={ticketsError}
                        >
                          <Button variant="outline" onClick={fetchTickets}>
                            Retry Tickets
                          </Button>
                        </BusinessEmptyState>
                      </div>
                    )}
                    {!ticketsLoading && !ticketsError && sortedTickets.length === 0 && (
                      <BusinessEmptyState
                        icon={Ticket01Icon}
                        title="No Tickets Found"
                        body={ticketEmptyDescription}
                      >
                        {(hasTicketFilters || ticketSearch.trim()) && (
                          <Button
                            variant="outline"
                            onClick={() => {
                              setTicketSearch("");
                              setFilter({ type: "all", status: "all", priority: "all" });
                            }}
                          >
                            {clearTicketViewLabel}
                          </Button>
                        )}
                      </BusinessEmptyState>
                    )}
                    {!ticketsLoading && !ticketsError && sortedTickets.length > 0 && (
                      <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
                        {sortedTickets.map((ticket) => {
                          const category = ticketCategory(ticket);
                          return (
                            <li key={ticket.id}>
                              <button
                                type="button"
                                className="flex w-full flex-col items-start justify-between gap-1 p-4 text-left transition-colors duration-150 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:flex-row sm:items-center sm:gap-3 sm:py-3"
                                onClick={() => handleViewTicket(ticket.ticketNumber)}
                              >
                                <div className="min-w-0 w-full flex-1 sm:w-auto">
                                  <div className="flex items-center gap-2 sm:flex-wrap">
                                    <h3
                                      className="min-w-0 flex-1 truncate text-body font-medium text-ink sm:flex-initial"
                                      title={ticket.subject}
                                    >
                                      {ticket.subject}
                                    </h3>
                                    {getStatusBadge(ticket.status)}
                                    {getPriorityBadge(ticket.priority)}
                                  </div>
                                  <div className="mt-0.5 flex min-w-0 items-center gap-2">
                                    <p
                                      className="min-w-0 flex-1 truncate text-caption text-ink-subtle"
                                      title={`${ticket.senderName} (${ticket.senderEmail})`}
                                    >
                                      {ticket.businessName || ticket.senderName} ·{" "}
                                      {ticket.ticketNumber} ·{" "}
                                      {category.charAt(0).toUpperCase() + category.slice(1)}
                                    </p>
                                    <time
                                      dateTime={ticket.createdAt}
                                      title={new Date(ticket.createdAt).toLocaleString()}
                                      className="shrink-0 text-caption text-slate-400 sm:hidden"
                                    >
                                      {formatDate(ticket.createdAt)}
                                    </time>
                                  </div>
                                </div>
                                <time
                                  dateTime={ticket.createdAt}
                                  title={new Date(ticket.createdAt).toLocaleString()}
                                  className="hidden shrink-0 text-caption text-slate-400 sm:block"
                                >
                                  {formatDate(ticket.createdAt)}
                                </time>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {section === "customer" && (
            <CustomerManagementAdmin search={searchUsername} onSearchChange={setSearchUsername} />
          )}

          {section === "featured" && <FeaturedRestaurantsManager />}

          {section === "campaigns" && <CampaignTemplatesAdmin />}

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogContent
              className={cn(
                "grid-cols-[minmax(0,1fr)] max-h-[85dvh] overflow-x-hidden overflow-y-auto rounded-2xl text-body text-ink sm:max-w-2xl",
                ticketTab === "messages" &&
                  "h-[85dvh] grid-rows-[auto_minmax(0,1fr)] overflow-hidden max-sm:overflow-hidden sm:h-[min(800px,85dvh)] sm:grid-rows-[auto_minmax(0,1fr)_auto] sm:overflow-hidden",
              )}
            >
              <DialogHeader className="min-w-0 text-left [overflow-wrap:anywhere]">
                <DialogTitle
                  title={selectedTicket?.subject}
                  className={cn("pr-8", ticketTab === "messages" && "max-sm:line-clamp-2")}
                >
                  {selectedTicket?.subject}
                </DialogTitle>
                <DialogDescription>Ticket #{selectedTicket?.ticketNumber}</DialogDescription>
              </DialogHeader>

              {selectedTicket && (
                <Tabs
                  value={ticketTab}
                  onValueChange={setTicketTab}
                  className="flex min-h-0 min-w-0 flex-col"
                >
                  <TabsList
                    className="grid w-full shrink-0 grid-cols-2"
                    aria-label="Ticket Sections"
                  >
                    <TabsTrigger
                      value="details"
                      className="data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=active]:shadow-none"
                    >
                      Details
                    </TabsTrigger>
                    <TabsTrigger
                      value="messages"
                      className="data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=active]:shadow-none"
                    >
                      Messages
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="details" className="mt-4 min-w-0">
                    <section aria-label="Ticket Details" className="min-w-0 space-y-4">
                      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="grid min-w-0 gap-2">
                          <Label htmlFor="ticket-status">Status</Label>
                          <Select
                            value={selectedTicket.status}
                            onValueChange={(value) =>
                              handleUpdateStatus(selectedTicket.ticketNumber, value)
                            }
                          >
                            <SelectTrigger
                              id="ticket-status"
                              className="max-sm:h-8 max-sm:text-body"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="open">Open</SelectItem>
                              <SelectItem value="in_progress">In Progress</SelectItem>
                              <SelectItem value="closed">Closed</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid min-w-0 gap-2">
                          <Label htmlFor="ticket-priority">Priority</Label>
                          <Select
                            value={selectedTicket.priority || "low"}
                            onValueChange={(value) =>
                              handleUpdatePriority(selectedTicket.ticketNumber, value)
                            }
                          >
                            <SelectTrigger
                              id="ticket-priority"
                              className="max-sm:h-8 max-sm:text-body"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="low">Low</SelectItem>
                              <SelectItem value="medium">Medium</SelectItem>
                              <SelectItem value="high">High</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="min-w-0 space-y-2">
                        <Label>Contact Information</Label>
                        <div className="min-w-0 bg-muted p-4 rounded-md space-y-1 [overflow-wrap:anywhere]">
                          <p>
                            <strong>Name:</strong> {selectedTicket.senderName}
                          </p>
                          <p>
                            <strong>Email:</strong> {selectedTicket.senderEmail}
                          </p>
                          {selectedTicket.senderPhone && (
                            <p>
                              <strong>Phone:</strong>{" "}
                              {formatEnteredPhone(selectedTicket.senderPhone)}
                            </p>
                          )}
                          {selectedTicket.businessName && (
                            <p>
                              <strong>Business:</strong> {selectedTicket.businessName}
                            </p>
                          )}
                        </div>
                      </div>

                      {selectedTicket.type === "feedback" && selectedTicket.data && (
                        <div className="min-w-0 space-y-2">
                          <Label>Feedback Details</Label>
                          <div className="min-w-0 bg-muted p-4 rounded-md space-y-1 text-body [overflow-wrap:anywhere]">
                            {selectedTicket.data.feedbackType && (
                              <p>
                                <strong>Type:</strong>{" "}
                                {formatTicketValue(selectedTicket.data.feedbackType)}
                              </p>
                            )}
                            {selectedTicket.data.severity && (
                              <p>
                                <strong>Severity:</strong>{" "}
                                {formatTicketValue(selectedTicket.data.severity)}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </section>
                  </TabsContent>
                  <TabsContent
                    value="messages"
                    forceMount
                    hidden={ticketTab !== "messages"}
                    className="mt-4 min-h-0 min-w-0 flex-1 data-[state=inactive]:hidden"
                  >
                    <TicketConversation
                      active={ticketTab === "messages"}
                      ticketNumber={selectedTicket.ticketNumber}
                      messages={selectedTicket.messages}
                      onRefresh={(ticket) =>
                        setSelectedTicket((current) => {
                          if (current?.ticketNumber === ticket.ticketNumber) {
                            return { ...current, ...ticket };
                          }
                          return current;
                        })
                      }
                    />
                  </TabsContent>
                </Tabs>
              )}

              <DialogFooter className={cn(ticketTab === "messages" && "max-sm:hidden")}>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Close
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </AdminLayout>
  );
};

export default Admin;
