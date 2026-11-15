import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { CreditCard, Download, Loader2, Smartphone } from "lucide-react"
import { loadStripe } from "@stripe/stripe-js"
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js"
import { toast } from "react-toastify"
import jsPDF from "jspdf"
import { Button } from "../../components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../../components/ui/card"
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"
import { CustomerLayout } from "../../Components/customer-layout"
import { StatusBadge, Empty, ErrorNote } from "../../Components/status-badge"
import { api, useApi } from "../../lib/api"
import { ksh, m3, formatDate, balanceLabel, displayPhone } from "./shared"

const POLL_MS = 2500
const POLL_TIMEOUT_MS = 6 * 60 * 1000 // the backend gives up after ~5 minutes

function downloadBill(bill, user) {
  const doc = new jsPDF()
  doc.setFontSize(18)
  doc.text("Maji ya Umma — Water Bill", 20, 20)
  doc.setFontSize(11)
  const rows = [
    ["Customer", bill.customerName],
    ["Account", bill.accountNumber ?? user?.accountNumber ?? ""],
    ["Meter", bill.meterNumber],
    ["Billing period", bill.label],
    ["Consumption", m3(bill.consumptionLitres, 3)],
    ["Issued", formatDate(bill.issuedAt)],
    ["Due date", formatDate(bill.dueDate)],
  ]
  rows.forEach(([k, v], i) => doc.text(`${k}: ${v}`, 20, 36 + i * 7))
  let y = 92
  doc.setFontSize(12)
  doc.text("Charges", 20, y)
  doc.setFontSize(11)
  bill.lines.forEach((l) => {
    y += 7
    const detail = l.quantityM3 != null ? `${l.quantityM3} m³ × Ksh ${l.ratePerM3}` : ""
    doc.text(`${l.label}  ${detail}`, 24, y)
    doc.text(ksh(l.amount), 170, y, { align: "right" })
  })
  y += 10
  doc.text(`Total: ${ksh(bill.amountDue)}`, 170, y, { align: "right" })
  doc.text(`Paid: ${ksh(bill.amountPaid)}`, 170, y + 7, { align: "right" })
  doc.text(`Outstanding: ${ksh(bill.outstanding)}`, 170, y + 14, { align: "right" })
  doc.setFontSize(9)
  doc.text(`Tariff: ${bill.tariff}`, 20, y + 28)
  doc.save(`Bill-${bill.period}-${bill.meterNumber}.pdf`)
}

let stripePromise = null
const getStripe = (publishableKey) => (stripePromise ??= loadStripe(publishableKey))

// Card details go straight from Stripe's iframe to Stripe; this app never sees them.
function CardForm({ paymentId, amount, onSubmitted, onCancel }) {
  const stripe = useStripe()
  const elements = useElements()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const submit = async (e) => {
    e.preventDefault()
    if (!stripe || !elements) return
    setBusy(true)
    setError("")
    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      redirect: "if_required", // only leaves the page if the bank's 3-D Secure needs it
      confirmParams: { return_url: `${window.location.origin}/bills?payment=${paymentId}` },
    })
    if (stripeError) {
      // e.g. declined: the same payment stays open, so another card can be tried.
      setError(stripeError.message)
      setBusy(false)
      return
    }
    onSubmitted()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <PaymentElement />
      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" className="flex-1 bg-water hover:bg-water-dark" disabled={!stripe || busy}>
          {busy ? "Processing…" : `Pay ${ksh(amount)}`}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
      </div>
      <p className="text-xs text-muted-foreground">Card payments are processed securely by Stripe.</p>
    </form>
  )
}

const paidWith = (p) =>
  p.method === "card"
    ? `card ${p.cardBrand ? p.cardBrand.toUpperCase() + " " : ""}ending ${p.cardLast4 ?? "****"}`
    : p.mpesaReceipt ? `M-Pesa ${p.mpesaReceipt}` : "M-Pesa"

