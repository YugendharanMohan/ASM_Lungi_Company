import { useState, type FormEvent } from "react"
import { AlertCircle, KeyRound, Loader2, Mail } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { useAuth } from "@/contexts/AuthContext"

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

  async function handlePasswordSignIn(event: FormEvent) {
    event.preventDefault()
    setError("")
    setNotice("")
    setBusy("password")
    try {
      await signInWithPassword(email, password)
    } catch (caught) {
      setError(readableError(caught))
    } finally {
      setBusy("")
    }
  }

  async function handleGoogle() {
    setError("")
    setNotice("")
    setBusy("google")
    try {
      await signInWithGoogle()
    } catch (caught) {
      setError(readableError(caught))
    } finally {
      setBusy("")
    }
  }

  async function handleReset() {
    if (!email.trim()) {
      setError("Enter your email address first, then choose Reset password.")
      return
    }
    setError("")
    setBusy("reset")
    try {
      await resetPassword(email)
      // Deliberately not revealing whether the address exists.
      setNotice(
        `If an account exists for ${email.trim()}, a reset link is on its way.`,
      )
    } catch (caught) {
      setError(readableError(caught))
    } finally {
      setBusy("")
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-primary text-xl font-bold text-primary-foreground">
            A
          </div>
          <CardTitle className="text-2xl">ASM Lungi Works</CardTitle>
          <CardDescription>
            Sign in to record production and wages
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {error && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          )}
          {notice && (
            <p className="flex items-start gap-2 rounded-md bg-success/10 p-3 text-sm text-success">
              <Mail className="mt-0.5 size-4 shrink-0" />
              {notice}
            </p>
          )}

          <Button
            variant="outline"
            className="w-full"
            onClick={() => void handleGoogle()}
            disabled={busy !== ""}
          >
            {busy === "google" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <GoogleMark />
            )}
            Continue with Google
          </Button>

          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">OR</span>
            <Separator className="flex-1" />
          </div>

          <form onSubmit={handlePasswordSignIn} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy !== ""}>
              {busy === "password" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <KeyRound className="size-4" />
              )}
              Sign in
            </Button>
          </form>

          <button
            type="button"
            onClick={() => void handleReset()}
            disabled={busy !== ""}
            className="w-full text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
          >
            {busy === "reset" ? "Sending…" : "Forgot your password?"}
          </button>

          <p className="border-t pt-4 text-center text-xs text-muted-foreground">
            Accounts are created by an administrator. There is no public
            sign-up — contact your admin if you need access.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function GoogleMark() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true">
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
    </svg>
  )
}
