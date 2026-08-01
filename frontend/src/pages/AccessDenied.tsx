import { ShieldX } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useAuth } from "@/contexts/AuthContext"

/** Firebase accepted the sign-in, but the backend has no active row for it. */
export function AccessDenied() {
  const { deniedReason, firebaseUser, logout } = useAuth()

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <ShieldX className="size-6" />
          </div>
          <CardTitle>Access not granted</CardTitle>
          <CardDescription>
            {deniedReason ||
              "This account is not allowed to use the system yet."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {firebaseUser?.email && (
            <p className="rounded-md bg-muted p-3 text-center text-sm">
              Signed in as{" "}
              <span className="font-medium">{firebaseUser.email}</span>
            </p>
          )}
          <p className="text-center text-sm text-muted-foreground">
            Ask an administrator to add this address under User Access.
          </p>
          <Button className="w-full" onClick={() => void logout()}>
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
