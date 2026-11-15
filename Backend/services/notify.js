import "../env.js";
import nodemailer from "nodemailer";
import { PermanentError } from "../mq/errors.js";

// ---------- SMS ----------
// SMS_DRIVER=africastalking (needs AT_USERNAME, AT_API_KEY; AT_USERNAME=sandbox
// uses the sandbox) or log (default without AT_API_KEY: print to console).
export const SMS_DRIVER = process.env.SMS_DRIVER || (process.env.AT_API_KEY ? "africastalking" : "log");

// Africa's Talking per-recipient status codes that will never succeed on retry.
const PERMANENT_SMS_CODES = new Set([403, 404, 406, 409]); // invalid number, unsupported, blacklisted, DND

export async function sendSms(to, text) {
  if (SMS_DRIVER === "log") {
    console.log(`[sms:log] → +${to}: ${text}`);
    return { provider: "log" };
  }

  const username = process.env.AT_USERNAME;
  const url =
    username === "sandbox"
      ? "https://api.sandbox.africastalking.com/version1/messaging"
      : "https://api.africastalking.com/version1/messaging";
  const body = new URLSearchParams({ username, to: `+${to}`, message: text });
  if (process.env.AT_SENDER_ID) body.set("from", process.env.AT_SENDER_ID);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      apiKey: process.env.AT_API_KEY,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Africa's Talking HTTP ${res.status}`);

  const data = await res.json();
  const recipient = data?.SMSMessageData?.Recipients?.[0];
  if (!recipient) throw new Error(`SMS not accepted: ${data?.SMSMessageData?.Message ?? "no recipients"}`);
  if (![100, 101, 102].includes(recipient.statusCode)) {
    const message = `SMS rejected: ${recipient.status} (${recipient.statusCode})`;
    if (PERMANENT_SMS_CODES.has(recipient.statusCode)) throw new PermanentError(message);
    throw new Error(message);
  }
  return { provider: "africastalking", messageId: recipient.messageId, cost: recipient.cost };
}

// ---------- Email ----------
// EMAIL_DRIVER=smtp (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE,
// EMAIL_FROM — works with Amazon SES SMTP, Gmail, Mailgun, ...) or log.
export const EMAIL_DRIVER = process.env.EMAIL_DRIVER || (process.env.SMTP_HOST ? "smtp" : "log");

let transporter;

export async function sendEmail({ to, subject, text }) {
  if (EMAIL_DRIVER === "log") {
    console.log(`[email:log] → ${to}: ${subject}\n${text.replace(/^/gm, "    ")}`);
    return { provider: "log" };
  }
  transporter ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  const info = await transporter.sendMail({
    from: process.env.EMAIL_FROM || "Maji ya Umma <no-reply@example.com>",
    to,
    subject,
    text,
  });
  return { provider: "smtp", messageId: info.messageId };
}
