import { useEffect, useMemo, useState, type FormEvent } from "react"
import { Check, Gauge, Plus, Ruler, Trash2, User } from "lucide-react"
import { toast } from "sonner"

import { useApi } from "@/hooks/useApi"
import { api, ApiError } from "@/lib/api"
import { formatCurrency, formatDate, formatMeters, todayISO } from "@/lib/format"
import { PICK_TYPES } from "@/lib/types"
import type { Loom, PickType, ProductionEntry, Shift, Worker } from "@/lib/types"
import { Button } from "@/ui/Button"
import { Card, CardHeader } from "@/ui/Card"
import { DataTable, type Column } from "@/ui/DataTable"
import { DateField } from "@/ui/DateField"
import { ErrorNote } from "@/ui/Feedback"
import { Field } from "@/ui/Field"
import { PageHeader } from "@/ui/PageHeader"
import { SegmentedControl } from "@/ui/SegmentedControl"
import { SelectField } from "@/ui/SelectField"

interface FormErrors {
  worker?: string
  loom?: string
  meters?: string
  rate?: string
}

export function Production() {
  const [entryDate, setEntryDate] = useState(todayISO())
  const [shift, setShift] = useState<Shift>("DAY")
  const [pick, setPick] = useState<PickType>("88x96")
  const [workerId, setWorkerId] = useState("")
  const [loomId, setLoomId] = useState("")
  const [meters, setMeters] = useState("")
  const [rate, setRate] = useState("")
  const [errors, setErrors] = useState<FormErrors>({})
  const [formError, setFormError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const workers = useApi<Worker[]>(() =>
    api.get<Worker[]>("/workers", { active_only: true }),
  )
  const looms = useApi<Loom[]>(() => api.get<Loom[]>("/looms"))
  const entries = useApi<ProductionEntry[]>(
    () =>
      api.get<ProductionEntry[]>("/production", {
        start_date: entryDate,
        end_date: entryDate,
      }),
    [entryDate],
  )

  const selectedWorker = useMemo(
    () => workers.data?.find((w) => String(w.id) === workerId),
    [workers.data, workerId],
  )

  // Choosing a worker suggests their standing rate. It is only a starting
  // point — the rate belongs to the pick being woven, so it stays editable and
  // whatever is in the box at submit time is what gets stored.
  useEffect(() => {
    if (selectedWorker && !rate) {
      setRate(String(selectedWorker.rate_per_meter ?? ""))
    }
  }, [selectedWorker, rate])

  const total =
    (Number.parseFloat(meters) || 0) * (Number.parseFloat(rate) || 0)

  function validate(): boolean {
    const next: FormErrors = {}
    if (!workerId) next.worker = "Choose a worker."
    if (!loomId) next.loom = "Choose a loom."
    const m = Number.parseFloat(meters)
    if (!meters.trim() || Number.isNaN(m)) next.meters = "Enter the metres."
    else if (m <= 0) next.meters = "Metres must be more than zero."
    const r = Number.parseFloat(rate)
    if (!rate.trim() || Number.isNaN(r)) next.rate = "Enter the rate."
    else if (r <= 0) next.rate = "Rate must be more than zero."
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError("")
    if (!validate()) return

    setSubmitting(true)
    try {
      await api.post<ProductionEntry>("/production", {
        entry_date: entryDate,
        shift,
        pick_type: pick,
        worker_id: Number(workerId),
        loom_id: Number(loomId),
        meters: Number.parseFloat(meters),
        rate_per_meter: Number.parseFloat(rate),
      })
      toast.success("Entry saved", {
        description: `${selectedWorker?.name ?? "Worker"} · ${formatMeters(
          Number.parseFloat(meters),
        )} · ${formatCurrency(total)}`,
      })
      setMeters("")
      setErrors({})
      entries.reload()
    } catch (caught) {
      setFormError(
        caught instanceof ApiError ? caught.message : "Could not save the entry.",
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(entry: ProductionEntry) {
    if (
      !window.confirm(
        `Delete ${entry.worker_name}'s ${entry.shift.toLowerCase()} entry of ${formatMeters(
          entry.meters,
        )}?`,
      )
    )
      return
    try {
      await api.delete(`/production/${entry.id}`)
      toast.success("Entry deleted")
      entries.reload()
    } catch (caught) {
      toast.error(
        caught instanceof ApiError ? caught.message : "Could not delete.",
      )
    }
  }

  const dayMeters = (entries.data ?? []).reduce((sum, e) => sum + e.meters, 0)
  const dayTotal = (entries.data ?? []).reduce(
    (sum, e) => sum + e.total_amount,
    0,
  )

  const columns: Column<ProductionEntry>[] = [
    {
      key: "worker",
      header: "Worker",
      sortValue: (row) => row.worker_name,
      render: (row) => (
        <span className="font-medium">{row.worker_name}</span>
      ),
    },
    {
      key: "loom",
      header: "Loom",
      sortValue: (row) => row.loom_label,
      render: (row) => (
        <span className="text-[var(--text-secondary)]">{row.loom_label}</span>
      ),
    },
    {
      key: "shift",
      header: "Shift",
      sortValue: (row) => row.shift,
      render: (row) => (
        <span className="text-[var(--text-secondary)]">
          {row.shift === "DAY" ? "Day" : "Night"}
        </span>
      ),
    },
    {
      key: "pick",
      header: "Pick",
      sortValue: (row) => row.pick_type,
      render: (row) => (
        <span className="tabular text-[var(--text-secondary)]">
          {row.pick_type}
        </span>
      ),
    },
    {
      key: "meters",
      header: "Metres",
      align: "right",
      sortValue: (row) => row.meters,
      render: (row) => (
        <span className="tabular">{row.meters.toFixed(2)}</span>
      ),
      cellClassName: "tabular",
    },
    {
      key: "rate",
      header: "Rate",
      align: "right",
      sortValue: (row) => row.rate_per_meter,
      render: (row) => (
        <span className="tabular text-[var(--text-secondary)]">
          {row.rate_per_meter.toFixed(2)}
        </span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      sortValue: (row) => row.total_amount,
      render: (row) => (
        <span className="tabular font-semibold">
          {formatCurrency(row.total_amount)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (row) => (
        <button
          type="button"
          onClick={() => void handleDelete(row)}
          aria-label={`Delete entry for ${row.worker_name}`}
          className="rounded-[8px] p-1.5 text-[var(--text-tertiary)] opacity-0 transition-all hover:bg-[var(--danger-soft)] hover:text-[var(--danger)] focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Trash2 className="size-4" />
        </button>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Daily Entry"
        description="Record what each worker wove, shift by shift. Any worker can be booked to any loom."
      />

      {/* Side by side only from 1536px. The entries table carries eight
          columns; below that the form beside it squeezes Amount off the edge
          and the operator is scrolling to read the figure they just typed. */}
      <div className="grid gap-5 2xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        {/* Capped when stacked: a 1200px-wide segmented control for two shift
            options looks like a mistake, and the eye has to travel the whole
            width to pair a label with its field. */}
        <Card className="h-fit w-full max-w-[560px] 2xl:max-w-none">
          <CardHeader title="New entry" />

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <DateField
              label="Date"
              value={entryDate}
              onChange={setEntryDate}
              max={todayISO()}
              required
            />

            <div>
              <p className="mb-2 pl-1 text-[12px] font-medium text-[var(--text-secondary)]">
                Shift
              </p>
              <SegmentedControl
                aria-label="Shift"
                value={shift}
                onChange={setShift}
                segments={[
                  { value: "DAY", label: "Day" },
                  { value: "NIGHT", label: "Night" },
                ]}
                className="w-full"
              />
            </div>

            <div>
              <p className="mb-2 pl-1 text-[12px] font-medium text-[var(--text-secondary)]">
                Pick
              </p>
              <SegmentedControl
                aria-label="Pick type"
                value={pick}
                onChange={setPick}
                segments={PICK_TYPES.map((value) => ({ value, label: value }))}
                className="w-full"
              />
            </div>

            <SelectField
              label="Worker"
              icon={<User className="size-[18px]" />}
              value={workerId}
              onChange={(value) => {
                setWorkerId(value)
                setErrors((prev) => ({ ...prev, worker: undefined }))
              }}
              error={errors.worker}
              options={(workers.data ?? []).map((worker) => ({
                value: String(worker.id),
                label: worker.name,
              }))}
              placeholder="Select worker"
              hint={
                workers.data?.length === 0
                  ? "No active workers — add one under Workers first."
                  : undefined
              }
            />

            <SelectField
              label="Loom"
              icon={<Gauge className="size-[18px]" />}
              value={loomId}
              onChange={(value) => {
                setLoomId(value)
                setErrors((prev) => ({ ...prev, loom: undefined }))
              }}
              error={errors.loom}
              options={(looms.data ?? []).map((loom) => ({
                value: String(loom.id),
                label: loom.label,
              }))}
              placeholder="Select loom"
            />

            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Metres"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                icon={<Ruler className="size-[18px]" />}
                value={meters}
                error={errors.meters}
                onChange={(event) => {
                  setMeters(event.target.value)
                  setErrors((prev) => ({ ...prev, meters: undefined }))
                }}
              />
              <Field
                label="Rate"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                suffix="₹/m"
                value={rate}
                error={errors.rate}
                onChange={(event) => {
                  setRate(event.target.value)
                  setErrors((prev) => ({ ...prev, rate: undefined }))
                }}
              />
            </div>

            <div className="flex items-center justify-between rounded-[14px] bg-[var(--surface-sunken)] px-4 py-3.5">
              <span className="text-[13.5px] text-[var(--text-secondary)]">
                Total amount
              </span>
              <span className="tabular text-[19px] font-semibold tracking-[-0.02em]">
                {formatCurrency(total)}
              </span>
            </div>

            {formError && <ErrorNote message={formError} />}

            <Button
              type="submit"
              fullWidth
              size="lg"
              loading={submitting}
              icon={<Plus className="size-4" />}
            >
              Save entry
            </Button>
          </form>
        </Card>

        <Card>
          <CardHeader
            title={formatDate(entryDate)}
            description={
              (entries.data?.length ?? 0) > 0
                ? `${formatMeters(dayMeters)} · ${formatCurrency(dayTotal)}`
                : "Entries recorded on this date"
            }
            action={
              (entries.data?.length ?? 0) > 0 ? (
                <span className="flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-[var(--success-soft)] px-3 py-1 text-[12.5px] font-medium text-[var(--success)]">
                  <Check className="size-3.5" />
                  {entries.data?.length} entries
                </span>
              ) : undefined
            }
          />

          <div className="mt-4">
            <DataTable
              bare
              data={entries.data}
              columns={columns}
              getRowId={(row) => row.id}
              loading={entries.loading}
              error={entries.error}
              onRetry={entries.reload}
              pageSize={10}
              emptyTitle="No entries yet"
              emptyDescription="Saved entries for this date appear here."
            />
          </div>
        </Card>
      </div>
    </div>
  )
}
