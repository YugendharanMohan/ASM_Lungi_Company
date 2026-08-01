import type { ReactNode } from "react"
import { motion } from "motion/react"
import { AlertCircle, Inbox } from "lucide-react"

import { Button } from "@/ui/Button"
import { cn } from "@/lib/utils"

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "relative overflow-hidden rounded-[10px] bg-[var(--surface-sunken)]",
        // A sweep rather than a pulse: opacity blinking on a full table is
        // more distracting than the wait it covers.
        "after:absolute after:inset-0 after:-translate-x-full after:animate-[shimmer_1.6s_infinite]",
        "after:bg-gradient-to-r after:from-transparent after:via-black/[0.045] after:to-transparent",
        "dark:after:via-white/[0.06]",
        className,
      )}
    />
  )
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2.5 p-1" aria-busy>
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton
          key={index}
          className="h-11 w-full"
          // Rows fade out slightly down the list so the block reads as
          // content arriving, not as a solid grey slab.
        />
      ))}
    </div>
  )
}

export function ErrorNote({
  message,
  onRetry,
  className,
}: {
  message: string
  onRetry?: () => void
  className?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      role="alert"
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-[14px] border px-4 py-3",
        "border-[var(--danger)]/25 bg-[var(--danger-soft)] text-[13.5px] text-[var(--danger)]",
        className,
      )}
    >
      <AlertCircle className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 whitespace-pre-line">{message}</span>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      )}
    </motion.div>
  )
}

export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center"
    >
      <div className="mb-1 flex size-11 items-center justify-center rounded-[14px] bg-[var(--surface-sunken)] text-[var(--text-tertiary)]">
        {icon ?? <Inbox className="size-5" />}
      </div>
      <p className="text-[15px] font-semibold text-[var(--text)]">{title}</p>
      {description && (
        <p className="max-w-xs text-[13.5px] text-[var(--text-secondary)]">
          {description}
        </p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </motion.div>
  )
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode
  tone?: "neutral" | "success" | "accent" | "danger"
}) {
  const tones = {
    neutral:
      "bg-[var(--surface-sunken)] text-[var(--text-secondary)] border-[var(--border-subtle)]",
    success:
      "bg-[var(--success-soft)] text-[var(--success)] border-transparent",
    accent: "bg-[var(--accent-soft)] text-[var(--accent)] border-transparent",
    danger: "bg-[var(--danger-soft)] text-[var(--danger)] border-transparent",
  }[tone]

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[var(--radius-pill)] border px-2.5 py-0.5",
        "text-[12px] font-medium",
        tones,
      )}
    >
      {children}
    </span>
  )
}
