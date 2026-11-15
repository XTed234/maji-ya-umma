import { db, collections, FieldValue } from "../firebase.js";
import { EVENTS } from "../mq/config.js";
import { PermanentError } from "../mq/errors.js";
import { isLastAttempt } from "../mq/consumer.js";
import { publishEvent, publishDelayed } from "../mq/publisher.js";
import { MPESA_MODE, stkPush, queryStatus, simulatedCallback, callbackMetadata } from "../services/mpesa.js";
import { stripe, cardDetails, fromStripeAmount, STRIPE_CURRENCY } from "../services/stripe.js";

// Payment lifecycle:
//   M-Pesa: queued ─(payments.initiate: STK push)─▶ pending ─┬─(callback)─────────▶ completed / failed
//                                                            └─(status_check poll)─▶ completed / failed
//   Card:   queued ─(API creates PaymentIntent)─▶ pending ─┬─(Stripe webhook)────▶ completed / failed
//                                                          └─(status_check poll)─▶ completed / failed
const FINAL = new Set(["completed", "failed"]);
const MAX_STATUS_CHECKS = Number(process.env.MPESA_MAX_STATUS_CHECKS || 5);
// Typing card details and passing 3-D Secure takes longer than an M-Pesa PIN.
const MAX_CARD_STATUS_CHECKS = Number(process.env.STRIPE_MAX_STATUS_CHECKS || 30);

const now = () => FieldValue.serverTimestamp();

async function scheduleFollowUps(paymentId, p) {
  await publishDelayed(
    "paymentStatusCheck",
    EVENTS.PAYMENT_STATUS_CHECK,
    { paymentId, check: 1 },
    { id: `${paymentId}:status-check:1` }
  );
  if (MPESA_MODE === "simulate") {
    await publishDelayed(
      "mpesaSimulator",
      EVENTS.MPESA_CALLBACK_RECEIVED,
      {
        source: "simulator",
        callback: simulatedCallback({
          checkoutRequestId: p.checkoutRequestId,
          merchantRequestId: p.merchantRequestId,
          amount: p.amount,
          phone: p.phone,
        }),
      },
      { id: `mpesa-cb:${p.checkoutRequestId}` }
    );
  }
}

// payments.initiate — sends the STK push. A payment is claimed (queued →
// initiating) in a transaction first, so redeliveries can never push twice.
export async function initiatePayment(event) {
  const { paymentId } = event.data;
  const ref = collections.payments().doc(paymentId);

  const claim = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new PermanentError(`payment ${paymentId} not found`);
    const p = snap.data();
    if (p.status === "queued") {
      tx.update(ref, { status: "initiating", updatedAt: now() });
      return { action: "push", p };
    }
    // A previous attempt crashed mid-push: we can't know whether the prompt
    // went out, so fail it rather than risk charging twice. If the customer
    // does pay, the callback lands in unmatchedMpesaCallbacks for staff.
    if (p.status === "initiating") return { action: "interrupted", p };
    // Already pushed: just make sure the follow-ups exist (ids dedupe them).
    if (p.status === "pending") return { action: "follow-ups", p };
    return { action: "none", p };
  });

  if (claim.action === "interrupted") {
    return settlePayment(paymentId, {
      success: false,
      reason: "The payment request was interrupted. Please try again.",
      source: "initiate",
    });
  }
  if (claim.action === "follow-ups") return scheduleFollowUps(paymentId, claim.p);
  if (claim.action !== "push") return;

  const p = claim.p;
  let push;
  try {
    push = await stkPush({ paymentId, amount: p.amount, phone: p.phone, accountReference: p.accountNumber });
  } catch (err) {
    if (err.permanent) {
      return settlePayment(paymentId, { success: false, reason: err.message, source: "stk_push" });
    }
    await ref.update({ status: "queued", updatedAt: now() }); // let the retry push again
    throw err;
  }

  const update = {
    status: "pending",
    checkoutRequestId: push.checkoutRequestId,
    merchantRequestId: push.merchantRequestId,
    customerMessage: push.customerMessage ?? null,
    initiatedAt: now(),
    updatedAt: now(),
  };
  await ref.update(update);
  await scheduleFollowUps(paymentId, { ...p, ...update });
}

