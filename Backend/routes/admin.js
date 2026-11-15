import express from "express";
import { AggregateField } from "firebase-admin/firestore";
import { db, collections, FieldValue, Timestamp } from "../firebase.js";
import { EVENTS } from "../mq/config.js";
import { publishEvent, queueStats } from "../mq/publisher.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { publicProfile, fullName, ROLES } from "../services/profiles.js";
import { TARIFF } from "../services/tariff.js";
import {
  asyncHandler,
  HttpError,
  docToJSON,
  toMillis,
  isValidPeriod,
  periodOf,
  periodStart,
  periodLabel,
  recentPeriods,
  shiftPeriod,
  generateMeterNumber,
} from "../lib/util.js";

const router = express.Router();
router.use(requireAuth, requireAdmin);

const LIST_LIMIT = 500;
const byNewest = (field) => (a, b) => toMillis(b[field]) - toMillis(a[field]);

// Admin actions below are synchronous (they validate against current state and
// the admin wants the answer now); the resulting domain event is published
// afterwards for notifications. A broker hiccup must not undo the action.
function publishAfterCommit(type, data, id) {
  publishEvent(type, data, { id }).catch((err) => console.error(`${type} not published: ${err.message}`));
}

// ---------- dashboard ----------

router.get(
  "/stats",
  asyncHandler(async (req, res) => {
    const current = periodOf();
    const lastPeriod = shiftPeriod(current, -1);
    const monthStart = Timestamp.fromDate(periodStart(current));
    const chartPeriods = recentPeriods(6);

    const count = (q) => q.count().get().then((s) => s.data().count);
    const [customers, activeMeters, openTickets, pendingConnections, revenueAgg, monthPayments, usageDocs, lastBills, openBills] =
      await Promise.all([
        count(collections.users().where("userRole", "==", ROLES.CUSTOMER)),
        count(collections.meters().where("status", "==", "active")),
        count(collections.tickets().where("status", "in", ["open", "in_progress"])),
        count(collections.connectionRequests().where("status", "==", "pending")),
        collections.payments()
          .where("completedAt", ">=", monthStart)
          .aggregate({ total: AggregateField.sum("amountPaid"), count: AggregateField.count() })
          .get(),
        collections.payments().where("createdAt", ">=", monthStart).select("status").get(),
        db.getAll(...chartPeriods.map((p) => collections.usageTotals().doc(p))),
        collections.bills()
          .where("period", "==", lastPeriod)
          .aggregate({ count: AggregateField.count(), billed: AggregateField.sum("amountDue"), collected: AggregateField.sum("amountPaid") })
          .get(),
        collections.bills().where("status", "in", ["unpaid", "partially_paid"]).select("dueDate", "amountDue", "amountPaid").get(),
      ]);

    const settled = monthPayments.docs.map((d) => d.data().status).filter((s) => s === "completed" || s === "failed");
    const now = Date.now();
    const overdue = openBills.docs.filter((d) => toMillis(d.data().dueDate) < now);

    res.json({
      period: current,
      customers,
      activeMeters,
      openTickets,
      pendingConnections,
      revenueThisMonth: revenueAgg.data().total ?? 0,
      paymentsThisMonth: revenueAgg.data().count,
      paymentSuccessRate: settled.length ? settled.filter((s) => s === "completed").length / settled.length : null,
      usage: usageDocs.map((d, i) => ({
        period: chartPeriods[i],
        label: periodLabel(chartPeriods[i]),
        consumptionLitres: d.exists ? d.data().consumptionLitres ?? 0 : 0,
      })),
      lastPeriodBills: {
        period: lastPeriod,
        label: periodLabel(lastPeriod),
        count: lastBills.data().count,
        billed: lastBills.data().billed ?? 0,
        collected: lastBills.data().collected ?? 0,
      },
      openBills: openBills.size,
      overdueBills: overdue.length,
      overdueAmount: overdue.reduce((s, d) => s + d.data().amountDue - d.data().amountPaid, 0),
    });
  })
);

router.get(
  "/queues",
  asyncHandler(async (req, res) => {
    res.json({ queues: await queueStats() });
  })
);

// ---------- people ----------

router.get(
  "/customers",
  asyncHandler(async (req, res) => {
    const snap = await collections.users().where("userRole", "==", ROLES.CUSTOMER).limit(LIST_LIMIT).get();
    const customers = snap.docs.map((d) => publicProfile({ id: d.id, ...d.data() }));
    res.json({ customers: customers.sort((a, b) => fullName(a).localeCompare(fullName(b))) });
  })
);

router.get(
  "/users",
  asyncHandler(async (req, res) => {
    const snap = await collections.users().limit(LIST_LIMIT).get();
    const users = snap.docs.map((d) => publicProfile({ id: d.id, ...d.data() }));
    res.json({ users: users.sort((a, b) => fullName(a).localeCompare(fullName(b))) });
  })
);

