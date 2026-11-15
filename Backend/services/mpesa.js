import "../env.js";
import { randomBytes } from "node:crypto";

// Lipa na M-Pesa Online (STK Push) via Safaricom Daraja.
//
// MPESA_MODE:
//   simulate   (default when no consumer key is set) — no network calls; a
//              fake callback is fed back through RabbitMQ a few seconds later.
//              Phone numbers ending in 0000 simulate the customer cancelling.
//   sandbox    — https://sandbox.safaricom.co.ke (test credentials)
//   production — https://api.safaricom.co.ke
export const MPESA_MODE =
  process.env.MPESA_MODE || (process.env.MPESA_CONSUMER_KEY ? "sandbox" : "simulate");

const BASE_URLS = {
  sandbox: "https://sandbox.safaricom.co.ke",
  production: "https://api.safaricom.co.ke",
};

const cfg = () => ({
  // MPESA_API_BASE_URL is only for tests (a local fake Daraja).
  baseUrl: process.env.MPESA_API_BASE_URL || BASE_URLS[MPESA_MODE],
  consumerKey: process.env.MPESA_CONSUMER_KEY,
  consumerSecret: process.env.MPESA_CONSUMER_SECRET,
  shortcode: process.env.MPESA_SHORTCODE,
  passkey: process.env.MPESA_PASSKEY,
  transactionType: process.env.MPESA_TRANSACTION_TYPE || "CustomerPayBillOnline",
  callbackUrl: `${process.env.PUBLIC_API_URL}/api/mpesa/callback/${process.env.MPESA_CALLBACK_TOKEN}`,
});

export class MpesaError extends Error {
  constructor(message, { permanent = false, code } = {}) {
    super(message);
    this.name = "MpesaError";
    this.permanent = permanent;
    this.code = code;
  }
}

// Fail fast on startup instead of on the first customer payment.
export function assertMpesaConfig() {
  if (MPESA_MODE === "simulate") return;
  if (!BASE_URLS[MPESA_MODE]) throw new Error(`Unknown MPESA_MODE "${MPESA_MODE}"`);
  const c = cfg();
  const missing = ["MPESA_CONSUMER_KEY", "MPESA_CONSUMER_SECRET", "MPESA_SHORTCODE", "MPESA_PASSKEY", "MPESA_CALLBACK_TOKEN", "PUBLIC_API_URL"]
    .filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`M-Pesa ${MPESA_MODE} mode needs: ${missing.join(", ")}`);
  if (!c.callbackUrl.startsWith("https://")) throw new Error("PUBLIC_API_URL must be https (Daraja requirement)");
}

let token = { value: null, expiresAt: 0 };

async function accessToken() {
  if (token.value && Date.now() < token.expiresAt - 60_000) return token.value;
  const c = cfg();
  const basic = Buffer.from(`${c.consumerKey}:${c.consumerSecret}`).toString("base64");
  const res = await fetch(`${c.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${basic}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new MpesaError(`Daraja OAuth failed (HTTP ${res.status})`);
  const body = await res.json();
  token = { value: body.access_token, expiresAt: Date.now() + Number(body.expires_in || 3599) * 1000 };
  return token.value;
}

// yyyyMMddHHmmss in Nairobi time, as Daraja expects.
function timestamp() {
  const d = new Date(Date.now() + 3 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

async function darajaPost(path, payload) {
  const c = cfg();
  const res = await fetch(`${c.baseUrl}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 401) token = { value: null, expiresAt: 0 };
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

function authFields() {
  const c = cfg();
  const ts = timestamp();
  return {
    BusinessShortCode: c.shortcode,
    Password: Buffer.from(`${c.shortcode}${c.passkey}${ts}`).toString("base64"),
    Timestamp: ts,
  };
}

// Sends the "enter your M-Pesa PIN" prompt to the customer's phone.
export async function stkPush({ paymentId, amount, phone, accountReference }) {
  if (MPESA_MODE === "simulate") {
    return {
      merchantRequestId: `SIM-M-${paymentId}`,
      checkoutRequestId: `SIM-C-${paymentId}`,
      customerMessage: "Simulated M-Pesa prompt sent",
    };
  }

  const c = cfg();
  const { status, body } = await darajaPost("/mpesa/stkpush/v1/processrequest", {
    ...authFields(),
    TransactionType: c.transactionType,
    Amount: amount,
    PartyA: phone,
    PartyB: c.shortcode,
    PhoneNumber: phone,
    CallBackURL: c.callbackUrl,
    AccountReference: String(accountReference).slice(0, 12),
    TransactionDesc: "Water bill",
  });

  if (status === 200 && body.ResponseCode === "0") {
    return {
      merchantRequestId: body.MerchantRequestID,
      checkoutRequestId: body.CheckoutRequestID,
      customerMessage: body.CustomerMessage,
    };
  }
  const reason = body.errorMessage || body.ResponseDescription || `HTTP ${status}`;
  // 4xx (bad phone number, bad amount...) won't succeed on retry; 429/5xx might.
  throw new MpesaError(`STK push rejected: ${reason}`, {
    permanent: status >= 400 && status < 500 && status !== 401 && status !== 429,
    code: body.errorCode,
  });
}

// Asks Daraja what happened to a push whose callback never arrived.
// Returns { state: "success" | "failed" | "processing", resultCode, resultDesc }.
export async function queryStatus(checkoutRequestId) {
  if (MPESA_MODE === "simulate") return { state: "processing" };

  const { status, body } = await darajaPost("/mpesa/stkpushquery/v1/query", {
    ...authFields(),
    CheckoutRequestID: checkoutRequestId,
  });

  if (status === 200 && body.ResponseCode === "0") {
    const resultCode = Number(body.ResultCode);
    return { state: resultCode === 0 ? "success" : "failed", resultCode, resultDesc: body.ResultDesc };
  }
  // "The transaction is being processed" — customer hasn't responded yet.
  if (body.errorCode === "500.001.1001") return { state: "processing" };
  throw new MpesaError(`STK query failed: ${body.errorMessage || `HTTP ${status}`}`);
}

// Same shape as Daraja's callback Body.stkCallback.
export function simulatedCallback({ checkoutRequestId, merchantRequestId, amount, phone }) {
  if (phone.endsWith("0000")) {
    return {
      MerchantRequestID: merchantRequestId,
      CheckoutRequestID: checkoutRequestId,
      ResultCode: 1032,
      ResultDesc: "Request cancelled by user",
    };
  }
  const p = (n) => String(n).padStart(2, "0");
  const d = new Date(Date.now() + 3 * 3600 * 1000);
  return {
    MerchantRequestID: merchantRequestId,
    CheckoutRequestID: checkoutRequestId,
    ResultCode: 0,
    ResultDesc: "The service request is processed successfully.",
    CallbackMetadata: {
      Item: [
        { Name: "Amount", Value: amount },
        { Name: "MpesaReceiptNumber", Value: `SIM${randomBytes(4).toString("hex").toUpperCase()}` },
        { Name: "TransactionDate", Value: Number(`${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`) },
        { Name: "PhoneNumber", Value: Number(phone) },
      ],
    },
  };
}

export const callbackMetadata = (cb) =>
  Object.fromEntries((cb?.CallbackMetadata?.Item ?? []).map((i) => [i.Name, i.Value]));
