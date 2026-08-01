import { useState, type FormEvent } from "react"
import { Building2, Package, Pencil, Plus, Trash2, Truck } from "lucide-react"
import { toast } from "sonner"

import { useApi } from "@/hooks/useApi"
import { api, ApiError } from "@/lib/api"
import { formatDate, formatNumber, todayISO } from "@/lib/format"
import type { Dispatch } from "@/lib/types"
import { Button } from "@/ui/Button"
import { DataTable, type Column } from "@/ui/DataTable"
import { DateField } from "@/ui/DateField"
import { ErrorNote } from "@/ui/Feedback"
import { Field } from "@/ui/Field"
import { Modal } from "@/ui/Modal"
import { PageHeader } from "@/ui/PageHeader"

interface FormState {
  company_name: string
  dispatch_date: string
  quantity: string
  remarks: string
}

const EMPTY: FormState = {
  company_name: "",
  dispatch_date: todayISO(),
  quantity: "",
  remarks: "",
}

export function DispatchPage() {
  const dispatches = useApi<Dispatch[]>(() => api.get<Dispatch[]>("/dispatch"))
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Dispatch | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [fieldErrors, setFieldErrors] = useState<{
    company?: string
    quantity?: string
  }>({})

  function openCreate() {
    setEditing(null)
    setForm(EMPTY)
    setError("")
    setFieldErrors({})
    setOpen(true)
  }

  function openEdit(dispatch: Dispatch) {
    setEditing(dispatch)
    setForm({
      company_name: dispatch.company_name,
      dispatch_date: dispatch.dispatch_date,
      quantity: String(dispatch.quantity),
      remarks: dispatch.remarks,
    })
    setError("")
    setFieldErrors({})
    setOpen(true)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const next: typeof fieldErrors = {}
    if (!form.company_name.trim()) next.company = "Enter the company name."
    const quantity = Number.parseInt(form.quantity, 10)
    if (!form.quantity.trim() || Number.isNaN(quantity))
      next.quantity = "Enter how many lungis."
    else if (quantity <= 0) next.quantity = "Must be more than zero."
    setFieldErrors(next)
    if (Object.keys(next).length) return

    setError("")
    setSaving(true)
    const payload = {
      company_name: form.company_name.trim(),
      dispatch_date: form.dispatch_date,
      quantity,
      remarks: form.remarks.trim(),
    }

    try {
      if (editing) {
        await api.patch<Dispatch>(`/dispatch/${editing.id}`, payload)
        toast.success("Dispatch updated")
      } else {
        await api.post<Dispatch>("/dispatch", payload)
        toast.success(
          `${formatNumber(payload.quantity)} lungis to ${payload.company_name}`,
        )
      }
      setOpen(false)
      dispatches.reload()
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Could not save the dispatch.",
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(dispatch: Dispatch) {
    if (
      !window.confirm(
        `Delete the ${formatDate(dispatch.dispatch_date)} dispatch to ${
          dispatch.company_name
        }?`,
      )
    )
      return
    try {
      await api.delete(`/dispatch/${dispatch.id}`)
      toast.success("Dispatch deleted")
      dispatches.reload()
    } catch (caught) {
      toast.error(
        caught instanceof ApiError ? caught.message : "Could not delete.",
        { duration: 8000 },
      )
    }
  }

  const columns: Column<Dispatch>[] = [
    {
      key: "date",
      header: "Date",
      sortValue: (row) => row.dispatch_date,
      render: (row) => (
        <span className="whitespace-nowrap">
          {formatDate(row.dispatch_date)}
        </span>
      ),
    },
    {
      key: "company",
      header: "Company",
      sortValue: (row) => row.company_name.toLowerCase(),
      render: (row) => <span className="font-medium">{row.company_name}</span>,
    },
    {
      key: "quantity",
      header: "Lungis",
      align: "right",
      sortValue: (row) => row.quantity,
      render: (row) => (
        <span className="tabular font-semibold">
          {formatNumber(row.quantity)}
        </span>
      ),
    },
    {
      key: "remarks",
      header: "Remarks",
      render: (row) => (
        <span className="text-[var(--text-secondary)]">
          {row.remarks || "—"}
        </span>
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
            aria-label="Edit dispatch"
            className="rounded-[8px] p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]"
          >
            <Pencil className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => void handleDelete(row)}
            aria-label="Delete dispatch"
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
        title="Dispatch"
        description="Lungis sent out to customer companies."
        actions={
          <Button onClick={openCreate} icon={<Plus className="size-4" />}>
            Record dispatch
          </Button>
        }
      />

      <DataTable
        data={dispatches.data}
        columns={columns}
        getRowId={(row) => row.id}
        loading={dispatches.loading}
        error={dispatches.error}
        onRetry={dispatches.reload}
        searchable={(row, query) =>
          row.company_name.toLowerCase().includes(query) ||
          row.remarks.toLowerCase().includes(query)
        }
        searchPlaceholder="Search company or remarks"
        pageSize={12}
        emptyTitle="No dispatches recorded"
        emptyDescription="Record a consignment to build up dispatch history."
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit dispatch" : "Record dispatch"}
        description="Track what went out, to whom, and when."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="dispatch-form" loading={saving}>
              {editing ? "Save changes" : "Record dispatch"}
            </Button>
          </>
        }
      >
        <form
          id="dispatch-form"
          onSubmit={handleSubmit}
          className="space-y-4 pb-2"
        >
          <Field
            label="Company name"
            icon={<Building2 className="size-[18px]" />}
            value={form.company_name}
            error={fieldErrors.company}
            onChange={(event) => {
              setForm({ ...form, company_name: event.target.value })
              setFieldErrors((prev) => ({ ...prev, company: undefined }))
            }}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <DateField
              label="Dispatch date"
              value={form.dispatch_date}
              onChange={(value) => setForm({ ...form, dispatch_date: value })}
            />
            <Field
              label="Number of lungis"
              type="number"
              min="1"
              step="1"
              icon={<Package className="size-[18px]" />}
              value={form.quantity}
              error={fieldErrors.quantity}
              onChange={(event) => {
                setForm({ ...form, quantity: event.target.value })
                setFieldErrors((prev) => ({ ...prev, quantity: undefined }))
              }}
            />
          </div>

          <Field
            label="Remarks"
            icon={<Truck className="size-[18px]" />}
            value={form.remarks}
            hint="Optional"
            onChange={(event) =>
              setForm({ ...form, remarks: event.target.value })
            }
          />

          {error && <ErrorNote message={error} />}
        </form>
      </Modal>
    </div>
  )
}