// Marks a payment completed or failed exactly once. On success the amount is
// allocated to the customer's open bills, oldest first; anything left over
// becomes account credit (negative balance) that the next bill consumes.
export async function settlePayment(paymentId, { success, receipt, amountPaid, reason, resultCode, source, details = {} }) {
  const ref = collections.payments().doc(paymentId);

  const payment = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const p = snap.data();
    if (FINAL.has(p.status)) return p;

    if (!success) {
      const update = {
        status: "failed",
        failureReason: reason ?? "Payment was not completed",
        resultCode: resultCode ?? null,
        settledBy: source,
        failedAt: now(),
        updatedAt: now(),
        ...details,
      };
      tx.update(ref, update);
      return { ...p, ...update };
    }

    const amount = Number.isFinite(amountPaid) ? amountPaid : p.amount;
    const billsSnap = await tx.get(collections.bills().where("uid", "==", p.uid));
    const open = billsSnap.docs
      .map((d) => ({ ref: d.ref, ...d.data() }))
      .filter((b) => b.status !== "paid")
      .sort((a, b) => a.period.localeCompare(b.period));

    let remaining = amount;
    const allocations = [];
    for (const bill of open) {
      if (remaining <= 0) break;
      const owed = bill.amountDue - bill.amountPaid;
      const applied = Math.min(owed, remaining);
      const paidInFull = applied >= owed;
      tx.update(bill.ref, {
        amountPaid: bill.amountPaid + applied,
        status: paidInFull ? "paid" : "partially_paid",
        ...(paidInFull ? { paidAt: now() } : {}),
      });
      allocations.push({ billId: bill.ref.id, period: bill.period, amount: applied });
      remaining -= applied;
    }

    tx.update(collections.users().doc(p.uid), {
      balance: FieldValue.increment(-amount),
      lastPaymentAt: now(),
      lastPaymentAmount: amount,
    });
    const update = {
      status: "completed",
      amountPaid: amount,
      ...(p.method === "card" ? {} : { mpesaReceipt: receipt ?? null }),
      ...details,
      allocations,
      creditAdded: remaining,
      settledBy: source,
      completedAt: now(),
      updatedAt: now(),
    };
    tx.update(ref, update);
    return { ...p, ...update };
  });

  // Published on every call, including repeats; the deterministic id lets the
  // notification senders drop duplicates.
  await publishEvent(
    payment.status === "completed" ? EVENTS.PAYMENT_COMPLETED : EVENTS.PAYMENT_FAILED,
    {
      paymentId,
      uid: payment.uid,
      amount: payment.amountPaid ?? payment.amount,
      method: payment.method ?? "mpesa",
      receipt: payment.mpesaReceipt ?? null,
      cardBrand: payment.cardBrand ?? null,
      cardLast4: payment.cardLast4 ?? null,
      reason: payment.failureReason ?? null,
    },
    { id: `${paymentId}:${payment.status}` }
  );
}

// payments.reconcile — M-Pesa callbacks (real or simulated).
export async function reconcileCallback(event, msg) {
  const { callback, source } = event.data;
  const checkoutRequestId = callback?.CheckoutRequestID;
  if (!checkoutRequestId) throw new PermanentError("callback without CheckoutRequestID");

  const match = await collections.payments().where("checkoutRequestId", "==", checkoutRequestId).limit(1).get();
  if (match.empty) {
    // A fast failure callback can beat the worker's own write of the
    // checkoutRequestId; give it a few retries before parking it for staff.
    if (!isLastAttempt(msg)) throw new Error(`no payment for checkout ${checkoutRequestId} yet`);
    await collections.unmatchedMpesa().doc(checkoutRequestId).set({
      callback,
      source,
      receivedAt: now(),
      resolved: false,
    });
    console.warn(`[payments] unmatched M-Pesa callback ${checkoutRequestId} stored for review`);
    return;
  }

  const meta = callbackMetadata(callback);
  const resultCode = Number(callback.ResultCode);
  const paymentDoc = match.docs[0];
  const p = paymentDoc.data();

  // Our own simulator (no Daraja to ask), or already settled (republish only).
  if (MPESA_MODE === "simulate" || FINAL.has(p.status)) {
    return settlePayment(paymentDoc.id, {
      success: resultCode === 0,
      receipt: meta.MpesaReceiptNumber ?? null,
      amountPaid: p.amount,
      reason: callback.ResultDesc,
      resultCode,
      source: source === "simulator" ? "simulator" : "callback",
    });
  }

  // Daraja doesn't sign callbacks, so the callback is only a hint: the outcome
  // is confirmed with Daraja's own status query, and the amount credited is
  // the amount we asked M-Pesa to charge, never the callback's Amount field.
  const verified = await queryStatus(checkoutRequestId);
  if (verified.state === "processing") {
    if (!isLastAttempt(msg)) throw new Error(`Daraja still processing ${checkoutRequestId}`);
    return; // the status-check poller settles it later
  }
  const success = verified.state === "success";
  if (success !== (resultCode === 0)) {
    console.warn(`[payments] callback for ${checkoutRequestId} says ${resultCode}, Daraja says ${verified.resultCode}; trusting Daraja`);
  }
  await settlePayment(paymentDoc.id, {
    success,
    receipt: success ? meta.MpesaReceiptNumber ?? null : null,
    amountPaid: p.amount,
    reason: success ? null : verified.resultDesc,
    resultCode: verified.resultCode,
    source: "callback",
  });
}

// payments.status_check — fed by the delay queue. Polls Daraja for payments
// whose callback never arrived, then gives up after MAX_STATUS_CHECKS.
function scheduleStatusCheck(paymentId, check) {
  return publishDelayed(
    "paymentStatusCheck",
    EVENTS.PAYMENT_STATUS_CHECK,
    { paymentId, check },
    { id: `${paymentId}:status-check:${check}` }
  );
}

