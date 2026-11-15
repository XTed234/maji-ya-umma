import { MAX_ATTEMPTS, retryQueueName, deadLetterQueueName } from "./config.js";

// 1-based delivery attempt of a message, for handlers that behave differently
// on their final attempt.
export const attemptOf = (msg) => (Number(msg?.properties?.headers?.["x-attempts"]) || 0) + 1;
export const isLastAttempt = (msg) => attemptOf(msg) >= MAX_ATTEMPTS;

function sendConfirmed(channel, queue, content, options) {
  return new Promise((resolve, reject) => {
    channel.sendToQueue(queue, content, options, (err) => (err ? reject(err) : resolve()));
  });
}

// Registers `handler(event, msg)` on `queue`.
//  - handler resolves      → ack
//  - handler throws        → copy to <queue>.retry (comes back after the TTL)
//  - MAX_ATTEMPTS reached  → copy to <queue>.dlq, stays there for inspection
//  - body is not JSON, or handler throws a PermanentError
//                          → straight to <queue>.dlq (retrying cannot help)
// The original is acked only after the broker confirms the copy, so a crash
// in between means redelivery, never loss. Handlers must therefore be
// idempotent (they key their writes on event.id).
export async function consume(channel, queue, handler, { prefetch = 10 } = {}) {
  await channel.prefetch(prefetch); // per-consumer limit for the consumer below

  await channel.consume(queue, async (msg) => {
    if (!msg) return; // consumer was cancelled by the broker

    const headers = msg.properties.headers || {};
    const attempts = (Number(headers["x-attempts"]) || 0) + 1;

    let event;
    let failure;
    try {
      event = JSON.parse(msg.content.toString("utf8"));
    } catch (err) {
      failure = { err, poison: true };
    }

    if (!failure) {
      try {
        await handler(event, msg);
      } catch (err) {
        failure = { err, poison: Boolean(err?.permanent) };
      }
    }

    if (!failure) {
      try {
        channel.ack(msg);
      } catch {
        // channel dropped after the work was done; redelivery is harmless
        // because handlers are idempotent
      }
      return;
    }

    const giveUp = failure.poison || attempts >= MAX_ATTEMPTS;
    const target = giveUp ? deadLetterQueueName(queue) : retryQueueName(queue);
    const label = `[worker:${queue}] message ${msg.properties.messageId ?? "?"}`;

    console.error(
      `${label} failed (attempt ${attempts}/${MAX_ATTEMPTS}): ${failure.err.message} → ${target}`
    );

    try {
      await sendConfirmed(channel, target, msg.content, {
        ...msg.properties,
        headers: {
          ...headers,
          "x-attempts": attempts,
          "x-last-error": String(failure.err.message).slice(0, 500),
          "x-original-queue": queue,
          "x-original-routing-key": msg.fields.routingKey,
        },
      });
      channel.ack(msg);
    } catch (republishErr) {
      // Couldn't park it anywhere: put it back on the queue and try again later.
      console.error(`${label} could not be moved to ${target}: ${republishErr.message}`);
      try {
        channel.nack(msg, false, true);
      } catch {
        // channel already gone — broker will redeliver after reconnect
      }
    }
  });

  console.log(`[worker] consuming ${queue} (prefetch ${prefetch})`);
}
