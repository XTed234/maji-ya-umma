import "./env.js";
import { readFileSync } from "node:fs";
import { initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

// The backend talks to Firebase with the Admin SDK and a service account, so
// Firestore can be locked down completely for browsers (see firestore.rules).
//
// Credentials, in order of preference:
//   FIREBASE_SERVICE_ACCOUNT_FILE=/path/to/service-account.json
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json (ADC)
//   running on Google Cloud with an attached service account (ADC)
// With FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST set, no
// credentials are needed and nothing touches the real project.
const projectId = process.env.FIREBASE_PROJECT_ID || "maji-ya-umma";
const usingEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

function credential() {
  if (usingEmulator) return undefined;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_FILE) {
    return cert(JSON.parse(readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_FILE, "utf8")));
  }
  return applicationDefault();
}

const cred = credential();
const app = initializeApp({ projectId, ...(cred ? { credential: cred } : {}) });

export const db = getFirestore(app);
export const auth = getAuth(app);
export { FieldValue, Timestamp };

export const collections = {
  users: () => db.collection("user"),
  meters: () => db.collection("meters"),
  readings: () => db.collection("meterReadings"),
  usage: () => db.collection("usage"),
  usageTotals: () => db.collection("usageTotals"),
  bills: () => db.collection("bills"),
  billingRuns: () => db.collection("billingRuns"),
  payments: () => db.collection("payments"),
  unmatchedMpesa: () => db.collection("unmatchedMpesaCallbacks"),
  tickets: () => db.collection("feedback"),
  connectionRequests: () => db.collection("connectionRequests"),
  notifications: () => db.collection("notifications"),
};
