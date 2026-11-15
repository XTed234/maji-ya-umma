import { useEffect, useState } from "react";
import { CustomerLayout } from "../../Components/customer-layout";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Button } from "../../components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { toast } from "react-toastify";
import { api } from "../../lib/api";
import { useAuth } from "../../auth/AuthProvider";
import { displayPhone } from "./shared";

function ProfilePage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const { refreshProfile } = useAuth();
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phoneNumber: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
  });
 
  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const data = await api("/api/me");
        setUser(data.user);
        setFormData({
          firstName: data.user.firstName || "",
          lastName: data.user.lastName || "",
          email: data.user.email || "",
          phoneNumber: displayPhone(data.user.phoneNumber),
          address: data.user.address || "",
          city: data.user.city || "",
          state: data.user.state || "",
          zipCode: data.user.zipCode || "",
        });
      } catch (err) {
        setError(err.message || "Error fetching user profile.");
      } finally {
        setLoading(false);
      }
    };

    fetchUserProfile();
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.id]: e.target.value });
  };

  const handleSaveChanges = async () => {
    setSaving(true);
    try {
      // email is not sent: the account is identified by the session token.
      const { email: _email, ...changes } = formData;
      const result = await api("/api/me", { method: "PUT", body: changes });
      toast.success(result.message);
      setTimeout(refreshProfile, 1500); // applied asynchronously by the profiles worker
    } catch (error) {
      toast.error(error.message || "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <CustomerLayout><p className="py-8">Loading profile…</p></CustomerLayout>;
  if (error) return <CustomerLayout><p className="py-8 text-red-500">{error}</p></CustomerLayout>;




  return (
    <CustomerLayout>
      <div className="container py-8">
        <h1 className="text-3xl font-bold tracking-tight">Account Profile</h1>
        <p className="text-muted-foreground">Manage your account information and preferences</p>

        <Tabs defaultValue="personal" className="space-y-6">


          <TabsContent value="personal">
            <Card>
              <CardHeader>
                <CardTitle>Personal Information</CardTitle>
                <CardDescription>Account {user?.accountNumber}{user?.meterNumbers?.length ? ` · Meter ${user.meterNumbers.join(", ")}` : ""}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="firstName">First name</Label>
                    <Input id="firstName" value={formData.firstName} onChange={handleChange} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="lastName">Last name</Label>
                    <Input id="lastName" value={formData.lastName} onChange={handleChange} />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={formData.email} disabled />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phoneNumber">Phone Number</Label>
                  <Input id="phoneNumber" type="tel" value={formData.phoneNumber} onChange={handleChange} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="address">Address</Label>
                  <Input id="address" value={formData.address} onChange={handleChange} />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="city">City</Label>
                    <Input id="city" value={formData.city} onChange={handleChange} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="state">State</Label>
                    <Input id="state" value={formData.state} onChange={handleChange} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="zipCode">ZIP Code</Label>
                    <Input id="zipCode" value={formData.zipCode} onChange={handleChange} />
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button className="bg-water hover:bg-water-dark" onClick={handleSaveChanges} disabled={saving}>
                  {saving ? "Saving…" : "Save Changes"}
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>


        </Tabs>
      </div>
    </CustomerLayout>
  );
}

export default ProfilePage;
