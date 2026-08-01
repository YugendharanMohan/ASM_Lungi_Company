import { useState, type FormEvent } from "react"
import { Loader2, ShieldCheck, Trash2, UserPlus } from "lucide-react"
import { toast } from "sonner"

import {
  EmptyState,
  ErrorNote,
  Loading,
  PageHeader,
  TableScroller,
} from "@/components/common"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useAuth } from "@/contexts/AuthContext"
import { useApi } from "@/hooks/useApi"
import { api, ApiError } from "@/lib/api"
import { formatDate } from "@/lib/format"
import type { AppUser, UserRole } from "@/lib/types"

export function UserAccess() {
  const { user: currentUser } = useAuth()
  const users = useApi<AppUser[]>(() => api.get<AppUser[]>("/users"))

  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [role, setRole] = useState<UserRole>("STAFF")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError("")
    setSaving(true)
    try {
      await api.post<AppUser>("/users", {
        email: email.trim().toLowerCase(),
        display_name: displayName.trim(),
        role,
        is_active: true,
      })
      toast.success(`${email.trim()} can now sign in`)
      setOpen(false)
      setEmail("")
      setDisplayName("")
      setRole("STAFF")
      users.reload()
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "Could not grant access.",
      )
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(target: AppUser) {
    try {
      await api.patch<AppUser>(`/users/${target.id}`, {
        is_active: !target.is_active,
      })
      toast.success(
        target.is_active
          ? `${target.email} deactivated`
          : `${target.email} reactivated`,
      )
      users.reload()
    } catch (caught) {
      toast.error(
        caught instanceof ApiError ? caught.message : "Could not update.",
        { duration: 8000 },
      )
    }
  }

  async function changeRole(target: AppUser, nextRole: UserRole) {
    try {
      await api.patch<AppUser>(`/users/${target.id}`, { role: nextRole })
      toast.success(`${target.email} is now ${nextRole.toLowerCase()}`)
      users.reload()
    } catch (caught) {
      toast.error(
        caught instanceof ApiError ? caught.message : "Could not update.",
        { duration: 8000 },
      )
    }
  }

  async function handleDelete(target: AppUser) {
    if (!window.confirm(`Remove access for ${target.email}?`)) return
    try {
      await api.delete(`/users/${target.id}`)
      toast.success("Access removed")
      users.reload()
    } catch (caught) {
      toast.error(
        caught instanceof ApiError ? caught.message : "Could not remove.",
        { duration: 8000 },
      )
    }
  }

  return (
    <div>
      <PageHeader
        title="User Access"
        description="Only these addresses can sign in. There is no public sign-up."
        actions={
          <Button onClick={() => setOpen(true)}>
            <UserPlus className="size-4" />
            Grant access
          </Button>
        }
      />

      <div className="mb-4 rounded-md border bg-muted/50 p-4 text-sm">
        <p className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>
            Adding an address here authorises it. The person must still have a
            Firebase account (create it in the Firebase console under
            Authentication → Users) and verify their email before they can get
            in.
          </span>
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          {users.loading ? (
            <Loading />
          ) : users.error ? (
            <ErrorNote message={users.error} onRetry={users.reload} />
          ) : users.data?.length === 0 ? (
            <EmptyState title="No users yet" />
          ) : (
            <TableScroller>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last sign-in</TableHead>
                    <TableHead className="w-32" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(users.data ?? []).map((row) => {
                    const isSelf = row.id === currentUser?.id
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">
                          {row.email}
                          {isSelf && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              (you)
                            </span>
                          )}
                        </TableCell>
                        <TableCell>{row.display_name || "—"}</TableCell>
                        <TableCell>
                          <Select
                            value={row.role}
                            onValueChange={(value) =>
                              void changeRole(row, value as UserRole)
                            }
                          >
                            <SelectTrigger className="h-8 w-28">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ADMIN">Admin</SelectItem>
                              <SelectItem value="STAFF">Staff</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={row.is_active ? "default" : "secondary"}
                          >
                            {row.is_active ? "Active" : "Disabled"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {row.last_login_at
                            ? formatDate(row.last_login_at)
                            : "Never"}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void toggleActive(row)}
                            >
                              {row.is_active ? "Disable" : "Enable"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={isSelf}
                              aria-label={`Remove ${row.email}`}
                              onClick={() => void handleDelete(row)}
                            >
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableScroller>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Grant access</DialogTitle>
            <DialogDescription>
              Authorise an email address to use the system.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="user-email">Email address</Label>
              <Input
                id="user-email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="supervisor@company.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-name">Display name (optional)</Label>
              <Input
                id="user-name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-role">Role</Label>
              <Select
                value={role}
                onValueChange={(value) => setRole(value as UserRole)}
              >
                <SelectTrigger id="user-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="STAFF">
                    Staff — record production and wages
                  </SelectItem>
                  <SelectItem value="ADMIN">
                    Admin — also manages users and deletions
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {error && <ErrorNote message={error} />}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                Grant access
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
