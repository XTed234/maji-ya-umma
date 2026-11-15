import { Link } from "react-router-dom"
import { BarChart3, CreditCard, Droplet, LifeBuoy, Loader2 } from "lucide-react"
import { Button } from "../../components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../../components/ui/card"
import { CustomerLayout } from "../../Components/customer-layout"
import { StatCard } from "../../Components/stat-card"
import { UsageChart } from "../../Components/usage-chart"
import { StatusBadge, Empty } from "../../Components/status-badge"
import { useAuth } from "../../auth/AuthProvider"
import { useApi } from "../../lib/api"
import { ksh, m3, formatDate, balanceLabel, toMillisSafe } from "./shared"

function CustomerDashboard() {
  const { profile } = useAuth()
  const usage = useApi("/api/me/usage?months=6")
  const bills = useApi("/api/me/bills")
  const payments = useApi("/api/me/payments")
  const connections = useApi("/api/me/connection-requests")
  const me = useApi("/api/me") // fresh balance (the auth profile is loaded once per session)

  const user = me.data?.user ?? profile
  const months = usage.data?.months ?? []
  const current = months.at(-1)
  const past = months.slice(0, -1).filter((m) => m.consumptionLitres > 0)
  const average = past.length ? past.reduce((s, m) => s + m.consumptionLitres, 0) / past.length : 0
  const openBill = (bills.data?.bills ?? []).find((b) => b.status !== "paid")
  const lastPayment = (payments.data?.payments ?? []).find((p) => p.status === "completed")
  const hasMeter = (user?.meterNumbers ?? []).length > 0
  const pendingRequest = (connections.data?.requests ?? []).find((r) => r.status === "pending")

  const activity = [
    ...(bills.data?.bills ?? []).map((b) => ({ key: `b-${b.id}`, title: `${b.label} bill`, date: b.issuedAt, amount: ksh(b.amountDue), status: b.overdue ? "overdue" : b.status })),
    ...(payments.data?.payments ?? []).map((p) => ({ key: `p-${p.id}`, title: p.method === "card" ? "Card payment" : "M-Pesa payment", date: p.createdAt, amount: ksh(p.amountPaid ?? p.amount), status: p.status, positive: p.status === "completed" })),
  ]
    .sort((a, b) => toMillisSafe(b.date) - toMillisSafe(a.date))
    .slice(0, 5)

  const loading = usage.loading || bills.loading || payments.loading

  return (
    <CustomerLayout>
      <div className="container py-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground">
              Welcome back {user?.firstName} {user?.lastName} · Account {user?.accountNumber}
            </p>
          </div>
          <div className="flex gap-2">
            <Button className="bg-water hover:bg-water-dark" asChild>
              <Link to="/bills">Pay Bill</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/request-connection">Request Water Connection</Link>
            </Button>
          </div>
        </div>

        {!hasMeter && (
          <Card className="mb-6 border-water">
            <CardContent className="py-4 text-sm">
              {pendingRequest
                ? `Your connection request for ${pendingRequest.address} is being reviewed. Usage and bills appear here once your meter is installed.`
                : "You don't have a water connection yet. Request one to get a meter; usage and bills will appear here."}
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Current Balance"
            value={balanceLabel(user?.balance ?? 0)}
            description={openBill ? `${openBill.label} bill due ${formatDate(openBill.dueDate)}` : "No unpaid bills"}
            icon={CreditCard}
          />
          <StatCard
            title="Last Payment"
            value={lastPayment ? ksh(lastPayment.amountPaid) : "—"}
            description={lastPayment ? `Paid on ${formatDate(lastPayment.completedAt)}` : "No payments yet"}
            icon={CreditCard}
          />
          <StatCard title="Usage This Month" value={m3(current?.consumptionLitres)} description={current ? `${current.label} so far` : ""} icon={Droplet} />
          <StatCard title="Average Usage" value={m3(average)} description="Per month, previous months" icon={BarChart3} />
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <UsageChart data={months.map((m) => ({ month: m.label.split(" ")[0].slice(0, 3), usage: m.consumptionLitres / 1000 }))} />

          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Your latest bills and payments</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading && <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />}
              {!loading && activity.length === 0 && <Empty>No activity yet</Empty>}
              {activity.map((a) => (
                <div key={a.key} className="flex items-center justify-between border-b pb-2">
                  <div>
                    <p className="font-medium">{a.title}</p>
                    <p className="text-sm text-muted-foreground">{formatDate(a.date)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={a.status} />
                    <p className={`font-medium ${a.positive ? "text-green-600" : ""}`}>{a.amount}</p>
                  </div>
                </div>
              ))}
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
              <CardDescription>Contact our support team</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 sm:flex-row">
              <Button variant="outline" className="flex items-center gap-2" asChild>
                <Link to="/feedback">
                  <LifeBuoy className="h-4 w-4" />
                  Submit a Support Ticket
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </CustomerLayout>
  )
}

export default CustomerDashboard
