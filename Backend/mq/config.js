import "../env.js";

// Works for both a local RabbitMQ and Amazon MQ (RabbitMQ engine):
//   local:     amqp://guest:guest@localhost:5672
//   Amazon MQ: amqps://<user>:<password>@b-xxxxxxxx.mq.<region>.on.aws:5671
export const AMQP_URL = process.env.AMQP_URL || "amqp://guest:guest@localhost:5672";

// "classic" for a local single-node broker; "quorum" is recommended for
// Amazon MQ cluster deployments. Changing this for an existing queue requires
// deleting the queue first (RabbitMQ refuses to redeclare with new arguments).
export const QUEUE_TYPE = process.env.MQ_QUEUE_TYPE || "classic";

// A failed message is retried this many times in total before it is parked in
// the queue's dead-letter queue (<queue>.dlq) for manual inspection.
export const MAX_ATTEMPTS = Number(process.env.MQ_MAX_ATTEMPTS || 5);

// Delay between retries. Set as a queue argument on <queue>.retry, so the same
// redeclare caveat as QUEUE_TYPE applies.
export const RETRY_DELAY_MS = Number(process.env.MQ_RETRY_DELAY_MS || 10000);

export const EXCHANGE = "maji.events";

export const EVENTS = {
  USER_REGISTERED: "user.registered",
  PROFILE_UPDATE_REQUESTED: "profile.update_requested",

  TICKET_SUBMITTED: "ticket.submitted",
  TICKET_UPDATED: "ticket.updated",

  CONNECTION_REQUESTED: "connection.requested",
  CONNECTION_APPROVED: "connection.approved",
  CONNECTION_REJECTED: "connection.rejected",

  PAYMENT_REQUESTED: "payment.requested",
  PAYMENT_STATUS_CHECK: "payment.status_check",
  MPESA_CALLBACK_RECEIVED: "mpesa.callback_received",
  STRIPE_EVENT_RECEIVED: "stripe.event_received",
  PAYMENT_COMPLETED: "payment.completed",
  PAYMENT_FAILED: "payment.failed",

  METER_READING_RECEIVED: "meter.reading_received",
  METER_ANOMALY_DETECTED: "meter.anomaly_detected",

  BILLING_RUN_REQUESTED: "billing.run_requested",
  BILL_GENERATE_REQUESTED: "bill.generate_requested",
  BILL_ISSUED: "bill.issued",

  NOTIFICATION_SMS: "notification.sms",
  NOTIFICATION_EMAIL: "notification.email",
};

// Work queues. Each gets <name>.retry and <name>.dlq companions (topology.js).
// `prefetch` caps in-flight messages per consumer. The key is what
// WORKER_QUEUES refers to.
export const QUEUES = {
  profiles: { name: "profiles.update", bindings: [EVENTS.PROFILE_UPDATE_REQUESTED], prefetch: 1 },
  tickets: { name: "tickets.record", bindings: [EVENTS.TICKET_SUBMITTED], prefetch: 10 },
  connections: { name: "connections.record", bindings: [EVENTS.CONNECTION_REQUESTED], prefetch: 10 },

  // M-Pesa: send the STK push, then settle on callback or by polling.
  paymentsInitiate: { name: "payments.initiate", bindings: [EVENTS.PAYMENT_REQUESTED], prefetch: 5 },
  paymentsReconcile: { name: "payments.reconcile", bindings: [EVENTS.MPESA_CALLBACK_RECEIVED], prefetch: 5 },
  paymentsStatusCheck: { name: "payments.status_check", bindings: [], prefetch: 5 },
  // Card: verified Stripe webhooks settle card payments.
  paymentsStripe: { name: "payments.stripe", bindings: [EVENTS.STRIPE_EVENT_RECEIVED], prefetch: 5 },

  readings: { name: "readings.process", bindings: [EVENTS.METER_READING_RECEIVED], prefetch: 20 },

  billingRuns: { name: "billing.runs", bindings: [EVENTS.BILLING_RUN_REQUESTED], prefetch: 1 },
  billingGenerate: { name: "billing.generate", bindings: [EVENTS.BILL_GENERATE_REQUESTED], prefetch: 10 },

  notifications: {
    name: "notifications.dispatch",
    bindings: [
      EVENTS.USER_REGISTERED,
      EVENTS.TICKET_SUBMITTED,
      EVENTS.TICKET_UPDATED,
      EVENTS.CONNECTION_REQUESTED,
      EVENTS.CONNECTION_APPROVED,
      EVENTS.CONNECTION_REJECTED,
      EVENTS.PAYMENT_COMPLETED,
      EVENTS.PAYMENT_FAILED,
      EVENTS.BILL_ISSUED,
      EVENTS.METER_ANOMALY_DETECTED,
    ],
    prefetch: 20,
  },
  sms: { name: "notifications.sms", bindings: [EVENTS.NOTIFICATION_SMS], prefetch: 5 },
  email: { name: "notifications.email", bindings: [EVENTS.NOTIFICATION_EMAIL], prefetch: 5 },
};

// Delay queues have no consumer: messages sit for `ttlMs`, then RabbitMQ
// dead-letters them to their destination. This is how "check again in a
// minute" is done without timers that would be lost on a restart.
export const DELAY_QUEUES = {
  // Poll Daraja / Stripe if the callback or webhook hasn't arrived.
  paymentStatusCheck: {
    name: "payments.status_check.delay",
    ttlMs: Number(process.env.MPESA_STATUS_CHECK_DELAY_MS || 60000),
    deadLetterExchange: "",
    deadLetterRoutingKey: QUEUES.paymentsStatusCheck.name,
  },
  // In simulate mode, stands in for Safaricom calling us back.
  mpesaSimulator: {
    name: "mpesa.simulator.delay",
    ttlMs: Number(process.env.MPESA_SIMULATED_CALLBACK_DELAY_MS || 5000),
    deadLetterExchange: EXCHANGE,
    deadLetterRoutingKey: EVENTS.MPESA_CALLBACK_RECEIVED,
  },
};

export const retryQueueName = (queue) => `${queue}.retry`;
export const deadLetterQueueName = (queue) => `${queue}.dlq`;
