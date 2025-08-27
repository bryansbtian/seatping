import Footer from "@/components/Footer";
import BusinessHeader from "@/components/BusinessHeader";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const BusinessSettings = () => {
  return (
    <>
      <BusinessHeader />
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-success/5">
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-2xl font-bold mb-6">Business Settings</h1>

          <Card className="border-0 shadow-xl">
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <CardDescription>Update your business profile.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                <div>
                  <Label htmlFor="businessName">Business Name</Label>
                  <Input id="businessName" placeholder="Your business name" />
                </div>

                <div>
                  <Label htmlFor="ticket">Average Ticket Value</Label>
                  <Input id="ticket" type="number" placeholder="$" />
                </div>

                <Button className="w-fit">Save Changes</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <Footer />
    </>
  );
};

export default BusinessSettings;
