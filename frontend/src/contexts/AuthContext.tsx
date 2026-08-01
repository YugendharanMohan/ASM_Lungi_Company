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
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const devMode = !isFirebaseConfigured
  const [status, setStatus] = useState<AuthStatus>(
    devMode ? "loading" : "loading",
  )
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null)
  const [user, setUser] = useState<AppUser | null>(null)
  const [deniedReason, setDeniedReason] = useState("")

  /** Ask the backend who we are. It owns the final say on access. */
  const loadProfile = useCallback(async () => {
    try {
      const profile = await api.get<AppUser>("/me")
      setUser(profile)
      setStatus("signed-in")
      setDeniedReason("")
    } catch (error) {
      setUser(null)
      if (error instanceof ApiError) {
        setDeniedReason(error.message)
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
    }
  }, [])

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
