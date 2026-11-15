import { Routes, Route, Navigate } from "react-router-dom"
import { ToastContainer } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"
import { ThemeProvider } from "./Components/theme-provider"
import { AuthProvider, RequireAuth, RequireAdmin, RedirectIfSignedIn } from "./auth/AuthProvider"

import LoginPage from "./pages/User/login"
import RegisterPage from "./pages/User/register"
import CustomerDashboard from "./pages/User/dashboard"
import BillsPage from "./pages/User/bills"
import UsagePage from "./pages/User/usage"
import PaymentsPage from "./pages/User/payments"
import FeedbackPage from "./pages/User/feedback"
import ProfilePage from "./pages/User/profile"
import HomePage from "./pages/User/home"
import RequestConnectionPage from "./pages/User/request-connection"

import AdminDashboard from "./pages/Admin/dashboard"
import CustomersPage from "./pages/Admin/customers"
import BillingPage from "./pages/Admin/billing"
import PaymentsManagementPage from "./pages/Admin/payments"
import TicketsPage from "./pages/Admin/tickets"
import UsersPage from "./pages/Admin/users"

const customer = (page) => <RequireAuth>{page}</RequireAuth>
const admin = (page) => <RequireAdmin>{page}</RequireAdmin>

function App() {
  return (
    <ThemeProvider defaultTheme="dark">
      <AuthProvider>
        <ToastContainer position="top-right" autoClose={4000} />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<RedirectIfSignedIn><LoginPage /></RedirectIfSignedIn>} />
          <Route path="/register" element={<RedirectIfSignedIn><RegisterPage /></RedirectIfSignedIn>} />

          <Route path="/request-connection" element={customer(<RequestConnectionPage />)} />
          <Route path="/dashboard" element={customer(<CustomerDashboard />)} />
          <Route path="/bills" element={customer(<BillsPage />)} />
          <Route path="/usage" element={customer(<UsagePage />)} />
          <Route path="/payments" element={customer(<PaymentsPage />)} />
          <Route path="/feedback" element={customer(<FeedbackPage />)} />
          <Route path="/profile" element={customer(<ProfilePage />)} />

          <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="/admin/dashboard" element={admin(<AdminDashboard />)} />
          <Route path="/admin/customers" element={admin(<CustomersPage />)} />
          <Route path="/admin/billing" element={admin(<BillingPage />)} />
          <Route path="/admin/payments" element={admin(<PaymentsManagementPage />)} />
          <Route path="/admin/tickets" element={admin(<TicketsPage />)} />
          <Route path="/admin/users" element={admin(<UsersPage />)} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App
