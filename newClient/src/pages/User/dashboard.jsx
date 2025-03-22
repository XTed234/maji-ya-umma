import { Link } from "react-router-dom"
import { BarChart3, CreditCard, Droplet, LifeBuoy } from "lucide-react"

import { Button } from "../../components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../../components/ui/card"
import { CustomerLayout } from "../../Components/customer-layout"
import { StatCard } from "../../Components/stat-card"
import { UsageChart } from "../../Components/usage-chart"

function CustomerDashboard() {
  // Sample data for the usage chart
  const usageData = [
    { month: "Jan", usage: 120 },
    { month: "Feb", usage: 150 },
    { month: "Mar", usage: 180 },
    { month: "Apr", usage: 140 },
    { month: "May", usage: 130 },
    { month: "Jun", usage: 160 },
  ]

  return (
    <CustomerLayout>
      <div className="container py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground">Welcome back, John Doe</p>
          </div>
          <Button className="bg-water hover:bg-water-dark" asChild>
            <Link to="/bills">Pay Bill</Link>
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Current Balance"
            value="Ksh12,450"
            description="Due on April 15, 2025"
            icon={CreditCard}
            trend={{ value: 12, isPositive: false }}
          />
          <StatCard title="Last Payment" value="Ksh 13, 000" description="Paid on March 10, 2025" icon={CreditCard} />
          <StatCard
            title="Current Usage"
            value="160 gal"
            description="As of April 5, 2025"
            icon={Droplet}
            trend={{ value: 8, isPositive: true }}
          />
          <StatCard title="Average Usage" value=" 600 litrs" description="Last 6 months" icon={BarChart3} />
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <UsageChart data={usageData} />

          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Your recent account activity</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <div>
                  <p className="font-medium">Bill Generated</p>
                  <p className="text-sm text-muted-foreground">April 1, 2025</p>
                </div>
                <p className="font-medium">Ksh 12450</p>
              </div>
              <div className="flex items-center justify-between border-b pb-2">
                <div>
                  <p className="font-medium">Payment Received</p>
                  <p className="text-sm text-muted-foreground">March 10, 2025</p>
                </div>
                <p className="font-medium text-green-600">Ksh 11,820</p>
              </div>
              <div className="flex items-center justify-between border-b pb-2">
                <div>
                  <p className="font-medium">Bill Generated</p>
                  <p className="text-sm text-muted-foreground">March 1, 2025</p>
                </div>
                <p className="font-medium">Ksh 11,820</p>
              </div>
            </CardContent>
            <CardFooter>
              <Button variant="outline" className="w-full" asChild>
                <Link to="/payments">View All Activity</Link>
              </Button>
            </CardFooter>
          </Card>
        </div>

        <div className="mt-8">
          <Card>
            <CardHeader>
              <CardTitle>Need Help?</CardTitle>
              <CardDescription>Contact our support team or check our FAQ</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 sm:flex-row">
              <Button variant="outline" className="flex items-center gap-2" asChild>
                <Link to="/feedback">
                  <LifeBuoy className="h-4 w-4" />
                  Submit a Support Ticket
                </Link>
              </Button>
              <Button variant="outline" className="flex items-center gap-2">
                <LifeBuoy className="h-4 w-4" />
                View FAQ
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </CustomerLayout>
  )
}

export default CustomerDashboard

