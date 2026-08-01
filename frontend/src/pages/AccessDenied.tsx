import { ShieldX } from "lucide-react"

import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/ui/Button"
import { AuthCanvas } from "@/ui/AuthCanvas"

/** Firebase accepted the sign-in, but the backend has no active row for it. */
export function AccessDenied() {
  const { deniedReason, firebaseUser, logout } = useAuth()

  return (
    <AuthCanvas
      title="Access not granted"
      subtitle={
        deniedReason || "This account is not allowed to use the system yet."
      }
      icon={<ShieldX className="size-6" />}
    >
      {firebaseUser?.email && (
        <p className="rounded-[14px] bg-[var(--surface-sunken)] px-4 py-3 text-center text-[13.5px]">
          Signed in as{" "}
          <span className="font-medium">{firebaseUser.email}</span>
        </p>
      )}
      <p className="text-center text-[13.5px] text-[var(--text-secondary)]">
        Ask an administrator to add this address under User Access.
      </p>
      <Button size="lg" fullWidth onClick={() => void logout()}>
        Sign out
      </Button>
    </AuthCanvas>
  )
}
