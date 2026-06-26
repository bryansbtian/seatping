import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import FeaturedRestaurantsManager from "@/components/FeaturedRestaurantsManager";
import CampaignTemplatesAdmin from "@/components/CampaignTemplatesAdmin";
import { formatPhone } from "@/lib/phone";

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
  data: any;
  messages: Array<{
    sender: string;
    message: string;
    timestamp: string;
    isTeamResponse: boolean;
  }>;
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
}

interface TicketStats {
  total: number;
  open: number;
  inProgress: number;
  closed: number;
  sales: number;
  feedback: number;
}

interface CustomerLocation {
  address: string;
  displayName?: string | null;
  credits: number;
}

interface CustomerRecord {
  name: string;
  username: string;
  email: string;
  phone: string;
  trial: boolean;
  trialDurationDays: number;
  maxLocations: number;
  baseCredits: number;
  creditsStartedAt: string | null;
  locations: CustomerLocation[];
}

const Admin = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [isLoading, setIsLoading] = useState(false);

  const [searchUsername, setSearchUsername] = useState("");
  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerRecord | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<CustomerRecord | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<TicketStats | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [filter, setFilter] = useState({
    status: "all",
    type: "all",
    priority: "all",
  });
  const [responseForm, setResponseForm] = useState({
    message: "",
    responderName: "",
  });

  const { toast } = useToast();

  useEffect(() => {
    if (isAuthenticated) {
      fetchStats();
      fetchTickets();
    }
  }, [isAuthenticated, filter]);

  useEffect(() => {
    let active = true;
    fetch("/auth/admin/session", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (active && d?.authenticated) setIsAuthenticated(true);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch("/auth/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(loginForm),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setIsAuthenticated(true);
        setLoginForm({ username: "", password: "" });
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
    } catch {
    }
    setIsAuthenticated(false);
  };

  const handleSearchCustomer = async () => {
    const trimmed = searchUsername.trim();
    if (!trimmed) {
      toast({
        title: "Error",
        description: "Please enter a business username",
        variant: "destructive",
      });
      return;
    }

    setIsSearching(true);
    setCustomerError(null);
    setSelectedCustomer(null);
    setIsEditing(false);
    setEditDraft(null);

    try {
      const response = await fetch(
        `/admin/customer/${encodeURIComponent(trimmed)}`,
      );

      if (response.status === 404) {
        setCustomerError("No customer found with this username.");
        return;
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const message = data?.error || "Failed to fetch customer";
        setCustomerError(message);
        toast({
          title: "Error",
          description: message,
          variant: "destructive",
        });
        return;
      }

      const data = await response.json();
      setSelectedCustomer(data.customer);
    } catch (error) {
      const message = "Network error occurred";
      setCustomerError(message);
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const startEditing = () => {
    if (!selectedCustomer) return;
    setEditDraft({
      ...selectedCustomer,
      locations: selectedCustomer.locations.map((l) => ({ ...l })),
    });
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditDraft(null);
  };

  const updateDraftNumber = (
    key: "trialDurationDays" | "maxLocations" | "baseCredits",
    raw: string,
  ) => {
    if (!editDraft) return;
    const parsed = raw === "" ? 0 : parseInt(raw, 10);
    if (Number.isNaN(parsed) || parsed < 0) return;
    setEditDraft({ ...editDraft, [key]: parsed });
  };

  const updateDraftBoolean = (key: "trial", value: boolean) => {
    if (!editDraft) return;
    setEditDraft({ ...editDraft, [key]: value });
  };

  const updateDraftString = (
    key: "name" | "username" | "email" | "phone",
    value: string,
  ) => {
    if (!editDraft) return;
    setEditDraft({ ...editDraft, [key]: value });
  };

  const updateDraftLocation = (index: number, key: "credits", raw: string) => {
    if (!editDraft) return;
    const parsed = raw === "" ? 0 : parseInt(raw, 10);
    if (Number.isNaN(parsed) || parsed < 0) return;
    const next = editDraft.locations.map((loc, i) =>
      i === index ? { ...loc, [key]: parsed } : loc,
    );
    setEditDraft({ ...editDraft, locations: next });
  };

  const updateDraftLocationAddress = (index: number, value: string) => {
    if (!editDraft) return;
    const next = editDraft.locations.map((loc, i) =>
      i === index ? { ...loc, address: value } : loc,
    );
    setEditDraft({ ...editDraft, locations: next });
  };

  const handleSaveCustomer = async () => {
    if (!editDraft || !selectedCustomer) return;

    setIsSaving(true);
    try {
      const response = await fetch(
        `/admin/customer/${encodeURIComponent(selectedCustomer.username)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: editDraft.name,
            username: editDraft.username,
            email: editDraft.email,
            phone: editDraft.phone,
            trial: editDraft.trial,
            trialDurationDays: editDraft.trialDurationDays,
            maxLocations: editDraft.maxLocations,
            baseCredits: editDraft.baseCredits,
            locations: editDraft.locations.map((l) => ({
              address: l.address,
              credits: l.credits,
            })),
          }),
        },
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast({
          title: "Error",
          description: data?.error || "Failed to update customer",
          variant: "destructive",
        });
        return;
      }

      const data = await response.json();
      setSelectedCustomer(data.customer);
      setSearchUsername(data.customer.username);
      setIsEditing(false);
      setEditDraft(null);
      setIsConfirmOpen(false);
      toast({
        title: "Success",
        description: "Customer updated successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Network error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const formatBoolean = (value: boolean) => (value ? "Yes" : "No");

  const formatDate = (value: string | null) => {
    if (!value) return "Not started";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "Not started";
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const fetchStats = async () => {
    try {
      const response = await fetch("/tickets/stats");
      if (response.ok) {
        const data = await response.json();
        setStats(data.stats);
      }
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  const fetchTickets = async () => {
    try {
      const params = new URLSearchParams();
      if (filter.status !== "all") params.append("status", filter.status);
      if (filter.type !== "all") params.append("type", filter.type);
      if (filter.priority !== "all") params.append("priority", filter.priority);

      const response = await fetch(`/tickets?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setTickets(data.tickets);
      }
    } catch (error) {
      console.error("Error fetching tickets:", error);
    }
  };

  const handleViewTicket = async (ticketNumber: string) => {
    try {
      const response = await fetch(`/tickets/${ticketNumber}`);
      if (response.ok) {
        const data = await response.json();
        setSelectedTicket(data.ticket);
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

  const handleUpdatePriority = async (
    ticketNumber: string,
    priority: string,
  ) => {
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

  const handleRespond = async () => {
    if (
      !selectedTicket ||
      !responseForm.message ||
      !responseForm.responderName
    ) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(
        `/tickets/${selectedTicket.ticketNumber}/respond`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(responseForm),
        },
      );

      if (response.ok) {
        toast({
          title: "Success",
          description: "Response sent successfully",
        });
        setResponseForm({ message: "", responderName: "" });
        fetchTickets();
        const data = await response.json();
        setSelectedTicket(data.ticket);
      } else {
        const error = await response.json();
        toast({
          title: "Error",
          description: error.error || "Failed to send response",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Network error occurred",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<
      string,
      "default" | "secondary" | "destructive" | "outline"
    > = {
      open: "destructive",
      in_progress: "default",
      closed: "secondary",
    };
    return (
      <Badge variant={variants[status] || "outline"}>
        {status.replace("_", " ").toUpperCase()}
      </Badge>
    );
  };

  const getPriorityBadge = (priority?: string) => {
    if (!priority) return null;
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      high: "destructive",
      medium: "default",
      low: "secondary",
    };
    return (
      <Badge variant={variants[priority] || "secondary"}>
        {priority.toUpperCase()}
      </Badge>
    );
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl text-center">Admin Access</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  value={loginForm.username}
                  onChange={(e) =>
                    setLoginForm({ ...loginForm, username: e.target.value })
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={loginForm.password}
                  onChange={(e) =>
                    setLoginForm({ ...loginForm, password: e.target.value })
                  }
                  required
                />
              </div>
              <Button type="submit" className="w-full">
                Log In
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-semibold">Admin Dashboard</h1>
            <p className="text-muted-foreground">
              Manage customer accounts and support tickets
            </p>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            Log Out
          </Button>
        </div>

        <Tabs defaultValue="tickets" className="w-full">
          <TabsList className="grid w-full grid-cols-1 h-auto sm:grid-cols-4">
            <TabsTrigger value="tickets">Ticket Management</TabsTrigger>
            <TabsTrigger value="customer">Customer Management</TabsTrigger>
            <TabsTrigger value="featured">Featured Restaurants</TabsTrigger>
            <TabsTrigger value="campaigns">Campaign Templates</TabsTrigger>
          </TabsList>

          <TabsContent value="tickets" className="space-y-6 mt-6">
            {stats && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Total
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold">{stats.total}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Open
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold text-red-600">
                      {stats.open}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      In Progress
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold text-indigo-600">
                      {stats.inProgress}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Closed
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold text-green-600">
                      {stats.closed}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Sales
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold">{stats.sales}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Feedback
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold">
                      {stats.feedback}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            <Card>
              <CardHeader>
                {}
                <CardTitle className="text-lg">Filters</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-4">
                <div className="w-40">
                  <Select
                    value={filter.status}
                    onValueChange={(value) =>
                      setFilter({ ...filter, status: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-40">
                  <Select
                    value={filter.type}
                    onValueChange={(value) =>
                      setFilter({ ...filter, type: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="sales">Sales</SelectItem>
                      <SelectItem value="feedback">Feedback</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-40">
                  <Select
                    value={filter.priority}
                    onValueChange={(value) =>
                      setFilter({ ...filter, priority: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Priorities</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              {tickets.map((ticket) => (
                <Card
                  key={ticket.id}
                  className="cursor-pointer hover:bg-accent"
                  onClick={() => handleViewTicket(ticket.ticketNumber)}
                >
                  <CardContent className="p-6">
                    <div className="flex justify-between items-start">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-lg">
                            {ticket.subject}
                          </h3>
                          {getStatusBadge(ticket.status)}
                          {getPriorityBadge(ticket.priority)}
                          <Badge variant="outline">
                            {ticket.type.toUpperCase()}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {ticket.ticketNumber} • From: {ticket.senderName} (
                          {ticket.senderEmail})
                          {ticket.businessName && ` • ${ticket.businessName}`}
                        </p>
                        <p className="text-sm">
                          Created: {new Date(ticket.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="customer" className="mt-6 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Customer Management</CardTitle>
                <CardDescription>
                  Search and view business account details
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="searchUsername">Business Username</Label>
                  <Input
                    id="searchUsername"
                    type="text"
                    value={searchUsername}
                    onChange={(e) => setSearchUsername(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleSearchCustomer();
                      }
                    }}
                    placeholder="Enter business username"
                  />
                </div>

                <Button
                  className="w-full sm:w-auto"
                  onClick={handleSearchCustomer}
                  disabled={isSearching}
                >
                  {isSearching ? "Searching..." : "Search Customer"}
                </Button>
              </CardContent>
            </Card>

            {customerError && !isSearching && (
              <Card>
                <CardContent className="p-6 text-center text-muted-foreground">
                  {customerError}
                </CardContent>
              </Card>
            )}

            {selectedCustomer && !isSearching && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Viewing Customer:{" "}
                      <span className="font-medium text-foreground">
                        {selectedCustomer.username}
                      </span>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {!isEditing ? (
                      <Button onClick={startEditing}>Edit Customer</Button>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          onClick={cancelEditing}
                          disabled={isSaving}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={() => setIsConfirmOpen(true)}
                          disabled={isSaving}
                        >
                          {isSaving ? "Saving..." : "Save Changes"}
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">
                      Account Information
                    </CardTitle>
                    <CardDescription>
                      Business contact and identity details
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-muted-foreground">Name</Label>
                        {isEditing && editDraft ? (
                          <Input
                            value={editDraft.name}
                            onChange={(e) =>
                              updateDraftString("name", e.target.value)
                            }
                          />
                        ) : (
                          <p className="text-sm md:text-base font-medium break-words">
                            {selectedCustomer.name || "—"}
                          </p>
                        )}
                      </div>
                      <div>
                        <Label className="text-muted-foreground">
                          Username
                        </Label>
                        {isEditing && editDraft ? (
                          <Input
                            value={editDraft.username}
                            onChange={(e) =>
                              updateDraftString("username", e.target.value)
                            }
                          />
                        ) : (
                          <p className="text-sm md:text-base font-medium break-words">
                            {selectedCustomer.username || "—"}
                          </p>
                        )}
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Email</Label>
                        {isEditing && editDraft ? (
                          <Input
                            type="email"
                            value={editDraft.email}
                            onChange={(e) =>
                              updateDraftString("email", e.target.value)
                            }
                          />
                        ) : (
                          <p className="text-sm md:text-base font-medium break-words">
                            {selectedCustomer.email || "—"}
                          </p>
                        )}
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Phone</Label>
                        {isEditing && editDraft ? (
                          <Input
                            value={editDraft.phone}
                            onChange={(e) =>
                              updateDraftString("phone", e.target.value)
                            }
                          />
                        ) : (
                          <p className="text-sm md:text-base font-medium break-words">
                            {formatPhone(selectedCustomer.phone) || "—"}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Trial & Access</CardTitle>
                    <CardDescription>
                      Turn Trial off to activate paid access. Credits start
                      then and refill monthly
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <Label className="text-muted-foreground">Trial</Label>
                        {isEditing && editDraft ? (
                          <div className="flex items-center gap-3 pt-1">
                            <Switch
                              checked={editDraft.trial}
                              onCheckedChange={(v) =>
                                updateDraftBoolean("trial", v)
                              }
                            />
                            <span className="text-sm">
                              {formatBoolean(editDraft.trial)}
                            </span>
                          </div>
                        ) : (
                          <p className="text-sm md:text-base font-medium">
                            {formatBoolean(selectedCustomer.trial)}
                          </p>
                        )}
                      </div>
                      <div>
                        <Label className="text-muted-foreground">
                          Trial Duration (Days)
                        </Label>
                        {isEditing && editDraft ? (
                          <Input
                            type="number"
                            min={0}
                            value={editDraft.trialDurationDays}
                            onChange={(e) =>
                              updateDraftNumber(
                                "trialDurationDays",
                                e.target.value,
                              )
                            }
                          />
                        ) : (
                          <p className="text-sm md:text-base font-medium">
                            {selectedCustomer.trialDurationDays ?? 0}
                          </p>
                        )}
                      </div>
                      <div>
                        <Label className="text-muted-foreground">
                          Max Locations
                        </Label>
                        {isEditing && editDraft ? (
                          <Input
                            type="number"
                            min={0}
                            value={editDraft.maxLocations}
                            onChange={(e) =>
                              updateDraftNumber("maxLocations", e.target.value)
                            }
                          />
                        ) : (
                          <p className="text-sm md:text-base font-medium">
                            {selectedCustomer.maxLocations ?? 0}
                          </p>
                        )}
                      </div>
                      <div>
                        <Label className="text-muted-foreground">
                          Base Credits
                        </Label>
                        {isEditing && editDraft ? (
                          <Input
                            type="number"
                            min={0}
                            value={editDraft.baseCredits}
                            onChange={(e) =>
                              updateDraftNumber("baseCredits", e.target.value)
                            }
                          />
                        ) : (
                          <p className="text-sm md:text-base font-medium">
                            {selectedCustomer.baseCredits ?? 0}
                          </p>
                        )}
                      </div>
                      <div>
                        <Label className="text-muted-foreground">
                          Credits Cycle Started
                        </Label>
                        <p className="text-sm md:text-base font-medium">
                          {selectedCustomer.creditsStartedAt
                            ? formatDate(selectedCustomer.creditsStartedAt)
                            : "—"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Set automatically when Trial is turned off.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Locations</CardTitle>
                    <CardDescription>
                      {selectedCustomer.locations.length === 0
                        ? "No locations registered"
                        : `${selectedCustomer.locations.length} location${selectedCustomer.locations.length === 1 ? "" : "s"}`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {selectedCustomer.locations.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        This business has not added any locations yet.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {(isEditing && editDraft
                          ? editDraft.locations
                          : selectedCustomer.locations
                        ).map((location, idx) => (
                          <div
                            key={idx}
                            className="rounded-lg border bg-muted/30 p-4 space-y-3"
                          >
                            <div>
                              <Label className="text-muted-foreground">
                                Address
                              </Label>
                              {isEditing && editDraft ? (
                                <Input
                                  value={location.address}
                                  onChange={(e) =>
                                    updateDraftLocationAddress(
                                      idx,
                                      e.target.value,
                                    )
                                  }
                                />
                              ) : (
                                <p className="text-sm md:text-base font-medium break-words">
                                  {location.address || "—"}
                                </p>
                              )}
                            </div>
                            <div>
                              <Label className="text-muted-foreground">
                                Credits
                              </Label>
                              {isEditing && editDraft ? (
                                <Input
                                  type="number"
                                  min={0}
                                  value={location.credits}
                                  onChange={(e) =>
                                    updateDraftLocation(
                                      idx,
                                      "credits",
                                      e.target.value,
                                    )
                                  }
                                />
                              ) : (
                                <p className="text-sm md:text-base font-medium">
                                  {location.credits}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirm changes</AlertDialogTitle>
                  <AlertDialogDescription>
                    {editDraft && selectedCustomer && (
                      <>
                        Apply these changes to{" "}
                        <span className="font-medium">
                          {selectedCustomer.username}
                        </span>
                        ?
                        <br />
                        <br />
                        Name: {editDraft.name}
                        <br />
                        Username: {editDraft.username}
                        {editDraft.username !== selectedCustomer.username && (
                          <span className="text-amber-600">
                            {" "}
                            (rename — must be unique)
                          </span>
                        )}
                        <br />
                        Email: {editDraft.email}
                        {editDraft.email !== selectedCustomer.email && (
                          <span className="text-amber-600">
                            {" "}
                            (changed — must be unique)
                          </span>
                        )}
                        <br />
                        Phone: {editDraft.phone}
                        <br />
                        <br />
                        Trial: {formatBoolean(editDraft.trial)}
                        <br />
                        Trial Duration: {editDraft.trialDurationDays} days
                        <br />
                        Max Locations: {editDraft.maxLocations}
                        <br />
                        Base Credits: {editDraft.baseCredits}
                        {editDraft.trial !== selectedCustomer.trial && (
                          <>
                            <br />
                            <span className="text-amber-600">
                              {editDraft.trial
                                ? "Trial ON — credits cycle will be cleared"
                                : "Trial OFF — credits cycle starts now, refills next month"}
                            </span>
                          </>
                        )}
                        {editDraft.locations.length > 0 && (
                          <>
                            <br />
                            <br />
                            Location addresses and per-location credits will
                            also be updated.
                          </>
                        )}
                      </>
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isSaving}>
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleSaveCustomer}
                    disabled={isSaving}
                  >
                    {isSaving ? "Saving..." : "Confirm"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </TabsContent>

          <TabsContent value="featured" className="mt-6">
            <FeaturedRestaurantsManager />
          </TabsContent>

          <TabsContent value="campaigns" className="mt-6">
            <CampaignTemplatesAdmin />
          </TabsContent>
        </Tabs>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedTicket?.subject}</DialogTitle>
              <DialogDescription>
                Ticket #{selectedTicket?.ticketNumber}
              </DialogDescription>
            </DialogHeader>

            {selectedTicket && (
              <Tabs defaultValue="details" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="details">Details</TabsTrigger>
                  <TabsTrigger value="messages">Messages</TabsTrigger>
                  <TabsTrigger value="respond">Respond</TabsTrigger>
                </TabsList>

                <TabsContent value="details" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Status</Label>
                      <Select
                        value={selectedTicket.status}
                        onValueChange={(value) =>
                          handleUpdateStatus(selectedTicket.ticketNumber, value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">Open</SelectItem>
                          <SelectItem value="in_progress">
                            In Progress
                          </SelectItem>
                          <SelectItem value="closed">Closed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Priority</Label>
                      <Select
                        value={selectedTicket.priority || "low"}
                        onValueChange={(value) =>
                          handleUpdatePriority(
                            selectedTicket.ticketNumber,
                            value,
                          )
                        }
                      >
                        <SelectTrigger>
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

                  <div className="space-y-2">
                    <Label>Contact Information</Label>
                    <div className="bg-muted p-4 rounded-md space-y-1">
                      <p>
                        <strong>Name:</strong> {selectedTicket.senderName}
                      </p>
                      <p>
                        <strong>Email:</strong> {selectedTicket.senderEmail}
                      </p>
                      {selectedTicket.senderPhone && (
                        <p>
                          <strong>Phone:</strong> {selectedTicket.senderPhone}
                        </p>
                      )}
                      {selectedTicket.businessName && (
                        <p>
                          <strong>Business:</strong>{" "}
                          {selectedTicket.businessName}
                        </p>
                      )}
                    </div>
                  </div>

                  {selectedTicket.type === "sales" && selectedTicket.data && (
                    <div className="space-y-2">
                      <Label>Sales Details</Label>
                      <div className="bg-muted p-4 rounded-md space-y-1 text-sm">
                        {selectedTicket.data.businessWebsite && (
                          <p>
                            <strong>Website:</strong>{" "}
                            {selectedTicket.data.businessWebsite}
                          </p>
                        )}
                        {selectedTicket.data.locations && (
                          <p>
                            <strong>Locations:</strong>{" "}
                            {selectedTicket.data.locations}
                          </p>
                        )}
                        {selectedTicket.data.smsPerMonth && (
                          <p>
                            <strong>SMS/Month:</strong>{" "}
                            {selectedTicket.data.smsPerMonth}
                          </p>
                        )}
                        {selectedTicket.data.customersPerDay && (
                          <p>
                            <strong>Customers/Day:</strong>{" "}
                            {selectedTicket.data.customersPerDay}
                          </p>
                        )}
                        {selectedTicket.data.useCase && (
                          <p>
                            <strong>Use Case:</strong>{" "}
                            {selectedTicket.data.useCase}
                          </p>
                        )}
                        {selectedTicket.data.budget && (
                          <p>
                            <strong>Budget:</strong>{" "}
                            {selectedTicket.data.budget}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {selectedTicket.type === "feedback" &&
                    selectedTicket.data && (
                      <div className="space-y-2">
                        <Label>Feedback Details</Label>
                        <div className="bg-muted p-4 rounded-md space-y-1 text-sm">
                          {selectedTicket.data.feedbackType && (
                            <p>
                              <strong>Type:</strong>{" "}
                              {selectedTicket.data.feedbackType}
                            </p>
                          )}
                          {selectedTicket.data.severity && (
                            <p>
                              <strong>Severity:</strong>{" "}
                              {selectedTicket.data.severity}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                </TabsContent>

                <TabsContent value="messages" className="space-y-4">
                  <div className="space-y-4">
                    {selectedTicket.messages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`p-4 rounded-md ${
                          msg.isTeamResponse
                            ? "bg-indigo-50 border-l-4 border-indigo-500"
                            : "bg-muted"
                        }`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <p className="font-semibold">{msg.sender}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(msg.timestamp).toLocaleString()}
                          </p>
                        </div>
                        <p className="whitespace-pre-wrap">{msg.message}</p>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="respond" className="space-y-4">
                  <div className="space-y-4">
                    <div>
                      <Label>Your Name</Label>
                      <Input
                        value={responseForm.responderName}
                        onChange={(e) =>
                          setResponseForm({
                            ...responseForm,
                            responderName: e.target.value,
                          })
                        }
                        placeholder="Enter your name"
                      />
                    </div>
                    <div>
                      <Label>Response Message</Label>
                      <Textarea
                        value={responseForm.message}
                        onChange={(e) =>
                          setResponseForm({
                            ...responseForm,
                            message: e.target.value,
                          })
                        }
                        placeholder="Type your response here..."
                        rows={8}
                      />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Close
              </Button>
              {selectedTicket && (
                <Button onClick={handleRespond} disabled={isLoading}>
                  {isLoading ? "Sending..." : "Send Response"}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default Admin;
