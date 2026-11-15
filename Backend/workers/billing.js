import { db, collections, FieldValue, Timestamp } from "../firebase.js";
import { EVENTS } from "../mq/config.js";
import { PermanentError } from "../mq/errors.js";
import { publishEvent } from "../mq/publisher.js";
import { computeCharges } from "../services/tariff.js";
import { fullName } from "../services/profiles.js";
import { isValidPeriod, periodOf, periodStart, shiftPeriod, toMillis } from "../lib/util.js";

const BILL_DUE_DAYS = Number(process.env.BILL_DUE_DAYS || 14);

// billing.runs — one message per billing period. Fans out one
// bill.generate_requested per active meter, so bills are generated in
// parallel by billing.generate consumers and a failure only retries one bill.
// Safe to re-run: bills already issued are skipped, new meters get billed.
export async function startBillingRun(event) {
  const { period, requestedBy } = event.data;
  if (!isValidPeriod(period)) throw new PermanentError(`invalid period ${period}`);
  if (period >= periodOf(new Date())) throw new PermanentError(`period ${period} has not ended yet`);

  const periodEnd = periodStart(shiftPeriod(period, 1)).getTime();
  const meters = await collections.meters().where("status", "==", "active").get();
  const eligible = meters.docs.filter((d) => toMillis(d.data().installedAt) < periodEnd);

  await collections.billingRuns().doc(period).set(
    {
      period,
      metersQueued: eligible.length,
      lastRequestedBy: requestedBy ?? null,
      lastRequestedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  for (let i = 0; i < eligible.length; i += 100) {
    await Promise.all(
      eligible.slice(i, i + 100).map((d) =>
        publishEvent(
          EVENTS.BILL_GENERATE_REQUESTED,
          { period, meterNumber: d.id, uid: d.data().uid },
          { id: `bill:${period}:${d.id}` }
        )
      )
    );
  }
  console.log(`[billing] run ${period}: queued ${eligible.length} bill(s)`);
}

// billing.generate — one bill per meter per period, id <period>_<meter>.
export async function generateBill(event) {
  const { period, meterNumber, uid } = event.data;
  const billRef = collections.bills().doc(`${period}_${meterNumber}`);
  const usageRef = collections.usage().doc(`${meterNumber}_${period}`);
  const userRef = collections.users().doc(uid);

  const bill = await db.runTransaction(async (tx) => {
    const [billSnap, usageSnap, userSnap] = await tx.getAll(billRef, usageRef, userRef);
    if (billSnap.exists) return billSnap.data();
    if (!userSnap.exists) throw new PermanentError(`meter ${meterNumber} belongs to missing user ${uid}`);

    const profile = userSnap.data();
    const litres = usageSnap.exists ? usageSnap.data().consumptionLitres ?? 0 : 0;
    const charges = computeCharges(litres);

    // Existing credit (negative balance) is applied to the new bill.
    const credit = Math.max(0, -(profile.balance ?? 0));
    const applied = Math.min(credit, charges.total);
    const dueDate = new Date(periodStart(shiftPeriod(period, 1)).getTime() + BILL_DUE_DAYS * 86_400_000);

    const data = {
      uid,
      meterNumber,
      accountNumber: profile.accountNumber ?? null,
      customerName: fullName(profile),
      period,
      consumptionLitres: litres,
      tariff: charges.tariff,
      lines: charges.lines,
      amountDue: charges.total,
      amountPaid: applied,
      status: applied >= charges.total ? "paid" : applied > 0 ? "partially_paid" : "unpaid",
      issuedAt: Timestamp.now(),
      dueDate: Timestamp.fromDate(dueDate),
    };
    tx.create(billRef, data);
    tx.update(userRef, { balance: FieldValue.increment(charges.total) });
    return data;
  });

  await publishEvent(
    EVENTS.BILL_ISSUED,
    {
      billId: billRef.id,
      uid,
      period,
      meterNumber,
      consumptionLitres: bill.consumptionLitres,
      amountDue: bill.amountDue,
      amountOutstanding: bill.amountDue - bill.amountPaid,
      dueDate: bill.dueDate.toDate().toISOString(),
    },
    { id: `${billRef.id}:issued` }
  );
}
