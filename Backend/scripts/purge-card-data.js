// One-off cleanup. The old payment form stored card numbers, CVVs and bank
// account numbers in plain text in payments/*.paymentDetails. Card data must
// not be stored at all (and a CVV never, under PCI DSS). This removes that
// field from every payment document.
//
//   npm run purge-card-data            # dry run: counts affected documents
//   npm run purge-card-data -- --apply # actually deletes the field
import { db, collections, FieldValue } from "../firebase.js";

const apply = process.argv.includes("--apply");
const snap = await collections.payments().get();
const affected = snap.docs.filter((d) => d.data().paymentDetails !== undefined);

console.log(`${affected.length} of ${snap.size} payment documents contain paymentDetails.`);
if (!apply) {
  console.log("Dry run. Re-run with --apply to remove the field.");
  process.exit(0);
}

for (let i = 0; i < affected.length; i += 400) {
  const batch = db.batch();
  affected.slice(i, i + 400).forEach((d) => batch.update(d.ref, { paymentDetails: FieldValue.delete() }));
  await batch.commit();
}
console.log(`Removed paymentDetails from ${affected.length} documents.`);
process.exit(0);
