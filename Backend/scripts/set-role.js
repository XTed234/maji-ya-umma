// Grants or revokes the admin role. The first admin has to be created this
// way; after that, admins can manage roles from the Users page.
//
//   npm run set-role -- someone@example.com admin
//   npm run set-role -- someone@example.com user
import { auth, collections } from "../firebase.js";
import { loadProfile, ROLES } from "../services/profiles.js";

const [email, role] = process.argv.slice(2);
if (!email || ![ROLES.ADMIN, ROLES.CUSTOMER].includes(role)) {
  console.error("Usage: npm run set-role -- <email> <admin|user>");
  process.exit(1);
}

try {
  const user = await auth.getUserByEmail(email);
  const profile = await loadProfile({ uid: user.uid, email: user.email }); // migrates legacy profiles
  const ref = collections.users().doc(user.uid);
  if (profile) {
    await ref.update({ userRole: role });
  } else {
    await ref.set({ uid: user.uid, email: user.email, firstName: user.displayName ?? "", userRole: role, balance: 0, meterNumbers: [] });
  }
  console.log(`${email} is now ${role}`);
  process.exit(0);
} catch (err) {
  console.error(err.code === "auth/user-not-found" ? `No account for ${email}` : err.message);
  process.exit(1);
}
