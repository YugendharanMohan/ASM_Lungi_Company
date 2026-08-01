import { useState, type FormEvent } from "react"
import { IndianRupee, Pencil, Phone, Plus, Trash2, User } from "lucide-react"
import { toast } from "sonner"

import { useApi } from "@/hooks/useApi"
import { api, ApiError } from "@/lib/api"
import { formatCurrency } from "@/lib/format"
import type { Shed, Worker } from "@/lib/types"
import { Button } from "@/ui/Button"
import { DataTable, type Column } from "@/ui/DataTable"
import { Badge, ErrorNote } from "@/ui/Feedback"
import { Field } from "@/ui/Field"
import { Modal } from "@/ui/Modal"
import { PageHeader } from "@/ui/PageHeader"
import { SelectField } from "@/ui/SelectField"
import { Switch } from "@/ui/Switch"

const NO_SHED = "__none__"

interface FormState {
  name: string
  phone: string
  shed_id: string
  rate_per_meter: string
  is_active: boolean
}

const EMPTY: FormState = {
  name: "",
  phone: "",
  shed_id: NO_SHED,
  rate_per_meter: "",
  is_active: true,
}

export function Workers() {
  const workers = useApi<Worker[]>(() => api.get<Worker[]>("/workers"))
  const sheds = useApi<Shed[]>(() => api.get<Shed[]>("/sheds"))

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Worker | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [nameError, setNameError] = useState("")

  function openCreate() {
    setEditing(null)
    setForm(EMPTY)
    setError("")
    setNameError("")
    setOpen(true)
  }

  function openEdit(worker: Worker) {
    setEditing(worker)
    setForm({
      name: worker.name,
      phone: worker.phone,
      shed_id: worker.shed_id ? String(worker.shed_id) : NO_SHED,
      rate_per_meter: String(worker.rate_per_meter ?? ""),
      is_active: worker.is_active,
    })
    setError("")
    setNameError("")
    setOpen(true)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!form.name.trim()) {
      setNameError("A worker needs a name.")
      return
    }
    setError("")
    setSaving(true)

    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      shed_id: form.shed_id === NO_SHED ? null : Number(form.shed_id),
      rate_per_meter: Number.parseFloat(form.rate_per_meter) || 0,
      is_active: form.is_active,
    }

    try {
      if (editing) {
        await api.patch<Worker>(`/workers/${editing.id}`, payload)
        toast.success(`${payload.name} updated`)
      } else {
        await api.post<Worker>("/workers", payload)
        toast.success(`${payload.name} added`)
      }
      setOpen(false)
      workers.reload()
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "Could not save worker.",
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(worker: Worker) {
    if (!window.confirm(`Delete ${worker.name}?`)) return
    try {
      await api.delete(`/workers/${worker.id}`)
      toast.success(`${worker.name} deleted`)
      workers.reload()
    } catch (caught) {
      toast.error(
        caught instanceof ApiError ? caught.message : "Could not delete.",
        { duration: 8000 },
      )
    }
  }

  const columns: Column<Worker>[] = [
    {
      key: "name",
      header: "Name",
      sortValue: (row) => row.name.toLowerCase(),
      render: (row) => <span className="font-medium">{row.name}</span>,
    },
    {
      key: "phone",
      header: "Phone",
      sortValue: (row) => row.phone,
      render: (row) => (
        <span className="tabular text-[var(--text-secondary)]">
          {row.phone || "—"}
        </span>
      ),
    },
    {
      key: "shed",
      header: "Shed",
      sortValue: (row) => row.shed_name,
      render: (row) => (
        <span className="text-[var(--text-secondary)]">
          {row.shed_name || "—"}
        </span>
      ),
    },
    {
      key: "rate",
      header: "Rate / m",
      align: "right",
      sortValue: (row) => row.rate_per_meter,
      render: (row) => (
        <span className="tabular">{formatCurrency(row.rate_per_meter)}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (row) => (row.is_active ? 0 : 1),
      render: (row) => (
        <Badge tone={row.is_active ? "success" : "neutral"}>
          {row.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (row) => (
        <div className="flex justify-end gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <button
            type="button"
            onClick={() => openEdit(row)}
            aria-label={`Edit ${row.name}`}
            className="rounded-[8px] p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]"
          >
            <Pencil className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => void handleDelete(row)}
            aria-label={`Delete ${row.name}`}
            className="rounded-[8px] p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
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
        title="Workers"
        description="Names, phone numbers and piece rates."
        actions={
          <Button onClick={openCreate} icon={<Plus className="size-4" />}>
            Add worker
          </Button>
        }
      />

      <DataTable
        data={workers.data}
        columns={columns}
        getRowId={(row) => row.id}
        loading={workers.loading}
        error={workers.error}
        onRetry={workers.reload}
        searchable={(row, query) =>
          row.name.toLowerCase().includes(query) ||
          row.phone.toLowerCase().includes(query) ||
          row.shed_name.toLowerCase().includes(query)
        }
        searchPlaceholder="Search name, phone or shed"
        pageSize={12}
        emptyTitle="No workers yet"
        emptyDescription="Add your first worker to start recording production."
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${editing.name}` : "Add worker"}
        description="The rate here pre-fills the daily entry form."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="worker-form" loading={saving}>
              {editing ? "Save changes" : "Add worker"}
            </Button>
          </>
        }
      >
        <form id="worker-form" onSubmit={handleSubmit} className="space-y-4 pb-2">
          <Field
            label="Worker name"
            icon={<User className="size-[18px]" />}
            value={form.name}
            error={nameError}
            onChange={(event) => {
              setForm({ ...form, name: event.target.value })
              setNameError("")
            }}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Phone"
              inputMode="tel"
              icon={<Phone className="size-[18px]" />}
              value={form.phone}
              onChange={(event) =>
                setForm({ ...form, phone: event.target.value })
              }
            />
            <Field
              label="Rate per metre"
              type="number"
              step="0.01"
              min="0"
              icon={<IndianRupee className="size-[18px]" />}
              value={form.rate_per_meter}
              onChange={(event) =>
                setForm({ ...form, rate_per_meter: event.target.value })
              }
            />
          </div>

          <SelectField
            label="Shed"
            value={form.shed_id}
            onChange={(value) => setForm({ ...form, shed_id: value })}
            options={[
              { value: NO_SHED, label: "No shed" },
              ...(sheds.data ?? []).map((shed) => ({
                value: String(shed.id),
                label: `Shed ${shed.name}`,
              })),
            ]}
            hint="Used for grouping reports. Workers can be booked to any loom."
          />

          <Switch
            label="Active"
            description="Shows in the daily entry worker list"
            checked={form.is_active}
            onChange={(checked) => setForm({ ...form, is_active: checked })}
          />

          {error && <ErrorNote message={error} />}
        </form>
      </Modal>
    </div>
  )
}
