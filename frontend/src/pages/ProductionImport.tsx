import { useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { AlertTriangle, Camera, Check, Loader2, Upload, User } from "lucide-react"
import { toast } from "sonner"

import { useApi } from "@/hooks/useApi"
import { useConfirm } from "@/ui/ConfirmDialog"
import { api, ApiError } from "@/lib/api"
import { downscaleImage } from "@/lib/imageScale"
import {
  formatCurrency,
  formatDate,
  formatMeters,
  toISODate,
  todayISO,
} from "@/lib/format"
import { PICK_TYPES, SHIFT_HOURS } from "@/lib/types"
import type { Loom, PickType, Shed, Shift, Worker } from "@/lib/types"
import { Button } from "@/ui/Button"
import { Card, CardHeader } from "@/ui/Card"
import { DateField } from "@/ui/DateField"
import { ErrorNote } from "@/ui/Feedback"
import { Field } from "@/ui/Field"
import { PageHeader } from "@/ui/PageHeader"
import { SegmentedControl } from "@/ui/SegmentedControl"
import { SelectField } from "@/ui/SelectField"
import { cn } from "@/lib/utils"

const DAY_COUNT = 7

interface SheetCell {
  value: number | null
  confidence: number
  raw: string
}

interface SheetColumn {
  loom_number: string
  cells: SheetCell[]
  written_total: number | null
  computed_total: number
  matches: boolean | null
  /** Set per loom. Undefined means "use the sheet default". */
  pick_type?: PickType
  rate_per_meter?: number
}

interface SheetOut {
  columns: SheetColumn[]
  day_count: number
  grand_total: number
  mismatched_looms: string[]
}

interface ImportedRow {
  entry_date: string
  loom_label: string
  meters: number
  status: string
  detail: string
}

interface ImportResult {
  created: number
  skipped: number
  rows: ImportedRow[]
}

/** Sum a column from what is on screen, not from what the server first said. */
function columnTotal(cells: SheetCell[]): number {
  return Math.round(cells.reduce((sum, c) => sum + (c.value ?? 0), 0) * 100) / 100
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  // toISODate, not toISOString().slice(): the latter converts to UTC and rolls
  // the date back a day anywhere east of Greenwich, so in India every row in
  // the review grid would be labelled with the previous day's date while the
  // server saved the right one — the worst kind of wrong, because the figures
  // would look misfiled and the operator would "correct" good data.
  return toISODate(d)
}

export function ProductionImport() {
  const navigate = useNavigate()
  const confirm = useConfirm()
  const workers = useApi<Worker[]>(() =>
    api.get<Worker[]>("/workers", { active_only: true }),
  )
  const sheds = useApi<Shed[]>(() => api.get<Shed[]>("/sheds"))
  const looms = useApi<Loom[]>(() => api.get<Loom[]>("/looms"))

  const [workerId, setWorkerId] = useState("")
  const [shedId, setShedId] = useState("")
  const [weekStart, setWeekStart] = useState(todayISO())
  const [shift, setShift] = useState<Shift>("DAY")
  const [pick, setPick] = useState<PickType>("88x96")
  const [rate, setRate] = useState("")

  const [sheet, setSheet] = useState<SheetOut | null>(null)
  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<ImportResult | null>(null)
  /** Row indices the worker was absent. Those days record no production. */
  const [leaveDays, setLeaveDays] = useState<Set<number>>(new Set())
  const fileRef = useRef<HTMLInputElement>(null)

  const contextReady =
    workerId !== "" && shedId !== "" && weekStart !== "" && Number(rate) > 0

  const worker = workers.data?.find((w) => String(w.id) === workerId)
  const shed = sheds.data?.find((s) => String(s.id) === shedId)

  /** Loom numbers that exist in the chosen shed, for flagging unknown columns. */
  const shedLoomNumbers = useMemo(
    () =>
      new Set(
        (looms.data ?? [])
          .filter((l) => String(l.shed_id) === shedId)
          .map((l) => l.loom_number),
      ),
    [looms.data, shedId],
  )

  const totals = useMemo(() => {
    if (!sheet) return null
    // Two different questions, deliberately not conflated:
    //
    //   `computed` covers every day and answers "did we read the page right?"
    //   — so it is what the checksum compares against the written total.
    //   `saved` skips days marked as leave and answers "what will be written?"
    //
    // Folding leave into the checksum would make marking an absence look like
    // a misreading, and every column would fail against a page that was read
    // perfectly well.
    const columns = sheet.columns.map((c) => ({
      loom: c.loom_number,
      computed: columnTotal(c.cells),
      saved: columnTotal(c.cells.filter((_, d) => !leaveDays.has(d))),
      written: c.written_total,
      // Recomputed here rather than trusting the server's flag: the operator
      // has been editing, so the only honest comparison is against what is on
      // screen right now.
      ok:
        c.written_total === null
          ? null
          : Math.abs(columnTotal(c.cells) - c.written_total) < 0.005,
      known: shedLoomNumbers.size === 0 || shedLoomNumbers.has(c.loom_number),
    }))
    const grand = Math.round(
      columns.reduce((s, c) => s + c.saved, 0) * 100,
    ) / 100
    // Summed per column rather than grand x rate: with three picks on one
    // sheet there is no single rate to multiply by, and doing so would quietly
    // pay every loom at whatever the default happened to be.
    const wage =
      Math.round(
        sheet.columns.reduce((sum, column, i) => {
          const r = column.rate_per_meter ?? Number(rate) ?? 0
          return sum + columns[i].saved * (r || 0)
        }, 0) * 100,
      ) / 100
    return {
      columns,
      grand,
      disagreeing: columns.filter((c) => c.ok === false),
      unknown: columns.filter((c) => !c.known),
      wage,
    }
  }, [sheet, rate, shedLoomNumbers, leaveDays])

  async function handleFile(file: File | undefined) {
    if (!file) return
    setError("")
    setResult(null)
    setReading(true)
    try {
      const scaled = await downscaleImage(file)
      const data = await api.upload<SheetOut>(
        "/production/import/extract",
        scaled,
        { day_count: DAY_COUNT },
      )
      setSheet(data)
      setLeaveDays(new Set())
      if (data.mismatched_looms.length) {
        toast.warning(
          `Read, but ${data.mismatched_looms.length} column(s) disagree with the totals written on the page.`,
        )
      } else {
        toast.success("Sheet read — check the figures before saving.")
      }
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Could not read that photograph.",
      )
    } finally {
      setReading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  function editCell(colIndex: number, dayIndex: number, raw: string) {
    if (!sheet) return
    const parsed = raw.trim() === "" ? null : Number(raw)
    const columns = sheet.columns.map((c, i) =>
      i !== colIndex
        ? c
        : {
            ...c,
            cells: c.cells.map((cell, d) =>
              d !== dayIndex
                ? cell
                : {
                    ...cell,
                    value: parsed === null || Number.isNaN(parsed) ? null : parsed,
                    // An edited cell is the operator's word, so it is no longer
                    // an OCR guess and should stop being flagged as one.
                    confidence: 1,
                  },
            ),
          },
    )
    setSheet({ ...sheet, columns })
  }

  function setColumnPick(index: number, value: PickType) {
    if (!sheet) return
    setSheet({
      ...sheet,
      columns: sheet.columns.map((c, i) =>
        i === index ? { ...c, pick_type: value } : c,
      ),
    })
  }

  function setColumnRate(index: number, raw: string) {
    if (!sheet) return
    const parsed = Number(raw)
    setSheet({
      ...sheet,
      columns: sheet.columns.map((c, i) =>
        i === index
          ? {
              ...c,
              rate_per_meter:
                raw.trim() === "" || Number.isNaN(parsed) ? undefined : parsed,
            }
          : c,
      ),
    })
  }

  async function toggleLeave(dayIndex: number) {
    if (!sheet) return
    const next = new Set(leaveDays)

    if (next.has(dayIndex)) {
      next.delete(dayIndex)
      setLeaveDays(next)
      return
    }

    // Figures on the row and "absent" are contradictory claims. The figures
    // stay on screen — they are what the page says, and the checksum still has
    // to answer for them — but they will not be saved. Say so rather than
    // dropping them quietly.
    const filled = sheet.columns
      .map((c) => c.cells[dayIndex]?.value)
      .filter((v): v is number => v !== null && v !== undefined && v > 0)

    if (filled.length > 0) {
      const total = Math.round(filled.reduce((a, b) => a + b, 0) * 100) / 100
      const ok = await confirm({
        title: `Mark ${formatDate(addDays(weekStart, dayIndex))} as leave?`,
        message: `The sheet has ${formatMeters(total)} across ${filled.length} loom${filled.length === 1 ? "" : "s"} on that day. Marking it leave records an absence and leaves those figures unsaved.`,
        confirmLabel: "Mark as leave",
      })
      if (!ok) return
    }

    next.add(dayIndex)
    setLeaveDays(next)
  }

  async function handleSave() {
    if (!sheet || !totals) return
    setError("")
    setSaving(true)
    try {
      const payload = {
        worker_id: Number(workerId),
        shed_id: Number(shedId),
        week_start: weekStart,
        shift,
        pick_type: pick,
        rate_per_meter: Number(rate),
        day_count: DAY_COUNT,
        leave_days: [...leaveDays],
        columns: sheet.columns.map((c) => ({
          loom_number: c.loom_number,
          cells: c.cells.map((cell) => ({ value: cell.value })),
          pick_type: c.pick_type ?? pick,
          rate_per_meter: c.rate_per_meter ?? Number(rate),
        })),
      }
      const res = await api.post<ImportResult>(
        "/production/import/commit",
        payload,
      )
      setResult(res)
      if (res.created > 0) {
        toast.success(`${res.created} entries saved for ${worker?.name ?? "worker"}`)
      } else {
        toast.warning("Nothing new was saved — every row already existed.")
      }
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "Could not save the entries.",
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Read a sheet"
        description="Photograph the weekly register and the metres are read off it. Nothing is saved until you have checked the figures."
        actions={
          <Button variant="secondary" onClick={() => navigate("/production")}>
            Back to Daily Entry
          </Button>
        }
      />

      <Card className="mb-5">
        <CardHeader
          title="What the page does not say"
          description="The sheet records only loom numbers and metres, so the rest is set here and applied to every entry."
        />
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <SelectField
            label="Worker"
            icon={<User className="size-[18px]" />}
            value={workerId}
            onChange={setWorkerId}
            options={(workers.data ?? []).map((w) => ({
              value: String(w.id),
              label: w.name,
            }))}
            placeholder="Select worker"
          />
          <SelectField
            label="Shed"
            value={shedId}
            onChange={setShedId}
            options={(sheds.data ?? []).map((s) => ({
              value: String(s.id),
              label: `Shed ${s.name}`,
            }))}
            placeholder="Select shed"
            hint="Column 8 becomes loom 8 in this shed."
          />
          <DateField
            label="Week starting"
            value={weekStart}
            onChange={setWeekStart}
            hint={
              weekStart
                ? `Rows run ${formatDate(weekStart)} to ${formatDate(addDays(weekStart, DAY_COUNT - 1))}`
                : undefined
            }
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
                { value: "DAY", label: "Day", hint: SHIFT_HOURS.DAY },
                { value: "NIGHT", label: "Night", hint: SHIFT_HOURS.NIGHT },
              ]}
              className="w-full"
            />
          </div>
          <div>
            <p className="mb-2 pl-1 text-[12px] font-medium text-[var(--text-secondary)]">
              Pick
            </p>
            <SegmentedControl
              aria-label="Pick"
              value={pick}
              onChange={setPick}
              segments={PICK_TYPES.map((value) => ({ value, label: value }))}
              className="w-full"
            />
          </div>
          <Field
            label="Rate for this sheet"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            suffix="₹/m"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            hint="Starting value. Each loom can be changed individually once the sheet is read."
          />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[var(--border-subtle)] pt-5">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
          <Button
            size="lg"
            disabled={!contextReady || reading}
            loading={reading}
            icon={<Camera className="size-4" />}
            onClick={() => fileRef.current?.click()}
          >
            {reading ? "Reading the page…" : "Choose photo"}
          </Button>
          {!contextReady && (
            <p className="text-[13px] text-[var(--text-tertiary)]">
              Fill in the fields above first.
            </p>
          )}
        </div>
        {error && <ErrorNote message={error} className="mt-4" />}
      </Card>

      {sheet && totals && !result && (
        <Card>
          <CardHeader
            title="Check before saving"
            description={`${sheet.columns.length} looms × ${DAY_COUNT} days. Edit any cell that was misread.`}
            action={
              <span className="tabular text-[13.5px] text-[var(--text-secondary)]">
                {formatMeters(totals.grand)} · {formatCurrency(totals.wage)}
              </span>
            }
          />

          {totals.disagreeing.length > 0 && (
            <ErrorNote
              className="mt-4"
              message={`Loom ${totals.disagreeing
                .map((c) => c.loom)
                .join(", ")} does not add up to the total written on the page. Correct the figures, or the sheet's own total is wrong.`}
            />
          )}
          {totals.unknown.length > 0 && (
            <ErrorNote
              className="mt-4"
              message={`Shed ${shed?.name ?? ""} has no loom ${totals.unknown
                .map((c) => c.loom)
                .join(", ")}. Check the shed is right before saving.`}
            />
          )}

          <div className="mt-4 -mx-1 overflow-x-auto px-1">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className="whitespace-nowrap border-b border-[var(--border-subtle)] px-2 py-2 text-left text-[11.5px] font-semibold uppercase tracking-[0.05em] text-[var(--text-tertiary)]">
                    Date
                  </th>
                  {totals.columns.map((c) => (
                    <th
                      key={c.loom}
                      className={cn(
                        "border-b border-[var(--border-subtle)] px-2 py-2 text-center text-[11.5px] font-semibold uppercase tracking-[0.05em]",
                        c.known
                          ? "text-[var(--text-tertiary)]"
                          : "text-[var(--danger)]",
                      )}
                    >
                      {shed?.name ?? "?"} - {c.loom}
                    </th>
                  ))}
                </tr>
                {/* Pick and rate belong to the loom, not the sheet: a worker
                    can run three looms on 88x96 and two on 88x80 in the same
                    week, each paid differently. Both default to the values
                    chosen above and are changed only where they differ. */}
                <tr>
                  <th className="px-2 py-1 text-left text-[11px] font-medium text-[var(--text-tertiary)]">
                    Pick
                  </th>
                  {sheet.columns.map((column, i) => (
                    <th key={i} className="px-1 py-1">
                      <select
                        value={column.pick_type ?? pick}
                        onChange={(e) =>
                          setColumnPick(i, e.target.value as PickType)
                        }
                        aria-label={`Pick for loom ${column.loom_number}`}
                        className="tabular h-8 w-full cursor-pointer appearance-none rounded-[7px] border border-[var(--border-subtle)] bg-[var(--surface)] px-1 text-center text-[12px] outline-none focus:border-[var(--accent)]"
                      >
                        {PICK_TYPES.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </th>
                  ))}
                </tr>
                <tr>
                  <th className="px-2 py-1 text-left text-[11px] font-medium text-[var(--text-tertiary)]">
                    Rate ₹/m
                  </th>
                  {sheet.columns.map((column, i) => (
                    <th key={i} className="px-1 py-1 pb-2">
                      <input
                        inputMode="decimal"
                        value={column.rate_per_meter ?? rate}
                        onChange={(e) => setColumnRate(i, e.target.value)}
                        aria-label={`Rate for loom ${column.loom_number}`}
                        className="tabular h-8 w-full rounded-[7px] border border-[var(--border-subtle)] bg-[var(--surface)] px-1 text-center text-[12px] font-normal outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_2px_var(--ring)]"
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: DAY_COUNT }).map((_, day) => {
                  const onLeave = leaveDays.has(day)
                  return (
                  <tr
                    key={day}
                    className={cn(
                      "border-b border-[var(--border-subtle)]",
                      onLeave && "bg-[var(--warning-soft)]/40",
                    )}
                  >
                    <td className="whitespace-nowrap px-2 py-1.5">
                      <span
                        className={cn(
                          "block",
                          onLeave
                            ? "text-[var(--text-tertiary)] line-through"
                            : "text-[var(--text-secondary)]",
                        )}
                      >
                        {formatDate(addDays(weekStart, day))}
                      </span>
                      <button
                        type="button"
                        onClick={() => void toggleLeave(day)}
                        className={cn(
                          "mt-0.5 rounded-[6px] px-1.5 py-0.5 text-[10.5px] font-medium transition-colors",
                          onLeave
                            ? "bg-[var(--warning-soft)] text-[var(--warning)]"
                            : "text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]",
                        )}
                      >
                        {onLeave ? "On leave" : "Mark leave"}
                      </button>
                    </td>
                    {sheet.columns.map((column, col) => {
                      const cell = column.cells[day]
                      const unsure = cell.confidence > 0 && cell.confidence < 0.75
                      return (
                        <td key={col} className="px-1 py-1">
                          <input
                            inputMode="decimal"
                            // Still editable on a leave row: the checksum holds
                            // the whole page to what was written, and a cell
                            // misread on an absent day would otherwise flag a
                            // column with no way to correct it.
                            value={cell.value ?? ""}
                            onChange={(e) => editCell(col, day, e.target.value)}
                            aria-label={`Loom ${column.loom_number}, ${formatDate(addDays(weekStart, day))}`}
                            className={cn(
                              "tabular h-9 w-full rounded-[8px] border bg-[var(--surface)] px-2 text-center outline-none",
                              "focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--ring)]",
                              unsure
                                ? "border-[var(--warning)] bg-[var(--warning-soft)]"
                                : "border-[var(--border-subtle)]",
                              onLeave && "text-[var(--text-tertiary)] line-through opacity-60",
                            )}
                          />
                        </td>
                      )
                    })}
                  </tr>
                  )
                })}
                <tr className="bg-[var(--surface-sunken)]">
                  <td className="px-2 py-2 text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--text-tertiary)]">
                    Total
                  </td>
                  {totals.columns.map((c) => (
                    <td key={c.loom} className="px-2 py-2 text-center">
                      <span
                        className={cn(
                          "tabular block font-semibold",
                          c.ok === false && "text-[var(--danger)]",
                        )}
                      >
                        {c.computed.toFixed(2)}
                      </span>
                      {c.saved !== c.computed && (
                        <span className="tabular block text-[11px] text-[var(--warning)]">
                          saving {c.saved.toFixed(2)}
                        </span>
                      )}
                      {c.written !== null && (
                        <span
                          className={cn(
                            "tabular block text-[11px]",
                            c.ok === false
                              ? "text-[var(--danger)]"
                              : "text-[var(--text-tertiary)]",
                          )}
                        >
                          {c.ok === false ? `page: ${c.written.toFixed(2)}` : "✓ matches"}
                        </span>
                      )}
                      <span className="tabular block text-[11px] text-[var(--text-tertiary)]">
                        {formatCurrency(
                          c.saved *
                            (sheet.columns[
                              totals.columns.indexOf(c)
                            ]?.rate_per_meter ??
                              Number(rate) ??
                              0),
                        )}
                      </span>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-5">
            <p className="text-[13px] text-[var(--text-secondary)]">
              {totals.disagreeing.length > 0 ? (
                <span className="flex items-center gap-1.5 text-[var(--danger)]">
                  <AlertTriangle className="size-4" />
                  Saving is blocked while a column disagrees with the page.
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-[var(--success)]">
                  <Check className="size-4" />
                  Every column matches the totals written on the page.
                </span>
              )}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => {
                  setSheet(null)
                  setLeaveDays(new Set())
                }}>
                Discard
              </Button>
              <Button
                size="lg"
                loading={saving}
                disabled={totals.disagreeing.length > 0 || saving}
                icon={<Upload className="size-4" />}
                onClick={() => void handleSave()}
              >
                Save entries
              </Button>
            </div>
          </div>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader
            title="Saved"
            description={`${result.created} created, ${result.skipped} skipped.`}
            action={
              <Button onClick={() => navigate("/production")}>
                Go to Daily Entry
              </Button>
            }
          />
          {result.skipped > 0 && (
            <div className="mt-4 max-h-64 overflow-y-auto rounded-[12px] border border-[var(--border-subtle)]">
              {result.rows
                .filter((r) => r.status !== "created")
                .map((r, i) => (
                  <p
                    key={i}
                    className="border-b border-[var(--border-subtle)] px-3 py-2 text-[12.5px] text-[var(--text-secondary)] last:border-0"
                  >
                    <span className="font-medium">{r.loom_label}</span>{" "}
                    {formatDate(r.entry_date)} — {r.detail || r.status}
                  </p>
                ))}
            </div>
          )}
        </Card>
      )}

      {reading && (
        <div className="flex items-center justify-center gap-2 py-10 text-[var(--text-secondary)]">
          <Loader2 className="size-4 animate-spin" />
          Reading the handwriting…
        </div>
      )}
    </div>
  )
}
