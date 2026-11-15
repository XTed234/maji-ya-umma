import { useState } from "react"
import { Button } from "../components/ui/button"
import { Empty } from "./status-badge"

// columns: [{ header, cell: (row) => node, className? }]
export function DataTable({ columns, rows, rowKey = (r) => r.id, empty = "Nothing to show", loading = false, pageSize = 15 }) {
  const [page, setPage] = useState(0)
  if (loading && !rows.length) return <Empty>Loading…</Empty>
  if (!rows.length) return <Empty>{empty}</Empty>

  const pages = Math.ceil(rows.length / pageSize)
  const current = Math.min(page, pages - 1)
  const visible = rows.slice(current * pageSize, (current + 1) * pageSize)

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              {columns.map((c) => (
                <th key={c.header} className="px-3 py-2 text-left font-medium">{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={rowKey(row)} className="border-b align-top">
                {columns.map((c) => (
                  <td key={c.header} className={`px-3 py-2 ${c.className ?? ""}`}>{c.cell(row)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {current * pageSize + 1}–{Math.min((current + 1) * pageSize, rows.length)} of {rows.length}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  )
}

export const matches = (query, ...values) => {
  const q = query.trim().toLowerCase()
  return !q || values.some((v) => String(v ?? "").toLowerCase().includes(q))
}