function BillsPage() {
  const me = useApi("/api/me")
  const bills = useApi("/api/me/bills")
  const options = useApi("/api/me/payment-options")
  const user = me.data?.user
  const cardEnabled = Boolean(options.data?.card)
  const [searchParams, setSearchParams] = useSearchParams()
  const [method, setMethod] = useState("mpesa")
  const [cardSession, setCardSession] = useState(null) // { paymentId, clientSecret, amount }
  const [phone, setPhone] = useState("")
  const [amount, setAmount] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [active, setActive] = useState(null) // payment being confirmed on the phone
  const pollRef = useRef(null)

  useEffect(() => {
    if (!user) return
    setPhone((p) => p || displayPhone(user.phoneNumber))
    setAmount((a) => (a !== "" ? a : user.balance > 0 ? String(user.balance) : ""))
  }, [user])

  useEffect(() => () => clearTimeout(pollRef.current), [])

  const poll = (paymentId, startedAt) => {
    pollRef.current = setTimeout(async () => {
      try {
        const { payment } = await api(`/api/me/payments/${paymentId}`)
        setActive(payment)
        if (payment.status === "completed") {
          toast.success(`Payment of ${ksh(payment.amountPaid)} received (${paidWith(payment)})`)
          setActive(null)
          setAmount("")
          me.reload()
          bills.reload()
          return
        }
        if (payment.status === "failed") {
          toast.error(`Payment not completed: ${payment.failureReason}`)
          setActive(null)
          return
        }
      } catch {
        // transient network error: keep polling
      }
      if (Date.now() - startedAt < POLL_TIMEOUT_MS) poll(paymentId, startedAt)
      else {
        toast.info("Still waiting for M-Pesa. Check Payment History in a few minutes.")
        setActive(null)
      }
    }, POLL_MS)
  }

  // Card: ask the server to check with Stripe right away, then wait for the
  // payment to be settled (the webhook and the poller are the backup).
  const awaitCardPayment = async (paymentId) => {
    setActive({ id: paymentId, method: "card", status: "pending" })
    try {
      await api(`/api/me/payments/${paymentId}/confirm`, { method: "POST" })
    } catch {
      // not fatal: the webhook / status poller settle it anyway
    }
    poll(paymentId, Date.now())
  }

  // Back from a 3-D Secure redirect: /bills?payment=<id>&payment_intent=...
  useEffect(() => {
    const returning = searchParams.get("payment")
    if (!returning) return
    setSearchParams({}, { replace: true })
    awaitCardPayment(returning)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handlePay = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      if (method === "card") {
        const res = await api("/api/me/payments", { method: "POST", body: { method: "card", amount: Number(amount) } })
        setCardSession({ paymentId: res.paymentId, clientSecret: res.clientSecret, amount: Number(amount) })
      } else {
        const res = await api("/api/me/payments", { method: "POST", body: { method: "mpesa", amount: Number(amount), phoneNumber: phone } })
        toast.info(res.message)
        setActive({ id: res.paymentId, method: "mpesa", status: res.status })
        poll(res.paymentId, Date.now())
      }
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const cancelCard = async () => {
    const { paymentId } = cardSession
    setCardSession(null)
    try {
      await api(`/api/me/payments/${paymentId}/cancel`, { method: "POST" })
      toast.info("Card payment cancelled")
    } catch (err) {
      toast.error(err.message)
    }
  }

  const list = bills.data?.bills ?? []
  const latest = list[0]

  return (
    <CustomerLayout>
      <div className="container py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Bills & Payment</h1>
          <p className="text-muted-foreground">Pay your water bill with M-Pesa or card</p>
        </div>

        <ErrorNote error={me.error || bills.error} onRetry={() => { me.reload(); bills.reload() }} />

        <div className="grid gap-8 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Account Summary</CardTitle>
              <CardDescription>Account {user?.accountNumber}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <p className="font-medium">Outstanding balance</p>
                <p className={`text-lg font-semibold ${user?.balance > 0 ? "text-red-500" : "text-green-600"}`}>{balanceLabel(user?.balance ?? 0)}</p>
              </div>
              {latest ? (
                <>
                  <div className="flex items-center justify-between border-b pb-2">
                    <p className="font-medium">Latest bill</p>
                    <p>{latest.label} · meter {latest.meterNumber}</p>
                  </div>
                  <div className="flex items-center justify-between border-b pb-2">
                    <p className="font-medium">Water used</p>
                    <p>{m3(latest.consumptionLitres)}</p>
                  </div>
                  {latest.lines.map((l) => (
                    <div key={l.label} className="flex items-center justify-between text-sm text-muted-foreground">
                      <p>{l.label}{l.quantityM3 != null ? ` (${l.quantityM3} m³ × Ksh ${l.ratePerM3})` : ""}</p>
                      <p>{ksh(l.amount)}</p>
                    </div>
                  ))}
                  <div className="flex items-center justify-between border-t pt-2">
                    <p className="font-medium">Bill total</p>
                    <p className="font-medium">{ksh(latest.amountDue)}</p>
                  </div>
                  <div className={`flex items-center justify-between ${latest.overdue ? "text-red-500" : ""}`}>
                    <p className="font-medium">Due date</p>
                    <p>{formatDate(latest.dueDate)} <StatusBadge status={latest.overdue ? "overdue" : latest.status} /></p>
                  </div>
                </>
              ) : (
                !bills.loading && <Empty>No bills yet. Bills are issued at the start of each month for the previous month's usage.</Empty>
              )}
            </CardContent>
            {latest && (
              <CardFooter>
                <Button variant="outline" className="w-full" onClick={() => downloadBill(latest, user)}>
                  <Download className="mr-2 h-4 w-4" /> Download PDF
                </Button>
              </CardFooter>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {method === "card" ? <CreditCard className="h-5 w-5" /> : <Smartphone className="h-5 w-5" />} Make a Payment
              </CardTitle>
              <CardDescription>
                {method === "card" ? "Pay with a debit or credit card" : "You'll get a prompt on your phone to enter your M-Pesa PIN"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {cardEnabled && !cardSession && !active && (
                <div className="grid grid-cols-2 gap-2">
                  {["mpesa", "card"].map((value) => (
                    <Button key={value} type="button" variant={method === value ? "default" : "outline"} onClick={() => setMethod(value)}>
                      {value === "card" ? <CreditCard className="mr-2 h-4 w-4" /> : <Smartphone className="mr-2 h-4 w-4" />}
                      {value === "card" ? "Card" : "M-Pesa"}
                    </Button>
                  ))}
                </div>
              )}

              {cardSession ? (
                <Elements
                  stripe={getStripe(options.data.stripePublishableKey)}
                  options={{ clientSecret: cardSession.clientSecret, appearance: { theme: "night", variables: { colorPrimary: "#3498db" } } }}
                >
                  <CardForm
                    paymentId={cardSession.paymentId}
                    amount={cardSession.amount}
                    onCancel={cancelCard}
                    onSubmitted={() => {
                      const { paymentId } = cardSession
                      setCardSession(null)
                      awaitCardPayment(paymentId)
                    }}
                  />
                </Elements>
              ) : (
                <form onSubmit={handlePay} className="space-y-4">
                  {method === "mpesa" && (
                    <div className="grid gap-2">
                      <Label htmlFor="phone">M-Pesa phone number</Label>
                      <Input id="phone" placeholder="0712 345 678" value={phone} onChange={(e) => setPhone(e.target.value)} required disabled={Boolean(active)} />
                    </div>
                  )}
                  <div className="grid gap-2">
                    <Label htmlFor="amount">Amount (Ksh)</Label>
                    <Input id="amount" type="number" min="1" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} required disabled={Boolean(active)} />
                    <p className="text-xs text-muted-foreground">Payments go to your oldest unpaid bill first; any extra is kept as credit.</p>
                  </div>
                  {active && (
                    <div className="flex items-center gap-3 rounded-md bg-muted p-3 text-sm">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>
                        {active.method === "card"
                          ? "Confirming your card payment…"
                          : active.status === "pending"
                            ? `Enter your M-Pesa PIN on ${phone} to complete the payment…`
                            : "Sending the payment request to your phone…"}
                      </span>
                    </div>
                  )}
                  <Button type="submit" className="w-full bg-water hover:bg-water-dark" disabled={submitting || Boolean(active)}>
                    {submitting
                      ? "Please wait…"
                      : active
                        ? "Waiting for confirmation…"
                        : method === "card"
                          ? "Continue to card details"
                          : `Pay ${amount ? ksh(amount) : ""} with M-Pesa`}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="mt-8">
          <CardHeader>
            <CardTitle>All Bills</CardTitle>
            <CardDescription>Your billing history</CardDescription>
          </CardHeader>
          <CardContent>
            {list.length === 0 ? (
              <Empty>{bills.loading ? "Loading…" : "No bills yet"}</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      {["Period", "Meter", "Usage", "Amount", "Paid", "Due", "Status", ""].map((h) => (
                        <th key={h} className="px-4 py-2 text-left font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((b) => (
                      <tr key={b.id} className="border-b">
                        <td className="px-4 py-2">{b.label}</td>
                        <td className="px-4 py-2">{b.meterNumber}</td>
                        <td className="px-4 py-2">{m3(b.consumptionLitres)}</td>
                        <td className="px-4 py-2">{ksh(b.amountDue)}</td>
                        <td className="px-4 py-2">{ksh(b.amountPaid)}</td>
                        <td className="px-4 py-2">{formatDate(b.dueDate)}</td>
                        <td className="px-4 py-2"><StatusBadge status={b.overdue ? "overdue" : b.status} /></td>
                        <td className="px-4 py-2">
                          <Button variant="ghost" size="sm" onClick={() => downloadBill(b, user)}>
                            <Download className="mr-1 h-4 w-4" /> PDF
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </CustomerLayout>
  )
}

export default BillsPage
