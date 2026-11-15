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
import { useAuth } from "../../auth/AuthProvider"
import { api, useApi } from "../../lib/api"
import { formatDate, fullName } from "../../lib/format"

function UsersPage() {
  const { profile } = useAuth()
  const users = useApi("/api/admin/users")
  const [role, setRole] = useState("all")
  const [query, setQuery] = useState("")
  const [busy, setBusy] = useState(null)

  const rows = (users.data?.users ?? []).filter(
    (u) => (role === "all" || u.userRole === role) && matches(query, fullName(u), u.email, u.accountNumber)
  )

  const changeRole = async (user, newRole) => {
    setBusy(user.uid)
    try {
      const res = await api(`/api/admin/users/${user.uid}/role`, { method: "PATCH", body: { role: newRole } })
      toast.success(`${fullName(user)}: ${res.message}`)
      users.reload()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <AdminLayout>
      <div className="container py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
          <p className="text-muted-foreground">Grant or revoke administrator access. Changes take effect on the user's next request.</p>
        </div>

        <Card>
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>All Accounts</CardTitle>
              <CardDescription>{rows.length} account(s)</CardDescription>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search users…" className="pl-8" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  <SelectItem value="admin">Admins</SelectItem>
                  <SelectItem value="user">Customers</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <ErrorNote error={users.error} onRetry={users.reload} />
            <DataTable
              rows={rows}
              rowKey={(u) => u.uid}
              loading={users.loading}
              empty="No users match"
              columns={[
                { header: "Name", cell: (u) => fullName(u) },
                { header: "Email", cell: (u) => u.email },
                { header: "Role", cell: (u) => <StatusBadge status={u.userRole} label={u.userRole === "admin" ? "Admin" : "Customer"} /> },
                { header: "Account", cell: (u) => u.accountNumber ?? "—" },
                { header: "Joined", cell: (u) => formatDate(u.createdOn) },
                {
                  header: "",
                  cell: (u) =>
                    u.uid === profile?.uid ? (
                      <span className="text-xs text-muted-foreground">You</span>
                    ) : u.userRole === "admin" ? (
                      <Button variant="ghost" size="sm" disabled={busy === u.uid} onClick={() => changeRole(u, "user")}>Remove admin</Button>
                    ) : (
                      <Button variant="ghost" size="sm" disabled={busy === u.uid} onClick={() => changeRole(u, "admin")}>Make admin</Button>
                    ),
                },
              ]}
            />
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  )
}

export default UsersPage
