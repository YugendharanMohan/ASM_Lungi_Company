import { motion } from "motion/react"

import { cn } from "@/lib/utils"

export interface Segment<T extends string> {
  value: T
  label: string
}

/**
 * iOS segmented control.
 *
 * The selected pill is a single shared element moved with `layoutId`, so it
 * slides between options instead of cross-fading. That continuity is the whole
 * effect — two pills fading would read as a plain tab bar.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  segments,
  size = "md",
  className,
  "aria-label": ariaLabel,
}: {
  value: T
  onChange: (value: T) => void
  segments: Segment<T>[]
  size?: "sm" | "md"
  className?: string
  "aria-label"?: string
}) {
  const layoutId = `segmented-${segments.map((s) => s.value).join("-")}`

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex rounded-[11px] bg-[var(--surface-sunken)] p-[3px]",
        className,
      )}
    >
      {segments.map((segment) => {
        const active = segment.value === value
        return (
          <button
            key={segment.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(segment.value)}
            className={cn(
              "relative isolate flex-1 whitespace-nowrap rounded-[9px] font-medium transition-colors duration-200",
              size === "sm" ? "px-3 py-1 text-[12.5px]" : "px-4 py-1.5 text-[13.5px]",
              active
                ? "text-[var(--text)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text)]",
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                className="absolute inset-0 -z-10 rounded-[9px] bg-[var(--surface)] shadow-[var(--shadow-sm)]"
              />
            )}
            {segment.label}
          </button>
        )
      })}
    </div>
  )
}
