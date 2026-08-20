import { useState, type FormEvent } from "react"
import { motion } from "motion/react"
import { KeyRound, Lock, Mail } from "lucide-react"

import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/ui/Button"
import { ErrorNote } from "@/ui/Feedback"
import { Field } from "@/ui/Field"
import { AuthCanvas } from "@/ui/AuthCanvas"

/** Firebase error codes mapped to something a mill supervisor can act on. */
function readableError(error: unknown): string {
  const code = (error as { code?: string })?.code ?? ""
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "That email and password do not match an account."
    case "auth/invalid-email":
      return "That does not look like a valid email address."
    case "auth/too-many-requests":
      return "Too many attempts. Wait a few minutes and try again."
    case "auth/user-disabled":
      return "This account has been disabled."
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "Sign-in was cancelled."
    case "auth/popup-blocked":
      return "Your browser blocked the sign-in popup. Allow popups and retry."
    case "auth/network-request-failed":
      return "Network problem. Check your connection and try again."
    default:
      return (error as Error)?.message ?? "Sign-in failed. Please try again."
  }
}

export function Login() {
  const { signInWithGoogle, signInWithPassword, resetPassword } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState<"" | "google" | "password" | "reset">("")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  async function run(kind: typeof busy, action: () => Promise<void>) {
    setError("")
    setNotice("")
    setBusy(kind)
    try {
      await action()
    } catch (caught) {
      setError(readableError(caught))
    } finally {
      setBusy("")
    }
  }

  function handlePasswordSignIn(event: FormEvent) {
    event.preventDefault()
    void run("password", () => signInWithPassword(email, password))
  }

  function handleReset() {
    if (!email.trim()) {
      setError("Enter your email address first, then choose Forgot password.")
      return
    }
    void run("reset", async () => {
      await resetPassword(email)
      // Deliberately not revealing whether the address exists.
      setNotice(
        `If an account exists for ${email.trim()}, a reset link is on its way.`,
      )
    })
  }

  return (
    <AuthCanvas
      title="ASM Lungi Company"
      subtitle="Sign in to record production and wages"
    >
      {error && <ErrorNote message={error} />}
      {notice && (
        <p className="flex items-start gap-2 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--success-soft)] px-4 py-3 text-[13.5px] text-[var(--success)]">
          <Mail className="mt-0.5 size-4 shrink-0" />
          {notice}
        </p>
      )}

      <Button
        variant="secondary"
        size="lg"
        fullWidth
        loading={busy === "google"}
        disabled={busy !== ""}
        onClick={() => void run("google", signInWithGoogle)}
        icon={busy === "google" ? undefined : <GoogleMark />}
      >
        Continue with Google
      </Button>

      <div className="flex items-center gap-3 py-1">
        <span className="h-px flex-1 bg-[var(--border-subtle)]" />
        <span className="text-[11.5px] font-medium uppercase tracking-[0.07em] text-[var(--text-tertiary)]">
          or
        </span>
        <span className="h-px flex-1 bg-[var(--border-subtle)]" />
      </div>

      <form onSubmit={handlePasswordSignIn} className="space-y-3">
        <Field
          label="Email"
          type="email"
          autoComplete="username"
          required
          icon={<Mail className="size-[18px]" />}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          icon={<Lock className="size-[18px]" />}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <Button
          type="submit"
          size="lg"
          fullWidth
          loading={busy === "password"}
          disabled={busy !== ""}
          icon={<KeyRound className="size-4" />}
        >
          Sign in
        </Button>
      </form>

      <button
        type="button"
        onClick={handleReset}
        disabled={busy !== ""}
        className="w-full text-[13.5px] text-[var(--accent)] transition-opacity hover:opacity-70 disabled:opacity-40"
      >
        {busy === "reset" ? "Sending…" : "Forgot your password?"}
      </button>

      <p className="border-t border-[var(--border-subtle)] pt-5 text-center text-[12.5px] leading-relaxed text-[var(--text-tertiary)]">
        Accounts are created by an administrator. There is no public sign-up —
        contact your admin if you need access.
      </p>
    </AuthCanvas>
  )
}

function GoogleMark() {
  return (
    <motion.svg
      className="size-4"
      viewBox="0 0 24 24"
      aria-hidden="true"
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.25 }}
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1a11 11 0 0 0-9.82 6.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </motion.svg>
  )
}
