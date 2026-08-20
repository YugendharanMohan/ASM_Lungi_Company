import { useState, type FormEvent } from "react"
import { Building2, Package, Pencil, Plus, Trash2, Truck } from "lucide-react"
import { toast } from "sonner"

import { useApi } from "@/hooks/useApi"
import { useConfirm } from "@/ui/ConfirmDialog"
import { api, ApiError } from "@/lib/api"
import { formatDate, formatNumber, todayISO } from "@/lib/format"
import { DISPATCH_PICKS, LUNGIS_PER_BUNDLE } from "@/lib/types"
import type { Dispatch, DispatchPick } from "@/lib/types"
import { Button } from "@/ui/Button"
import { DataTable, type Column } from "@/ui/DataTable"
import { DateField } from "@/ui/DateField"
import { Badge, ErrorNote } from "@/ui/Feedback"
import { Field } from "@/ui/Field"
import { Modal } from "@/ui/Modal"
import { PageHeader } from "@/ui/PageHeader"

/** Bundle counts keyed by pick — "" means the pick is not on this consignment. */
type BundleMap = Record<DispatchPick, string>

const EMPTY_BUNDLES: BundleMap = {
  "88x96": "",
  "88x92": "",
  "88x80": "",
  "88x96 Kambam": "",
}

interface FormState {
  company_name: string
  dispatch_date: string
  remarks: string
  bundles: BundleMap
}

const EMPTY: FormState = {
  company_name: "",
  dispatch_date: todayISO(),
  remarks: "",
  bundles: EMPTY_BUNDLES,
}

export function DispatchPage() {
  const confirm = useConfirm()
  const dispatches = useApi<Dispatch[]>(() => api.get<Dispatch[]>("/dispatch"))
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Dispatch | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [companyError, setCompanyError] = useState("")

  const totalBundles = DISPATCH_PICKS.reduce(
    (sum, pick) => sum + (Number.parseInt(form.bundles[pick], 10) || 0),
    0,
  )
  const totalLungis = totalBundles * LUNGIS_PER_BUNDLE

  function openCreate() {
    setEditing(null)
    setForm({ ...EMPTY, dispatch_date: todayISO(), bundles: EMPTY_BUNDLES })
    setError("")
    setCompanyError("")
    setOpen(true)
  }

  function openEdit(dispatch: Dispatch) {
    const bundles = { ...EMPTY_BUNDLES }
    for (const item of dispatch.items) {
      bundles[item.pick_type] = String(item.bundles)
    }
    setEditing(dispatch)
    setForm({
      company_name: dispatch.company_name,
      dispatch_date: dispatch.dispatch_date,
      remarks: dispatch.remarks,
      bundles,
    })
    setError("")
    setCompanyError("")
    setOpen(true)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!form.company_name.trim()) {
      setCompanyError("Enter the company name.")
      return
    }
    if (totalBundles <= 0) {
      setError("Enter bundles against at least one pick.")
      return
    }

    setError("")
    setSaving(true)

    // Only picks with bundles are sent. The form shows all four, but most
    // consignments use one or two.
    const items = DISPATCH_PICKS.map((pick) => ({
      pick_type: pick,
      bundles: Number.parseInt(form.bundles[pick], 10) || 0,
    })).filter((item) => item.bundles > 0)

    const payload = {
      company_name: form.company_name.trim(),
      dispatch_date: form.dispatch_date,
      remarks: form.remarks.trim(),
      items,
    }

    try {
      if (editing) {
        await api.patch<Dispatch>(`/dispatch/${editing.id}`, payload)
        toast.success("Dispatch updated")
      } else {
        await api.post<Dispatch>("/dispatch", payload)
        toast.success(
          `${totalBundles} bundles — ${formatNumber(totalLungis)} lungis to ${
            payload.company_name
          }`,
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
    const ok = await confirm({
      title: `Delete the ${formatDate(dispatch.dispatch_date)} dispatch?`,
      message: `${formatNumber(dispatch.quantity)} lungis to ${dispatch.company_name} will be removed from the records.`,
    })
    if (!ok) return
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
      key: "picks",
      header: "Picks",
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.items.map((item) => (
            <Badge key={item.pick_type}>
              {item.pick_type} · {item.bundles}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      key: "bundles",
      header: "Bundles",
      align: "right",
      sortValue: (row) => row.total_bundles,
      render: (row) => (
        <span className="tabular">{formatNumber(row.total_bundles)}</span>
      ),
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
        description={`Consignments go out as bundles of ${LUNGIS_PER_BUNDLE} lungis. Enter bundles per pick — the piece count follows.`}
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
          row.remarks.toLowerCase().includes(query) ||
          row.items.some((item) => item.pick_type.toLowerCase().includes(query))
        }
        searchPlaceholder="Search company, pick or remarks"
        pageSize={12}
        emptyTitle="No dispatches recorded"
        emptyDescription="Record a consignment to build up dispatch history."
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit dispatch" : "Record dispatch"}
        description="Enter the number of bundles against each pick being sent."
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
            error={companyError}
            onChange={(event) => {
              setForm({ ...form, company_name: event.target.value })
              setCompanyError("")
            }}
          />

          <DateField
            label="Dispatch date"
            value={form.dispatch_date}
            onChange={(value) => setForm({ ...form, dispatch_date: value })}
          />

          <div>
            <p className="mb-2 pl-1 text-[12px] font-medium text-[var(--text-secondary)]">
              Bundles by pick
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {DISPATCH_PICKS.map((pick) => {
                const count = Number.parseInt(form.bundles[pick], 10) || 0
                return (
                  <Field
                    key={pick}
                    label={pick}
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="1"
                    icon={<Package className="size-[18px]" />}
                    value={form.bundles[pick]}
                    // The piece count sits under the box it came from, so the
                    // multiplication is visible where the operator typed
                    // rather than only in a grand total further down.
                    hint={
                      count > 0
                        ? `${formatNumber(count * LUNGIS_PER_BUNDLE)} lungis`
                        : undefined
                    }
                    onChange={(event) => {
                      setForm({
                        ...form,
                        bundles: {
                          ...form.bundles,
                          [pick]: event.target.value,
                        },
                      })
                      setError("")
                    }}
                  />
                )
              })}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-[14px] bg-[var(--surface-sunken)] px-4 py-3.5">
            <span className="text-[13.5px] text-[var(--text-secondary)]">
              {formatNumber(totalBundles)} bundle
              {totalBundles === 1 ? "" : "s"} × {LUNGIS_PER_BUNDLE}
            </span>
            <span className="tabular text-[19px] font-semibold tracking-[-0.02em]">
              {formatNumber(totalLungis)} lungis
            </span>
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
