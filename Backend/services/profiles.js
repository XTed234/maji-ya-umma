import { db, collections } from "../firebase.js";
import { generateAccountNumber, serialize } from "../lib/util.js";

export const ROLES = { CUSTOMER: "user", ADMIN: "admin" };

// Profiles live at user/{uid}. Accounts created before the auth rework were
// stored under random ids; the first time such a user signs in, their profile
// is moved to user/{uid} (same data, plus the new account fields).
export async function loadProfile({ uid, email }) {
  const ref = collections.users().doc(uid);
  const snap = await ref.get();
  if (snap.exists) return { id: uid, ...snap.data() };
  if (!email) return null;

  const legacy = await collections.users().where("email", "==", email).limit(1).get();
  if (legacy.empty) return null;
  const legacyRef = legacy.docs[0].ref;

  return db.runTransaction(async (tx) => {
    const [current, old] = await tx.getAll(ref, legacyRef);
    if (current.exists) return { id: uid, ...current.data() };
    if (!old.exists) return null;

    const data = {
      ...old.data(),
      uid,
      userRole: old.data().userRole || ROLES.CUSTOMER,
      accountNumber: old.data().accountNumber || generateAccountNumber(),
      balance: old.data().balance ?? 0,
      meterNumbers: old.data().meterNumbers ?? [],
    };
    tx.set(ref, data);
    tx.delete(legacyRef);
    return { id: uid, ...data };
  });
}

// What a customer may see about themselves / what admins see in lists.
export function publicProfile(p) {
  return serialize({
    uid: p.uid ?? p.id,
    email: p.email,
    firstName: p.firstName ?? "",
    lastName: p.lastName ?? "",
    phoneNumber: p.phoneNumber ?? "",
    address: p.address ?? "",
    city: p.city ?? "",
    state: p.state ?? "",
    zipCode: p.zipCode ?? "",
    userRole: p.userRole ?? ROLES.CUSTOMER,
    accountNumber: p.accountNumber ?? null,
    balance: p.balance ?? 0,
    meterNumbers: p.meterNumbers ?? [],
    lastPaymentAt: p.lastPaymentAt ?? null,
    lastPaymentAmount: p.lastPaymentAmount ?? null,
    createdOn: p.createdOn ?? null,
  });
}

export const fullName = (p) => [p?.firstName, p?.lastName].filter(Boolean).join(" ") || p?.email || "Customer";
