import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  Building2,
  Cog,
  IndianRupee,
  Ruler,
  Truck,
  Users,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { EmptyState, ErrorNote, Loading, PageHeader } from "@/components/common"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useApi } from "@/hooks/useApi"
import { api } from "@/lib/api"
import {
  formatCurrency,
  formatDate,
  formatDateShort,
  formatMeters,
  formatNumber,
} from "@/lib/format"
import type { DashboardStats } from "@/lib/types"

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string
  value: string
  sub?: string
  icon: LucideIcon
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 pt-6">
        <div className="min-w-0">
          <p className="truncate text-sm text-muted-foreground">{label}</p>
          <p className="tabular mt-1 truncate text-2xl font-semibold">{value}</p>
          {sub && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {sub}
            </p>
          )}
        </div>
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Icon className="size-4" />
        </div>
      </CardContent>
    </Card>
  )
}

export function Dashboard() {
  const { data, loading, error, reload } = useApi<DashboardStats>(() =>
    api.get<DashboardStats>("/dashboard"),
  )

  if (loading) return <Loading label="Loading dashboard…" />
  if (error) return <ErrorNote message={error} onRetry={reload} />
  if (!data) return null

  const chartData = data.daily_production.map((point) => ({
    ...point,
    label: formatDateShort(point.date),
  }))

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`Today ${formatDate(data.today)} · Week ${formatDate(
          data.week_start,
        )} – ${formatDate(data.week_end)}`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Today's production"
          value={formatMeters(data.today_meters)}
          sub={`${formatCurrency(data.today_amount)} in wages`}
          icon={Ruler}
        />
        <StatCard
          label="This week's production"
          value={formatMeters(data.week_meters)}
          sub={`${formatCurrency(data.week_amount)} in wages`}
          icon={Ruler}
        />
        <StatCard
          label="Salary this week"
          value={formatCurrency(data.week_amount)}
          sub="Meters × rate, all workers"
          icon={IndianRupee}
        />
        <StatCard
          label="Workers"
          value={formatNumber(data.total_workers)}
          sub={`${formatNumber(data.active_workers)} active`}
          icon={Users}
        />
        <StatCard
          label="Looms"
          value={formatNumber(data.total_looms)}
          sub={`Across ${formatNumber(data.total_sheds)} sheds`}
          icon={Cog}
        />
        <StatCard
          label="Dispatched this week"
          value={`${formatNumber(data.week_dispatch_quantity)} lungis`}
          sub={`${data.week_dispatch_by_company.length} customer(s)`}
          icon={Truck}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Production, last 7 days</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 4, right: 8, bottom: 4, left: 8 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="var(--border)"
                  />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={52}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--accent)" }}
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius)",
                      color: "var(--popover-foreground)",
                    }}
                    formatter={(value) => [formatMeters(Number(value)), "Meters"]}
                  />
                  <Bar
                    dataKey="meters"
                    fill="var(--chart-1)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Weekly dispatch</CardTitle>
          </CardHeader>
          <CardContent>
            {data.week_dispatch_by_company.length === 0 ? (
              <EmptyState
                title="Nothing dispatched"
                description="No consignments recorded for this week yet."
              />
            ) : (
              <ul className="space-y-3">
                {data.week_dispatch_by_company.map((row) => (
                  <li
                    key={row.company_name}
                    className="flex items-center justify-between gap-3 border-b pb-3 last:border-0 last:pb-0"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Building2 className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate text-sm">
                        {row.company_name}
                      </span>
                    </span>
                    <span className="tabular shrink-0 text-sm font-medium">
                      {formatNumber(row.quantity)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
