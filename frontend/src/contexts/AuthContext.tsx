import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import {
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User as FirebaseUser,
} from "firebase/auth"

import { api, ApiError } from "@/lib/api"
import { auth, googleProvider, isFirebaseConfigured, requireAuth } from "@/lib/firebase"
import type { AppUser } from "@/lib/types"

/**
 * `unverified` is its own state, distinct from signed-out. The person holds
 * valid credentials but has not proved they own the address, so they get the
 * "check your inbox" screen with a resend button rather than the login form.
 * `denied` means Firebase accepted them but the backend has no active row —
 * an admin has not granted access.
 */
export type AuthStatus =
  | "loading"
  | "signed-out"
  | "unverified"
  | "denied"
  | "offline"
  | "signed-in"

interface AuthContextValue {
  status: AuthStatus
  firebaseUser: FirebaseUser | null
  user: AppUser | null
  deniedReason: string
  devMode: boolean
  isAdmin: boolean
  signInWithGoogle: () => Promise<void>
  signInWithPassword: (email: string, password: string) => Promise<void>
  resetPassword: (email: string) => Promise<void>
  resendVerification: () => Promise<void>
  refreshVerification: () => Promise<boolean>
  retry: () => Promise<void>
  logout: () => Promise<void>
}

/**
 * How long to keep trying to reach a server that gives no answer at all.
 * A cold start on Render's free plan takes roughly 25-45 seconds; this allows
 * for a slow one without leaving somebody staring at a spinner indefinitely.
 */
const WAKE_BUDGET_MS = 75_000

/**
 * Hard ceiling on the loading screen, comfortably past the retry budget so it
 * only ever catches a hang the retry loop never saw.
 */
const LOADING_CEILING_MS = 95_000

/** Pauses between attempts, in order. The last value repeats. */
const RETRY_DELAYS_MS = [1_000, 2_000, 3_000, 5_000, 5_000, 8_000]

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const devMode = !isFirebaseConfigured
  const [status, setStatus] = useState<AuthStatus>(
    devMode ? "loading" : "loading",
  )
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null)
  const [user, setUser] = useState<AppUser | null>(null)
  const [deniedReason, setDeniedReason] = useState("")

  /** Turn a failed profile call into the screen that explains it. */
  const settleFailure = useCallback((error: unknown) => {
    setUser(null)
    if (error instanceof ApiError) {
      setDeniedReason(error.message)
      // Status 0 means no answer ever arrived — asleep, offline, or blocked
      // before a status was readable. Reporting that as "denied" told people
      // an administrator had refused them, sending them to ask for access
      // they already had.
      if (error.status === 0) {
        setStatus("offline")
        return
      }
      // 403 with an unverified email should land on the verify screen, not
      // the generic denial — the user can fix that one themselves.
      setStatus(
        error.status === 403 && /not verified/i.test(error.message)
          ? "unverified"
          : "denied",
      )
    } else {
      setDeniedReason("Something went wrong while signing in.")
      setStatus("denied")
    }
  }, [])

  /**
   * Ask the backend who we are. It owns the final say on access.
   *
   * Retried while the server looks merely absent rather than unwilling.
   * A sleeping API wakes on the first request but cannot answer it: Render
   * replies 503 from its own edge, and that reply carries no CORS headers, so
   * the browser rejects it before any status can be read — fetch simply
   * throws. The one request that starts the wake is therefore guaranteed to
   * fail, and giving up on it showed "cannot reach the server" to people
   * whose server was, at that moment, starting up for them.
   */
  const loadProfile = useCallback(async () => {
    const deadline = Date.now() + WAKE_BUDGET_MS
    for (let attempt = 0; ; attempt++) {
      try {
        const profile = await api.get<AppUser>("/me")
        setUser(profile)
        setStatus("signed-in")
        setDeniedReason("")
        return
      } catch (error) {
        // Only a total absence of an answer is worth asking again. Any status
        // the server actually returned is its considered verdict, and the
        // same question will get the same answer.
        const unreachable = error instanceof ApiError && error.status === 0
        if (!unreachable || Date.now() >= deadline) {
          settleFailure(error)
          return
        }
        const pause = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)]
        await new Promise((resolve) => setTimeout(resolve, pause))
      }
    }
  }, [settleFailure])

  useEffect(() => {
    if (devMode) {
      void loadProfile()
      return
    }

    return onAuthStateChanged(requireAuth(), async (fbUser) => {
      setFirebaseUser(fbUser)
      if (!fbUser) {
        setUser(null)
        setDeniedReason("")
        setStatus("signed-out")
        return
      }
      if (!fbUser.emailVerified) {
        setUser(null)
        setStatus("unverified")
        return
      }
      await loadProfile()
    })
  }, [devMode, loadProfile])

  /**
   * Last resort: never leave somebody on the spinner forever.
   *
   * Everything below is bounded individually, but "loading" depends on
   * Firebase calling back at all — and if it never does, no timeout of ours
   * is involved to fire. An unexplained wait with no way out is the one
   * outcome worth ruling out categorically, so past the budget the screen
   * that at least offers a Try again button wins.
   */
  useEffect(() => {
    if (status !== "loading") return
    const timer = window.setTimeout(() => {
      setDeniedReason("The server did not answer in time.")
      setStatus("offline")
    }, LOADING_CEILING_MS)
    return () => window.clearTimeout(timer)
  }, [status])

  const signInWithGoogle = useCallback(async () => {
    await signInWithPopup(requireAuth(), googleProvider)
  }, [])

  const signInWithPassword = useCallback(
    async (email: string, password: string) => {
      const credential = await signInWithEmailAndPassword(
        requireAuth(),
        email.trim(),
        password,
      )
      // Send the link immediately rather than making them hunt for a button.
      if (!credential.user.emailVerified) {
        await sendEmailVerification(credential.user).catch(() => {})
      }
    },
    [],
  )

  const resetPassword = useCallback(async (email: string) => {
    await sendPasswordResetEmail(requireAuth(), email.trim())
  }, [])

  const resendVerification = useCallback(async () => {
    const current = auth?.currentUser
    if (current) await sendEmailVerification(current)
  }, [])

  /**
   * Verification happens in another tab or on a phone, so nothing tells this
   * app about it. Reload the Firebase user on demand to pick it up.
   */
  const refreshVerification = useCallback(async () => {
    const current = auth?.currentUser
    if (!current) return false
    await current.reload()
    if (current.emailVerified) {
      await current.getIdToken(true)
      await loadProfile()
      return true
    }
    return false
  }, [loadProfile])

  /** Try the profile call again, for the "cannot reach the server" screen. */
  const retry = useCallback(async () => {
    setStatus("loading")
    await loadProfile()
  }, [loadProfile])

  const logout = useCallback(async () => {
    if (isFirebaseConfigured) await signOut(requireAuth())
    setUser(null)
    setStatus("signed-out")
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      firebaseUser,
      user,
      deniedReason,
      devMode,
      isAdmin: user?.role === "ADMIN",
      signInWithGoogle,
      signInWithPassword,
      resetPassword,
      resendVerification,
      refreshVerification,
      retry,
      logout,
    }),
    [
      status,
      firebaseUser,
      user,
      deniedReason,
      devMode,
      signInWithGoogle,
      signInWithPassword,
      resetPassword,
      resendVerification,
      refreshVerification,
      retry,
      logout,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>.")
  return context
}
