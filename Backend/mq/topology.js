import {
  EXCHANGE,
  QUEUES,
  DELAY_QUEUES,
  QUEUE_TYPE,
  RETRY_DELAY_MS,
  retryQueueName,
  deadLetterQueueName,
} from "./config.js";

// Declares the exchange and every queue + binding. Idempotent, and run by both
// the API and the worker on connect, so messages published before a worker has
// ever started are still queued rather than dropped.
//
//   API ──publish──▶ maji.events (topic) ──binding──▶ <queue> ──▶ worker
//                                                       ▲   │ handler fails
//                                    TTL expires,       │   ▼
//                                    back to <queue>  <queue>.retry
//                                                           │ attempts exhausted
//                                                           ▼
//                                                       <queue>.dlq
export async function assertTopology(channel) {
  await channel.assertExchange(EXCHANGE, "topic", { durable: true });

  const typeArgs = { "x-queue-type": QUEUE_TYPE };

  for (const { name, bindings } of Object.values(QUEUES)) {
    await channel.assertQueue(name, { durable: true, arguments: typeArgs });

    // Messages wait here for RETRY_DELAY_MS, then RabbitMQ dead-letters them
    // through the default exchange straight back onto the work queue.
    await channel.assertQueue(retryQueueName(name), {
      durable: true,
      arguments: {
        ...typeArgs,
        "x-message-ttl": RETRY_DELAY_MS,
        "x-dead-letter-exchange": "",
        "x-dead-letter-routing-key": name,
      },
    });

    await channel.assertQueue(deadLetterQueueName(name), { durable: true, arguments: typeArgs });

    for (const routingKey of bindings) {
      await channel.bindQueue(name, EXCHANGE, routingKey);
    }
  }

  for (const { name, ttlMs, deadLetterExchange, deadLetterRoutingKey } of Object.values(DELAY_QUEUES)) {
    await channel.assertQueue(name, {
      durable: true,
      arguments: {
        ...typeArgs,
        "x-message-ttl": ttlMs,
        "x-dead-letter-exchange": deadLetterExchange,
        "x-dead-letter-routing-key": deadLetterRoutingKey,
      },
    });
  }
}
