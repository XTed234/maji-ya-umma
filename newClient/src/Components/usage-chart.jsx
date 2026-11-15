import { useEffect, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"

// data: [{ month: "Oct", usage: 4.5 }]
export function UsageChart({ data, title = "Water Usage", description = "Monthly water consumption in m³", unit = "m³" }) {
  const canvasRef = useRef(null)
  const hasData = data.some((d) => d.usage > 0)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!ctx) return

    const { width, height } = canvas
    ctx.clearRect(0, 0, width, height)
    if (!data.length) return

    const padding = 48
    const chartWidth = width - padding * 2
    const chartHeight = height - padding * 2
    const maxUsage = Math.max(...data.map((d) => d.usage), 1)
    const scale = chartHeight / maxUsage
    const text = getComputedStyle(canvas).color || "#64748b"
    const fmt = (v) => (v >= 100 ? Math.round(v).toLocaleString() : (Math.round(v * 10) / 10).toString())

    ctx.strokeStyle = "#94a3b8"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(padding, padding)
    ctx.lineTo(padding, height - padding)
    ctx.lineTo(width - padding, height - padding)
    ctx.stroke()

    const slot = chartWidth / data.length
    const barWidth = slot * 0.7
    ctx.font = "12px sans-serif"
    ctx.textAlign = "center"

    data.forEach((item, i) => {
      const x = padding + i * slot + (slot - barWidth) / 2
      const barHeight = item.usage * scale
      const y = height - padding - barHeight
      ctx.fillStyle = "rgba(59, 130, 246, 0.85)"
      ctx.fillRect(x, y, barWidth, barHeight)
      ctx.fillStyle = text
      ctx.fillText(item.month, x + barWidth / 2, height - padding + 16)
      if (item.usage > 0) ctx.fillText(fmt(item.usage), x + barWidth / 2, y - 6)
    })

    ctx.textAlign = "right"
    for (let i = 0; i <= 4; i++) {
      const value = (maxUsage / 4) * i
      const y = height - padding - value * scale
      ctx.fillStyle = text
      ctx.fillText(fmt(value), padding - 6, y + 4)
      ctx.strokeStyle = "rgba(148, 163, 184, 0.2)"
      ctx.beginPath()
      ctx.moveTo(padding, y)
      ctx.lineTo(width - padding, y)
      ctx.stroke()
    }
    ctx.textAlign = "left"
    ctx.fillText(unit, 4, padding - 16)
  }, [data, unit])

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative h-80 w-full">
          <canvas ref={canvasRef} width={800} height={400} className="h-full w-full text-muted-foreground" />
          {!hasData && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              No usage recorded yet
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
