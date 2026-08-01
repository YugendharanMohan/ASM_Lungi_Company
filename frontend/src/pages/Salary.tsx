import { useState } from "react"
import { Download, FileText, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { useApi } from "@/hooks/useApi"
import { api, ApiError } from "@/lib/api"
import {
  formatCurrency,
  formatDate,
  formatMeters,
  toISODate,
  todayISO,
} from "@/lib/format"
import type { SalaryReport, SalaryRow } from "@/lib/types"
import { Button } from "@/ui/Button"
import { Card } from "@/ui/Card"
import { DataTable, type Column } from "@/ui/DataTable"
import { DateField } from "@/ui/DateField"
import { ErrorNote } from "@/ui/Feedback"
import { PageHeader } from "@/ui/PageHeader"
import { SegmentedControl } from "@/ui/SegmentedControl"

type Preset = "week" | "month" | "custom"

function presetRange(preset: Exclude<Preset, "custom">): [string, string] {
  const today = new Date()
  if (preset === "week") {
    // Monday-start week, matching the backend's ISO bounds.
    const monday = new Date(today)
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    return [toISODate(monday), toISODate(sunday)]
  }
  const first = new Date(today.getFullYear(), today.getMonth(), 1)
  const last = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  return [toISODate(first), toISODate(last)]
}

export function Salary() {
  const [preset, setPreset] = useState<Preset>("week")
  const initial = presetRange("week")
  const [startDate, setStartDate] = useState(initial[0])
  const [endDate, setEndDate] = useState(initial[1])
  const [downloading, setDownloading] = useState<number | null>(null)

  const invalidRange = Boolean(startDate && endDate && startDate > endDate)

  const report = useApi<SalaryReport>(
    () =>
      api.get<SalaryReport>("/salary", {
        start_date: startDate,
        end_date: endDate,
      }),
    [startDate, endDate],
  )

  function applyPreset(next: Preset) {
    setPreset(next)
    if (next === "custom") return
    const [from, to] = presetRange(next)
    setStartDate(from)
    setEndDate(to)
  }

  async function downloadReceipt(row: SalaryRow) {
    setDownloading(row.worker_id)
    try {
      await api.download(
        `/salary/receipt/${row.worker_id}/pdf`,
        { start_date: startDate, end_date: endDate },
        `salary-${row.worker_name}.pdf`,
      )
      toast.success(`Receipt downloaded for ${row.worker_name}`)
    } catch (caught) {
      toast.error(
        caught instanceof ApiError
          ? caught.message
          : "Could not generate the receipt.",
      )
    } finally {
      setDownloading(null)
    }
  }

  const columns: Column<SalaryRow>[] = [
    {
      key: "worker",
      header: "Worker",
      sortValue: (row) => row.worker_name.toLowerCase(),
      render: (row) => <span className="font-medium">{row.worker_name}</span>,
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
      key: "entries",
      header: "Entries",
      align: "right",
      sortValue: (row) => row.entry_count,
      render: (row) => <span className="tabular">{row.entry_count}</span>,
    },
    {
      key: "meters",
      header: "Metres",
      align: "right",
      sortValue: (row) => row.total_meters,
      render: (row) => (
        <span className="tabular">{row.total_meters.toFixed(2)}</span>
      ),
    },
    {
      key: "salary",
      header: "Salary",
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
      header: "Receipt",
      align: "right",
      render: (row) => (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void downloadReceipt(row)}
          disabled={downloading !== null}
          icon={
            downloading === row.worker_id ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <FileText className="size-3.5" />
            )
          }
        >
          PDF
        </Button>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Salary"
        description="Metres × rate per metre, totalled per worker. Download a worker's receipt as a PDF."
        actions={
          <Button
            variant="secondary"
            icon={<Download className="size-4" />}
            disabled={!report.data?.rows.length}
            onClick={() => exportCsv(report.data)}
          >
            Export CSV
          </Button>
        }
      />

      <Card className="mb-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-2 pl-0.5 text-[12px] font-medium text-[var(--text-secondary)]">
              Period
            </p>
            <SegmentedControl
              aria-label="Period preset"
              value={preset}
              onChange={applyPreset}
              segments={[
                { value: "week", label: "This week" },
                { value: "month", label: "This month" },
                { value: "custom", label: "Custom" },
              ]}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:w-[420px]">
            <DateField
              label="From"
              value={startDate}
              max={endDate || todayISO()}
              onChange={(value) => {
                setStartDate(value)
                setPreset("custom")
              }}
            />
            <DateField
              label="To"
              value={endDate}
              min={startDate}
              error={invalidRange ? "Must be after the start date." : undefined}
              onChange={(value) => {
                setEndDate(value)
                setPreset("custom")
              }}
            />
          </div>
        </div>
      </Card>

      {report.data && !report.loading && !report.error && (
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <Summary
            label="Period"
            value={`${formatDate(report.data.start_date)} — ${formatDate(
              report.data.end_date,
            )}`}
          />
          <Summary
            label="Total metres"
            value={formatMeters(report.data.total_meters)}
          />
          <Summary
            label="Total payable"
            value={formatCurrency(report.data.total_amount)}
            emphasis
          />
        </div>
      )}

      {invalidRange ? (
        <ErrorNote message="Choose an end date on or after the start date." />
      ) : (
        <DataTable
          data={report.data?.rows ?? null}
          columns={columns}
          getRowId={(row) => row.worker_id}
          loading={report.loading}
          error={report.error}
          onRetry={report.reload}
          searchable={(row, query) =>
            row.worker_name.toLowerCase().includes(query) ||
            row.shed_name.toLowerCase().includes(query)
          }
          searchPlaceholder="Search worker"
          pageSize={12}
          emptyTitle="No production in this period"
          emptyDescription="Record entries under Daily Entry, then come back."
        />
      )}
    </div>
  )
}

function Summary({
  label,
  value,
  emphasis,
}: {
  label: string
  value: string
  emphasis?: boolean
}) {
  return (
    <div className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--surface)] px-4 py-3.5 shadow-[var(--shadow-sm)]">
      <p className="text-[12px] font-medium text-[var(--text-tertiary)]">
        {label}
      </p>
      <p
        className={
          emphasis
            ? "tabular mt-1 text-[19px] font-semibold tracking-[-0.02em] text-[var(--accent)]"
            : "tabular mt-1 text-[15px] font-medium"
        }
      >
        {value}
      </p>
    </div>
  )
}

/** Quotes wrap every field and inner quotes are doubled, per RFC 4180. */
function csvField(value: string | number): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`
}

function exportCsv(report: SalaryReport | null) {
  if (!report) return
  const lines = [
    ["Worker", "Phone", "Shed", "Entries", "Metres", "Amount"]
      .map(csvField)
      .join(","),
    ...report.rows.map((row) =>
      [
        row.worker_name,
        row.phone,
        row.shed_name,
        row.entry_count,
        row.total_meters.toFixed(2),
        row.total_amount.toFixed(2),
      ]
        .map(csvField)
        .join(","),
    ),
  ]
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `salary-${report.start_date}-to-${report.end_date}.csv`
  link.click()
  URL.revokeObjectURL(url)
}
