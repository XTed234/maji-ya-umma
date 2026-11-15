const STYLES = {
  green: "bg-green-100 text-green-800",
  yellow: "bg-yellow-100 text-yellow-800",
  red: "bg-red-100 text-red-800",
  blue: "bg-blue-100 text-blue-800",
  gray: "bg-gray-100 text-gray-800",
}

const COLOR_BY_STATUS = {
  completed: "green", paid: "green", resolved: "green", approved: "green", active: "green", admin: "blue",
  queued: "yellow", initiating: "yellow", pending: "yellow", partially_paid: "yellow", open: "yellow", in_progress: "blue", unpaid: "yellow",
  failed: "red", overdue: "red", rejected: "red", high: "red",
  medium: "yellow", low: "blue",
}

const LABELS = { queued: "Processing", initiating: "Processing", pending: "Pending", partially_paid: "Partly paid", in_progress: "In progress" }

export function StatusBadge({ status, label }) {
  const key = String(status || "").toLowerCase()
  const color = STYLES[COLOR_BY_STATUS[key] || "gray"]
  const text = label || LABELS[key] || key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " ")
  return <span className={`whitespace-nowrap rounded-full px-2 py-1 text-xs ${color}`}>{text}</span>
}

export function Empty({ children }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>
}

export function ErrorNote({ error, onRetry }) {
  if (!error) return null
  return (
    <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
      {error.message}{" "}
      {onRetry && (
        <button className="underline" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}