router.patch(
  "/users/:uid/role",
  asyncHandler(async (req, res) => {
    const role = req.body?.role;
    if (![ROLES.ADMIN, ROLES.CUSTOMER].includes(role)) throw new HttpError(400, "role must be admin or user");
    if (req.params.uid === req.user.uid) throw new HttpError(400, "You can't change your own role");
    const ref = collections.users().doc(req.params.uid);
    if (!(await ref.get()).exists) throw new HttpError(404, "User not found");
    await ref.update({ userRole: role, roleChangedBy: req.user.uid, roleChangedAt: FieldValue.serverTimestamp() });
    res.json({ message: `Role updated to ${role}` });
  })
);

router.get(
  "/meters",
  asyncHandler(async (req, res) => {
    const q = req.query.uid ? collections.meters().where("uid", "==", String(req.query.uid)) : collections.meters().limit(LIST_LIMIT);
    res.json({ meters: (await q.get()).docs.map(docToJSON) });
  })
);

// ---------- billing ----------

router.get(
  "/tariff",
  asyncHandler(async (req, res) => {
    res.json({ tariff: TARIFF });
  })
);

router.get(
  "/bills",
  asyncHandler(async (req, res) => {
    const period = req.query.period;
    if (period && !isValidPeriod(period)) throw new HttpError(400, "period must be YYYY-MM");
    const q = period
      ? collections.bills().where("period", "==", period).limit(LIST_LIMIT)
      : collections.bills().orderBy("issuedAt", "desc").limit(LIST_LIMIT);
    const now = Date.now();
    let bills = (await q.get()).docs.map(docToJSON).map((b) => ({
      ...b,
      label: periodLabel(b.period),
      outstanding: b.amountDue - b.amountPaid,
      overdue: b.status !== "paid" && toMillis(b.dueDate) < now,
    }));
    if (req.query.status === "overdue") bills = bills.filter((b) => b.overdue);
    else if (req.query.status) bills = bills.filter((b) => b.status === req.query.status);
    res.json({ bills });
  })
);

router.get(
  "/billing-runs",
  asyncHandler(async (req, res) => {
    const snap = await collections.billingRuns().orderBy("period", "desc").limit(24).get();
    const runs = await Promise.all(
      snap.docs.map(async (d) => {
        const agg = await collections.bills()
          .where("period", "==", d.id)
          .aggregate({ count: AggregateField.count(), billed: AggregateField.sum("amountDue"), collected: AggregateField.sum("amountPaid") })
          .get();
        const { count, billed, collected } = agg.data();
        const run = docToJSON(d);
        return {
          ...run,
          label: periodLabel(d.id),
          billsGenerated: count,
          totalBilled: billed ?? 0,
          totalCollected: collected ?? 0,
          status: count >= (run.metersQueued ?? 0) ? "completed" : "in_progress",
        };
      })
    );
    res.json({ runs });
  })
);

router.post(
  "/billing/run",
  asyncHandler(async (req, res) => {
    const period = req.body?.period;
    if (!isValidPeriod(period)) throw new HttpError(400, "period must be YYYY-MM");
    if (period >= periodOf()) throw new HttpError(400, "You can only bill a month that has ended");
    await publishEvent(EVENTS.BILLING_RUN_REQUESTED, { period, requestedBy: req.user.uid });
    res.status(202).json({ message: `Billing run for ${periodLabel(period)} queued` });
  })
);

// ---------- payments ----------

router.get(
  "/payments",
  asyncHandler(async (req, res) => {
    let payments = (await collections.payments().orderBy("createdAt", "desc").limit(LIST_LIMIT).get()).docs.map(docToJSON);
    if (req.query.status === "pending") payments = payments.filter((p) => !["completed", "failed"].includes(p.status));
    else if (req.query.status) payments = payments.filter((p) => p.status === req.query.status);
    res.json({ payments });
  })
);

router.get(
  "/unmatched-payments",
  asyncHandler(async (req, res) => {
    const snap = await collections.unmatchedMpesa().where("resolved", "==", false).limit(LIST_LIMIT).get();
    res.json({ callbacks: snap.docs.map(docToJSON) });
  })
);

// ---------- tickets ----------

const TICKET_STATUSES = ["open", "in_progress", "resolved"];

router.get(
  "/tickets",
  asyncHandler(async (req, res) => {
    const snap = await collections.tickets().orderBy("createdAt", "desc").limit(LIST_LIMIT).get();
    let tickets = snap.docs.map(docToJSON).map(({ attachment, ...t }) => ({
      ...t,
      status: t.status ?? "open",
      attachmentName: attachment?.name ?? (typeof attachment === "string" ? "attachment" : null),
    }));
    if (req.query.status) tickets = tickets.filter((t) => t.status === req.query.status);
    res.json({ tickets });
  })
);

