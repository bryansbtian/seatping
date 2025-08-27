import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface QueueCustomer {
  id: string;
  name: string;
  phone: string;
  joinedAt: Date;
  estimatedWait: number;
}

const Dashboard = () => {
  const [queueData] = useState<QueueCustomer[]>([
    {
      id: "1",
      name: "John Smith",
      phone: "(555) 123-4567",
      joinedAt: new Date(Date.now() - 10 * 60000),
      estimatedWait: 15,
    },
    {
      id: "2",
      name: "Sarah Johnson",
      phone: "(555) 987-6543",
      joinedAt: new Date(Date.now() - 5 * 60000),
      estimatedWait: 25,
    },
    {
      id: "3",
      name: "Mike Davis",
      phone: "(555) 555-1234",
      joinedAt: new Date(Date.now() - 2 * 60000),
      estimatedWait: 35,
    },
  ]);

  const [todayStats] = useState({
    totalServed: 16,
    currentQueue: 3,
    avgWaitTime: 18,
    walkAways: 2,
    revenue: 1200,
  });

  const { toast } = useToast();

  const handleCallNext = (customer: QueueCustomer) => {
    toast({
      title: "Customer notified!",
      description: `${customer.name} has been texted and is being called.`,
    });

    // In real app, this would:
    // 1. Send SMS to customer
    // 2. Send email to business
    // 3. Remove customer from queue
    // 4. Update analytics
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diffMinutes = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60)
    );
    return `${diffMinutes}m ago`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-success/5">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-success bg-clip-text text-transparent mb-2">
            Business Dashboard
          </h1>
          <p className="text-muted-foreground">
            Welcome back! Here's your queue status for today.
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="shadow-lg border-0 bg-gradient-to-br from-success/10 to-success/5">
            <CardHeader className="pb-2">
              <CardDescription>Total Served Today</CardDescription>
              <CardTitle className="text-2xl text-success">
                {todayStats.totalServed}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card className="shadow-lg border-0 bg-gradient-to-br from-primary/10 to-primary/5">
            <CardHeader className="pb-2">
              <CardDescription>Current Queue</CardDescription>
              <CardTitle className="text-2xl text-primary">
                {todayStats.currentQueue}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card className="shadow-lg border-0">
            <CardHeader className="pb-2">
              <CardDescription>Avg Wait Time</CardDescription>
              <CardTitle className="text-2xl">
                {todayStats.avgWaitTime}min
              </CardTitle>
            </CardHeader>
          </Card>

          <Card className="shadow-lg border-0 bg-gradient-to-br from-destructive/10 to-destructive/5">
            <CardHeader className="pb-2">
              <CardDescription>Walk-aways</CardDescription>
              <CardTitle className="text-2xl text-destructive">
                {todayStats.walkAways}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Current Queue */}
        <Card className="shadow-2xl border-0">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Current Queue
              <Badge variant="secondary">{queueData.length} customers</Badge>
            </CardTitle>
            <CardDescription>
              Manage your current queue and call customers when ready
            </CardDescription>
          </CardHeader>
          <CardContent>
            {queueData.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No customers in queue</p>
              </div>
            ) : (
              <div className="space-y-4">
                {queueData.map((customer, index) => (
                  <div
                    key={customer.id}
                    className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-8 h-8 bg-gradient-to-r from-primary to-primary-glow rounded-full flex items-center justify-center text-white font-semibold">
                        {index + 1}
                      </div>
                      <div>
                        <h3 className="font-semibold">{customer.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {customer.phone} • Joined{" "}
                          {formatTime(customer.joinedAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">
                        ~{customer.estimatedWait}min wait
                      </Badge>
                      <Button
                        variant={index === 0 ? "success" : "outline"}
                        onClick={() => handleCallNext(customer)}
                      >
                        {index === 0 ? "Call Now" : "Call Next"}
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
  );
};

export default Dashboard;
