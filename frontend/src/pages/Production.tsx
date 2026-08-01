import { useEffect, useMemo, useState, type FormEvent } from "react"
import { CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import {
  EmptyState,
  ErrorNote,
  Loading,
  PageHeader,
  TableScroller,
} from "@/components/common"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { useApi } from "@/hooks/useApi"
import { api, ApiError } from "@/lib/api"
import {
  formatCurrency,
  formatDate,
  formatMeters,
  todayISO,
} from "@/lib/format"
import type { Loom, ProductionEntry, Shift, Worker } from "@/lib/types"

export function Production() {
  const [entryDate, setEntryDate] = useState(todayISO())
  const [shift, setShift] = useState<Shift>("DAY")
  const [workerId, setWorkerId] = useState("")
  const [loomId, setLoomId] = useState("")
  const [meters, setMeters] = useState("")
  const [rate, setRate] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState("")

  const workers = useApi<Worker[]>(() =>
    api.get<Worker[]>("/workers", { active_only: true }),
  )
  const looms = useApi<Loom[]>(() => api.get<Loom[]>("/looms"))
  const entries = useApi<ProductionEntry[]>(
    () => api.get<ProductionEntry[]>("/production", { start_date: entryDate, end_date: entryDate }),
    [entryDate],
  )

  const selectedWorker = useMemo(
    () => workers.data?.find((w) => String(w.id) === workerId),
    [workers.data, workerId],
  )

  // Picking a worker fills in their rate and their usual loom — the common
  // case is one worker on one loom, and retyping both every shift is the
  // single most repeated action in this app.
  useEffect(() => {
    if (!selectedWorker) return
    setRate(String(selectedWorker.rate_per_meter ?? ""))
    if (selectedWorker.loom_id) setLoomId(String(selectedWorker.loom_id))
  }, [selectedWorker])

  const total =
    (Number.parseFloat(meters) || 0) * (Number.parseFloat(rate) || 0)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError("")

    if (!workerId || !loomId) {
      setFormError("Choose both a worker and a loom.")
      return
    }

    setSubmitting(true)
    try {
      await api.post<ProductionEntry>("/production", {
        entry_date: entryDate,
        shift,
        worker_id: Number(workerId),
        loom_id: Number(loomId),
        meters: Number.parseFloat(meters) || 0,
        rate_per_meter: Number.parseFloat(rate) || 0,
      })
      toast.success("Production entry saved", {
        description: `${selectedWorker?.name ?? "Worker"} · ${formatMeters(
          Number.parseFloat(meters) || 0,
        )} · ${formatCurrency(total)}`,
      })
      setMeters("")
      entries.reload()
    } catch (caught) {
      const message =
        caught instanceof ApiError
          ? caught.message
          : "Could not save the entry."
      setFormError(message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(entry: ProductionEntry) {
    if (
      !window.confirm(
        `Delete ${entry.worker_name}'s ${entry.shift.toLowerCase()} shift entry of ${formatMeters(
          entry.meters,
        )}?`,
      )
    ) {
      return
    }
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

  const dayTotal = (entries.data ?? []).reduce(
    (sum, entry) => sum + entry.total_amount,
    0,
  )
  const dayMeters = (entries.data ?? []).reduce(
    (sum, entry) => sum + entry.meters,
    0,
  )

  return (
    <div>
      <PageHeader
        title="Daily Meter Entry"
        description="Record what each worker produced, shift by shift."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">New entry</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="date">Date</Label>
                  <Input
                    id="date"
                    type="date"
                    required
                    max={todayISO()}
                    value={entryDate}
                    onChange={(event) => setEntryDate(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="shift">Shift</Label>
                  <Select
                    value={shift}
                    onValueChange={(value) => setShift(value as Shift)}
                  >
                    <SelectTrigger id="shift" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DAY">Day shift</SelectItem>
                      <SelectItem value="NIGHT">Night shift</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="worker">Worker</Label>
                <Select value={workerId} onValueChange={setWorkerId}>
                  <SelectTrigger id="worker" className="w-full">
                    <SelectValue placeholder="Select worker" />
                  </SelectTrigger>
                  <SelectContent>
                    {(workers.data ?? []).map((worker) => (
                      <SelectItem key={worker.id} value={String(worker.id)}>
                        {worker.name}
                        {worker.shed_name ? ` · Shed ${worker.shed_name}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {workers.data?.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No active workers yet — add one under Workers first.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="loom">Loom</Label>
                <Select value={loomId} onValueChange={setLoomId}>
                  <SelectTrigger id="loom" className="w-full">
                    <SelectValue placeholder="Select loom" />
                  </SelectTrigger>
                  <SelectContent>
                    {(looms.data ?? []).map((loom) => (
                      <SelectItem key={loom.id} value={String(loom.id)}>
                        Shed {loom.shed_name} · Loom {loom.loom_number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="meters">Meters</Label>
                  <Input
                    id="meters"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    required
                    value={meters}
                    onChange={(event) => setMeters(event.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rate">Rate (₹/m)</Label>
                  <Input
                    id="rate"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    required
                    value={rate}
                    onChange={(event) => setRate(event.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-md bg-muted px-4 py-3">
                <span className="text-sm text-muted-foreground">
                  Total amount
                </span>
                <span className="tabular text-lg font-semibold">
                  {formatCurrency(total)}
                </span>
              </div>

              {formError && <ErrorNote message={formError} />}

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                Save entry
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle className="text-base">
              Entries for {formatDate(entryDate)}
            </CardTitle>
            {(entries.data?.length ?? 0) > 0 && (
              <span className="tabular text-sm text-muted-foreground">
                {formatMeters(dayMeters)} · {formatCurrency(dayTotal)}
              </span>
            )}
          </CardHeader>
          <CardContent>
            {entries.loading ? (
              <Loading />
            ) : entries.error ? (
              <ErrorNote message={entries.error} onRetry={entries.reload} />
            ) : entries.data?.length === 0 ? (
              <EmptyState
                title="No entries for this date"
                description="Saved entries will appear here."
              />
            ) : (
              <TableScroller>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Worker</TableHead>
                      <TableHead>Loom</TableHead>
                      <TableHead>Shift</TableHead>
                      <TableHead className="text-right">Meters</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(entries.data ?? []).map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-medium">
                          {entry.worker_name}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {entry.shed_name} · {entry.loom_number}
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 text-sm">
                            <CheckCircle2 className="size-3.5 text-success" />
                            {entry.shift === "DAY" ? "Day" : "Night"}
                          </span>
                        </TableCell>
                        <TableCell className="tabular text-right">
                          {entry.meters.toFixed(2)}
                        </TableCell>
                        <TableCell className="tabular text-right">
                          {entry.rate_per_meter.toFixed(2)}
                        </TableCell>
                        <TableCell className="tabular text-right font-medium">
                          {formatCurrency(entry.total_amount)}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Delete entry for ${entry.worker_name}`}
                            onClick={() => void handleDelete(entry)}
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableScroller>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
