import { useState } from "react"
import { Download, Search } from "lucide-react"

import { Button } from "../../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card"
import { Input } from "../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"
import { AdminLayout } from "../../Components/admin-layout"
import { DataTable, matches } from "../../Components/data-table"
import { StatusBadge, ErrorNote } from "../../Components/status-badge"
import { useApi } from "../../lib/api"
import { ksh, formatDateTime, displayPhone, downloadCsv, paymentMethodLabel } from "../../lib/format"

const isPending = (p) => !["completed", "failed"].includes(p.status)
const SETTLED_BY = {
  callback: "M-Pesa callback (verified)",
  status_query: "Status query",
  simulator: "Simulator",
  status_check: "Timed out",
  stk_push: "Rejected by M-Pesa",
  initiate: "Interrupted",
  stripe_webhook: "Stripe webhook",
  client_return: "Card form (verified)",
  customer: "Cancelled by customer",
}

function PaymentsManagementPage() {
  const payments = useApi("/api/admin/payments")
  const unmatched = useApi("/api/admin/unmatched-payments")
  const [status, setStatus] = useState("all")
  const [query, setQuery] = useState("")

  const all = payments.data?.payments ?? []
  const rows = all.filter(
    (p) =>
      (status === "all" || (status === "pending" ? isPending(p) : p.status === status)) &&
      matches(query, p.customerName, p.accountNumber, p.mpesaReceipt, p.phone, displayPhone(p.phone), p.email, p.stripePaymentIntentId, p.cardLast4)
  )
  const completed = all.filter((p) => p.status === "completed")
  const failed = all.filter((p) => p.status === "failed")
  const settled = completed.length + failed.length

  const exportCsv = () =>
    downloadCsv(
      "payments.csv",
      rows.map((p) => ({
        date: p.createdAt,
        customer: p.customerName,
        account: p.accountNumber,
        method: paymentMethodLabel(p),
        phone: displayPhone(p.phone),
        amount: p.amountPaid ?? p.amount,
        status: p.status,
        stripePaymentIntent: p.stripePaymentIntentId ?? "",
        mpesaReceipt: p.mpesaReceipt ?? "",
        failureReason: p.failureReason ?? "",
      }))
    )

  return (
    <AdminLayout>
      <div className="container py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Payment Management</h1>
          <p className="text-muted-foreground">M-Pesa and card payments (most recent 500)</p>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Payment Overview</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-4">
            {[
              ["Collected", ksh(completed.reduce((s, p) => s + p.amountPaid, 0)), `${completed.length} payments`],
              ["In progress", all.filter(isPending).length, "awaiting customer / M-Pesa / card"],
              ["Failed", failed.length, "cancelled, timed out or rejected"],
              ["Success rate", settled ? `${Math.round((completed.length / settled) * 100)}%` : "—", "of settled payments"],
            ].map(([label, value, hint]) => (
              <div key={label} className="space-y-1">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="text-2xl font-bold">{value}</p>
                <p className="text-sm text-muted-foreground">{hint}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {(unmatched.data?.callbacks ?? []).length > 0 && (
          <Card className="mb-8 border-red-400">
            <CardHeader>
              <CardTitle>Unmatched M-Pesa Callbacks</CardTitle>
              <CardDescription>
                M-Pesa confirmed these, but no payment in the system matches. Usually a payment whose request was interrupted. Check the receipt and credit the customer manually.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable
                rows={unmatched.data.callbacks}
                columns={[
                  { header: "Received", cell: (c) => formatDateTime(c.receivedAt) },
                  { header: "Checkout ID", cell: (c) => <code className="text-xs">{c.id}</code> },
                  { header: "Result", cell: (c) => c.callback?.ResultDesc },
                  {
                    header: "Details",
                    cell: (c) =>
                      (c.callback?.CallbackMetadata?.Item ?? []).map((i) => `${i.Name}: ${i.Value}`).join(" · ") || "—",
                  },
                ]}
              />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Payment Records</CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Customer, receipt, phone, pi_…" className="pl-8" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="pending">In progress</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={exportCsv} disabled={!rows.length}><Download className="mr-2 h-4 w-4" /> Export</Button>
            </div>
          </CardHeader>
          <CardContent>
            <ErrorNote error={payments.error} onRetry={payments.reload} />
            <DataTable
              rows={rows}
              loading={payments.loading}
              empty="No payments match"
              columns={[
                { header: "Date", cell: (p) => formatDateTime(p.createdAt) },
                { header: "Customer", cell: (p) => <><div>{p.customerName}</div><div className="text-muted-foreground">{p.accountNumber}</div></> },
                { header: "Method", cell: (p) => <><div>{paymentMethodLabel(p)}</div><div className="text-muted-foreground">{displayPhone(p.phone)}</div></> },
                { header: "Amount", cell: (p) => ksh(p.amountPaid ?? p.amount) },
                {
                  header: "Reference",
                  cell: (p) =>
                    p.mpesaReceipt ?? (p.stripePaymentIntentId ? <code className="text-xs">{p.stripePaymentIntentId}</code> : "—"),
                },
                {
                  header: "Status",
                  cell: (p) => (
                    <>
                      <StatusBadge status={p.status} />
                      {p.failureReason && <div className="mt-1 text-xs text-muted-foreground">{p.failureReason}</div>}
                      {!p.failureReason && p.lastCardError && <div className="mt-1 text-xs text-muted-foreground">Last attempt: {p.lastCardError}</div>}
                    </>
                  ),
                },
                { header: "Settled via", cell: (p) => SETTLED_BY[p.settledBy] ?? "—" },
              ]}
            />
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  )
}

export default PaymentsManagementPage
