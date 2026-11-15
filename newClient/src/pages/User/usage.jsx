import { useState } from "react"
import { CustomerLayout } from "../../Components/customer-layout"
import { UsageChart } from "../../Components/usage-chart"
import { Empty, ErrorNote } from "../../Components/status-badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"
import { useApi } from "../../lib/api"
import { m3, formatDateTime } from "./shared"

function UsagePage() {
  const [months, setMonths] = useState("6")
  const usage = useApi(`/api/me/usage?months=${months}`)
  const rows = [...(usage.data?.months ?? [])].reverse() // newest first
  const meters = usage.data?.meters ?? []

  return (
    <CustomerLayout>
      <div className="container py-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Water Usage</h1>
            <p className="text-muted-foreground">Measured by your meter{meters.length > 1 ? "s" : ""}</p>
          </div>
          <Select value={months} onValueChange={setMonths}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Time Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">Last 3 Months</SelectItem>
              <SelectItem value="6">Last 6 Months</SelectItem>
              <SelectItem value="12">Last Year</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <ErrorNote error={usage.error} onRetry={usage.reload} />

        {!usage.loading && meters.length === 0 && (
          <Card className="mb-6">
            <CardContent className="py-4 text-sm">No meter is linked to your account yet. Request a connection from the dashboard.</CardContent>
          </Card>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <UsageChart data={(usage.data?.months ?? []).map((m) => ({ month: m.label.split(" ")[0].slice(0, 3), usage: m.consumptionLitres / 1000 }))} />

          <Card>
            <CardHeader>
              <CardTitle>Usage Details</CardTitle>
              <CardDescription>Monthly breakdown (1 m³ = 1,000 litres)</CardDescription>
            </CardHeader>
            <CardContent>
              {rows.length === 0 && <Empty>{usage.loading ? "Loading…" : "No usage yet"}</Empty>}
              <div className="space-y-4">
                {rows.map((item, index) => {
                  const previous = rows[index + 1]
                  const diff = previous ? item.consumptionLitres - previous.consumptionLitres : null
                  return (
                    <div key={item.period} className="flex items-center justify-between border-b pb-2">
                      <div>
                        <p className="font-medium">{item.label}</p>
                        <p className="text-sm text-muted-foreground">{index === 0 ? "Current month (so far)" : `${index} month${index > 1 ? "s" : ""} ago`}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{m3(item.consumptionLitres)}</p>
                        <p className="text-xs text-muted-foreground">{item.consumptionLitres.toLocaleString()} litres</p>
                        {diff !== null && index > 0 && diff !== 0 && (
                          <p className={`text-sm ${diff > 0 ? "text-red-500" : "text-green-500"}`}>
                            {diff > 0 ? "+" : "−"}{m3(Math.abs(diff))} vs previous month
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {meters.length > 0 && (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle>Your Meters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {meters.map((m) => (
                <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-sm">
                  <span className="font-medium">{m.id}</span>
                  <span>{[m.address, m.city].filter(Boolean).join(", ")}</span>
                  <span className="text-muted-foreground">
                    Last reading {m.lastReading} m³ {m.lastReadAt ? `on ${formatDateTime(m.lastReadAt)}` : "(installation)"}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <div className="mt-8">
          <Card>
            <CardHeader>
              <CardTitle>Conservation Tips</CardTitle>
              <CardDescription>Ways to reduce your water consumption</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-2 pl-5">
                <li>Fix leaky taps and toilets promptly — we'll SMS you if your meter shows unusually high use</li>
                <li>Install water-efficient showerheads and taps</li>
                <li>Take shorter showers instead of baths</li>
                <li>Only run full loads in washing machines</li>
                <li>Water gardens in the early morning or evening</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </CustomerLayout>
  )
}

export default UsagePage
