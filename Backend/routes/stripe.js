import express from "express";
import { EVENTS } from "../mq/config.js";
import { publishEvent } from "../mq/publisher.js";
import { STRIPE_ENABLED, verifyWebhook } from "../services/stripe.js";

const router = express.Router();

const HANDLED = new Set(["payment_intent.succeeded", "payment_intent.payment_failed", "payment_intent.canceled"]);

// Stripe webhook endpoint. In the Stripe dashboard (Developers → Webhooks) add
//   PUBLIC_API_URL/api/stripe/webhook
// for the three events above, and put its signing secret in
// STRIPE_WEBHOOK_SECRET. Locally: `stripe listen --forward-to localhost:5000/api/stripe/webhook`.
//
// Needs the raw body to check the signature, so this router is mounted before
// express.json(). The event is only queued here; the payments.stripe worker
// settles the payment. If queuing fails we answer 500 and Stripe retries
// (for up to three days), so a broker outage loses nothing.
router.post("/webhook", express.raw({ type: "application/json", limit: "1mb" }), async (req, res) => {
  if (!STRIPE_ENABLED) return res.status(404).end();

  let event;
  try {
    event = verifyWebhook(req.body, req.get("stripe-signature"));
  } catch {
    return res.status(400).json({ message: "Invalid signature" });
  }

  if (!HANDLED.has(event.type)) return res.json({ received: true });

  const intent = event.data.object;
  try {
    await publishEvent(
      EVENTS.STRIPE_EVENT_RECEIVED,
      {
        type: event.type,
        stripeEventId: event.id,
        paymentIntentId: intent.id,
        paymentId: intent.metadata?.paymentId ?? null,
        lastError: intent.last_payment_error?.message ?? null,
        livemode: event.livemode,
        source: "stripe",
      },
      { id: `stripe:${event.id}` }
    );
  } catch (err) {
    console.error(`Stripe event ${event.id} not queued: ${err.message}`);
    return res.status(500).json({ received: false });
  }
  res.json({ received: true });
});

export default router;
