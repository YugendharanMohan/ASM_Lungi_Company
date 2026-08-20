import { initializeApp, type FirebaseApp } from "firebase/app"
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  setPersistence,
  type Auth,
} from "firebase/auth"

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

/**
 * Whether Firebase is configured for this build.
 *
 * When false the app runs in dev mode: no login screen, and the backend is
 * expected to be running with AUTH_DEV_BYPASS=true. Calling initializeApp with
 * an empty apiKey throws on the first auth call, so every Firebase entry point
 * is guarded on this flag rather than failing at runtime.
 */
export const isFirebaseConfigured = Boolean(
  config.apiKey && config.authDomain && config.projectId,
)

let app: FirebaseApp | null = null
let authInstance: Auth | null = null

if (isFirebaseConfigured) {
  app = initializeApp(config)
  authInstance = getAuth(app)

  // Keep the session across app restarts, so signing in is something you do
  // once rather than every morning. Set explicitly rather than relying on the
  // default: inside the Android WebView, Firebase silently falls back to
  // in-memory persistence when it cannot open its preferred store, and an
  // in-memory session dies with the process — which looks exactly like the
  // app forgetting the login. IndexedDB first, localStorage if that is
  // unavailable; the promise is fire-and-forget because failing to upgrade
  // persistence must not stop the app loading.
  void setPersistence(authInstance, indexedDBLocalPersistence).catch(() =>
    setPersistence(authInstance!, browserLocalPersistence).catch(() => {}),
  )
}

export const auth = authInstance

export const googleProvider = new GoogleAuthProvider()
// Always show the chooser: on a shared mill office machine, silently reusing
// the last Google session signs the wrong person in.
googleProvider.setCustomParameters({ prompt: "select_account" })

export function requireAuth(): Auth {
  if (!authInstance) {
    throw new Error(
      "Firebase is not configured. Set the VITE_FIREBASE_* variables in .env.",
    )
  }
  return authInstance
}
