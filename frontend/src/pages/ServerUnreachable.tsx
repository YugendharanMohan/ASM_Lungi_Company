import { useState } from "react"
import { CloudOff } from "lucide-react"

import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/ui/Button"
import { AuthCanvas } from "@/ui/AuthCanvas"

/**
 * The request never reached the API.
 *
 * Distinct from AccessDenied on purpose. Both used to land on "Access not
 * granted", which sent people to ask an administrator for permission they
 * already had, when the real answer was to wait a moment and try again.
 */
export function ServerUnreachable() {
  const { retry, logout } = useAuth()
  const [trying, setTrying] = useState(false)

  async function again() {
    setTrying(true)
    try {
      await retry()
    } finally {
      setTrying(false)
    }
  }

  return (
    <AuthCanvas
      title="Cannot reach the server"
      subtitle="The app is fine — it just could not get an answer."
      icon={<CloudOff className="size-6" />}
    >
      <p className="rounded-[14px] bg-[var(--surface-sunken)] px-4 py-3 text-[13.5px] leading-relaxed text-[var(--text-secondary)]">
        The server sleeps when nobody has used it for a while and takes up to a
        minute to wake. If this is the first time it has been opened today,
        wait a moment and try again.
      </p>
      <Button size="lg" fullWidth loading={trying} onClick={() => void again()}>
        Try again
      </Button>
      <button
        type="button"
        onClick={() => void logout()}
        className="text-[13px] text-[var(--text-tertiary)] underline-offset-2 hover:underline"
      >
        Sign out
      </button>
    </AuthCanvas>
  )
}
