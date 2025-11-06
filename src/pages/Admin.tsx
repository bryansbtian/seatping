import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

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

const Admin = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [updateForm, setUpdateForm] = useState({
    businessUsername: "",
    customerCredits: "",
    smsCredits: ""
  });
  const [isLoading, setIsLoading] = useState(false);

  // Ticket management state
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<TicketStats | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [filter, setFilter] = useState({ status: "all", type: "all", priority: "all" });
  const [responseForm, setResponseForm] = useState({ message: "", responderName: "" });

  const { toast } = useToast();

  useEffect(() => {
    if (isAuthenticated) {
      fetchStats();
      fetchTickets();
    }
  }, [isAuthenticated, filter]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();

    if (loginForm.username === "adminSeatPing" && loginForm.password === "seatping2025@") {
      setIsAuthenticated(true);
      toast({
        title: "Success",
        description: "Admin access granted",
      });
    } else {
      toast({
        title: "Error",
        description: "Invalid credentials",
        variant: "destructive",
      });
    }
  };

  const handleUpdate = async () => {
    if (!updateForm.businessUsername || !updateForm.customerCredits || !updateForm.smsCredits) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    
    try {
      const response = await fetch("/admin/update-credits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: updateForm.businessUsername,
          baseCustomerCredits: parseInt(updateForm.customerCredits),
          baseSMSCredits: parseInt(updateForm.smsCredits),
        }),
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: "Business credits updated successfully",
        });
        setUpdateForm({
          businessUsername: "",
          customerCredits: "",
          smsCredits: ""
        });
      } else {
        const error = await response.text();
        toast({
          title: "Error",
          description: error || "Failed to update credits",
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

  // Ticket Management Functions
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

  const handleRespond = async () => {
    if (!selectedTicket || !responseForm.message || !responseForm.responderName) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/tickets/${selectedTicket.ticketNumber}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(responseForm),
      });

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
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      open: "destructive",
      in_progress: "default",
      closed: "secondary",
    };
    return <Badge variant={variants[status] || "outline"}>{status.replace("_", " ").toUpperCase()}</Badge>;
  };

  const getPriorityBadge = (priority?: string) => {
    if (!priority) return null;
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      high: "destructive",
      medium: "default",
      low: "secondary",
    };
    return <Badge variant={variants[priority] || "secondary"}>{priority.toUpperCase()}</Badge>;
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
                Login
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
            <p className="text-muted-foreground">Manage business credits and support tickets</p>
          </div>
          <Button variant="outline" onClick={() => setIsAuthenticated(false)}>
            Logout
          </Button>
        </div>

        <Tabs defaultValue="tickets" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="tickets">Ticket Management</TabsTrigger>
            <TabsTrigger value="credits">Credits Management</TabsTrigger>
          </TabsList>

          <TabsContent value="tickets" className="space-y-6 mt-6">
            {stats && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold">{stats.total}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Open</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold text-red-600">{stats.open}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">In Progress</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold text-indigo-600">{stats.inProgress}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Closed</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold text-green-600">{stats.closed}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Sales</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold">{stats.sales}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Feedback</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold">{stats.feedback}</div>
                  </CardContent>
                </Card>
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Filters</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-4">
                <div className="w-40">
                  <Select value={filter.status} onValueChange={(value) => setFilter({ ...filter, status: value })}>
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
                  <Select value={filter.type} onValueChange={(value) => setFilter({ ...filter, type: value })}>
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
                  <Select value={filter.priority} onValueChange={(value) => setFilter({ ...filter, priority: value })}>
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
                <Card key={ticket.id} className="cursor-pointer hover:bg-accent" onClick={() => handleViewTicket(ticket.ticketNumber)}>
                  <CardContent className="p-6">
                    <div className="flex justify-between items-start">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-lg">{ticket.subject}</h3>
                          {getStatusBadge(ticket.status)}
                          {getPriorityBadge(ticket.priority)}
                          <Badge variant="outline">{ticket.type.toUpperCase()}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {ticket.ticketNumber} • From: {ticket.senderName} ({ticket.senderEmail})
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

          <TabsContent value="credits" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">Update Business Credits</CardTitle>
                <p className="text-muted-foreground">Manage customer and SMS credits for businesses</p>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="businessUsername">Business Username</Label>
                  <Input
                    id="businessUsername"
                    type="text"
                    value={updateForm.businessUsername}
                    onChange={(e) =>
                      setUpdateForm({ ...updateForm, businessUsername: e.target.value })
                    }
                    placeholder="Enter business username"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="customerCredits">New Customer Credits Base</Label>
                  <Input
                    id="customerCredits"
                    type="number"
                    value={updateForm.customerCredits}
                    onChange={(e) =>
                      setUpdateForm({ ...updateForm, customerCredits: e.target.value })
                    }
                    placeholder="Enter customer credits"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="smsCredits">SMS Credits Base</Label>
                  <Input
                    id="smsCredits"
                    type="number"
                    value={updateForm.smsCredits}
                    onChange={(e) =>
                      setUpdateForm({ ...updateForm, smsCredits: e.target.value })
                    }
                    placeholder="Enter SMS credits"
                  />
                </div>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button className="w-full" disabled={isLoading}>
                      {isLoading ? "Updating..." : "Update Credits"}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Confirm Update</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to update the credits for business "{updateForm.businessUsername}"?
                        <br />
                        <br />
                        Customer Credits: {updateForm.customerCredits}
                        <br />
                        SMS Credits: {updateForm.smsCredits}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleUpdate}>
                        Confirm Update
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedTicket?.subject}</DialogTitle>
              <DialogDescription>Ticket #{selectedTicket?.ticketNumber}</DialogDescription>
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
                      <Select value={selectedTicket.status} onValueChange={(value) => handleUpdateStatus(selectedTicket.ticketNumber, value)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">Open</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="closed">Closed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Priority</Label>
                      <Select value={selectedTicket.priority || "low"} onValueChange={(value) => handleUpdatePriority(selectedTicket.ticketNumber, value)}>
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
                      <p><strong>Name:</strong> {selectedTicket.senderName}</p>
                      <p><strong>Email:</strong> {selectedTicket.senderEmail}</p>
                      {selectedTicket.senderPhone && <p><strong>Phone:</strong> {selectedTicket.senderPhone}</p>}
                      {selectedTicket.businessName && <p><strong>Business:</strong> {selectedTicket.businessName}</p>}
                    </div>
                  </div>

                  {selectedTicket.type === "sales" && selectedTicket.data && (
                    <div className="space-y-2">
                      <Label>Sales Details</Label>
                      <div className="bg-muted p-4 rounded-md space-y-1 text-sm">
                        {selectedTicket.data.businessWebsite && <p><strong>Website:</strong> {selectedTicket.data.businessWebsite}</p>}
                        {selectedTicket.data.locations && <p><strong>Locations:</strong> {selectedTicket.data.locations}</p>}
                        {selectedTicket.data.smsPerMonth && <p><strong>SMS/Month:</strong> {selectedTicket.data.smsPerMonth}</p>}
                        {selectedTicket.data.customersPerDay && <p><strong>Customers/Day:</strong> {selectedTicket.data.customersPerDay}</p>}
                        {selectedTicket.data.useCase && <p><strong>Use Case:</strong> {selectedTicket.data.useCase}</p>}
                        {selectedTicket.data.budget && <p><strong>Budget:</strong> {selectedTicket.data.budget}</p>}
                      </div>
                    </div>
                  )}

                  {selectedTicket.type === "feedback" && selectedTicket.data && (
                    <div className="space-y-2">
                      <Label>Feedback Details</Label>
                      <div className="bg-muted p-4 rounded-md space-y-1 text-sm">
                        {selectedTicket.data.feedbackType && <p><strong>Type:</strong> {selectedTicket.data.feedbackType}</p>}
                        {selectedTicket.data.severity && <p><strong>Severity:</strong> {selectedTicket.data.severity}</p>}
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
                          msg.isTeamResponse ? "bg-indigo-50 border-l-4 border-indigo-500" : "bg-muted"
                        }`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <p className="font-semibold">{msg.sender}</p>
                          <p className="text-xs text-muted-foreground">{new Date(msg.timestamp).toLocaleString()}</p>
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
                        onChange={(e) => setResponseForm({ ...responseForm, responderName: e.target.value })}
                        placeholder="Enter your name"
                      />
                    </div>
                    <div>
                      <Label>Response Message</Label>
                      <Textarea
                        value={responseForm.message}
                        onChange={(e) => setResponseForm({ ...responseForm, message: e.target.value })}
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

