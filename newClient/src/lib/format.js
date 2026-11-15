export const ksh = (n) => `Ksh ${Number(n || 0).toLocaleString("en-KE", { maximumFractionDigits: 2 })}`

export const m3 = (litres, digits = 2) =>
  `${(Number(litres || 0) / 1000).toLocaleString("en-KE", { maximumFractionDigits: digits })} m³`

export const formatDate = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Nairobi" })
    : "—"

export const formatDateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString("en-KE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" })
    : "—"

export const periodLabel = (period) => {
  const [y, m] = period.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleString("en-KE", { month: "long", year: "numeric", timeZone: "UTC" })
}

// "2026-10" for the month before the current one (Nairobi time).
export const previousPeriod = () => {
  const d = new Date(Date.now() + 3 * 3600 * 1000)
  const idx = d.getUTCFullYear() * 12 + d.getUTCMonth() - 1
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`
}

export const balanceLabel = (balance) => (balance < 0 ? `${ksh(-balance)} credit` : ksh(balance))

// "M-Pesa SIM1234" / "VISA •••• 4242"
export const paymentMethodLabel = (p) =>
  p?.method === "card"
    ? `${p.cardBrand ? p.cardBrand.toUpperCase() : "Card"}${p.cardLast4 ? ` •••• ${p.cardLast4}` : ""}`
    : "M-Pesa"

export const fullName = (p) => [p?.firstName, p?.lastName].filter(Boolean).join(" ") || p?.email || "—"

export const displayPhone = (p) => (p && /^254\d{9}$/.test(p) ? `0${p.slice(3)}` : p || "")

export function downloadCsv(filename, rows) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n")
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
  const a = Object.assign(document.createElement("a"), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}
