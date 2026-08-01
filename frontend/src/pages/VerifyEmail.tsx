import { useState } from "react"
import { CheckCircle2, Loader2, MailCheck, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useAuth } from "@/contexts/AuthContext"

/**
 * Shown when credentials are valid but the address is unverified.
 *
 * This is a courtesy screen, not the control: the backend rejects unverified
 * tokens regardless of what the client renders.
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
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <MailCheck className="size-6" />
          </div>
          <CardTitle>Verify your email</CardTitle>
          <CardDescription>
            We sent a verification link to{" "}
            <span className="font-medium text-foreground">
              {firebaseUser?.email ?? "your email address"}
            </span>
            . Open it, then come back and choose "I've verified".
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {message && (
            <p className="flex items-start gap-2 rounded-md bg-success/10 p-3 text-sm text-success">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              {message}
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          )}

          <Button
            className="w-full"
            onClick={() => void handleCheck()}
            disabled={busy !== ""}
          >
            {busy === "check" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            I&apos;ve verified — continue
          </Button>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => void handleResend()}
            disabled={busy !== ""}
          >
            {busy === "resend" && <Loader2 className="size-4 animate-spin" />}
            Resend verification email
          </Button>

          <Button
            variant="ghost"
            className="w-full"
            onClick={() => void logout()}
          >
            Sign in with a different account
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
