import type { LucideIcon } from "lucide-react"
import { motion } from "motion/react"

import { cn } from "@/lib/utils"
import { staggerChild } from "@/ui/motion"

/**
 * The overview screen's primary unit.
 *
 * The gradient is deliberately barely there — a 4% wash from the top-left, not
 * a coloured tile. It gives the surface a light source without turning a
 * production figure into marketing.
 */
export function StatCard({
  label,
  value,
  unit,
  detail,
  icon: Icon,
  tone = "accent",
  className,
}: {
  label: string
  value: string
  unit?: string
  detail?: string
  icon: LucideIcon
  tone?: "accent" | "success" | "neutral"
  className?: string
}) {
  const tones = {
    accent: {
      wash: "from-[var(--accent-soft)]",
      chip: "bg-[var(--accent-soft)] text-[var(--accent)]",
    },
    success: {
      wash: "from-[var(--success-soft)]",
      chip: "bg-[var(--success-soft)] text-[var(--success)]",
    },
    neutral: {
      wash: "from-[var(--surface-sunken)]",
      chip: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
    },
  }[tone]

  return (
    <motion.div
      variants={staggerChild}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "group relative overflow-hidden rounded-[var(--radius-card)]",
        "border border-[var(--border-subtle)] bg-[var(--surface)]",
        "p-5 shadow-[var(--shadow-sm)] transition-shadow hover:shadow-[var(--shadow-md)]",
        className,
      )}
    >
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent opacity-60",
          tones.wash,
        )}
      />

      <div className="relative flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-[var(--text-secondary)]">
          {label}
        </p>
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-[10px]",
            tones.chip,
          )}
        >
          <Icon className="size-4" strokeWidth={2} />
        </span>
      </div>

      <p className="tabular relative mt-3 flex items-baseline gap-1 text-[28px] font-semibold leading-none tracking-[-0.02em] text-[var(--text)]">
        {value}
        {unit && (
          <span className="text-[15px] font-medium text-[var(--text-tertiary)]">
            {unit}
          </span>
        )}
      </p>

      {detail && (
        <p className="relative mt-2 text-[12.5px] text-[var(--text-tertiary)]">
          {detail}
        </p>
      )}
    </motion.div>
  )
}
