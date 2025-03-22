import { CustomerLayout } from "../../Components/customer-layout"
import { UsageChart } from "../../Components/usage-chart"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"

function UsagePage() {
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
            <h1 className="text-3xl font-bold tracking-tight">Water Usage</h1>
            <p className="text-muted-foreground">Monitor your water consumption</p>
          </div>
          <Select defaultValue="6months">
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Time Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3months">Last 3 Months</SelectItem>
              <SelectItem value="6months">Last 6 Months</SelectItem>
              <SelectItem value="1year">Last Year</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <UsageChart data={usageData} />

          <Card>
            <CardHeader>
              <CardTitle>Usage Details</CardTitle>
              <CardDescription>Monthly breakdown of your water consumption</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {usageData.map((item, index) => (
                  <div key={index} className="flex items-center justify-between border-b pb-2">
                    <div>
                      <p className="font-medium">{item.month} 2025</p>
                      <p className="text-sm text-muted-foreground">
                        {index === 0 ? "Current month" : `${index} month${index > 1 ? "s" : ""} ago`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{item.usage} gallons</p>
                      {index > 0 && (
                        <p
                          className={`text-sm ${item.usage > usageData[index - 1].usage ? "text-red-500" : "text-green-500"}`}
                        >
                          {item.usage > usageData[index - 1].usage
                            ? `+${item.usage - usageData[index - 1].usage}`
                            : `-${usageData[index - 1].usage - item.usage}`}{" "}
                          gallons
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8">
          <Card>
            <CardHeader>
              <CardTitle>Conservation Tips</CardTitle>
              <CardDescription>Ways to reduce your water consumption</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 list-disc pl-5">
                <li>Fix leaky faucets and toilets promptly</li>
                <li>Install water-efficient showerheads and faucets</li>
                <li>Take shorter showers instead of baths</li>
                <li>Only run full loads in washing machines and dishwashers</li>
                <li>Water your lawn and garden in the early morning or evening</li>
                <li>Use a broom instead of a hose to clean driveways and sidewalks</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </CustomerLayout>
  )
}

export default UsagePage

