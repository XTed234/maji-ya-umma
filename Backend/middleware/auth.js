import { auth } from "../firebase.js";
import { loadProfile, ROLES } from "../services/profiles.js";
import { safeEqual } from "../lib/util.js";

async function verifyBearer(req) {
  const match = (req.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  // checkRevoked: disabled accounts and revoked sessions are rejected at once.
  const decoded = await auth.verifyIdToken(match[1], true);
  return { uid: decoded.uid, email: decoded.email };
}

// Requires a valid Firebase ID token (sent by the frontend as a Bearer token).
// The user's identity comes only from the verified token, never from the
// request body or query string.
export async function requireAuth(req, res, next) {
  try {
    const user = await verifyBearer(req);
    if (!user) return res.status(401).json({ message: "Authentication required" });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: "Your session has expired, please sign in again" });
  }
}

// Role is read from Firestore on every admin request (not from token claims),
// so revoking someone's admin role takes effect immediately.
export async function requireAdmin(req, res, next) {
  try {
    const profile = await loadProfile(req.user);
    if (profile?.userRole !== ROLES.ADMIN) {
      return res.status(403).json({ message: "Administrator access required" });
    }
    req.profile = profile;
    next();
  } catch (err) {
    next(err);
  }
}

// Meter gateways / field devices authenticate with a shared API key; staff
// can also submit readings with an admin session.
export async function requireMeterSourceOrAdmin(req, res, next) {
  const key = req.get("x-api-key");
  if (key) {
    if (safeEqual(key, process.env.METER_INGEST_API_KEY)) {
      req.readingSource = "device";
      return next();
    }
    return res.status(401).json({ message: "Invalid API key" });
  }
  await requireAuth(req, res, async () => {
    req.readingSource = "staff";
    await requireAdmin(req, res, next);
  });
}