export async function checkPaymentStatus(event) {
  const { paymentId, check } = event.data;
  const snap = await collections.payments().doc(paymentId).get();
  if (!snap.exists) return;
  const p = snap.data();
  if (FINAL.has(p.status)) return;
  if (p.method === "card") return checkCardPayment(paymentId, p, check);
  if (p.status !== "pending") return;

  const result = await queryStatus(p.checkoutRequestId);
  if (result.state === "processing") {
    if (check >= MAX_STATUS_CHECKS) {
      return settlePayment(paymentId, {
        success: false,
        reason: "No confirmation from M-Pesa (timed out)",
        source: "status_check",
      });
    }
    return scheduleStatusCheck(paymentId, check + 1);
  }

  await settlePayment(paymentId, {
    success: result.state === "success",
    reason: result.resultDesc,
    resultCode: result.resultCode,
    source: "status_query",
  });
}

// ---------- card (Stripe) ----------

async function settleCardSuccess(paymentId, paymentIntentId, source) {
  const card = await cardDetails(paymentIntentId);
  const pi = card.paymentIntent;
  if (pi.status !== "succeeded") throw new Error(`PaymentIntent ${pi.id} is ${pi.status}, not succeeded`);
  if (pi.currency !== STRIPE_CURRENCY) throw new PermanentError(`PaymentIntent ${pi.id} is in ${pi.currency}`);
  await settlePayment(paymentId, {
    success: true,
    receipt: card.chargeId,
    amountPaid: fromStripeAmount(pi.amount_received),
    source,
    details: {
      stripeChargeId: card.chargeId,
      cardBrand: card.cardBrand,
      cardLast4: card.cardLast4,
      receiptUrl: card.receiptUrl,
    },
  });
}

// A card payment is only ever failed after its PaymentIntent is cancelled:
// until then the customer may still complete it (e.g. with another card after
// a decline), and Stripe guarantees a cancelled intent can't succeed later.
async function checkCardPayment(paymentId, p, check) {
  if (!p.stripePaymentIntentId) return;
  const pi = await stripe().paymentIntents.retrieve(p.stripePaymentIntentId);

  if (pi.status === "succeeded") return settleCardSuccess(paymentId, pi.id, "status_query");
  if (pi.status === "canceled") {
    return settlePayment(paymentId, { success: false, reason: "Card payment was cancelled", source: "status_query" });
  }
  if (pi.status === "processing" || check < MAX_CARD_STATUS_CHECKS) return scheduleStatusCheck(paymentId, check + 1);

  try {
    await stripe().paymentIntents.cancel(pi.id, { cancellation_reason: "abandoned" });
  } catch (err) {
    // Its state changed under us (e.g. it just succeeded): look again shortly.
    console.warn(`[payments] couldn't cancel ${pi.id}: ${err.message}`);
    return scheduleStatusCheck(paymentId, check + 1);
  }
  return settlePayment(paymentId, {
    success: false,
    reason: "Card payment was not completed in time",
    source: "status_check",
  });
}

// payments.stripe — verified Stripe webhook events (see routes/stripe.js).
export async function handleStripeEvent(event) {
  const { type, paymentIntentId, paymentId, lastError, source } = event.data;
  // stripe = verified webhook, client_return = /confirm endpoint, customer = cancel button
  const via = !source || source === "stripe" ? "stripe_webhook" : source;
  if (!paymentId) return; // a PaymentIntent this app didn't create

  const ref = collections.payments().doc(paymentId);
  const snap = await ref.get();
  if (!snap.exists) throw new PermanentError(`webhook for unknown payment ${paymentId}`);
  const p = snap.data();
  if (p.stripePaymentIntentId !== paymentIntentId) {
    throw new PermanentError(`payment ${paymentId} is linked to ${p.stripePaymentIntentId}, not ${paymentIntentId}`);
  }

  // Queue messages are only hints: every outcome is confirmed with Stripe's
  // API (settleCardSuccess re-fetches the intent too), so a forged or replayed
  // message can neither mark a payment paid nor wrongly fail a real one.
  if (type === "payment_intent.succeeded") return settleCardSuccess(paymentId, paymentIntentId, via);
  if (type === "payment_intent.canceled") {
    const pi = await stripe().paymentIntents.retrieve(paymentIntentId);
    if (pi.status === "succeeded") return settleCardSuccess(paymentId, paymentIntentId, via);
    if (pi.status !== "canceled") throw new PermanentError(`cancel event for ${paymentIntentId}, but Stripe says ${pi.status}`);
    return settlePayment(paymentId, { success: false, reason: "Card payment was cancelled", source: via });
  }
  if (type === "payment_intent.payment_failed" && !FINAL.has(p.status)) {
    // Not final: the customer can retry with another card.
    await ref.update({ lastCardError: lastError ?? "Card was declined", updatedAt: now() });
  }
}
