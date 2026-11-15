// Minimal stand-in for the Stripe PaymentIntents API, for the e2e test.
// The backend talks to it when STRIPE_API_HOST/PORT/PROTOCOL point here.
import http from "node:http";
import { randomBytes } from "node:crypto";

const rid = (prefix) => `${prefix}_${randomBytes(12).toString("hex")}`;

// Stripe's form encoding: a[b]=1&c[0]=x → { a: { b: "1" }, c: { 0: "x" } }
function parseForm(body) {
  const out = {};
  for (const [key, value] of new URLSearchParams(body)) {
    const parts = key.split(/[[\]]+/).filter(Boolean);
    let node = out;
    parts.forEach((part, i) => {
      if (i === parts.length - 1) node[part] = value;
      else node = node[part] ??= {};
    });
  }
  return out;
}

export function startFakeStripe(port) {
  const intents = new Map();
  const charges = new Map();
  const idempotency = new Map();

  const view = (pi, expand = []) =>
    expand.includes("latest_charge") && pi.latest_charge ? { ...pi, latest_charge: charges.get(pi.latest_charge) } : pi;
  const fail = (res, status, message) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { type: "invalid_request_error", message } }));
  };

  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const url = new URL(req.url, "http://x");
      const form = parseForm(req.method === "GET" ? url.search.slice(1) : body);
      const expand = Object.values(form.expand ?? {});
      const send = (obj) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(obj));
      };

      if (req.method === "POST" && url.pathname === "/v1/payment_intents") {
        const key = req.headers["idempotency-key"];
        if (key && idempotency.has(key)) return send(intents.get(idempotency.get(key)));
        if (Number(form.amount) < 5000) return fail(res, 400, "Amount must be at least Ksh 50.00");
        const id = rid("pi");
        const pi = {
          id,
          object: "payment_intent",
          amount: Number(form.amount),
          amount_received: 0,
          currency: form.currency,
          status: "requires_payment_method",
          client_secret: `${id}_secret_${randomBytes(8).toString("hex")}`,
          metadata: form.metadata ?? {},
          payment_method_types: Object.values(form.payment_method_types ?? {}),
          latest_charge: null,
          last_payment_error: null,
          livemode: false,
        };
        intents.set(id, pi);
        if (key) idempotency.set(key, id);
        return send(pi);
      }

      const m = url.pathname.match(/^\/v1\/payment_intents\/([^/]+)(\/cancel)?$/);
      const pi = m && intents.get(m[1]);
      if (!pi) return fail(res, 404, "No such payment_intent");
      if (req.method === "GET" && !m[2]) return send(view(pi, expand));
      if (req.method === "POST" && m[2]) {
        if (["succeeded", "canceled", "processing"].includes(pi.status)) {
          return fail(res, 400, `You cannot cancel this PaymentIntent because it has a status of ${pi.status}.`);
        }
        pi.status = "canceled";
        return send(pi);
      }
      fail(res, 404, "Unrecognized request URL");
    });
  });

  return new Promise((resolve) =>
    server.listen(port, () =>
      resolve({
        intents,
        // What happens in the browser + at the card network, for the test:
        succeed(id, { brand = "visa", last4 = "4242" } = {}) {
          const pi = intents.get(id);
          const chargeId = rid("ch");
          charges.set(chargeId, {
            id: chargeId,
            object: "charge",
            receipt_url: `https://pay.stripe.com/receipts/${chargeId}`,
            payment_method_details: { type: "card", card: { brand, last4 } },
          });
          Object.assign(pi, { status: "succeeded", amount_received: pi.amount, latest_charge: chargeId, last_payment_error: null });
          return pi;
        },
        decline(id) {
          const pi = intents.get(id);
          pi.last_payment_error = { code: "card_declined", message: "Your card was declined." };
          return pi;
        },
        close: () => server.close(),
      })
    )
  );
}
