import express from "express";
import { EVENTS } from "../mq/config.js";
import { publishEvent } from "../mq/publisher.js";
import { requireMeterSourceOrAdmin } from "../middleware/auth.js";
import { asyncHandler, HttpError } from "../lib/util.js";

const router = express.Router();

const METER_RE = /^[A-Z0-9-]{3,32}$/;
const MAX_BATCH = 500;
const MAX_AGE_MS = 2 * 365 * 86_400_000;
const CLOCK_SKEW_MS = 5 * 60_000;

function validate(r) {
  const meterNumber = String(r?.meterNumber ?? "").trim().toUpperCase();
  if (!METER_RE.test(meterNumber)) return { error: "meterNumber must be 3–32 letters, digits or dashes" };
  const reading = Number(r?.reading);
  if (!Number.isFinite(reading) || reading < 0 || reading > 1e9) return { error: "reading must be a non-negative number (m³)" };
  const readAt = r?.readAt ? new Date(r.readAt) : new Date();
  if (Number.isNaN(readAt.getTime())) return { error: "readAt must be an ISO date" };
  if (readAt.getTime() > Date.now() + CLOCK_SKEW_MS) return { error: "readAt is in the future" };
  if (readAt.getTime() < Date.now() - MAX_AGE_MS) return { error: "readAt is more than two years old" };
  return { value: { meterNumber, reading, readAt: readAt.toISOString() } };
}

// Ingestion endpoint for meter gateways (X-Api-Key) and staff (admin session).
// Accepts one reading or { readings: [...] } and only queues them; the
// readings worker computes consumption. Each reading's id is derived from
// meter + timestamp, so a device that resends a batch causes no double counting.
router.post(
  "/",
  requireMeterSourceOrAdmin,
  asyncHandler(async (req, res) => {
    const items = Array.isArray(req.body?.readings) ? req.body.readings : [req.body];
    if (items.length === 0) throw new HttpError(400, "No readings supplied");
    if (items.length > MAX_BATCH) throw new HttpError(400, `At most ${MAX_BATCH} readings per request`);

    const results = items.map(validate);
    const errors = results.flatMap((r, index) => (r.error ? [{ index, message: r.error }] : []));
    if (errors.length) return res.status(400).json({ message: "Some readings are invalid", errors });

    // Publish oldest first so the usual case needs no out-of-order correction
    // in the worker (which still copes if they arrive out of order anyway).
    const ordered = results.map((r) => r.value).sort((a, b) => a.readAt.localeCompare(b.readAt));
    await Promise.all(
      ordered.map((value) =>
        publishEvent(
          EVENTS.METER_READING_RECEIVED,
          { ...value, source: req.readingSource },
          { id: `${value.meterNumber}_${Date.parse(value.readAt)}` }
        )
      )
    );
    res.status(202).json({ accepted: ordered.length });
  })
);

export default router;
