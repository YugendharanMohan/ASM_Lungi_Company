import type { ReactNode } from "react"
import { motion } from "motion/react"

import { normal } from "@/ui/motion"

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <motion.header
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={normal}
      className="mb-7 flex flex-wrap items-end justify-between gap-4"
    >
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.07em] text-[var(--accent)]">
            {eyebrow}
          </p>
        )}
        <h1 className="text-[30px] font-semibold leading-[1.1] tracking-[-0.025em] text-[var(--text)] sm:text-[34px]">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-[var(--text-secondary)]">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2.5">{actions}</div>
      )}
    </motion.header>
  )
}
