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
  const queueData = [] as Array<{
    id: string;
    name: string;
    phone: string;
    joinedAt: Date;
    estimatedWait: number;
  }>;
  const todayStats = {
    totalServed: 0,
    currentQueue: 0,
    avgWaitTime: 15,
    successRate: 0,
  };

  const [me, setMe] = useState<any | null>(null);
  const [selectedLocationIndex, setSelectedLocationIndex] = useState(0);
  const locations = (me?.locations as any[]) || [];
  const maxLocations = me?.maxLocations ?? 1;
  const onTrial = me?.trial ?? true;
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      try {
        const res = await api("/auth/me");
        setMe(res.user);
      } catch {}
    })();
  }, []);

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
                <CardTitle className="text-2xl">0</CardTitle>
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
                <Badge variant="secondary">{queueData.length} customers</Badge>
              </CardTitle>
              <CardDescription>No customers in queue</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border p-6 text-sm text-muted-foreground">
                Keep the momentum going with a paid plan.{" "}
                <Button className="ml-2" size="sm" variant="success">
                  Upgrade to Grow
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <Footer />
    </>
  );
};

export default BusinessDashboard;
