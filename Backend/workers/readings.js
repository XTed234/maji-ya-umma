import { db, collections, FieldValue, Timestamp } from "../firebase.js";
import { EVENTS } from "../mq/config.js";
import { PermanentError } from "../mq/errors.js";
import { publishEvent } from "../mq/publisher.js";
import { periodOf, toMillis } from "../lib/util.js";

// Above this average daily consumption between two readings, the customer is
// warned about a possible leak (one alert per meter per day at most).
const HIGH_USAGE_LITRES_PER_DAY = Number(process.env.HIGH_USAGE_LITRES_PER_DAY || 2000);

// Readings are cumulative meter values in m³. The water used between two
// consecutive readings (stored in whole litres, so sums are exact) belongs to
// the month of the later reading.
//
// Messages are processed in parallel and retries reorder them, so readings
// can arrive out of order. The result must not depend on arrival order:
//   - a reading newer than the meter's latest extends the series;
//   - an older ("late") one is slotted between its neighbours p < r < n:
//     the interval p→n that was credited to month(n) splits into p→r
//     (credited to month(r)) and r→n (still month(n)).
export async function processReading(event) {
  const { meterNumber, reading, readAt: readAtIso, source } = event.data;
  const readAt = new Date(readAtIso);
  const readingRef = collections.readings().doc(event.id);
  const meterRef = collections.meters().doc(meterNumber);

  const stored = await db.runTransaction(async (tx) => {
    const [readingSnap, meterSnap] = await tx.getAll(readingRef, meterRef);
    if (readingSnap.exists) return readingSnap.data(); // device resent it
    if (!meterSnap.exists) throw new PermanentError(`unknown meter ${meterNumber}`);
    const meter = meterSnap.data();
    if (meter.status !== "active") throw new PermanentError(`meter ${meterNumber} is ${meter.status}`);
    if (meter.installedAt && readAt.getTime() < toMillis(meter.installedAt)) {
      throw new PermanentError(`reading at ${readAtIso} predates installation of ${meterNumber}`);
    }

    const base = {
      meterNumber,
      uid: meter.uid,
      reading,
      readAt: Timestamp.fromDate(readAt),
      period: periodOf(readAt),
      source,
      receivedAt: FieldValue.serverTimestamp(),
    };
    const lastAt = meter.lastReadAt?.toDate() ?? null;
    return !lastAt || readAt > lastAt
      ? appendReading(tx, { readingRef, meterRef, meter, base, lastAt })
      : insertLateReading(tx, { readingRef, meter, base });
  });

  // Also runs on redelivery (from the stored reading), so a crash between
  // the write and the publish can't lose the alert.
  if (stored.anomaly) {
    const day = stored.readAt.toDate().toISOString().slice(0, 10);
    const id =
      stored.anomaly.kind === "high_usage" ? `${meterNumber}:high_usage:${day}` : `${event.id}:anomaly`;
    await publishEvent(
      EVENTS.METER_ANOMALY_DETECTED,
      { meterNumber, uid: stored.uid, readingId: event.id, ...stored.anomaly },
      { id }
    );
  }
}

function addUsage(tx, { meterNumber, uid, period, litres, readings = 0 }) {
  if (!litres && !readings) return;
  tx.set(
    collections.usage().doc(`${meterNumber}_${period}`),
    {
      uid,
      meterNumber,
      period,
      consumptionLitres: FieldValue.increment(litres),
      readings: FieldValue.increment(readings),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  // System-wide monthly total for the admin dashboard, kept in step here so
  // the dashboard never has to scan every usage document.
  if (litres) {
    tx.set(collections.usageTotals().doc(period), { period, consumptionLitres: FieldValue.increment(litres) }, { merge: true });
  }
}

function appendReading(tx, { readingRef, meterRef, meter, base, lastAt }) {
  const { reading } = base;
  let status = "ok";
  let litres = 0;
  let anomaly = null;

  if (reading < meter.lastReading) {
    // Meter replaced, reset, or tampered with: re-baseline, flag for staff.
    status = "rollback";
    anomaly = { kind: "meter_rollback", previousReading: meter.lastReading, reading };
  } else {
    litres = Math.round((reading - meter.lastReading) * 1000);
    const days = lastAt ? (base.readAt.toMillis() - lastAt.getTime()) / 86_400_000 : 0;
    if (days > 0 && litres / days > HIGH_USAGE_LITRES_PER_DAY) {
      anomaly = { kind: "high_usage", litresPerDay: Math.round(litres / days) };
    }
  }

  const doc = { ...base, status, counted: true, consumptionLitres: litres, anomaly };
  tx.set(readingRef, doc);
  tx.update(meterRef, { lastReading: reading, lastReadAt: base.readAt });
  addUsage(tx, { meterNumber: base.meterNumber, uid: meter.uid, period: base.period, litres, readings: 1 });
  return doc;
}

async function insertLateReading(tx, { readingRef, meter, base }) {
  const neighbours = (op, dir) =>
    collections.readings()
      .where("meterNumber", "==", base.meterNumber)
      .where("readAt", op, base.readAt)
      .orderBy("readAt", dir)
      .limit(10);
  const [prevSnap, nextSnap] = [await tx.get(neighbours("<", "desc")), await tx.get(neighbours(">", "asc"))];

  const prevDoc = prevSnap.docs.find((d) => d.data().counted);
  const nextDoc = nextSnap.docs.find((d) => d.data().counted);
  const prevReading = prevDoc ? prevDoc.data().reading : meter.initialReading ?? 0;
  const next = nextDoc?.data();

  // Must fit between its neighbours; otherwise keep it for the record but
  // don't let it move any consumption.
  if (!next || base.reading < prevReading || base.reading > next.reading) {
    const doc = { ...base, status: "inconsistent", counted: false, consumptionLitres: 0, anomaly: null };
    tx.set(readingRef, doc);
    return doc;
  }

  const before = Math.round((base.reading - prevReading) * 1000);
  const after = Math.round((next.reading - base.reading) * 1000);
  const doc = { ...base, status: "late", counted: true, consumptionLitres: before, anomaly: null };
  tx.set(readingRef, doc);
  tx.update(nextDoc.ref, { consumptionLitres: after });

  if (base.period !== next.period) {
    addUsage(tx, { meterNumber: base.meterNumber, uid: meter.uid, period: base.period, litres: before, readings: 1 });
    addUsage(tx, { meterNumber: base.meterNumber, uid: meter.uid, period: next.period, litres: -before });
  } else {
    addUsage(tx, { meterNumber: base.meterNumber, uid: meter.uid, period: base.period, litres: 0, readings: 1 });
  }
  return doc;
}