// Served as a download, never inline: the content type comes from the
// uploader, so rendering it in the admin's browser could run their HTML/JS.
router.get(
  "/tickets/:id/attachment",
  asyncHandler(async (req, res) => {
    const snap = await collections.tickets().doc(req.params.id).get();
    const att = snap.exists ? snap.data().attachment : null;
    if (!att) throw new HttpError(404, "No attachment");
    const data = typeof att === "string" ? att : att.data; // older tickets stored bare base64
    const name = (typeof att === "string" ? "attachment" : att.name).replace(/[^\w.\- ]/g, "_");
    res.set({
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${name}"`,
      "X-Content-Type-Options": "nosniff",
    });
    res.send(Buffer.from(data, "base64"));
  })
);

router.patch(
  "/tickets/:id",
  asyncHandler(async (req, res) => {
    const { status, response } = req.body ?? {};
    if (!TICKET_STATUSES.includes(status)) throw new HttpError(400, `status must be one of ${TICKET_STATUSES.join(", ")}`);
    if (response !== undefined && String(response).length > 5000) throw new HttpError(400, "Response is too long");

    const ref = collections.tickets().doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpError(404, "Ticket not found");
    const update = {
      status,
      ...(response !== undefined ? { response: String(response).trim() || null } : {}),
      handledBy: req.user.uid,
      updatedAt: FieldValue.serverTimestamp(),
    };
    await ref.update(update);

    const t = { ...snap.data(), ...update };
    if (t.uid) {
      publishAfterCommit(
        EVENTS.TICKET_UPDATED,
        { ticketId: ref.id, uid: t.uid, subject: t.subject, status, response: t.response ?? null },
        `ticket-updated:${ref.id}:${Date.now()}`
      );
    }
    res.json({ message: "Ticket updated" });
  })
);

// ---------- connection requests ----------

router.get(
  "/connection-requests",
  asyncHandler(async (req, res) => {
    let requests = (await collections.connectionRequests().orderBy("createdAt", "desc").limit(LIST_LIMIT).get()).docs.map(docToJSON);
    if (req.query.status) requests = requests.filter((r) => (r.status ?? "pending").toLowerCase() === req.query.status);
    res.json({ requests });
  })
);

// Approving installs a meter: creates meters/{meterNumber}, links it to the
// customer and marks the request approved, all in one transaction.
router.patch(
  "/connection-requests/:id",
  asyncHandler(async (req, res) => {
    const { decision, note } = req.body ?? {};
    if (!["approve", "reject"].includes(decision)) throw new HttpError(400, "decision must be approve or reject");
    const meterNumber = req.body?.meterNumber ? String(req.body.meterNumber).trim().toUpperCase() : generateMeterNumber();
    if (!/^[A-Z0-9-]{3,32}$/.test(meterNumber)) throw new HttpError(400, "Meter number must be 3–32 letters, digits or dashes");
    const initialReading = Number(req.body?.initialReading ?? 0);
    if (!Number.isFinite(initialReading) || initialReading < 0) throw new HttpError(400, "Initial reading must be a non-negative number");

    const reqRef = collections.connectionRequests().doc(req.params.id);
    const meterRef = collections.meters().doc(meterNumber);

    const request = await db.runTransaction(async (tx) => {
      const [reqSnap, meterSnap] = await tx.getAll(reqRef, meterRef);
      if (!reqSnap.exists) throw new HttpError(404, "Request not found");
      const r = reqSnap.data();
      if ((r.status ?? "pending").toLowerCase() !== "pending") throw new HttpError(409, `Request is already ${r.status}`);
      if (!r.uid) throw new HttpError(409, "This request predates account linking; ask the customer to submit it again");

      const review = { reviewedBy: req.user.uid, reviewedAt: FieldValue.serverTimestamp(), reviewNote: note?.trim() || null };
      if (decision === "reject") {
        tx.update(reqRef, { status: "rejected", ...review });
        return r;
      }
      if (meterSnap.exists) throw new HttpError(409, `Meter ${meterNumber} is already in use`);
      tx.create(meterRef, {
        uid: r.uid,
        address: r.address ?? null,
        city: r.city ?? null,
        status: "active",
        initialReading,
        lastReading: initialReading,
        lastReadAt: null,
        installedAt: FieldValue.serverTimestamp(),
        connectionRequestId: reqRef.id,
      });
      tx.update(reqRef, { status: "approved", meterNumber, ...review });
      tx.update(collections.users().doc(r.uid), { meterNumbers: FieldValue.arrayUnion(meterNumber) });
      return r;
    });

    publishAfterCommit(
      decision === "approve" ? EVENTS.CONNECTION_APPROVED : EVENTS.CONNECTION_REJECTED,
      { requestId: reqRef.id, uid: request.uid, address: request.address, meterNumber: decision === "approve" ? meterNumber : null, note: note?.trim() || null },
      `connection-${decision}:${reqRef.id}`
    );
    res.json({ message: decision === "approve" ? `Approved, meter ${meterNumber} installed` : "Request rejected", meterNumber: decision === "approve" ? meterNumber : null });
  })
);

export default router;
