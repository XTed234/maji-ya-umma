import { initializeApp } from "firebase/app"
import { getAuth, connectAuthEmulator } from "firebase/auth"

// The browser only uses Firebase Authentication. All data goes through the
// backend API; Firestore is closed to browsers (see firestore.rules).
// This web config is not a secret (it identifies the project), but it lives in
// newClient/.env so each environment can point at its own project.
const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
})

export const auth = getAuth(app)

if (import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL) {
  connectAuthEmulator(auth, import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL, { disableWarnings: true })
}
