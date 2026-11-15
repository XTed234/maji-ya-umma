import { useState } from "react"
import { Search } from "lucide-react"
import { toast } from "react-toastify"

import { Button } from "../../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card"
import { Input } from "../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"
import { AdminLayout } from "../../Components/admin-layout"
import { DataTable, matches } from "../../Components/data-table"
import { StatusBadge, ErrorNote } from "../../Components/status-badge"
import { api, useApi } from "../../lib/api"
import { ksh, m3, formatDate, formatDateTime, periodLabel, previousPeriod } from "../../lib/format"

// The last 12 months that have ended, newest first.
const endedPeriods = () => {
  const [y, m] = previousPeriod().split("-").map(Number)
  return Array.from({ length: 12 }, (_, i) => {
    const idx = y * 12 + (m - 1) - i
    return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`
  })
}

function BillingPage() {
  const runs = useApi("/api/admin/billing-runs")
  const tariff = useApi("/api/admin/tariff")
  const [runPeriod, setRunPeriod] = useState(previousPeriod())
  const [viewPeriod, setViewPeriod] = useState("all")
  const [status, setStatus] = useState("all")
  const [query, setQuery] = useState("")
  const bills = useApi(`/api/admin/bills${viewPeriod !== "all" ? `?period=${viewPeriod}` : ""}`)
  const [busy, setBusy] = useState(false)

  const run = async () => {
    setBusy(true)
    try {
      const res = await api("/api/admin/billing/run", { method: "POST", body: { period: runPeriod } })
      toast.success(`${res.message}. Bills appear as the workers generate them.`)
      setTimeout(() => { runs.reload(); bills.reload() }, 3000)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const rows = (bills.data?.bills ?? []).filter(
    (b) =>
      (status === "all" || (status === "overdue" ? b.overdue : b.status === status)) &&
      matches(query, b.customerName, b.accountNumber, b.meterNumber)
  )

  return (
    <AdminLayout>
      <div className="container py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Billing Management</h1>
          <p className="text-muted-foreground">Monthly bills are generated automatically after each month ends; you can also run billing manually.</p>
        </div>

        <div className="mb-8 grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Run Billing</CardTitle>
              <CardDescription>Bills every active meter for the chosen month. Safe to repeat: meters already billed are skipped.</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Select value={runPeriod} onValueChange={setRunPeriod}>
                <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {endedPeriods().map((p) => <SelectItem key={p} value={p}>{periodLabel(p)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button className="bg-amber-600 hover:bg-amber-700" onClick={run} disabled={busy}>
                {busy ? "Queuing…" : "Generate Bills"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tariff</CardTitle>
              <CardDescription>{tariff.data?.tariff.name}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {(tariff.data?.tariff.blocks ?? []).map((b, i, all) => (
                <div key={i} className="flex justify-between">
                  <span>{i === 0 ? 0 : all[i - 1].upToM3}{b.upToM3 == null ? "+" : `–${b.upToM3}`} m³</span>
                  <span>Ksh {b.ratePerM3} / m³</span>
                </div>
              ))}
              <div className="flex justify-between border-t pt-1">
                <span>Standing charge</span>
                <span>{ksh(tariff.data?.tariff.standingCharge)} / month</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Billing Runs</CardTitle>
          </CardHeader>
          <CardContent>
            <ErrorNote error={runs.error} onRetry={runs.reload} />
            <DataTable
              rows={runs.data?.runs ?? []}
              loading={runs.loading}
              empty="No billing runs yet"
              columns={[
                { header: "Period", cell: (r) => r.label },
                { header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
                { header: "Bills", cell: (r) => `${r.billsGenerated} / ${r.metersQueued ?? 0} meters` },
                { header: "Billed", cell: (r) => ksh(r.totalBilled) },
                { header: "Collected", cell: (r) => ksh(r.totalCollected) },
                { header: "Last run", cell: (r) => `${formatDateTime(r.lastRequestedAt)}${r.lastRequestedBy === "scheduler" ? " (auto)" : ""}` },
                { header: "", cell: (r) => <Button variant="ghost" size="sm" onClick={() => setViewPeriod(r.period)}>View bills</Button> },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Bills</CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Customer, account, meter…" className="pl-8" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <Select value={viewPeriod} onValueChange={setViewPeriod}>
                <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Latest bills</SelectItem>
                  {endedPeriods().map((p) => <SelectItem key={p} value={p}>{periodLabel(p)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="partially_paid">Partly paid</SelectItem>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <ErrorNote error={bills.error} onRetry={bills.reload} />
            <DataTable
              rows={rows}
              loading={bills.loading}
              empty="No bills match"
              columns={[
                { header: "Period", cell: (b) => b.label },
                { header: "Customer", cell: (b) => <><div>{b.customerName}</div><div className="text-muted-foreground">{b.accountNumber}</div></> },
                { header: "Meter", cell: (b) => b.meterNumber },
                { header: "Usage", cell: (b) => m3(b.consumptionLitres) },
                { header: "Amount", cell: (b) => ksh(b.amountDue) },
                { header: "Outstanding", cell: (b) => ksh(b.outstanding) },
                { header: "Due", cell: (b) => formatDate(b.dueDate) },
                { header: "Status", cell: (b) => <StatusBadge status={b.overdue ? "overdue" : b.status} /> },
              ]}
            />
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  )
}

export default BillingPage
