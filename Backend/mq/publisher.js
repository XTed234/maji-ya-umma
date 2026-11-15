import { randomUUID } from "node:crypto";
import { EXCHANGE, QUEUES, DELAY_QUEUES, retryQueueName, deadLetterQueueName } from "./config.js";
import { createBroker } from "./connection.js";

// One publishing connection per process (API and worker alike). Publishing and
// consuming on separate connections is RabbitMQ's recommended practice: flow
// control on a busy publisher can't stall consumers.
export const broker = createBroker({ name: `maji-publisher[${process.argv[1]?.split("/").pop()}]` });

export class BrokerUnavailableError extends Error {
  constructor(cause) {
    super(`Message broker unavailable: ${cause.message}`);
    this.name = "BrokerUnavailableError";
    this.cause = cause;
  }
}

function envelope(type, data, id) {
  return { id: id || randomUUID(), type, occurredAt: new Date().toISOString(), data };
}

function confirmed(fn) {
  return new Promise((resolve, reject) => fn((err) => (err ? reject(err) : resolve())));
}

const props = (msg) => ({
  persistent: true,
  contentType: "application/json",
  messageId: msg.id,
  type: msg.type,
  appId: "maji-ya-umma",
  timestamp: Math.floor(Date.now() / 1000),
});

// Publishes a persistent event and resolves once the broker has confirmed it,
// so a 202 from the API means the message is safely stored on the broker.
//
// Envelope: { id, type, occurredAt, data }. Pass a deterministic `id` when the
// same logical event may be published more than once (redelivery, device
// resends): consumers key their writes on it, so duplicates are harmless.
export async function publishEvent(type, data, { id } = {}) {
  const msg = envelope(type, data, id);
  try {
    const channel = await broker.getChannel();
    await confirmed((cb) =>
      channel.publish(EXCHANGE, type, Buffer.from(JSON.stringify(msg)), props(msg), cb)
    );
  } catch (err) {
    throw new BrokerUnavailableError(err);
  }
  return msg.id;
}

// Puts an event on one of DELAY_QUEUES; it is delivered after the queue's TTL.
export async function publishDelayed(delayQueueKey, type, data, { id } = {}) {
  const queue = DELAY_QUEUES[delayQueueKey].name;
  const msg = envelope(type, data, id);
  try {
    const channel = await broker.getChannel();
    await confirmed((cb) => channel.sendToQueue(queue, Buffer.from(JSON.stringify(msg)), props(msg), cb));
  } catch (err) {
    throw new BrokerUnavailableError(err);
  }
  return msg.id;
}

// Message / consumer counts for every queue, for the admin dashboard.
export async function queueStats() {
  return broker.withTemporaryChannel(async (ch) => {
    const rows = [];
    for (const [key, { name }] of Object.entries(QUEUES)) {
      const [main, retry, dlq] = await Promise.all([
        ch.checkQueue(name),
        ch.checkQueue(retryQueueName(name)),
        ch.checkQueue(deadLetterQueueName(name)),
      ]);
      rows.push({
        key,
        queue: name,
        ready: main.messageCount,
        consumers: main.consumerCount,
        retrying: retry.messageCount,
        deadLettered: dlq.messageCount,
      });
    }
    return rows;
  });
}
