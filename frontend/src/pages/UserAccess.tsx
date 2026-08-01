import { useState, type FormEvent } from "react"
import { Mail, ShieldCheck, Trash2, User, UserPlus } from "lucide-react"
import { toast } from "sonner"

import { useAuth } from "@/contexts/AuthContext"
import { useApi } from "@/hooks/useApi"
import { api, ApiError } from "@/lib/api"
import { formatDate } from "@/lib/format"
import type { AppUser, UserRole } from "@/lib/types"
import { Button } from "@/ui/Button"
import { DataTable, type Column } from "@/ui/DataTable"
import { Badge, ErrorNote } from "@/ui/Feedback"
import { Field } from "@/ui/Field"
import { Modal } from "@/ui/Modal"
import { PageHeader } from "@/ui/PageHeader"
import { SegmentedControl } from "@/ui/SegmentedControl"
import { SelectField } from "@/ui/SelectField"

export function UserAccess() {
  const { user: currentUser } = useAuth()
  const users = useApi<AppUser[]>(() => api.get<AppUser[]>("/users"))

  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [role, setRole] = useState<UserRole>("STAFF")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [emailError, setEmailError] = useState("")

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setEmailError("Enter a valid email address.")
      return
    }
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

  async function patch(target: AppUser, body: Partial<AppUser>, message: string) {
    try {
      await api.patch<AppUser>(`/users/${target.id}`, body)
      toast.success(message)
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

  const columns: Column<AppUser>[] = [
    {
      key: "email",
      header: "Email",
      sortValue: (row) => row.email,
      render: (row) => (
        <span className="font-medium">
          {row.email}
          {row.id === currentUser?.id && (
            <span className="ml-2 text-[12px] font-normal text-[var(--text-tertiary)]">
              you
            </span>
          )}
        </span>
      ),
    },
    {
      key: "name",
      header: "Name",
      sortValue: (row) => row.display_name,
      render: (row) => (
        <span className="text-[var(--text-secondary)]">
          {row.display_name || "—"}
        </span>
      ),
    },
    {
      key: "role",
      header: "Role",
      sortValue: (row) => row.role,
      render: (row) => (
        <SegmentedControl
          size="sm"
          aria-label={`Role for ${row.email}`}
          value={row.role}
          onChange={(value) =>
            void patch(
              row,
              { role: value },
              `${row.email} is now ${value.toLowerCase()}`,
            )
          }
          segments={[
            { value: "STAFF", label: "Staff" },
            { value: "ADMIN", label: "Admin" },
          ]}
        />
      ),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (row) => (row.is_active ? 0 : 1),
      render: (row) => (
        <Badge tone={row.is_active ? "success" : "neutral"}>
          {row.is_active ? "Active" : "Disabled"}
        </Badge>
      ),
    },
    {
      key: "last",
      header: "Last sign-in",
      sortValue: (row) => row.last_login_at ?? "",
      render: (row) => (
        <span className="whitespace-nowrap text-[var(--text-secondary)]">
          {row.last_login_at ? formatDate(row.last_login_at) : "Never"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              void patch(
                row,
                { is_active: !row.is_active },
                row.is_active
                  ? `${row.email} deactivated`
                  : `${row.email} reactivated`,
              )
            }
          >
            {row.is_active ? "Disable" : "Enable"}
          </Button>
          <button
            type="button"
            disabled={row.id === currentUser?.id}
            onClick={() => void handleDelete(row)}
            aria-label={`Remove ${row.email}`}
            className="rounded-[8px] p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--danger-soft)] hover:text-[var(--danger)] disabled:pointer-events-none disabled:opacity-30"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="User Access"
        description="Only these addresses can sign in. There is no public sign-up."
        actions={
          <Button onClick={() => setOpen(true)} icon={<UserPlus className="size-4" />}>
            Grant access
          </Button>
        }
      />

      <div className="mb-5 flex items-start gap-3 rounded-[16px] border border-[var(--border-subtle)] bg-[var(--accent-soft)] px-4 py-3.5 text-[13.5px] text-[var(--text)]">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--accent)]" />
        <p>
          Adding an address here authorises it. The person must still have a
          Firebase account — create it under{" "}
          <span className="font-medium">Authentication → Users</span> — and
          verify their email before they can get in.
        </p>
      </div>

      <DataTable
        data={users.data}
        columns={columns}
        getRowId={(row) => row.id}
        loading={users.loading}
        error={users.error}
        onRetry={users.reload}
        searchable={(row, query) =>
          row.email.toLowerCase().includes(query) ||
          row.display_name.toLowerCase().includes(query)
        }
        searchPlaceholder="Search email or name"
        pageSize={12}
        emptyTitle="No users yet"
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Grant access"
        description="Authorise an email address to use the system."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="access-form" loading={saving}>
              Grant access
            </Button>
          </>
        }
      >
        <form id="access-form" onSubmit={handleSubmit} className="space-y-4 pb-2">
          <Field
            label="Email address"
            type="email"
            icon={<Mail className="size-[18px]" />}
            value={email}
            error={emailError}
            onChange={(event) => {
              setEmail(event.target.value)
              setEmailError("")
            }}
          />
          <Field
            label="Display name"
            icon={<User className="size-[18px]" />}
            value={displayName}
            hint="Optional"
            onChange={(event) => setDisplayName(event.target.value)}
          />
          <SelectField
            label="Role"
            value={role}
            onChange={(value) => setRole(value as UserRole)}
            options={[
              { value: "STAFF", label: "Staff — record production and wages" },
              { value: "ADMIN", label: "Admin — also manages users" },
            ]}
          />
          {error && <ErrorNote message={error} />}
        </form>
      </Modal>
    </div>
  )
}
