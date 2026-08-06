import { useState, type FormEvent } from "react"
import { Cog, Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { useApi } from "@/hooks/useApi"
import { loomSortKey } from "@/lib/looms"
import { api, ApiError } from "@/lib/api"
import type { Loom, Shed } from "@/lib/types"
import { Button } from "@/ui/Button"
import { DataTable, type Column } from "@/ui/DataTable"
import { Badge, ErrorNote } from "@/ui/Feedback"
import { Field } from "@/ui/Field"
import { Modal } from "@/ui/Modal"
import { PageHeader } from "@/ui/PageHeader"
import { SelectField } from "@/ui/SelectField"
import { Switch } from "@/ui/Switch"

export function Looms() {
  const sheds = useApi<Shed[]>(() => api.get<Shed[]>("/sheds"))
  const looms = useApi<Loom[]>(() => api.get<Loom[]>("/looms"))

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Loom | null>(null)
  const [loomNumber, setLoomNumber] = useState("")
  const [shedId, setShedId] = useState("")
  const [isActive, setIsActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [numberError, setNumberError] = useState("")
  const [shedError, setShedError] = useState("")

  function openCreate() {
    setEditing(null)
    setLoomNumber("")
    setShedId(String(sheds.data?.[0]?.id ?? ""))
    setIsActive(true)
    setError("")
    setNumberError("")
    setShedError("")
    setOpen(true)
  }

  function openEdit(loom: Loom) {
    setEditing(loom)
    setLoomNumber(loom.loom_number)
    setShedId(String(loom.shed_id))
    setIsActive(loom.is_active)
    setError("")
    setNumberError("")
    setShedError("")
    setOpen(true)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    let invalid = false
    if (!shedId) {
      setShedError("Choose a shed.")
      invalid = true
    }
    if (!loomNumber.trim()) {
      setNumberError("Give the loom a number.")
      invalid = true
    }
    if (invalid) return

    setError("")
    setSaving(true)
    const payload = {
      loom_number: loomNumber.trim(),
      shed_id: Number(shedId),
      is_active: isActive,
    }

    try {
      if (editing) {
        await api.patch<Loom>(`/looms/${editing.id}`, payload)
        toast.success("Loom updated")
      } else {
        await api.post<Loom>("/looms", payload)
        toast.success("Loom added")
      }
      setOpen(false)
      looms.reload()
      sheds.reload()
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "Could not save loom.",
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(loom: Loom) {
    if (!window.confirm(`Delete loom ${loom.label}?`)) return
    try {
      await api.delete(`/looms/${loom.id}`)
      toast.success("Loom deleted")
      looms.reload()
      sheds.reload()
    } catch (caught) {
      toast.error(
        caught instanceof ApiError ? caught.message : "Could not delete.",
        { duration: 8000 },
      )
    }
  }

  const columns: Column<Loom>[] = [
    {
      key: "label",
      header: "Loom",
      sortValue: (row) => loomSortKey(row.shed_name, row.loom_number),
      render: (row) => <span className="font-medium">{row.label}</span>,
    },
    {
      key: "shed",
      header: "Shed",
      sortValue: (row) => row.shed_name,
      render: (row) => (
        <span className="text-[var(--text-secondary)]">{row.shed_name}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (row) => (row.is_active ? 0 : 1),
      render: (row) => (
        <Badge tone={row.is_active ? "success" : "neutral"}>
          {row.is_active ? "Running" : "Idle"}
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
            aria-label={`Edit loom ${row.label}`}
            className="rounded-[8px] p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]"
          >
            <Pencil className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => void handleDelete(row)}
            aria-label={`Delete loom ${row.label}`}
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
        title="Looms"
        description="Every loom belongs to one shed. Change its shed to move it."
        actions={
          <Button
            onClick={openCreate}
            icon={<Plus className="size-4" />}
            disabled={(sheds.data?.length ?? 0) === 0}
          >
            Add loom
          </Button>
        }
      />

      <DataTable
        data={looms.data}
        columns={columns}
        getRowId={(row) => row.id}
        loading={looms.loading || sheds.loading}
        error={looms.error}
        onRetry={looms.reload}
        searchable={(row, query) =>
          row.label.toLowerCase().includes(query) ||
          row.shed_name.toLowerCase().includes(query)
        }
        searchPlaceholder="Search loom or shed"
        pageSize={14}
        emptyTitle={
          (sheds.data?.length ?? 0) === 0 ? "Add a shed first" : "No looms yet"
        }
        emptyDescription={
          (sheds.data?.length ?? 0) === 0
            ? "Looms belong to a shed, so create one under Sheds."
            : "Add a loom to start booking production against it."
        }
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit loom ${editing.label}` : "Add loom"}
        description="Loom numbers only need to be unique within their shed."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="loom-form" loading={saving}>
              {editing ? "Save changes" : "Add loom"}
            </Button>
          </>
        }
      >
        <form id="loom-form" onSubmit={handleSubmit} className="space-y-4 pb-2">
          <SelectField
            label="Shed"
            value={shedId}
            error={shedError}
            onChange={(value) => {
              setShedId(value)
              setShedError("")
            }}
            options={(sheds.data ?? []).map((shed) => ({
              value: String(shed.id),
              label: `Shed ${shed.name}`,
            }))}
            placeholder="Select shed"
          />
          <Field
            label="Loom number"
            icon={<Cog className="size-[18px]" />}
            value={loomNumber}
            error={numberError}
            hint="Plain numbers — 1, 2, 3."
            onChange={(event) => {
              setLoomNumber(event.target.value)
              setNumberError("")
            }}
          />
          <Switch
            label="Running"
            description="Idle looms stay selectable for back-dated entries"
            checked={isActive}
            onChange={setIsActive}
          />
          {error && <ErrorNote message={error} />}
        </form>
      </Modal>
    </div>
  )
}
