import Footer from "@/components/Footer";
import BusinessHeader from "@/components/BusinessHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

const BusinessDashboard = () => {
  const [me, setMe] = useState<any | null>(null);
  const [selectedLocationIndex, setSelectedLocationIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const locations = (me?.locations as any[]) || [];
  const maxLocations = me?.maxLocations ?? 1;
  const onTrial = me?.trial ?? true;
  const { toast } = useToast();

  // Get current location and queue
  const currentLocation = locations[selectedLocationIndex];
  const queueData = currentLocation?.queue || [];
  
  // Calculate real-time statistics
  const todayStats = {
    totalServed: 0, // This could be enhanced to track served customers
    currentQueue: queueData.length,
    avgWaitTime: 15, // This could be calculated from actual data
    successRate: 100, // This could be calculated from actual data
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await api("/auth/me");
        setMe(res.user);
      } catch {}
    })();
  }, []);

  // Auto-refresh queue data every 10 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await api("/auth/me");
        setMe(res.user);
      } catch {}
    }, 10000); // Refresh every 10 seconds

    return () => clearInterval(interval);
  }, []);

  // Function to admit a customer (remove from queue)
  const admitCustomer = async (customerIndex: number) => {
    if (!currentLocation) return;
    
    setLoading(true);
    try {
      const updatedQueue = [...queueData];
      const admittedCustomer = updatedQueue.splice(customerIndex, 1)[0];
      
      // Update the locations array with the new queue
      const updatedLocations = [...locations];
      updatedLocations[selectedLocationIndex] = {
        ...currentLocation,
        queue: updatedQueue
      };

      // Update the user data
      const updated = await api("/auth/me", {
        method: "PUT",
        body: JSON.stringify({
          locations: updatedLocations
        }),
      });
      
      setMe(updated.user);
      
      toast({
        title: "Customer admitted",
        description: `${admittedCustomer.firstName} ${admittedCustomer.lastName} has been admitted.`,
      });
    } catch (error: any) {
      toast({
        title: "Failed to admit customer",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Function to remove a customer from queue (without admitting)
  const removeCustomer = async (customerIndex: number) => {
    if (!currentLocation) return;
    
    setLoading(true);
    try {
      const updatedQueue = [...queueData];
      const removedCustomer = updatedQueue.splice(customerIndex, 1)[0];
      
      // Update the locations array with the new queue
      const updatedLocations = [...locations];
      updatedLocations[selectedLocationIndex] = {
        ...currentLocation,
        queue: updatedQueue
      };

      // Update the user data
      const updated = await api("/auth/me", {
        method: "PUT",
        body: JSON.stringify({
          locations: updatedLocations
        }),
      });
      
      setMe(updated.user);
      
      toast({
        title: "Customer removed",
        description: `${removedCustomer.firstName} ${removedCustomer.lastName} has been removed from the queue.`,
      });
    } catch (error: any) {
      toast({
        title: "Failed to remove customer",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Format time since customer joined
  const formatTimeSince = (joinedAt: string) => {
    const joined = new Date(joinedAt);
    const now = new Date();
    const diffMs = now.getTime() - joined.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    return `${diffHours}h ${diffMins % 60}m ago`;
  };

  return (
    <>
      <BusinessHeader />
      <div className="min-h-screen pt-20 bg-gradient-to-br from-primary/5 via-background to-success/5">
        <div className="container mx-auto px-4 py-8">
          {onTrial && (
            <div className="mb-6">
              <div className="rounded-md bg-primary/10 border p-4 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">
                    You're on a free trial!
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {me?.trialDurationDays ?? 7} days total trial
                  </div>
                </div>
                <Button size="sm" variant="success">
                  Upgrade to Full Access
                </Button>
              </div>
            </div>
          )}

          {/* Locations dropdown + add */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {locations.length > 0 ? (
              <>
                <select
                  className="border rounded px-3 py-2 min-w-56"
                  // if the current index is out of range (e.g., after a delete), fall back to 0
                  value={
                    selectedLocationIndex >= 0 &&
                    selectedLocationIndex < locations.length
                      ? selectedLocationIndex
                      : 0
                  }
                  onChange={(e) =>
                    setSelectedLocationIndex(Number(e.target.value))
                  }
                >
                  {/* Optional: show a non-selectable label at the top */}
                  <option disabled>Choose a location…</option>
                  {locations.map((loc, idx) => (
                    <option key={idx} value={idx}>
                      {loc?.address || `Location ${idx + 1}`}
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  onClick={async () => {
                    if (locations.length >= maxLocations) {
                      toast({
                        title: "Limit reached",
                        description: `You have reached the maximum locations (${maxLocations}).`,
                        variant: "destructive",
                      });
                      return;
                    }
                    const address = prompt(
                      "Enter new location address:"
                    )?.trim();
                    if (!address) return;
                    try {
                      const updated = await api("/auth/locations", {
                        method: "POST",
                        body: JSON.stringify({ address }),
                      });
                      setMe(updated.user);
                      setSelectedLocationIndex(
                        updated.user.locations.length - 1
                      );
                    } catch (e: any) {
                      toast({
                        title: "Failed to add location",
                        description: e?.message || "Please try again.",
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  Add Location
                </Button>
              </>
            ) : (
              <>
                <div className="text-sm text-muted-foreground">
                  No locations yet. Add your first one:
                </div>
                <Button
                  variant="outline"
                  onClick={async () => {
                    if (locations.length >= maxLocations) {
                      toast({
                        title: "Limit reached",
                        description: `You have reached the maximum locations (${maxLocations}).`,
                        variant: "destructive",
                      });
                      return;
                    }
                    const address = prompt(
                      "Enter new location address:"
                    )?.trim();
                    if (!address) return;
                    try {
                      const updated = await api("/auth/locations", {
                        method: "POST",
                        body: JSON.stringify({ address }),
                      });
                      setMe(updated.user);
                      setSelectedLocationIndex(
                        updated.user.locations.length - 1
                      );
                    } catch (e: any) {
                      toast({
                        title: "Failed to add location",
                        description: e?.message || "Please try again.",
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  Add Location
                </Button>
              </>
            )}
          </div>

          <Card className="mb-6 border-0 shadow-xl">
            <CardHeader className="flex items-center justify-between flex-row">
              <div>
                <CardTitle>100% retention</CardTitle>
                <CardDescription>
                  Set average ticket value for ROI insights
                </CardDescription>
              </div>
              <Button variant="outline">Settings</Button>
            </CardHeader>
          </Card>

          <Card className="mb-8 border-0 shadow-xl">
            <CardHeader className="flex items-center justify-between flex-row">
              <div>
                <CardTitle>Your Optimization Journey</CardTitle>
                <CardDescription>20% complete</CardDescription>
              </div>
              <Button variant="outline">Settings</Button>
            </CardHeader>
            <CardContent>
              <div className="h-2 w-full bg-muted rounded">
                <div
                  className="h-2 bg-primary rounded"
                  style={{ width: "20%" }}
                />
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                Next milestone (+10%): Set your average ticket value in Settings
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            <Card className="shadow-lg border-0">
              <CardHeader className="pb-2">
                <CardDescription>Currently Waiting</CardDescription>
                <CardTitle className="text-2xl">{todayStats.currentQueue}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="shadow-lg border-0">
              <CardHeader className="pb-2">
                <CardDescription>Average Wait Time</CardDescription>
                <CardTitle className="text-2xl">
                  {todayStats.avgWaitTime}m
                </CardTitle>
              </CardHeader>
            </Card>
            <Card className="shadow-lg border-0">
              <CardHeader className="pb-2">
                <CardDescription>Served Today</CardDescription>
                <CardTitle className="text-2xl">
                  {todayStats.totalServed}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card className="shadow-lg border-0">
              <CardHeader className="pb-2">
                <CardDescription>Success Rate</CardDescription>
                <CardTitle className="text-2xl">
                  {todayStats.successRate}%
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card className="shadow-2xl border-0">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Queue Management{" "}
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        const res = await api("/auth/me");
                        setMe(res.user);
                        toast({
                          title: "Queue refreshed",
                          description: "Queue data has been updated.",
                        });
                      } catch (error: any) {
                        toast({
                          title: "Failed to refresh",
                          description: error.message || "Please try again.",
                          variant: "destructive",
                        });
                      }
                    }}
                    disabled={loading}
                  >
                    Refresh
                  </Button>
                  <Badge variant="secondary">{queueData.length} customers</Badge>
                </div>
              </CardTitle>
              <CardDescription>
                {currentLocation ? `Managing queue for: ${currentLocation.address}` : "No location selected"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {queueData.length === 0 ? (
                <div className="rounded-md border p-6 text-sm text-muted-foreground text-center">
                  No customers in queue at this location.
                </div>
              ) : (
                <div className="space-y-3">
                  {queueData.map((customer: any, index: number) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-4 border rounded-lg bg-card"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <Badge variant="outline" className="text-xs">
                            #{index + 1}
                          </Badge>
                          <span className="font-medium">
                            {customer.firstName} {customer.lastName}
                          </span>
                          <Badge variant="secondary" className="text-xs">
                            {customer.numGuests} {customer.numGuests === 1 ? 'guest' : 'guests'}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground space-y-1">
                          <div>Joined: {formatTimeSince(customer.joinedAt)}</div>
                          <div>Preference: {customer.waitingPreference === 'on_premises' ? 'Stay on Premises' : 'Wait Anywhere'}</div>
                          {customer.phoneNumber && (
                            <div>Phone: {customer.phoneNumber}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 ml-4">
                        <Button
                          size="sm"
                          variant="success"
                          onClick={() => admitCustomer(index)}
                          disabled={loading}
                        >
                          Admit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => removeCustomer(index)}
                          disabled={loading}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <Footer />
    </>
  );
};

export default BusinessDashboard;
