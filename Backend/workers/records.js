import { collections, Timestamp } from "../firebase.js";

const eventTime = (event) => Timestamp.fromDate(new Date(event.occurredAt));

// create() rather than set(): if the message is redelivered after an admin has
// already changed the document (e.g. resolved the ticket), the redelivery
// must not reset it.
async function createOnce(ref, data) {
  try {
    await ref.create(data);
  } catch (err) {
    if (err.code === 6 /* ALREADY_EXISTS */) return;
    throw err;
  }
}

export async function recordTicket(event) {
  const d = event.data;
  await createOnce(collections.tickets().doc(event.id), {
    uid: d.uid,
    email: d.email,
    customerName: d.customerName,
    accountNumber: d.accountNumber ?? null,
    subject: d.subject,
    category: d.category,
    priority: d.priority,
    message: d.message,
    attachment: d.attachment ?? null,
    status: "open",
    response: null,
    createdAt: eventTime(event),
    updatedAt: eventTime(event),
  });
}

export async function recordConnectionRequest(event) {
  const d = event.data;
  await createOnce(collections.connectionRequests().doc(event.id), {
    uid: d.uid,
    firstName: d.firstName ?? null,
    lastName: d.lastName ?? null,
    email: d.email,
    phoneNumber: d.phoneNumber ?? null,
    accountNumber: d.accountNumber ?? null,
    address: d.address ?? null,
    city: d.city ?? "",
    zipCode: d.zipCode ?? "",
    status: "pending",
    assignedTo: "Plumbing & Installation Unit",
    meterNumber: null,
    reviewNote: null,
    createdAt: eventTime(event),
  });
}

export async function applyProfileUpdate(event) {
  const { uid, updates } = event.data;
  await collections.users().doc(uid).update({ ...updates, updatedAt: eventTime(event) });
}
