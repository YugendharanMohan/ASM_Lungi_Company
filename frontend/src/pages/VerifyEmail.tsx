import { useState } from "react"
import { CheckCircle2, MailCheck, RefreshCw } from "lucide-react"

import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/ui/Button"
import { AuthCanvas } from "@/ui/AuthCanvas"
import { ErrorNote } from "@/ui/Feedback"

/**
 * Shown when credentials are valid but the address is unverified.
 *
 * A courtesy screen, not the control: the backend rejects unverified tokens
 * regardless of what the client renders.
 */
export function VerifyEmail() {
  const { firebaseUser, resendVerification, refreshVerification, logout } =
    useAuth()
  const [busy, setBusy] = useState<"" | "resend" | "check">("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  async function handleResend() {
    setBusy("resend")
    setError("")
    setMessage("")
    try {
      await resendVerification()
      setMessage("Verification email sent. Check your inbox and spam folder.")
    } catch {
      setError("Could not send the email just now. Wait a minute and retry.")
    } finally {
      setBusy("")
    }
  }

  async function handleCheck() {
    setBusy("check")
    setError("")
    setMessage("")
    try {
      const verified = await refreshVerification()
      if (!verified) {
        setError(
          "Still not verified. Open the link in the email, then check again.",
        )
      }
    } finally {
      setBusy("")
    }
  }

  return (
    <AuthCanvas
      title="Verify your email"
      subtitle={`We sent a link to ${firebaseUser?.email ?? "your email address"}`}
      icon={<MailCheck className="size-6" />}
    >
      {message && (
        <p className="flex items-start gap-2 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--success-soft)] px-4 py-3 text-[13.5px] text-[var(--success)]">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          {message}
        </p>
      )}
      {error && <ErrorNote message={error} />}

      <p className="text-center text-[13.5px] leading-relaxed text-[var(--text-secondary)]">
        Open the link, then come back and continue. Verification is required —
        it cannot be skipped.
      </p>

      <Button
        size="lg"
        fullWidth
        loading={busy === "check"}
        disabled={busy !== ""}
        onClick={() => void handleCheck()}
        icon={<RefreshCw className="size-4" />}
      >
        I&apos;ve verified — continue
      </Button>

      <Button
        variant="secondary"
        size="lg"
        fullWidth
        loading={busy === "resend"}
        disabled={busy !== ""}
        onClick={() => void handleResend()}
      >
        Resend verification email
      </Button>

      <Button variant="ghost" fullWidth onClick={() => void logout()}>
        Sign in with a different account
      </Button>
    </AuthCanvas>
  )
}
