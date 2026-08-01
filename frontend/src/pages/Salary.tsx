import { useState } from "react"
import { Download } from "lucide-react"

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
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useApi } from "@/hooks/useApi"
import { api } from "@/lib/api"
import {
  formatCurrency,
  formatDate,
  formatMeters,
  todayISO,
} from "@/lib/format"
import type { SalaryReport } from "@/lib/types"

type Period = "daily" | "weekly" | "monthly"

/** Escapes a CSV field: quotes wrap it, and inner quotes are doubled. */
function csvField(value: string | number): string {
  const text = String(value ?? "")
  return `"${text.replace(/"/g, '""')}"`
}

export function Salary() {
  const [period, setPeriod] = useState<Period>("weekly")
  const [reference, setReference] = useState(todayISO())

  const report = useApi<SalaryReport>(
    () =>
      api.get<SalaryReport>("/salary", {
        period,
        reference_date: reference,
      }),
    [period, reference],
  )

  function downloadCsv() {
    if (!report.data) return
    const { rows, start_date, end_date } = report.data
    const lines = [
      ["Worker", "Phone", "Shed", "Entries", "Meters", "Amount"]
        .map(csvField)
        .join(","),
      ...rows.map((row) =>
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
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `salary-${period}-${start_date}-to-${end_date}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <PageHeader
        title="Salary"
        description="Meters × rate per meter, totalled per worker."
        actions={
          <Button
            variant="outline"
            onClick={downloadCsv}
            disabled={!report.data?.rows.length}
          >
            <Download className="size-4" />
            Export CSV
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <div className="space-y-1.5">
            <Label>Period</Label>
            <Tabs
              value={period}
              onValueChange={(value) => setPeriod(value as Period)}
            >
              <TabsList>
                <TabsTrigger value="daily">Daily</TabsTrigger>
                <TabsTrigger value="weekly">Weekly</TabsTrigger>
                <TabsTrigger value="monthly">Monthly</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reference">Any date in the period</Label>
            <Input
              id="reference"
              type="date"
              className="w-48"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {report.loading ? (
        <Loading label="Calculating wages…" />
      ) : report.error ? (
        <ErrorNote message={report.error} onRetry={report.reload} />
      ) : report.data ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
            <CardTitle className="text-base">
              {formatDate(report.data.start_date)}
              {report.data.start_date !== report.data.end_date &&
                ` – ${formatDate(report.data.end_date)}`}
            </CardTitle>
            <div className="tabular flex gap-4 text-sm">
              <span className="text-muted-foreground">
                {formatMeters(report.data.total_meters)}
              </span>
              <span className="font-semibold">
                {formatCurrency(report.data.total_amount)}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {report.data.rows.length === 0 ? (
              <EmptyState
                title="No production in this period"
                description="Record entries under Daily Meter Entry, then come back."
              />
            ) : (
              <TableScroller>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Worker</TableHead>
                      <TableHead>Shed</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead className="text-right">Entries</TableHead>
                      <TableHead className="text-right">Meters</TableHead>
                      <TableHead className="text-right">Salary</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.data.rows.map((row) => (
                      <TableRow key={row.worker_id}>
                        <TableCell className="font-medium">
                          {row.worker_name}
                        </TableCell>
                        <TableCell>{row.shed_name || "—"}</TableCell>
                        <TableCell className="tabular text-muted-foreground">
                          {row.phone || "—"}
                        </TableCell>
                        <TableCell className="tabular text-right">
                          {row.entry_count}
                        </TableCell>
                        <TableCell className="tabular text-right">
                          {row.total_meters.toFixed(2)}
                        </TableCell>
                        <TableCell className="tabular text-right font-medium">
                          {formatCurrency(row.total_amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={4}>Total</TableCell>
                      <TableCell className="tabular text-right">
                        {report.data.total_meters.toFixed(2)}
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {formatCurrency(report.data.total_amount)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </TableScroller>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
