import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

const Admin = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [updateForm, setUpdateForm] = useState({
    businessUsername: "",
    customerCredits: "",
    smsCredits: ""
  });
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

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
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Admin Dashboard</CardTitle>
            <p className="text-muted-foreground">Update business credits</p>
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
      </div>
    </div>
  );
};

export default Admin;

