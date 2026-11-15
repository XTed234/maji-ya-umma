import "../env.js";
import Stripe from "stripe";

// Card payments via Stripe PaymentIntents. Card details are entered in
// Stripe's own iframe (Stripe Elements) and never reach this server, which
// keeps the app out of PCI scope beyond SAQ A.
//
// Enabled when STRIPE_SECRET_KEY is set. Use test keys (sk_test_/pk_test_)
// until you go live.
export const STRIPE_ENABLED = Boolean(process.env.STRIPE_SECRET_KEY);
export const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY || null;

// All balances and bills are in Kenyan shillings, so charges are too. Stripe
// treats KES as a two-decimal currency: amounts are sent in cents.
export const STRIPE_CURRENCY = "kes";
export const toStripeAmount = (ksh) => Math.round(ksh * 100);
export const fromStripeAmount = (cents) => cents / 100;

let client;

export function stripe() {
  if (!STRIPE_ENABLED) throw new Error("Stripe is not configured (STRIPE_SECRET_KEY)");
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY, {
    maxNetworkRetries: 2,
    timeout: 20_000,
    appInfo: { name: "maji-ya-umma" },
    // Only for tests: point the SDK at a local fake Stripe API.
    ...(process.env.STRIPE_API_HOST
      ? {
          host: process.env.STRIPE_API_HOST,
          port: Number(process.env.STRIPE_API_PORT || 443),
          protocol: process.env.STRIPE_API_PROTOCOL || "https",
        }
      : {}),
  });
  return client;
}

// Verifies the Stripe-Signature header against the raw request body.
// Throws if the payload wasn't signed with STRIPE_WEBHOOK_SECRET.
export function verifyWebhook(rawBody, signature) {
  return stripe().webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
}

export function assertStripeConfig() {
  if (!STRIPE_ENABLED) return;
  const missing = ["STRIPE_PUBLISHABLE_KEY", "STRIPE_WEBHOOK_SECRET"].filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`Stripe is enabled but missing: ${missing.join(", ")}`);
  const secretMode = process.env.STRIPE_SECRET_KEY.startsWith("sk_live_") ? "live" : "test";
  const publicMode = process.env.STRIPE_PUBLISHABLE_KEY.startsWith("pk_live_") ? "live" : "test";
  if (secretMode !== publicMode) throw new Error("STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY are from different modes (test vs live)");
}

// Card brand/last4/receipt for a PaymentIntent, read from Stripe rather than
// trusted from the client or the webhook body.
export async function cardDetails(paymentIntentId) {
  const pi = await stripe().paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge"] });
  const charge = typeof pi.latest_charge === "object" ? pi.latest_charge : null;
  const card = charge?.payment_method_details?.card;
  return {
    paymentIntent: pi,
    chargeId: charge?.id ?? (typeof pi.latest_charge === "string" ? pi.latest_charge : null),
    cardBrand: card?.brand ?? null,
    cardLast4: card?.last4 ?? null,
    receiptUrl: charge?.receipt_url ?? null,
  };
}
