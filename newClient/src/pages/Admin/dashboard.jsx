import { useState } from "react"
import { Link } from "react-router-dom"
import { AlertTriangle, CreditCard, Droplet, Gauge, LifeBuoy, RefreshCw, Users } from "lucide-react"
import { toast } from "react-toastify"

import { Button } from "../../components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../../components/ui/card"
import { AdminLayout } from "../../Components/admin-layout"
import { StatCard } from "../../Components/stat-card"
import { UsageChart } from "../../Components/usage-chart"
import { DataTable } from "../../Components/data-table"
import { StatusBadge, ErrorNote } from "../../Components/status-badge"
import { api, useApi } from "../../lib/api"
import { ksh, m3, formatDate, periodLabel, previousPeriod } from "../../lib/format"

function AdminDashboard() {
  const stats = useApi("/api/admin/stats")
  const queues = useApi("/api/admin/queues")
  const tickets = useApi("/api/admin/tickets")
  const [running, setRunning] = useState(false)
  const s = stats.data
  const lastPeriod = previousPeriod()

  const runBilling = async () => {
    setRunning(true)
    try {
      const res = await api("/api/admin/billing/run", { method: "POST", body: { period: lastPeriod } })
      toast.success(res.message)
      setTimeout(stats.reload, 3000)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setRunning(false)
    }
  }

  const unhealthy = (queues.data?.queues ?? []).filter((q) => q.deadLettered > 0 || q.consumers === 0)

  return (
    <AdminLayout>
      <div className="container py-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
            <p className="text-muted-foreground">System overview and key metrics</p>
          </div>
          <Button className="bg-amber-600 hover:bg-amber-700" onClick={runBilling} disabled={running}>
            {running ? "Queuing…" : `Generate ${periodLabel(lastPeriod)} Bills`}
          </Button>
        </div>

        <ErrorNote error={stats.error} onRetry={stats.reload} />

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Revenue" value={ksh(s?.revenueThisMonth)} description={`${s?.paymentsThisMonth ?? 0} payments this month`} icon={CreditCard} />
          <StatCard title="Customers" value={s?.customers ?? "—"} description={`${s?.activeMeters ?? 0} active meters`} icon={Users} />
          <StatCard title="Usage This Month" value={m3(s?.usage?.at(-1)?.consumptionLitres, 1)} description="All meters, so far" icon={Droplet} />
          <StatCard title="Open Tickets" value={s?.openTickets ?? "—"} description={`${s?.pendingConnections ?? 0} connection requests pending`} icon={LifeBuoy} />
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <UsageChart
            data={(s?.usage ?? []).map((u) => ({ month: u.label.split(" ")[0].slice(0, 3), usage: u.consumptionLitres / 1000 }))}
            title="System-wide Usage"
            description="Monthly water consumption, all meters (m³)"
          />

          <Card>
            <CardHeader>
              <CardTitle>Billing & Collections</CardTitle>
              <CardDescription>{s?.lastPeriodBills?.label ?? ""} bills and open balances</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                ["Bills issued", s?.lastPeriodBills?.count ?? 0],
                ["Amount billed", ksh(s?.lastPeriodBills?.billed)],
                ["Collected on those bills", ksh(s?.lastPeriodBills?.collected)],
                ["Open bills (all periods)", s?.openBills ?? 0],
                ["Overdue bills", <span key="o" className={s?.overdueBills ? "text-red-500" : ""}>{s?.overdueBills ?? 0} · {ksh(s?.overdueAmount)}</span>],
                ["M-Pesa success rate (this month)", s?.paymentSuccessRate == null ? "—" : `${Math.round(s.paymentSuccessRate * 100)}%`],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between border-b pb-2">
                  <p className="font-medium">{label}</p>
                  <p>{value}</p>
                </div>
              ))}
            </CardContent>
            <CardFooter>
              <Button variant="outline" className="w-full" asChild>
                <Link to="/admin/billing">Billing Details</Link>
              </Button>
            </CardFooter>
          </Card>
        </div>

        <Card className="mt-8">
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Gauge className="h-5 w-5" /> Message Queues</CardTitle>
              <CardDescription>
                RabbitMQ work queues. Dead-lettered messages failed every retry and need a look in the RabbitMQ management UI.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={queues.reload}><RefreshCw className="mr-1 h-4 w-4" /> Refresh</Button>
          </CardHeader>
          <CardContent>
            <ErrorNote error={queues.error} onRetry={queues.reload} />
            {unhealthy.length > 0 && (
              <p className="mb-4 flex items-center gap-2 text-sm text-red-500">
                <AlertTriangle className="h-4 w-4" /> {unhealthy.length} queue(s) need attention
              </p>
            )}
            <DataTable
              rows={queues.data?.queues ?? []}
              rowKey={(q) => q.queue}
              loading={queues.loading}
              pageSize={20}
              columns={[
                { header: "Queue", cell: (q) => <code>{q.queue}</code> },
                { header: "Waiting", cell: (q) => q.ready },
                { header: "Retrying", cell: (q) => q.retrying },
                { header: "Dead-lettered", cell: (q) => <span className={q.deadLettered ? "font-semibold text-red-500" : ""}>{q.deadLettered}</span> },
                { header: "Consumers", cell: (q) => <span className={q.consumers ? "" : "font-semibold text-red-500"}>{q.consumers}</span> },
              ]}
            />
          </CardContent>
        </Card>

        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Recent Support Tickets</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              rows={(tickets.data?.tickets ?? []).slice(0, 5)}
              loading={tickets.loading}
              empty="No tickets"
              columns={[
                { header: "Customer", cell: (t) => t.customerName ?? t.email ?? "—" },
                { header: "Subject", cell: (t) => t.subject },
                { header: "Priority", cell: (t) => <StatusBadge status={t.priority} /> },
                { header: "Status", cell: (t) => <StatusBadge status={t.status} /> },
                { header: "Created", cell: (t) => formatDate(t.createdAt) },
              ]}
            />
          </CardContent>
          <CardFooter>
            <Button variant="outline" className="w-full" asChild>
              <Link to="/admin/tickets">View All Tickets</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </AdminLayout>
  )
}

export default AdminDashboard
