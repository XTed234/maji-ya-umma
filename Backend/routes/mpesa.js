import express from "express";
import { EVENTS } from "../mq/config.js";
import { publishEvent } from "../mq/publisher.js";
import { safeEqual } from "../lib/util.js";

const router = express.Router();

// Daraja calls PUBLIC_API_URL/api/mpesa/callback/<MPESA_CALLBACK_TOKEN>.
// Daraja doesn't sign callbacks, so the unguessable token in the URL is what
// proves the request came from the URL we gave Safaricom. Keep it secret.
//
// The handler only queues the callback and answers immediately; Safaricom
// expects a fast response, and settling the payment (bill allocation,
// receipts) happens in the payments.reconcile worker.
router.post("/callback/:token", async (req, res) => {
  if (!safeEqual(req.params.token, process.env.MPESA_CALLBACK_TOKEN)) return res.status(404).end();

  const callback = req.body?.Body?.stkCallback;
  if (!callback?.CheckoutRequestID) {
    return res.status(400).json({ ResultCode: 1, ResultDesc: "Malformed callback" });
  }

  try {
    await publishEvent(
      EVENTS.MPESA_CALLBACK_RECEIVED,
      { source: "daraja", callback },
      { id: `mpesa-cb:${callback.CheckoutRequestID}` }
    );
  } catch (err) {
    // The status-check poller will still settle this payment via the query API.
    console.error(`M-Pesa callback ${callback.CheckoutRequestID} not queued: ${err.message}`);
    return res.status(500).json({ ResultCode: 1, ResultDesc: "Temporarily unavailable" });
  }
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });
});

export default router;
