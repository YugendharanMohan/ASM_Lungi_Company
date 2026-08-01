import type { HTMLAttributes, ReactNode } from "react"
import { motion } from "motion/react"

import { cn } from "@/lib/utils"
import { staggerChild } from "@/ui/motion"

interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, "onAnimationStart" | "onDrag" | "onDragEnd" | "onDragStart"> {
  /** Opt into the parent's stagger sequence. */
  animate?: boolean
  padded?: boolean
}

export function Card({
  className,
  children,
  animate = false,
  padded = true,
  ...props
}: CardProps) {
  const classes = cn(
    "rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface)]",
    "shadow-[var(--shadow-sm)]",
    padded && "p-5 sm:p-6",
    className,
  )

  if (!animate) {
    return (
      <div className={classes} {...props}>
        {children}
      </div>
    )
  }

  return (
    <motion.div variants={staggerChild} className={classes} {...props}>
      {children}
    </motion.div>
  )
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-[17px] font-semibold text-[var(--text)]">{title}</h2>
        {description && (
          <p className="mt-0.5 text-[13px] text-[var(--text-secondary)]">
            {description}
          </p>
        )}
      </div>
      {action && <div className="flex shrink-0 gap-2">{action}</div>}
    </div>
  )
}
