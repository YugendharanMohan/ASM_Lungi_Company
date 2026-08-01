import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { motion } from "motion/react"
import { Building2, Cog, IndianRupee, Ruler, Truck, Users } from "lucide-react"

import { useApi } from "@/hooks/useApi"
import { api } from "@/lib/api"
import {
  formatCurrency,
  formatCurrencyCompact,
  formatDate,
  formatDateShort,
  formatMeters,
  formatNumber,
} from "@/lib/format"
import type { DashboardStats } from "@/lib/types"
import { Card, CardHeader } from "@/ui/Card"
import { EmptyState, ErrorNote, Skeleton } from "@/ui/Feedback"
import { PageHeader } from "@/ui/PageHeader"
import { StatCard } from "@/ui/StatCard"
import { staggerParent } from "@/ui/motion"

export function Overview() {
  const { data, loading, error, reload } = useApi<DashboardStats>(() =>
    api.get<DashboardStats>("/dashboard"),
  )

  if (loading) return <OverviewSkeleton />
  if (error) return <ErrorNote message={error} onRetry={reload} />
  if (!data) return null

  const chartData = data.daily_production.map((point) => ({
    ...point,
    label: formatDateShort(point.date),
  }))

  return (
    <div>
      <PageHeader
        eyebrow={formatDate(data.today)}
        title="Overview"
        description={`Week of ${formatDate(data.week_start)} — ${formatDate(
          data.week_end,
        )}`}
      />

      <motion.div
        variants={staggerParent}
        initial="hidden"
        animate="visible"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        <StatCard
          label="Today's production"
          value={formatNumber(data.today_meters)}
          unit="m"
          detail={`${formatCurrency(data.today_amount)} in wages`}
          icon={Ruler}
        />
        <StatCard
          label="Active workers"
          value={formatNumber(data.active_workers)}
          detail={`of ${formatNumber(data.total_workers)} on the books`}
          icon={Users}
          tone="success"
        />
        <StatCard
          label="Active looms"
          value={formatNumber(data.total_looms)}
          detail={`across ${formatNumber(data.total_sheds)} sheds`}
          icon={Cog}
          tone="neutral"
        />
        <StatCard
          label="Weekly salary"
          value={formatCurrencyCompact(data.week_amount)}
          detail={`${formatMeters(data.week_meters)} woven this week`}
          icon={IndianRupee}
        />
        <StatCard
          label="Weekly dispatch"
          value={formatNumber(data.week_dispatch_quantity)}
          unit="pcs"
          detail={`${data.week_dispatch_by_company.length} customer${
            data.week_dispatch_by_company.length === 1 ? "" : "s"
          }`}
          icon={Truck}
          tone="neutral"
        />
        <StatCard
          label="Week to date"
          value={formatNumber(data.week_meters)}
          unit="m"
          detail="Total metres produced"
          icon={Ruler}
          tone="success"
        />
      </motion.div>

      <div className="mt-5 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader
            title="Production"
            description="Metres woven over the last seven days"
          />
          <div className="mt-5 h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 6, right: 6, bottom: 0, left: -14 }}
              >
                <defs>
                  <linearGradient id="fillMeters" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor="var(--chart-1)"
                      stopOpacity={0.24}
                    />
                    <stop
                      offset="100%"
                      stopColor="var(--chart-1)"
                      stopOpacity={0.02}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="4 4"
                  vertical={false}
                  stroke="var(--border-subtle)"
                />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  dy={8}
                  tick={{ fill: "var(--text-tertiary)", fontSize: 11.5 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={54}
                  tick={{ fill: "var(--text-tertiary)", fontSize: 11.5 }}
                />
                <Tooltip
                  cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
                  contentStyle={{
                    background: "var(--glass)",
                    backdropFilter: "saturate(180%) blur(20px)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 12,
                    boxShadow: "var(--shadow-md)",
                    color: "var(--text)",
                    fontSize: 12.5,
                  }}
                  labelStyle={{ color: "var(--text-secondary)" }}
                  formatter={(value) => [formatMeters(Number(value)), "Metres"]}
                />
                <Area
                  type="monotone"
                  dataKey="meters"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  fill="url(#fillMeters)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Weekly dispatch"
            description="Lungis sent to customers"
          />
          {data.week_dispatch_by_company.length === 0 ? (
            <EmptyState
              title="Nothing dispatched"
              description="No consignments recorded this week."
              icon={<Truck className="size-5" />}
            />
          ) : (
            <ul className="mt-4 space-y-1">
              {data.week_dispatch_by_company.map((row, index) => {
                const share =
                  data.week_dispatch_quantity > 0
                    ? (row.quantity / data.week_dispatch_quantity) * 100
                    : 0
                return (
                  <li key={row.company_name} className="py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <Building2 className="size-4 shrink-0 text-[var(--text-tertiary)]" />
                        <span className="truncate text-[13.5px] font-medium">
                          {row.company_name}
                        </span>
                      </span>
                      <span className="tabular shrink-0 text-[13.5px] font-semibold">
                        {formatNumber(row.quantity)}
                      </span>
                    </div>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${share}%` }}
                        transition={{
                          duration: 0.6,
                          delay: 0.1 + index * 0.06,
                          ease: [0.16, 1, 0.3, 1],
                        }}
                        className="h-full rounded-full bg-[var(--accent)]"
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

function OverviewSkeleton() {
  return (
    <div>
      <Skeleton className="mb-2 h-4 w-28" />
      <Skeleton className="mb-8 h-9 w-52" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-[132px] rounded-[var(--radius-card)]" />
        ))}
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-5">
        <Skeleton className="h-[380px] rounded-[var(--radius-card)] lg:col-span-3" />
        <Skeleton className="h-[380px] rounded-[var(--radius-card)] lg:col-span-2" />
      </div>
    </div>
  )
}
