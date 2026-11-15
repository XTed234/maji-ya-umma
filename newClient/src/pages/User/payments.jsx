import { useState } from "react"
import { Link } from "react-router-dom"
import { Download } from "lucide-react"
import jsPDF from "jspdf"
import { CustomerLayout } from "../../Components/customer-layout"
import { StatusBadge, Empty, ErrorNote } from "../../Components/status-badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"
import { Button } from "../../components/ui/button"
import { useAuth } from "../../auth/AuthProvider"
import { useApi } from "../../lib/api"
import { ksh, formatDate, formatDateTime, displayPhone, downloadCsv, paymentMethodLabel } from "./shared"

const isPending = (p) => !["completed", "failed"].includes(p.status)

function downloadReceipt(payment, user) {
  const doc = new jsPDF()
  doc.setFontSize(18)
  doc.text("Maji ya Umma — Payment Receipt", 20, 20)
  doc.setFontSize(12)
  const rows = [
    payment.method === "card" ? ["Card", paymentMethodLabel(payment)] : ["Receipt (M-Pesa)", payment.mpesaReceipt ?? "—"],
    ["Payment ID", payment.id],
    ["Customer", payment.customerName ?? ""],
    ["Account", payment.accountNumber ?? user?.accountNumber ?? ""],
    ["Date", formatDateTime(payment.completedAt)],
    ["Amount", ksh(payment.amountPaid)],
    ...(payment.method === "card" ? [] : [["Paid from", displayPhone(payment.phone)]]),
  ]
  rows.forEach(([k, v], i) => doc.text(`${k}: ${v}`, 20, 40 + i * 9))
  let y = 40 + rows.length * 9 + 6
  ;(payment.allocations ?? []).forEach((a) => {
    doc.text(`Applied to ${a.period} bill: ${ksh(a.amount)}`, 20, y)
    y += 8
  })
  if (payment.creditAdded > 0) doc.text(`Added as account credit: ${ksh(payment.creditAdded)}`, 20, y)
  doc.setFontSize(10)
  doc.text("Thank you for your payment!", 20, y + 16)
  doc.save(`Receipt-${payment.mpesaReceipt ?? payment.id.slice(0, 8)}.pdf`)
}

function PaymentsPage() {
  const { profile } = useAuth()
  const [filter, setFilter] = useState("all")
  const payments = useApi("/api/me/payments")
  const bills = useApi("/api/me/bills")

  const all = payments.data?.payments ?? []
  const shown = all.filter((p) => filter === "all" || (filter === "pending" ? isPending(p) : p.status === filter))
  const completed = all.filter((p) => p.status === "completed")
  const total = completed.reduce((s, p) => s + p.amountPaid, 0)
  const unpaid = (bills.data?.bills ?? []).filter((b) => b.status !== "paid")

  const exportCsv = () =>
    downloadCsv(
      "payments.csv",
      shown.map((p) => ({
        date: p.createdAt,
        amount: p.amountPaid ?? p.amount,
        method: paymentMethodLabel(p),
        status: p.status,
        mpesaReceipt: p.mpesaReceipt ?? "",
        phone: displayPhone(p.phone),
        failureReason: p.failureReason ?? "",
      }))
    )

  return (
    <CustomerLayout>
      <div className="container py-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Payment History</h1>
            <p className="text-muted-foreground">Your M-Pesa and card payments</p>
          </div>
          <div className="flex gap-2">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Payments</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={exportCsv} disabled={!shown.length}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </div>
        </div>

        <ErrorNote error={payments.error} onRetry={payments.reload} />

        <Card>
          <CardHeader>
            <CardTitle>Payment Records</CardTitle>
          </CardHeader>
          <CardContent>
            {shown.length === 0 ? (
              <Empty>{payments.loading ? "Loading…" : "No payments"}</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      {["Date", "Amount", "Method", "Reference", "Status", ""].map((h) => (
                        <th key={h} className="px-4 py-2 text-left font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((p) => (
                      <tr key={p.id} className="border-b">
                        <td className="px-4 py-2">{formatDateTime(p.createdAt)}</td>
                        <td className="px-4 py-2">{ksh(p.amountPaid ?? p.amount)}</td>
                        <td className="px-4 py-2">
                          {paymentMethodLabel(p)}
                          {p.phone && <div className="text-xs text-muted-foreground">{displayPhone(p.phone)}</div>}
                        </td>
                        <td className="px-4 py-2">
                          {p.mpesaReceipt ?? (p.receiptUrl ? <a href={p.receiptUrl} target="_blank" rel="noreferrer" className="underline">Stripe receipt</a> : "—")}
                        </td>
                        <td className="px-4 py-2">
                          <StatusBadge status={p.status} />
                          {p.status === "failed" && <p className="mt-1 text-xs text-muted-foreground">{p.failureReason}</p>}
                        </td>
                        <td className="px-4 py-2">
                          {p.status === "completed" && (
                            <Button variant="ghost" size="sm" onClick={() => downloadReceipt(p, profile)}>
                              <Download className="mr-1 h-4 w-4" />
                              Receipt
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Payment Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <p className="font-medium">Total paid</p>
                <p>{ksh(total)}</p>
              </div>
              <div className="flex items-center justify-between border-b pb-2">
                <p className="font-medium">Completed payments</p>
                <p>{completed.length}</p>
              </div>
              <div className="flex items-center justify-between border-b pb-2">
                <p className="font-medium">Most recent payment</p>
                <p>{completed[0] ? `${ksh(completed[0].amountPaid)} on ${formatDate(completed[0].completedAt)}` : "—"}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Unpaid Bills</CardTitle>
              <CardDescription>Bills still awaiting payment</CardDescription>
            </CardHeader>
            <CardContent>
              {unpaid.length === 0 && <Empty>Nothing due. You're all paid up.</Empty>}
              {unpaid.map((b) => (
                <div key={b.id} className="flex items-center justify-between border-b py-3">
                  <div>
                    <p className="font-medium">{b.label} bill</p>
                    <p className={`text-sm ${b.overdue ? "text-red-500" : "text-muted-foreground"}`}>
                      {b.overdue ? "Overdue since" : "Due on"} {formatDate(b.dueDate)}
                    </p>
                  </div>
                  <p className="font-medium">{ksh(b.outstanding)}</p>
                </div>
              ))}
              {unpaid.length > 0 && (
                <Button className="mt-4 w-full bg-water hover:bg-water-dark" asChild>
                  <Link to="/bills">Pay Now</Link>
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </CustomerLayout>
  )
}

export default PaymentsPage
