import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CreditCard, Smartphone, Building } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { RadioGroup, RadioGroupItem } from "../../components/ui/radio-group";
import { getUsageDataFromLocalStorage } from "./utils"; 
import { CustomerLayout } from "../../Components/customer-layout";

const WATER_PRICE_PER_LITER = 3; 

function BillsPage() {
  const [paymentMethod, setPaymentMethod] = useState("card");
  const [waterUsage, setWaterUsage] = useState(0);
  const [totalAmountDue, setTotalAmountDue] = useState(0);
  const [customAmount, setCustomAmount] = useState(0);
  const [cardNumber, setCardNumber] = useState("");
  const [cvv, setCvv] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");

  useEffect(() => {
    const calculateTotalUsage = () => {
      const usageData3Months = getUsageDataFromLocalStorage("3months") || [];
      const usageData6Months = getUsageDataFromLocalStorage("6months") || [];
      const usageData1Year = getUsageDataFromLocalStorage("1year") || [];

      const allUsageData = [...usageData3Months, ...usageData6Months, ...usageData1Year];
      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();

      const filteredUsage = allUsageData.filter(entry => {
        const entryDate = new Date(entry.month);
        return entryDate.getMonth() === currentMonth && entryDate.getFullYear() === currentYear;
      });

      const totalLiters = filteredUsage.reduce((sum, entry) => sum + entry.usage, 0);
      setWaterUsage(totalLiters);
      setTotalAmountDue(totalLiters * WATER_PRICE_PER_LITER);
      setCustomAmount(totalLiters * WATER_PRICE_PER_LITER);
    };

    calculateTotalUsage();
  }, []);

  const handlePayment = () => {
    alert(`Processing payment of Ksh ${customAmount} via ${paymentMethod}`);
  };

  return (
    <CustomerLayout>
      <div className="container py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Pay Your Bill</h1>
          <p className="text-muted-foreground">Make a payment to your water account</p>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          {/* Bill Summary Card */}
          <Card>
            <CardHeader>
              <CardTitle>Current Bill</CardTitle>
              <CardDescription>Your current water bill details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <p className="font-medium">Billing Period</p>
                <p>From {new Date().toLocaleString('default', { month: 'long' })} 1 to Today</p>
              </div>
              <div className="flex items-center justify-between border-b pb-2">
                <p className="font-medium">Water Usage</p>
                <p>{waterUsage} litres</p>
              </div>
              <div className="flex items-center justify-between border-b pb-2">
                <p className="font-medium">Usage Charge</p>
                <p>Ksh {totalAmountDue}</p>
              </div>
              <div className="flex items-center justify-between text-red-500">
                <p className="font-medium">Due Date</p>
                <p>{new Date().toLocaleDateString()}</p>
              </div>
            </CardContent>
            <CardFooter>
              <Button variant="outline" className="w-full" asChild>
                <Link to="/bills/download">Download PDF</Link>
              </Button>
            </CardFooter>
          </Card>

          {/* Payment Method Card */}
          <Card>
            <CardHeader>
              <CardTitle>Payment Method</CardTitle>
              <CardDescription>Select your preferred payment method</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="card" id="card" />
                  <Label htmlFor="card" className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    Credit/Debit Card
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="bank" id="bank" />
                  <Label htmlFor="bank" className="flex items-center gap-2">
                    <Building className="h-4 w-4" />
                    Bank Account
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="mpesa" id="mpesa" />
                  <Label htmlFor="mpesa" className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4" />
                    M-Pesa
                  </Label>
                </div>
              </RadioGroup>

              {paymentMethod === "card" && (
                <div className="space-y-4">
                  <Input placeholder="Card Number" value={cardNumber} onChange={e => setCardNumber(e.target.value)} />
                  <Input placeholder="CVV" type="password" value={cvv} onChange={e => setCvv(e.target.value)} />
                </div>
              )}

              {paymentMethod === "bank" && (
                <div className="space-y-4">
                  <Input placeholder="Bank Name" value={bankName} onChange={e => setBankName(e.target.value)} />
                  <Input placeholder="Account Number" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} />
                </div>
              )}

              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="amount">Payment Amount</Label>
                  <div className="flex items-center">
                    <span className="mr-2">Ksh</span>
                    <Input id="amount" type="number" value={customAmount} onChange={e => setCustomAmount(e.target.value)} />
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button className="w-full bg-water hover:bg-water-dark" onClick={handlePayment}>
                {(paymentMethod === "card" && cardNumber && cvv) || (paymentMethod === "bank" && bankName && accountNumber)
                  ? "Confirm Payment"
                  : "Pay Now"}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </CustomerLayout>
  );
}

export default BillsPage;
