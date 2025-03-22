import { Link } from "react-router-dom"
import { CreditCard, Smartphone, Building } from "lucide-react"

import { Button } from "../../components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../../components/ui/card"
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"
import { RadioGroup, RadioGroupItem } from "../../components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"
import { CustomerLayout } from "../../Components/customer-layout"
import { useState } from "react"

function BillsPage() {
  const [paymentMethod, setPaymentMethod] = useState("card")
  
  return (
    <CustomerLayout>
      <div className="container py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Pay Your Bill</h1>
          <p className="text-muted-foreground">Make a payment to your water account</p>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Current Bill</CardTitle>
              <CardDescription>Your current water bill details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <p className="font-medium">Bill Number</p>
                <p>WB-2025-04-001</p>
              </div>
              <div className="flex items-center justify-between border-b pb-2">
                <p className="font-medium">Billing Period</p>
                <p>March 1 - March 30, 2025</p>
              </div>
              <div className="flex items-center justify-between border-b pb-2">
                <p className="font-medium">Water Usage</p>
                <p>605 litres</p>
              </div>
              <div className="flex items-center justify-between border-b pb-2">
                <p className="font-medium">Base Charge</p>
                <p>Ksh 5000</p>
              </div>
              <div className="flex items-center justify-between border-b pb-2">
                <p className="font-medium">Usage Charge</p>
                <p>Ksh 7500</p>
              </div>
              <div className="flex items-center justify-between border-b pb-2">
                <p className="font-medium">Tax</p>
                <p>Ksh 1200</p>
              </div>
              <div className="flex items-center justify-between font-bold">
                <p>Total Amount Due</p>
                <p>Ksh 14700</p>
              </div>
              <div className="flex items-center justify-between text-red-500">
                <p className="font-medium">Due Date</p>
                <p>April 15, 2025</p>
              </div>
            </CardContent>
            <CardFooter>
              <Button variant="outline" className="w-full" asChild>
                <Link to="/bills/download">Download PDF</Link>
              </Button>
            </CardFooter>
          </Card>

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
                  <div className="grid gap-2">
                    <Label htmlFor="card-number">Card Number</Label>
                    <Input id="card-number" placeholder="1234 5678 9012 3456" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="expiry">Expiry Date</Label>
                      <Input id="expiry" placeholder="MM/YY" />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="cvc">CVC</Label>
                      <Input id="cvc" placeholder="123" />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="name">Name on Card</Label>
                    <Input id="name" placeholder="John Doe" />
                  </div>
                </div>
              )}

              {paymentMethod === "mpesa" && (
                <div className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="phone-number">Phone Number</Label>
                    <Input id="phone-number" placeholder="07XX XXX XXX" />
                  </div>
                  <div className="rounded-md bg-blue-50 p-4">
                    <div className="flex">
                      <div className="ml-3 flex-1 md:flex md:justify-between">
                        <p className="text-sm text-blue-700">
                          <strong>Paybill Instructions:</strong> Go to M-Pesa &gt; Lipa na M-Pesa &gt; Paybill &gt; Enter Business No: <strong>654321</strong> &gt; Account No: <strong>WP-1001</strong> (Your Account Number) &gt; Amount: Ksh 14700 &gt; Your M-Pesa PIN
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="amount">Payment Amount</Label>
                  <div className="flex items-center">
                    <span className="mr-2">Ksh</span>
                    <Input id="amount" defaultValue="14700" />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="payment-type">Payment Type</Label>
                  <Select defaultValue="full">
                    <SelectTrigger id="payment-type">
                      <SelectValue placeholder="Select payment type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full">Full Payment</SelectItem>
                      <SelectItem value="partial">Partial Payment</SelectItem>
                      <SelectItem value="arrangement">Payment Arrangement</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button className="w-full bg-water hover:bg-water-dark">
                {paymentMethod === "mpesa" ? "Confirm Payment" : "Pay Now"}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </CustomerLayout>
  )
}

export default BillsPage