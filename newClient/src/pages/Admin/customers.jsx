import { useState } from "react"
import { Search } from "lucide-react"
import { toast } from "react-toastify"

import { Button } from "../../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card"
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"
import { AdminLayout } from "../../Components/admin-layout"
import { DataTable, matches } from "../../Components/data-table"
import { ErrorNote } from "../../Components/status-badge"
import { api, useApi } from "../../lib/api"
import { balanceLabel, formatDate, fullName, displayPhone, ksh } from "../../lib/format"

function RecordReading({ onDone }) {
  const [form, setForm] = useState({ meterNumber: "", reading: "", readAt: "" })
  const [busy, setBusy] = useState(false)
  const set = (e) => setForm({ ...form, [e.target.id]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api("/api/readings", {
        method: "POST",
        body: {
          meterNumber: form.meterNumber,
          reading: Number(form.reading),
          ...(form.readAt ? { readAt: new Date(form.readAt).toISOString() } : {}),
        },
      })
      toast.success(`Reading for ${form.meterNumber.toUpperCase()} queued`)
      setForm({ meterNumber: "", reading: "", readAt: "" })
      onDone?.()
    } catch (err) {
      toast.error(err.data?.errors?.[0]?.message || err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>Record a Meter Reading</CardTitle>
        <CardDescription>For manual reads by field staff. Meter gateways post to the same endpoint with an API key.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4 md:grid-cols-4 md:items-end">
          <div className="grid gap-2">
            <Label htmlFor="meterNumber">Meter number</Label>
            <Input id="meterNumber" placeholder="MTR-12345678" value={form.meterNumber} onChange={set} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="reading">Reading (m³ on the dial)</Label>
            <Input id="reading" type="number" step="0.001" min="0" value={form.reading} onChange={set} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="readAt">Read at (default: now)</Label>
            <Input id="readAt" type="datetime-local" value={form.readAt} onChange={set} />
          </div>
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Submit Reading"}</Button>
        </form>
      </CardContent>
    </Card>
  )
}

function CustomersPage() {
  const customers = useApi("/api/admin/customers")
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState("all")

  const rows = (customers.data?.customers ?? []).filter((c) => {
    if (filter === "connected" && !c.meterNumbers.length) return false
    if (filter === "unconnected" && c.meterNumbers.length) return false
    if (filter === "owing" && !(c.balance > 0)) return false
    return matches(query, fullName(c), c.email, c.accountNumber, c.phoneNumber, displayPhone(c.phoneNumber), ...c.meterNumbers)
  })

  return (
    <AdminLayout>
      <div className="container py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Customer Management</h1>
          <p className="text-muted-foreground">Customer accounts, meters and balances</p>
        </div>

        <RecordReading onDone={() => setTimeout(customers.reload, 2000)} />

        <Card>
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Customer List</CardTitle>
              <CardDescription>{rows.length} customer(s)</CardDescription>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Name, email, account, meter…" className="pl-8" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All customers</SelectItem>
                  <SelectItem value="connected">Connected</SelectItem>
                  <SelectItem value="unconnected">No meter yet</SelectItem>
                  <SelectItem value="owing">Balance owing</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <ErrorNote error={customers.error} onRetry={customers.reload} />
            <DataTable
              rows={rows}
              rowKey={(c) => c.uid}
              loading={customers.loading}
              empty="No customers match"
              columns={[
                { header: "Account #", cell: (c) => c.accountNumber ?? "—" },
                { header: "Name", cell: (c) => fullName(c) },
                { header: "Contact", cell: (c) => <><div>{c.email}</div><div className="text-muted-foreground">{displayPhone(c.phoneNumber)}</div></> },
                { header: "Meters", cell: (c) => (c.meterNumbers.length ? c.meterNumbers.join(", ") : <span className="text-muted-foreground">none</span>) },
                { header: "Balance", cell: (c) => <span className={c.balance > 0 ? "text-red-500" : ""}>{balanceLabel(c.balance)}</span> },
                { header: "Last Payment", cell: (c) => (c.lastPaymentAt ? `${ksh(c.lastPaymentAmount)} · ${formatDate(c.lastPaymentAt)}` : "—") },
              ]}
            />
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  )
}

export default CustomersPage
